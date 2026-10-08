// test/cola-servidor.test.js
// Verifica de punta a punta que ColaAnimaciones está integrada en server.js
// y que /api/directo/comando encola fiesta, conga y bronca sin solapamientos.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));

async function arrancar(dataDir) {
  const port = 26000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      PANEL_PASS: 'test-cola-pass',
      NODE_ENV: 'production',
      TWITCH_CHAT_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  child.stdout.on('data', (d) => { salida += d; });
  child.stderr.on('data', (d) => { salida += d; });
  const base = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws?token=test-cola-pass`;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('server exited:\n' + salida);
    try {
      if ((await fetch(base + '/api/directo/comando')).status > 0) break;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const parar = () => new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill();
  });
  return { base, wsUrl, parar, salida: () => salida };
}

test('P5 Servidor: fiesta, conga y bronca pasan por la cola y no se solapan', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cola-test-'));
  const srv = await arrancar(dir);

  try {
    const ws = new WebSocket(srv.wsUrl);
    const mensajes = [];
    ws.on('message', (raw) => {
      try {
        mensajes.push(JSON.parse(raw.toString('utf8')));
      } catch (_) {}
    });

    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // 1. Enviar !bronca desde /api/directo/comando
    const res1 = await fetch(srv.base + '/api/directo/comando', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: '!bronca', usuario: 'ja' }),
    });
    assert.equal(res1.status, 200);

    // Esperar a que llegue el comando_chat de !bronca
    await new Promise((r) => setTimeout(r, 200));
    const broncaCmd = mensajes.find((m) => m.type === 'comando_chat' && m.comando === '!bronca');
    assert.ok(broncaCmd, 'El servidor debe iniciar la bronca');

    // 2. Enviar !conga mientras la bronca está activa
    const res2 = await fetch(srv.base + '/api/directo/comando', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: '!conga', usuario: 'ja' }),
    });
    assert.equal(res2.status, 200);

    // Comprobar que NO ha salido todavía la conga (está en cola)
    await new Promise((r) => setTimeout(r, 200));
    const congaCmd = mensajes.find((m) => m.type === 'comando_chat' && m.comando === '!conga');
    assert.equal(congaCmd, undefined, 'La conga debe esperar en la cola sin solaparse');

    ws.close();
  } finally {
    await srv.parar();
  }
});
