// A1 (2026-09-30): the server owns the panel lists (users, channels, messages)
// and the bot commands. A save is only reported once the server confirms it;
// failures keep what was typed; an empty server list stays empty; corrupt files
// are never overwritten. Frontend handlers are the real ones extracted from
// admin.html and run against a mocked fetch or a throwaway server.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const ADMIN = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');

// ── Throwaway server ─────────────────────────────────────────────────────────
async function arrancarServidor(dataDir) {
  const port = 20000 + Math.floor(Math.random() * 30000);
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir,
      PANEL_PASS: 'test-only-pass', NODE_ENV: 'production', TWITCH_CHAT_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  child.stdout.on('data', d => { salida += d; });
  child.stderr.on('data', d => { salida += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`server exited:\n${salida}`);
    try {
      const r = await fetch(`${base}/api/panel/comandos-bot`);
      if (r.status > 0) break;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  const parar = () => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill();
  });
  return { base, parar };
}

const post = (base, ruta, cuerpo) => fetch(`${base}${ruta}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
});

// ── Real frontend handlers from admin.html ───────────────────────────────────
function bloquePersistencia() {
  const m = ADMIN.match(/\/\* <panel-persistencia>[\s\S]*?\/\* <\/panel-persistencia> \*\//);
  assert.ok(m, 'admin.html must delimit the persistence block with <panel-persistencia> markers');
  return m[0];
}

function crearSesion({ fetchImpl, confirmar = true } = {}) {
  const toasts = [];
  const elementos = new Map();
  const escrituras = [];
  const llamadas = [];
  const elemento = (id) => {
    if (!elementos.has(id)) elementos.set(id, { id, value: '', disabled: false, hidden: false, textContent: '', dataset: {} });
    return elementos.get(id);
  };
  const ctx = {
    console,
    JSON, Array, Promise, String, Object, Set, Map,
    fetch: async (url, opts) => { llamadas.push({ url, opts }); return fetchImpl(url, opts); },
    document: { getElementById: elemento },
    localStorage: {
      getItem: () => { throw new Error('localStorage must not be read for panel lists'); },
      setItem: (k) => escrituras.push(['set', k]),
      removeItem: (k) => escrituras.push(['remove', k]),
      clear: () => escrituras.push(['clear']),
    },
    confirm: () => confirmar,
    showToast: (t) => toasts.push(t),
    renderChips: () => {}, renderComandosGrid: () => {}, renderComandosAccordion: () => {},
  };
  vm.createContext(ctx);
  const api = vm.runInContext(`${bloquePersistencia()}
    ;({
      agregarItemLista, agregarValorLista, quitarValorLista, cargarListas,
      guardarNuevoComando, quitarComandoPanel, vaciarComandosPanel, cargarPredeterminados,
      listas: () => ({ usuario: usuariosList, canal: canalesList, mensaje: mensajesList, comandos: comandosList }),
    })`, ctx);
  return { api, toasts, elemento, escrituras, llamadas };
}

const respuesta = (status, cuerpo) => new Response(JSON.stringify(cuerpo), {
  status, headers: { 'Content-Type': 'application/json' },
});

// ── Frontend: failures never look like saves ────────────────────────────────
for (const [nombre, fallo] of [
  ['401', () => respuesta(401, { error: 'No autorizado' })],
  ['500', () => respuesta(500, { error: 'lista-danada' })],
  ['network error', () => { throw new TypeError('Failed to fetch'); }],
]) {
  test(`agregarItemLista on ${nombre}: error shown, typed value kept, list unchanged`, async () => {
    const s = crearSesion({ fetchImpl: fallo });
    s.elemento('input-add-canal').value = 'midudev';
    const ok = await s.api.agregarItemLista('canal', 'input-add-canal');
    assert.equal(ok, false);
    assert.equal(s.elemento('input-add-canal').value, 'midudev', 'typed value must survive the failure');
    assert.equal(s.elemento('input-add-canal').disabled, false, 'input usable again after failure');
    assert.deepEqual([...s.api.listas().canal], []);
    assert.ok(s.toasts.some(t => t.startsWith('❌')), `error toast expected, got ${s.toasts}`);
    assert.ok(!s.toasts.some(t => t.startsWith('✓')), 'no success toast on failure');
    assert.deepEqual(s.escrituras, [], 'browser storage untouched');
  });

  test(`guardarNuevoComando on ${nombre}: inputs kept, no success`, async () => {
    const s = crearSesion({ fetchImpl: fallo });
    const n = s.elemento('new-cmd-name'); n.value = '!hola';
    const d = s.elemento('new-cmd-desc'); d.value = 'Saluda';
    const t = s.elemento('new-cmd-tipo'); t.value = 'ninguno';
    assert.equal(await s.api.guardarNuevoComando(n, d, t), false);
    assert.equal(n.value, '!hola');
    assert.equal(d.value, 'Saluda');
    assert.ok(s.toasts.some(x => x.startsWith('❌')));
    assert.ok(!s.toasts.some(x => x.startsWith('✓')));
  });

  test(`quitarValorLista on ${nombre}: element stays`, async () => {
    const s = crearSesion({
      fetchImpl: (url, opts) => {
        if (opts?.method === 'POST') return fallo();
        if (String(url).includes('comandos-bot')) return respuesta(200, { comandos: [] });
        return respuesta(200, { valores: String(url).includes('tipo=usuario') ? ['ana'] : [] });
      },
    });
    assert.equal(await s.api.cargarListas(), true);
    assert.deepEqual([...s.api.listas().usuario], ['ana']);
    assert.equal(await s.api.quitarValorLista('usuario', 'ana'), false);
    assert.deepEqual([...s.api.listas().usuario], ['ana']);
    assert.ok(s.toasts.some(t => t.startsWith('❌')));
  });
}

test('a 200 response that does not contain the value is not reported as saved', async () => {
  const s = crearSesion({ fetchImpl: () => respuesta(200, { ok: true, valores: [] }) });
  s.elemento('input-add-usuario').value = 'ana';
  assert.equal(await s.api.agregarItemLista('usuario', 'input-add-usuario'), false);
  assert.equal(s.elemento('input-add-usuario').value, 'ana');
});

test('success: list comes from the server response, input cleared, success toast after confirmation', async () => {
  const s = crearSesion({ fetchImpl: () => respuesta(200, { ok: true, valores: ['previo', 'ana'] }) });
  s.elemento('input-add-usuario').value = '@ana';
  assert.equal(await s.api.agregarItemLista('usuario', 'input-add-usuario'), true);
  assert.deepEqual([...s.api.listas().usuario], ['previo', 'ana']);
  assert.equal(s.elemento('input-add-usuario').value, '');
  assert.equal(JSON.parse(s.llamadas[0].opts.body).valor, 'ana', 'leading @ stripped for users');
  assert.ok(s.toasts.some(t => t.startsWith('✓')));
});

test('cargarListas: valid empty server lists stay empty, no presets resurrected', async () => {
  const s = crearSesion({
    fetchImpl: (url) => String(url).includes('comandos-bot')
      ? respuesta(200, { comandos: [] }) : respuesta(200, { valores: [] }),
  });
  assert.equal(await s.api.cargarListas(), true);
  const l = s.api.listas();
  assert.deepEqual([...l.usuario], []);
  assert.deepEqual([...l.canal], []);
  assert.deepEqual([...l.mensaje], []);
  assert.deepEqual([...l.comandos], []);
  assert.equal(s.elemento('listas-estado').hidden, true);
  assert.deepEqual(s.escrituras, []);
});

test('cargarListas: server failure shows an explicit error and invents nothing', async () => {
  const s = crearSesion({ fetchImpl: () => respuesta(500, { error: 'lista-danada' }) });
  assert.equal(await s.api.cargarListas(), false);
  const l = s.api.listas();
  assert.equal(l.usuario.length + l.canal.length + l.mensaje.length + l.comandos.length, 0);
  assert.equal(s.elemento('listas-estado').hidden, false);
  assert.equal(s.elemento('listas-estado').dataset.kind, 'error');
  assert.deepEqual(s.escrituras, []);
});

test('defaults are only added after an explicit confirmation', async () => {
  const s = crearSesion({ fetchImpl: () => respuesta(200, {}), confirmar: false });
  assert.equal(await s.api.cargarPredeterminados(), false);
  assert.equal(s.llamadas.length, 0, 'no request when the user cancels');
});

// ── Server: validation and corrupt-file preservation ────────────────────────
test('server rejects invalid list types and never writes outside data/panel', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'panel-a1-tipo-'));
  const srv = await arrancarServidor(dir);
  t.after(srv.parar);
  for (const tipo of ['../config', 'comandos-bot', 'x']) {
    const g = await fetch(`${srv.base}/api/panel/lista?tipo=${encodeURIComponent(tipo)}`);
    assert.equal(g.status, 400, `GET tipo=${tipo}`);
    const p = await post(srv.base, '/api/panel/lista', { tipo, accion: 'agregar', valor: 'x' });
    assert.equal(p.status, 400, `POST tipo=${tipo}`);
  }
  assert.equal(existsSync(join(dir, 'config.json')), false);
  assert.equal(existsSync(join(dir, 'panel', 'x.json')), false);
  const accion = await post(srv.base, '/api/panel/lista', { tipo: 'usuario', accion: 'borrar-todo' });
  assert.equal(accion.status, 400);
  const vacio = await post(srv.base, '/api/panel/lista', { tipo: 'usuario', accion: 'agregar', valor: '   ' });
  assert.equal(vacio.status, 400);
});

test('server preserves corrupt list and command files instead of overwriting them', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'panel-a1-corrupto-'));
  mkdirSync(join(dir, 'panel'), { recursive: true });
  const danado = '["ana", "be';
  writeFileSync(join(dir, 'panel', 'usuario.json'), danado);
  writeFileSync(join(dir, 'panel', 'comandos-bot.json'), '{"no":"lista"}');
  const srv = await arrancarServidor(dir);
  t.after(srv.parar);
  assert.equal((await fetch(`${srv.base}/api/panel/lista?tipo=usuario`)).status, 500);
  assert.equal((await post(srv.base, '/api/panel/lista', { tipo: 'usuario', accion: 'agregar', valor: 'nuevo' })).status, 500);
  assert.equal((await post(srv.base, '/api/panel/comandos-bot', { accion: 'agregar', comando: '!x' })).status, 500);
  assert.equal((await post(srv.base, '/api/panel/comandos-bot', { accion: 'vaciar' })).status, 500);
  assert.equal(readFileSync(join(dir, 'panel', 'usuario.json'), 'utf8'), danado);
  assert.equal(readFileSync(join(dir, 'panel', 'comandos-bot.json'), 'utf8'), '{"no":"lista"}');
});

test('server: empty GET creates nothing; merging commands never overwrites a saved description', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'panel-a1-fusion-'));
  const srv = await arrancarServidor(dir);
  t.after(srv.parar);
  const g = await fetch(`${srv.base}/api/panel/lista?tipo=canal`);
  assert.deepEqual(await g.json(), { valores: [] });
  assert.equal(existsSync(join(dir, 'panel', 'canal.json')), false);
  await post(srv.base, '/api/panel/comandos-bot', { accion: 'agregar', comando: '!redes', descripcion: 'Mía' });
  const f = await post(srv.base, '/api/panel/comandos-bot', { accion: 'fusionar', comandos: [['!redes', 'Otra'], ['!repo', 'Repo']] });
  assert.equal(f.status, 200);
  assert.deepEqual((await f.json()).comandos, [['!redes', 'Mía'], ['!repo', 'Repo']]);
});

// ── End to end: real handlers + real server, independent sessions + restart ─
test('a confirmed save survives an independent session and a server restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'panel-a1-e2e-'));
  let srv = await arrancarServidor(dir);
  try {
    const haciaServidor = () => (url, opts) => fetch(`${srv.base}${url}`, opts);
    const uno = crearSesion({ fetchImpl: haciaServidor() });
    uno.elemento('input-add-mensaje').value = 'Hola chat';
    assert.equal(await uno.api.agregarItemLista('mensaje', 'input-add-mensaje'), true);
    const n = uno.elemento('new-cmd-name'); n.value = '!hola';
    const d = uno.elemento('new-cmd-desc'); d.value = 'Saluda';
    const tp = uno.elemento('new-cmd-tipo'); tp.value = 'usuario';
    assert.equal(await uno.api.guardarNuevoComando(n, d, tp), true);

    const dos = crearSesion({ fetchImpl: haciaServidor() });
    assert.equal(await dos.api.cargarListas(), true);
    assert.deepEqual([...dos.api.listas().mensaje], ['Hola chat']);
    assert.deepEqual([...dos.api.listas().usuario], []);

    await srv.parar();
    srv = await arrancarServidor(dir);
    const tres = crearSesion({ fetchImpl: haciaServidor() });
    assert.equal(await tres.api.cargarListas(), true);
    assert.deepEqual([...tres.api.listas().mensaje], ['Hola chat']);
    assert.deepEqual(tres.api.listas().comandos.map(c => [...c]), [['!hola [usuario]', 'Saluda']]);
    assert.equal(await tres.api.quitarValorLista('mensaje', 'Hola chat'), true);

    const cuatro = crearSesion({ fetchImpl: haciaServidor() });
    await cuatro.api.cargarListas();
    assert.deepEqual([...cuatro.api.listas().mensaje], [], 'a deleted value stays deleted');
  } finally {
    await srv.parar();
  }
});
