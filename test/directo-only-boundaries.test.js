import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');
process.env.NODE_ENV = 'test';
process.env.PANEL_PASS = 'test-only-directo-boundaries';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'directo-boundaries-test-'));

for (const [name, modulePath] of [
  ['main server', '../server.js'],
  ['VPS overlay server', '../vps-overlay/server.js'],
]) {
  test(`${name}: own camera config remains guarded and old phone routes are gone`, async () => {
    const { server } = require(modulePath);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const remote = { 'x-forwarded-for': '203.0.113.10' };

    try {
      const unauthenticated = await fetch(`${base}/api/directo/camara/config`, { headers: remote });
      assert.equal(unauthenticated.status, 401);
      assert.equal(unauthenticated.headers.get('cache-control'), 'no-store');
      assert.equal((await unauthenticated.text()).includes('streamId'), false);

      const authenticated = await fetch(`${base}/api/directo/camara/config`, {
        headers: { ...remote, authorization: `Bearer ${process.env.PANEL_PASS}` },
      });
      assert.equal(authenticated.status, 200);
      assert.equal(authenticated.headers.get('cache-control'), 'no-store');

      for (const [method, route] of [
        ['GET', '/photo/latest.jpg'],
        ['POST', '/agent/ask'],
        ['POST', '/agent/command'],
        ['POST', '/device/response'],
        ['GET', '/ws/bot'],
      ]) {
        const response = await fetch(`${base}${route}`, {
          method,
          headers: { authorization: `Bearer ${process.env.PANEL_PASS}` },
        });
        assert.equal(response.status, 404, `${method} ${route} must be absent`);
      }

      const socket = new WebSocket(`${base.replace('http:', 'ws:')}/ws/bot`);
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Old bot WebSocket did not close')), 1500);
        socket.once('open', () => {
          clearTimeout(timer);
          reject(new Error('Old bot WebSocket unexpectedly opened'));
        });
        socket.once('error', () => {
          clearTimeout(timer);
          resolve('rejected');
        });
      });
      assert.equal(result, 'rejected');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
}

test('old phone implementation and secret wiring are absent from Directo', () => {
  for (const filename of [
    '../server.js', '../vps-overlay/server.js',
    '../src/ws-auth.js', '../vps-overlay/src/ws-auth.js',
  ]) {
    const source = fs.readFileSync(new URL(filename, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /latestPhotoBuffer|broadcastBot|botClients|botWss|\/ws\/bot|\/agent\/ask|\/agent\/command|\/device\/response|TELEGRAM_BOT_TOKEN/);
  }
});
