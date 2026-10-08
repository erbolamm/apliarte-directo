import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));

async function arrancar(dataDir) {
  const port = 25000 + Math.floor(Math.random() * 25000);
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      PANEL_PASS: 'test-only-pass',
      NODE_ENV: 'production',
      TWITCH_CHAT_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  child.stdout.on('data', d => { salida += d; });
  child.stderr.on('data', d => { salida += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('server exited:\n' + salida);
    try { if ((await fetch(base + '/api/directo/contexto')).status > 0) break; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  const parar = () => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill();
  });
  return { base, parar, salida: () => salida };
}

test('P3: !contexto enviado desde /api/directo/comando actualiza fijarContextoDirecto y el endpoint /api/directo/contexto', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'contexto-test-'));
  const srv = await arrancar(dir);
  try {
    // 1. GET contexto inicial
    const get1 = await fetch(srv.base + '/api/directo/contexto');
    assert.equal(get1.status, 200);
    const data1 = await get1.json();
    assert.equal(data1.ok, true);

    // 2. Enviar !contexto desde comandos de estudio (/api/directo/comando)
    const postCmd = await fetch(srv.base + '/api/directo/comando', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: '!contexto Charlita y café matutino ☕' }),
    });
    assert.equal(postCmd.status, 200);

    // 3. GET /api/directo/contexto debe reflejar el nuevo texto
    const get2 = await fetch(srv.base + '/api/directo/contexto');
    assert.equal(get2.status, 200);
    const data2 = await get2.json();
    assert.equal(data2.ok, true);
    assert.equal(data2.contexto, 'Charlita y café matutino ☕');

    // 4. Enviar !contexto vacío para limpiar
    const postCmdVacio = await fetch(srv.base + '/api/directo/comando', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: '!contexto' }),
    });
    assert.equal(postCmdVacio.status, 200);

    const get3 = await fetch(srv.base + '/api/directo/contexto');
    assert.equal(get3.status, 200);
    const data3 = await get3.json();
    assert.equal(data3.ok, true);
    assert.equal(data3.contexto, '');
  } finally {
    await srv.parar();
  }
});
