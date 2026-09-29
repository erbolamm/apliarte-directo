import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { crearRutasPanel } from '../src/panel-rutas.js';

// Rutas reales sobre un Express real en un puerto efímero y un directorio
// temporal: nunca se toca directo/data/ ni el servidor de emisión.
async function arrancar(t) {
  const raiz = mkdtempSync(join(tmpdir(), 'panel-rutas-test-'));
  const app = express();
  app.use(express.json());
  app.use(crearRutasPanel(raiz));
  const servidor = await new Promise((ok) => {
    const s = app.listen(0, '127.0.0.1', () => ok(s));
  });
  t.after(() => {
    servidor.close();
    rmSync(raiz, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const post = (ruta, cuerpo) =>
    fetch(`${base}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:8791' },
      body: JSON.stringify(cuerpo),
    });
  return { raiz, base, post };
}

test('GET /api/panel/lista devuelve la lista guardada y lleva CORS', async (t) => {
  const { base, post } = await arrancar(t);
  await post('/api/panel/lista', { tipo: 'usuario', accion: 'agregar', valor: 'elesky' });
  const r = await fetch(`${base}/api/panel/lista?tipo=usuario`, { headers: { Origin: 'http://127.0.0.1:8791' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8791');
  assert.deepEqual(await r.json(), { valores: ['elesky'] });
});

test('GET /api/panel/lista rechaza un tipo desconocido con 400', async (t) => {
  const { base } = await arrancar(t);
  const r = await fetch(`${base}/api/panel/lista?tipo=secretos`);
  assert.equal(r.status, 400);
});

test('OPTIONS responde al preflight del panel servido desde la Oficina (8791)', async (t) => {
  const { base } = await arrancar(t);
  const r = await fetch(`${base}/api/panel/lista`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://127.0.0.1:8791',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8791');
  assert.match(r.headers.get('access-control-allow-methods'), /POST/);
  assert.match(r.headers.get('access-control-allow-headers'), /Content-Type/i);
});

test('POST desde un origen ajeno se rechaza antes de persistir', async (t) => {
  const { raiz, base } = await arrancar(t);
  const r = await fetch(`${base}/api/panel/lista`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://ajeno.example' },
    body: JSON.stringify({ tipo: 'usuario', accion: 'agregar', valor: 'intruso' }),
  });
  assert.equal(r.status, 403);
  assert.equal(existsSync(join(raiz, 'panel', 'usuario.json')), false);
});

test('POST agregar y quitar persisten en data/panel/<tipo>.json', async (t) => {
  const { raiz, post } = await arrancar(t);
  await post('/api/panel/lista', { tipo: 'canal', accion: 'agregar', valor: '  CursosDeDesarrollo ' });
  await post('/api/panel/lista', { tipo: 'canal', accion: 'agregar', valor: 'nMarulo' });
  const r = await post('/api/panel/lista', { tipo: 'canal', accion: 'quitar', valor: 'nMarulo' });
  assert.deepEqual(await r.json(), { valores: ['CursosDeDesarrollo'] });
  assert.deepEqual(JSON.parse(readFileSync(join(raiz, 'panel', 'canal.json'), 'utf8')), ['CursosDeDesarrollo']);
});

test('POST agregar sin valor o con acción desconocida devuelve 400', async (t) => {
  const { post } = await arrancar(t);
  assert.equal((await post('/api/panel/lista', { tipo: 'usuario', accion: 'agregar', valor: '  ' })).status, 400);
  assert.equal((await post('/api/panel/lista', { tipo: 'usuario', accion: 'borrarTodo' })).status, 400);
});

test('POST fusionar une lo del navegador con lo del disco', async (t) => {
  const { post } = await arrancar(t);
  await post('/api/panel/lista', { tipo: 'usuario', accion: 'agregar', valor: 'elesky' });
  const r = await post('/api/panel/lista', { tipo: 'usuario', accion: 'fusionar', valores: ['elesky', 'soloEnElNavegador'] });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { valores: ['elesky', 'soloEnElNavegador'] });
});

test('POST fusionar sin array devuelve 400', async (t) => {
  const { post } = await arrancar(t);
  assert.equal((await post('/api/panel/lista', { tipo: 'usuario', accion: 'fusionar', valores: 'x' })).status, 400);
});

test('comandos-bot: semilla, agregar, fusionar y quitar', async (t) => {
  const { base, post } = await arrancar(t);
  const inicial = await (await fetch(`${base}/api/panel/comandos-bot`)).json();
  assert.deepEqual(inicial.comandos.map(([c]) => c), ['!so [usuario]']);
  await post('/api/panel/comandos-bot', { accion: 'agregar', comando: '!discord', descripcion: 'Discord' });
  const fusion = await (await post('/api/panel/comandos-bot', {
    accion: 'fusionar',
    comandos: [['!discord', 'otra'], ['!redes', 'Redes']],
  })).json();
  assert.deepEqual(fusion.comandos.map(([c]) => c), ['!so [usuario]', '!discord', '!redes']);
  const quitado = await (await post('/api/panel/comandos-bot', { accion: 'quitar', comando: '!discord' })).json();
  assert.deepEqual(quitado.comandos.map(([c]) => c), ['!so [usuario]', '!redes']);
  const vaciado = await (await post('/api/panel/comandos-bot', { accion: 'vaciar' })).json();
  assert.deepEqual(vaciado.comandos, []);
});

test('voces: leer, guardar y fusionar mediante /api/panel/voces', async (t) => {
  const { base, post } = await arrancar(t);
  const inicial = await (await fetch(`${base}/api/panel/voces`)).json();
  assert.deepEqual(inicial.voces, {});

  const guardado = await (await post('/api/panel/voces', {
    accion: 'guardar',
    usuario: 'Javier',
    voz: { lang: 'es-ES', slot: 2, name: 'Alvaro' },
  })).json();
  assert.deepEqual(guardado.voces.javier, { lang: 'es-ES', slot: 2, name: 'Alvaro' });

  const fusion = await (await post('/api/panel/voces', {
    accion: 'fusionar',
    voces: { maria: { lang: 'es-MX', slot: 1 } },
  })).json();
  assert.deepEqual(fusion.voces.javier, { lang: 'es-ES', slot: 2, name: 'Alvaro' });
  assert.deepEqual(fusion.voces.maria, { lang: 'es-MX', slot: 1 });
});

test('usuarios-ignorados: leer, agregar, quitar y fusionar mediante /api/panel/usuarios-ignorados', async (t) => {
  const { base, post } = await arrancar(t);
  const inicial = await (await fetch(`${base}/api/panel/usuarios-ignorados`)).json();
  assert.ok(Array.isArray(inicial.usuarios));
  assert.ok(inicial.usuarios.includes('streamelements'));
  assert.ok(inicial.usuarios.includes('pepitoelpapas'));

  const agregado = await (await post('/api/panel/usuarios-ignorados', {
    accion: 'agregar',
    usuario: 'Spammer123',
  })).json();
  assert.ok(agregado.usuarios.includes('spammer123'));

  const quitado = await (await post('/api/panel/usuarios-ignorados', {
    accion: 'quitar',
    usuario: 'spammer123',
  })).json();
  assert.equal(quitado.usuarios.includes('spammer123'), false);

  const fusion = await (await post('/api/panel/usuarios-ignorados', {
    accion: 'fusionar',
    usuarios: ['BotA', 'BotB'],
  })).json();
  assert.ok(fusion.usuarios.includes('bota'));
  assert.ok(fusion.usuarios.includes('botb'));

  const reemplazado = await (await post('/api/panel/usuarios-ignorados', {
    accion: 'reemplazar',
    usuarios: ['soloestebot'],
  })).json();
  assert.deepEqual(reemplazado.usuarios, ['soloestebot']);
});

// Guardia contra la pérdida del 2026-09-17/18: las rutas vivían escritas a
// mano en server.js y desaparecieron en una edición concurrente sin que
// ningún test fallara. Ahora server.js debe montar este router.
test('server.js monta las rutas del panel', () => {
  const servidor = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(servidor, /import\s*\{\s*crearRutasPanel\s*\}\s*from\s*["']\.\/panel-rutas\.js["']/);
  assert.match(servidor, /app\.use\(\s*crearRutasPanel\(/);
});
