import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));

async function arrancar(dataDir) {
  const port = 20000 + Math.floor(Math.random() * 30000);
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
    try { if ((await fetch(base + '/api/panel/bienvenida')).status > 0) break; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  const parar = () => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill();
  });
  return { base, parar, salida: () => salida };
}

const post = (base, body) => fetch(base + '/api/panel/bienvenida', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('endpoint /api/panel/bienvenida: siempre activa = true y no se puede desactivar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bienvenida-test-'));
  let srv = await arrancar(dir);
  try {
    // 1. GET por defecto: activa = true
    const get1 = await fetch(srv.base + '/api/panel/bienvenida');
    assert.equal(get1.status, 200);
    assert.deepEqual(await get1.json(), { ok: true, activa: true });

    // 2. POST intentar desactivar: el servidor responde activa: true
    const saved = await post(srv.base, { activa: false });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { ok: true, activa: true });

    // 3. GET sigue siendo activa: true
    const get2 = await fetch(srv.base + '/api/panel/bienvenida');
    assert.deepEqual(await get2.json(), { ok: true, activa: true });

    // 4. Reiniciar servidor y verificar que sigue activa: true
    await srv.parar();
    srv = await arrancar(dir);
    const get3 = await fetch(srv.base + '/api/panel/bienvenida');
    assert.deepEqual(await get3.json(), { ok: true, activa: true }, 'siempre activo');
  } finally {
    await srv.parar();
  }
});

