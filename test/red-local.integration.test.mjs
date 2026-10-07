import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Set env BEFORE requiring server.js (it reads PANEL_PASS when loaded).
process.env.PANEL_PASS = 'integration-test-panel-pass-red';
process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const { server } = require('../server.js');

let base;

test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('GET /api/panel/red describes how other devices reach the panel', async () => {
  const response = await fetch(`${base}/api/panel/red`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(typeof data.port, 'number');
  assert.ok(Array.isArray(data.lan));
  for (const address of data.lan) assert.match(address, /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/);
  assert.equal(typeof data.lanReachable, 'boolean');
  assert.equal(typeof data.tailscale.active, 'boolean');
  if (data.tailscale.active) {
    assert.match(data.tailscale.ip, /^100\./);
    assert.match(data.tailscale.url, /^https?:\/\//);
  } else {
    assert.deepEqual(data.tailscale, { active: false, ip: null, url: null });
  }
  // Addresses only: no configuration, keys or tokens leak through here.
  assert.deepEqual(Object.keys(data).sort(), ['lan', 'lanReachable', 'ok', 'port', 'tailscale']);
});

test('the endpoint is read-only', async () => {
  const response = await fetch(`${base}/api/panel/red`, { method: 'POST', body: '{}' });
  assert.equal(response.status, 405);
});

test('/estudio serves the unified studio page', async () => {
  const response = await fetch(`${base}/estudio`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /<title>ApliArte Directo · Estudio<\/title>/);
});
