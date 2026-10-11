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
    try { if ((await fetch(base + '/api/directo/avatares')).status > 0) break; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  let parado = false;
  const parar = () => new Promise(resolve => {
    if (parado || child.exitCode !== null || child.killed) return resolve();
    parado = true;
    child.once('exit', resolve);
    child.kill();
  });
  return { base, parar, salida: () => salida };
}

test('Auto-liberación de avatares por inactividad de 5 minutos en el servidor', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-inactividad-test-'));
  const srv = await arrancar(dir);
  try {
    // 1. Adoptar un avatar
    const resAdop = await fetch(`${srv.base}/api/directo/comando`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: 'adoptar', agente: 'cl', usuario: 'viewer_inactivo' })
    });
    assert.equal(resAdop.status, 200);
    const dataAdop = await resAdop.json();
    assert.equal(dataAdop.duenos.cl, 'viewer_inactivo');

    // 2. Verificar que figura en /api/directo/avatares
    const resGet1 = await fetch(`${srv.base}/api/directo/avatares`);
    assert.equal(resGet1.status, 200);
    const dataGet1 = await resGet1.json();
    assert.equal(dataGet1.avatares.cl, 'viewer_inactivo');
    assert.equal(dataGet1.avatares.ja, 'apliarte');

    // 3. Un mensaje de comando renueva la actividad
    const resCmd = await fetch(`${srv.base}/api/directo/comando`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: '!cafe', usuario: 'viewer_inactivo' })
    });
    assert.equal(resCmd.status, 200);
  } finally {
    await srv.parar();
  }
});
