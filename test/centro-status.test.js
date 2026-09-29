const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const { handleCentreStatus } = require('../src/centro-status');
function response() {
  return { status: 0, headers: {}, body: '', writeHead(code, headers = {}) { this.status = code; this.headers = headers; }, end(body = '') { this.body = body; } };
}
test('status proxy is GET-only, authenticated, and strips keys, URLs, logs and raw errors', async () => {
  const req = { method: 'GET' };
  const denied = response();
  handleCentreStatus(req, denied, () => false);
  assert.equal(denied.status, 401);
  const payload = { estado: 'reenviando', obsActivo: true, destinos: [{ nombre: 'twitch', listo: true, pid: 1, modo: 'relay', url: 'rtmp://host/app/SECRET', error: 'SECRET' }], registro: ['SECRET'] };
  const requester = (_options, onResponse) => {
    const incoming = new EventEmitter(); incoming.statusCode = 200;
    const outbound = new EventEmitter(); outbound.setTimeout = () => {}; outbound.end = () => { onResponse(incoming); queueMicrotask(() => { incoming.emit('data', Buffer.from(JSON.stringify(payload))); incoming.emit('end'); }); }; return outbound;
  };
  const ok = response();
  handleCentreStatus(req, ok, () => true, { port: 12345, requester });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(ok.body).destinos[0].nombre, 'twitch');
  assert.doesNotMatch(ok.body, /SECRET|rtmp|registro|pid/);
  const method = response(); handleCentreStatus({ method: 'POST' }, method, () => true); assert.equal(method.status, 405);
});

test('status proxy reaches only a loopback centre on random test ports', async () => {
  const upstream = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ estado: 'reenviando', destinos: [{ nombre: 'youtube', listo: true, pid: 42, modo: 'relay', url: 'rtmp://host/live/SECRET' }] }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const overlay = http.createServer((req, res) => handleCentreStatus(req, res, () => true, { port: upstream.address().port }));
  await new Promise(resolve => overlay.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${overlay.address().port}/api/panel/destinos`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.equal(JSON.parse(body).destinos[0].activo, true);
    assert.doesNotMatch(body, /SECRET|rtmp|pid/);
  } finally {
    await new Promise(resolve => overlay.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
  }
});
