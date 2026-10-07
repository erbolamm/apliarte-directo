import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Set env BEFORE requiring server.js (it reads PANEL_PASS when loaded).
process.env.PANEL_PASS = 'integration-test-panel-pass-sms';
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

test('no SMS is on screen until one is chosen', async () => {
  const response = await fetch(`${base}/api/directo/sms/pantalla`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, mensaje: null });
});

test('showing an id that is not in the mailbox is refused and shows nothing', async () => {
  const response = await fetch(`${base}/api/directo/sms/mostrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'sms-que-no-existe' }),
  });
  assert.equal(response.status, 404);
  const after = await (await fetch(`${base}/api/directo/sms/pantalla`)).json();
  assert.equal(after.mensaje, null);
});

test('hiding is always safe and the mailbox routes still answer', async () => {
  const hidden = await fetch(`${base}/api/directo/sms/ocultar`, { method: 'POST' });
  assert.equal(hidden.status, 200);
  const mailbox = await fetch(`${base}/api/directo/sms`);
  assert.equal(mailbox.status, 200);
  assert.ok(Array.isArray((await mailbox.json()).mensajes));
});

test('the on-screen page is served for OBS', async () => {
  const response = await fetch(`${base}/sms-pantalla.html`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /api\/directo\/sms\/pantalla/);
});
