import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
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
    try { if ((await fetch(base + '/api/directo/youtube/chat')).status > 0) break; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  const parar = () => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill();
  });
  return { base, parar, salida: () => salida };
}

test('endpoint /api/directo/youtube/chat: GET y POST de configuración de stream', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'yt-test-'));
  const srv = await arrancar(dir);
  try {
    // 1. GET público
    const resGet = await fetch(srv.base + '/api/directo/youtube/chat');
    assert.equal(resGet.status, 200);
    const dataGet = await resGet.json();
    assert.equal(dataGet.ok, true);
    assert.ok(typeof dataGet.conectado === 'boolean');
    assert.ok(dataGet.canal);

    // 2. POST con JSON inválido devuelve 400
    const resPostInvalid = await fetch(srv.base + '/api/directo/youtube/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json{{'
    });
    assert.equal(resPostInvalid.status, 400);

    // 3. POST actualiza vídeo
    const resPostOk = await fetch(srv.base + '/api/directo/youtube/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: 'ZuWtlv2piac' })
    });
    assert.equal(resPostOk.status, 200);
    const dataPost = await resPostOk.json();
    assert.equal(dataPost.ok, true);
    assert.equal(dataPost.videoId, 'ZuWtlv2piac');
  } finally {
    await srv.parar();
  }
});
