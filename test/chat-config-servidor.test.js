// A3 (Javier, 2026-10-01): the Botrix widget address and the "Todos" chat option
// live on the server (data/panel/chat.json), so every tablet and browser shows
// the same combined chat. Saves are confirmed by the server; a damaged file is
// never overwritten; the browser no longer stores them.
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
const PIZARRA = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
const BOTRIX = 'https://botrix.live/widgets/chat/?bid=test-only';

async function arrancar(dataDir) {
  const port = 20000 + Math.floor(Math.random() * 30000);
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, PANEL_PASS: 'test-only-pass', NODE_ENV: 'production', TWITCH_CHAT_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  child.stdout.on('data', d => { salida += d; });
  child.stderr.on('data', d => { salida += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('server exited:\n' + salida);
    try { if ((await fetch(base + '/api/panel/chat-config')).status > 0) break; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  const parar = () => new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill(); });
  return { base, parar, salida: () => salida };
}
const post = (base, body) => fetch(base + '/api/panel/chat-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('the chat configuration is saved on the server and survives a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chat-config-'));
  let srv = await arrancar(dir);
  try {
    assert.deepEqual(await (await fetch(srv.base + '/api/panel/chat-config')).json(), { todos: false, botrixUrl: '' });
    assert.equal(existsSync(join(dir, 'panel', 'chat.json')), false, 'reading creates nothing');
    const saved = await post(srv.base, { botrixUrl: BOTRIX, todos: true });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { ok: true, todos: true, botrixUrl: BOTRIX });
    await srv.parar();
    srv = await arrancar(dir);
    assert.deepEqual(await (await fetch(srv.base + '/api/panel/chat-config')).json(), { todos: true, botrixUrl: BOTRIX });
    const off = await post(srv.base, { todos: false });
    assert.deepEqual(await off.json(), { ok: true, todos: false, botrixUrl: BOTRIX }, 'switching off keeps the address');
    assert.doesNotMatch(srv.salida(), /test-only/, 'the widget address is never printed');
  } finally { await srv.parar(); }
});

test('only botrix.live https addresses and boolean options are accepted', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'chat-config-val-'));
  const srv = await arrancar(dir);
  t.after(srv.parar);
  for (const body of [
    { botrixUrl: 'https://evil.example/x' }, { botrixUrl: 'http://botrix.live/x' }, { botrixUrl: 'javascript:alert(1)' },
    { botrixUrl: 'https://botrix.live/' + 'x'.repeat(600) }, { todos: 'yes' }, { todos: 1 }, {}, { botrixUrl: 42 },
  ]) {
    assert.equal((await post(srv.base, body)).status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal((await post(srv.base, { botrixUrl: '' })).status, 200, 'an empty address clears it');
  assert.equal(existsSync(join(dir, 'panel', 'config.json')), false);
});

test('a damaged chat file is reported and never overwritten', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'chat-config-danado-'));
  mkdirSync(join(dir, 'panel'), { recursive: true });
  writeFileSync(join(dir, 'panel', 'chat.json'), '{"todos": tru');
  const srv = await arrancar(dir);
  t.after(srv.parar);
  assert.equal((await fetch(srv.base + '/api/panel/chat-config')).status, 500);
  assert.equal((await post(srv.base, { todos: true })).status, 500);
  assert.equal(readFileSync(join(dir, 'panel', 'chat.json'), 'utf8'), '{"todos": tru');
});

function extract(source, name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n    \\}`));
  assert.ok(match, `function ${name} exists`);
  return match[0];
}

test('Admin saves only after the server confirms, and keeps the previous state on failure', async () => {
  const run = async (respuesta) => {
    const toasts = [];
    const ctx = {
      fetch: async () => respuesta(), showToast: t => toasts.push(t), JSON, Promise,
      chatConfig: { todos: false, botrixUrl: '' },
    };
    vm.createContext(ctx);
    vm.runInContext(['pedirPanel', 'motivoFallo', 'guardarConfigChat'].map(n => extract(ADMIN, n)).join('\n') + ';this.guardar = guardarConfigChat;', ctx);
    const ok = await ctx.guardar({ botrixUrl: BOTRIX, todos: true });
    return { ok, config: { ...ctx.chatConfig }, toasts };
  };
  const good = await run(() => new Response(JSON.stringify({ ok: true, todos: true, botrixUrl: BOTRIX }), { status: 200 }));
  assert.equal(good.ok, true);
  assert.deepEqual(good.config, { todos: true, botrixUrl: BOTRIX });
  for (const fail of [() => new Response('{}', { status: 401 }), () => new Response('{}', { status: 500 }), () => { throw new TypeError('offline'); }]) {
    const bad = await run(fail);
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.config, { todos: false, botrixUrl: '' }, 'nothing changes on failure');
    assert.ok(bad.toasts.some(t => t.startsWith('❌')));
  }
});

test('the browser no longer stores the Botrix address; old values are only offered, never uploaded alone', () => {
  assert.doesNotMatch(ADMIN, /localStorage\.setItem\(CLAVE_BOTRIX_URL|localStorage\.setItem\(CLAVE_CHAT_TODOS/);
  assert.match(ADMIN, /\/api\/panel\/chat-config/);
  assert.match(ADMIN, /botrixInput\.value = anterior/, 'an address saved in this browser is pre-filled for an explicit save');
  assert.doesNotMatch(ADMIN, /botrix\.live\/widgets\/chat\/\?bid=[A-Za-z0-9]/);
});

test('the Pizarra chat reads the same server configuration', () => {
  assert.match(PIZARRA, /fetch\('\/api\/panel\/chat-config'/);
  assert.doesNotMatch(PIZARRA, /erbolamm-botrix-widget-url|erbolamm-chat-todos/);
});
