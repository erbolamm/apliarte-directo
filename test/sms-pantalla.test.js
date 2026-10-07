const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createSmsPantalla, safeAvatar } = require('../src/sms-pantalla');

function response() {
  return {
    status: 0, headers: {}, body: '',
    removeHeader() {},
    writeHead(code, headers = {}) { this.status = code; this.headers = headers; },
    end(body = '') { this.body = body; },
    json() { return JSON.parse(this.body); },
  };
}
function request(method, body) {
  const req = new EventEmitter();
  req.method = method;
  if (body !== undefined) queueMicrotask(() => { req.emit('data', typeof body === 'string' ? body : JSON.stringify(body)); req.emit('end'); });
  return req;
}
const allow = () => true;
function mailbox() {
  const list = [
    { id: 'sms-1', usuario: 'Pepe', texto: 'hola desde el chat', fecha: '2026-10-07T10:00:00Z', leido: false },
    { id: 'sms-2', usuario: 'anónimo', texto: 'otro', fecha: '2026-10-07T10:01:00Z', leido: true },
  ];
  return { list, get: () => list };
}

test('only an https picture is accepted as avatar', () => {
  assert.equal(safeAvatar('https://static-cdn.jtvnw.net/a.png'), 'https://static-cdn.jtvnw.net/a.png');
  for (const bad of ['http://x.test/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '', null, 'no es una url']) assert.equal(safeAvatar(bad), null, String(bad));
});

test('every route needs authorisation and the right method', async () => {
  const screen = createSmsPantalla({ getSmsList: mailbox().get });
  for (const [path, method] of [['/api/directo/sms/pantalla', 'GET'], ['/api/directo/sms/mostrar', 'POST'], ['/api/directo/sms/ocultar', 'POST']]) {
    assert.equal(screen.matches(path), true);
    const denied = response();
    await screen.handle(request(method, {}), denied, path, () => false);
    assert.equal(denied.status, 401, path);
  }
  assert.equal(screen.matches('/api/directo/sms'), false);
  assert.equal(screen.matches('/api/directo/sms/borrar'), false);
  const wrongGet = response();
  await screen.handle(request('POST', {}), wrongGet, '/api/directo/sms/pantalla', allow);
  assert.equal(wrongGet.status, 405);
  const wrongPost = response();
  await screen.handle(request('GET'), wrongPost, '/api/directo/sms/mostrar', allow);
  assert.equal(wrongPost.status, 405);
});

test('nothing is on screen until a message is chosen, and only that one is exposed', async () => {
  const box = mailbox();
  const asked = [];
  const screen = createSmsPantalla({ getSmsList: box.get, lookupAvatar: async user => { asked.push(user); return 'https://cdn.example/pepe.png'; } });

  const empty = response();
  await screen.handle(request('GET'), empty, '/api/directo/sms/pantalla', allow);
  assert.deepEqual(empty.json(), { ok: true, mensaje: null });
  assert.equal(empty.headers['Cache-Control'], 'no-store');

  const shown = response();
  await screen.handle(request('POST', { id: 'sms-1' }), shown, '/api/directo/sms/mostrar', allow);
  assert.equal(shown.status, 200);
  assert.deepEqual(shown.json().mensaje, { id: 'sms-1', usuario: 'Pepe', texto: 'hola desde el chat', avatar: 'https://cdn.example/pepe.png' });
  assert.deepEqual(asked, ['pepe']);

  const polled = response();
  await screen.handle(request('GET'), polled, '/api/directo/sms/pantalla', allow);
  assert.equal(polled.json().mensaje.id, 'sms-1');
  assert.doesNotMatch(polled.body, /otro|sms-2/);

  const hidden = response();
  await screen.handle(request('POST', {}), hidden, '/api/directo/sms/ocultar', allow);
  assert.deepEqual(hidden.json(), { ok: true, mensaje: null });
  assert.equal(screen.current, null);
});

test('an unknown id, a bad body or a failing picture lookup never break the screen', async () => {
  const box = mailbox();
  const screen = createSmsPantalla({ getSmsList: box.get, lookupAvatar: async () => { throw new Error('twitch down'); } });

  const missing = response();
  await screen.handle(request('POST', { id: 'no-existe' }), missing, '/api/directo/sms/mostrar', allow);
  assert.equal(missing.status, 404);
  const noId = response();
  await screen.handle(request('POST', {}), noId, '/api/directo/sms/mostrar', allow);
  assert.equal(noId.status, 400);
  const garbage = response();
  await screen.handle(request('POST', '{no json'), garbage, '/api/directo/sms/mostrar', allow);
  assert.equal(garbage.status, 400);
  const huge = response();
  await screen.handle(request('POST', JSON.stringify({ id: 'x'.repeat(5000) })), huge, '/api/directo/sms/mostrar', allow);
  assert.equal(huge.status, 400);
  assert.equal(screen.current, null);

  const shown = response();
  await screen.handle(request('POST', { id: 'sms-2' }), shown, '/api/directo/sms/mostrar', allow);
  assert.deepEqual(shown.json().mensaje, { id: 'sms-2', usuario: 'anónimo', texto: 'otro', avatar: null });
});

test('a message deleted from the mailbox leaves the screen, and pictures are cached', async () => {
  const box = mailbox();
  let lookups = 0;
  let clock = 0;
  const screen = createSmsPantalla({ getSmsList: box.get, lookupAvatar: async () => { lookups++; return 'http://insecure.example/a.png'; }, now: () => clock });
  await screen.show('sms-1');
  assert.equal(screen.current.avatar, null);
  await screen.show('sms-1');
  assert.equal(lookups, 1);
  clock = 2 * 60 * 60 * 1000;
  await screen.show('sms-1');
  assert.equal(lookups, 2);

  box.list.splice(0, 1);
  const polled = response();
  await screen.handle(request('GET'), polled, '/api/directo/sms/pantalla', allow);
  assert.deepEqual(polled.json(), { ok: true, mensaje: null });
});
