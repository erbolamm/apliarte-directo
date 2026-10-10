import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Set env BEFORE requiring server.js (server.js lee PANEL_PASS al cargar).
const TEST_PANEL = 'integration-test-panel-pass-1234';
process.env.PANEL_PASS = TEST_PANEL;
process.env.NODE_ENV = 'test';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const { server } = require('../server.js');

let port;
const openSockets = [];

function track(ws) {
  openSockets.push(ws);
  return ws;
}

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function waitClose(ws) {
  return new Promise((resolve) => {
    ws.once('close', (code, reason) => resolve({ code, reason: reason && reason.toString() }));
  });
}

// Helper para drenar mensajes iniciales (escenas que el server
// envia en el handshake) antes de empezar a contar lo que nos interesa.
// Local sockets from another web origin keep the restricted 'publico' role.
function publicoSocket() {
  return track(new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: 'https://other.example' } }));
}

function drainMs(ms = 200) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForMessage(ws, predicate, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeoutMs);
    function onMessage(data) {
      let message;
      try { message = JSON.parse(data.toString()); } catch (_) { return; }
      if (!predicate(message)) return;
      clearTimeout(timeout);
      ws.off('message', onMessage);
      resolve(message);
    }
    ws.on('message', onMessage);
  });
}

test.before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

test.after(async () => {
  for (const ws of openSockets) {
    if (ws.readyState === 1) ws.close();
  }
  await new Promise((resolve) => server.close(resolve));
});

// ─── /ws handshake ──────────────────────────────────────────────────────────

test('handshake /ws: con ?token=PANEL_PASS valido abre como admin', async () => {
  const ws = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  await waitOpen(ws);
  assert.equal(ws.readyState, 1);
  ws.close();
});

test('handshake /ws: sin token desde 127.0.0.1 y sin Origin abre como admin', async () => {
  const local = track(new WebSocket(`ws://127.0.0.1:${port}/ws`));
  const admin = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  await Promise.all([waitOpen(local), waitOpen(admin)]);
  const got = waitForMessage(local, m => m.type === 'comando_chat' && m.marker === 'local-admin');
  admin.send(JSON.stringify({ type: 'comando_chat', comando: '!test', marker: 'local-admin' }));
  await got;
  local.close();
  admin.close();
});

test('handshake /ws: sin token desde 127.0.0.1 con Origin del mismo host abre como admin', async () => {
  const local = track(new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: `http://127.0.0.1:${port}` } }));
  const admin = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  await Promise.all([waitOpen(local), waitOpen(admin)]);
  const got = waitForMessage(admin, m => m.type === 'directo_comando' && m.marker === 'same-origin');
  local.send(JSON.stringify({ type: 'directo_comando', cmd: {}, marker: 'same-origin' }));
  await got;
  local.close();
  admin.close();
});

test('handshake /ws: con token invalido cierra 4001', async () => {
  const ws = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=wrong-token`));
  const result = await waitClose(ws);
  assert.equal(result.code, 4001);
});

test('handshake /ws: panel cookie same-origin grants admin without URL token', async () => {
  const url = `ws://127.0.0.1:${port}/ws`;
  const cookieAdmin = track(new WebSocket(url, { headers: {
    Origin: `http://127.0.0.1:${port}`, Cookie: `tts_auth=${TEST_PANEL}`
  } }));
  const admin = track(new WebSocket(`${url}?token=${TEST_PANEL}`));
  await Promise.all([waitOpen(cookieAdmin), waitOpen(admin)]);
  const message = waitForMessage(admin, m => m.type === 'sms_nuevo' && m.marker === 'cookie-admin');
  cookieAdmin.send(JSON.stringify({ type: 'sms_nuevo', marker: 'cookie-admin' }));
  await message;
  cookieAdmin.close();
  admin.close();
});

test('handshake /ws: cross-origin cookie stays publico and explicit invalid token closes', async () => {
  const url = `ws://127.0.0.1:${port}/ws`;
  const crossOrigin = track(new WebSocket(url, { headers: {
    Origin: 'https://other.example', Cookie: `tts_auth=${TEST_PANEL}`
  } }));
  const admin = track(new WebSocket(`${url}?token=${TEST_PANEL}`));
  await Promise.all([waitOpen(crossOrigin), waitOpen(admin)]);
  const received = [];
  admin.on('message', data => {
    try { received.push(JSON.parse(data.toString())); } catch (_) {}
  });
  crossOrigin.send(JSON.stringify({ type: 'sms_nuevo', marker: 'cross-origin' }));
  await drainMs(50);
  assert.equal(received.some(m => m.marker === 'cross-origin'), false);

  const invalid = track(new WebSocket(`${url}?token=wrong`, { headers: {
    Origin: `http://127.0.0.1:${port}`, Cookie: `tts_auth=${TEST_PANEL}`
  } }));
  assert.equal((await waitClose(invalid)).code, 4001);
  crossOrigin.close();
  admin.close();
});

// ─── Broadcast filter (T4) ─────────────────────────────────────────────────

test('broadcast: admin envia sms_nuevo, admin2 lo recibe, publico NO', async () => {
  const admin = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  const admin2 = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  const publico = publicoSocket();
  await Promise.all([waitOpen(admin), waitOpen(admin2), waitOpen(publico)]);

  // Drenar mensajes iniciales (escenas del handshake).
  await drainMs();

  const received = { admin2: [], publico: [] };
  admin2.on('message', (data) => {
    try { received.admin2.push(JSON.parse(data.toString())); } catch (_) {}
  });
  publico.on('message', (data) => {
    try { received.publico.push(JSON.parse(data.toString())); } catch (_) {}
  });

  const marker = '__test_sms_marker__';
  admin.send(JSON.stringify({ type: 'sms_nuevo', marker, content: 'secreto' }));
  await drainMs();

  const admin2Got = received.admin2.some(m => m.type === 'sms_nuevo' && m.marker === marker);
  const publicoGot = received.publico.some(m => m.type === 'sms_nuevo' && m.marker === marker);

  assert.equal(admin2Got, true, 'admin2 SI deberia recibir sms_nuevo');
  assert.equal(publicoGot, false, 'publico NO deberia recibir sms_nuevo');

  admin.close();
  admin2.close();
  publico.close();
});

test('broadcast: scene es visible para publico (PUBLIC_EVENTS)', async () => {
  const admin = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  const publico = publicoSocket();
  await Promise.all([waitOpen(admin), waitOpen(publico)]);

  await drainMs();

  const receivedPublico = [];
  publico.on('message', (data) => {
    try { receivedPublico.push(JSON.parse(data.toString())); } catch (_) {}
  });

  const marker = '__test_scene_marker__';
  admin.send(JSON.stringify({ type: 'scene', scene: marker, visible: true }));
  await drainMs();

  const got = receivedPublico.some(m => m.type === 'scene' && m.scene === marker);
  assert.equal(got, true, 'publico SI deberia recibir scene (PUBLIC_EVENTS)');

  admin.close();
  publico.close();
});

test('broadcast: comando_chat llega a admin pero NO a publico', async () => {
  const admin = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  const admin2 = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  const publico = publicoSocket();
  await Promise.all([waitOpen(admin), waitOpen(admin2), waitOpen(publico)]);

  await drainMs();

  const received = { admin2: [], publico: [] };
  admin2.on('message', (data) => {
    try { received.admin2.push(JSON.parse(data.toString())); } catch (_) {}
  });
  publico.on('message', (data) => {
    try { received.publico.push(JSON.parse(data.toString())); } catch (_) {}
  });

  const marker = '__test_cmd_marker__';
  admin.send(JSON.stringify({ type: 'comando_chat', marker, text: 'hola' }));
  await drainMs();

  const admin2Got = received.admin2.some(m => m.type === 'comando_chat' && m.marker === marker);
  const publicoGot = received.publico.some(m => m.type === 'comando_chat' && m.marker === marker);

  assert.equal(admin2Got, true, 'admin2 SI deberia recibir comando_chat');
  assert.equal(publicoGot, false, 'publico NO deberia recibir comando_chat');

  admin.close();
  admin2.close();
  publico.close();
});

// ─── Sender authorization (sender-authz) ────────────────────────────────────

test('sender-authz: publico NO puede inyectar sms_nuevo, comando_chat, directo_comando ni juego_estado a admin', async () => {
  const publico = publicoSocket();
  const admin = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  await Promise.all([waitOpen(publico), waitOpen(admin)]);

  // Drenar mensajes iniciales (escenas del handshake).
  await drainMs();

  const adminReceived = [];
  admin.on('message', (data) => {
    try { adminReceived.push(JSON.parse(data.toString())); } catch (_) {}
  });

  // publico intenta inyectar los 4 eventos restringidos mencionados en el task.
  const attempts = [
    { type: 'sms_nuevo', marker: '__inject_sms__', content: 'fake' },
    { type: 'comando_chat', marker: '__inject_comando__', text: 'fake' },
    { type: 'directo_comando', marker: '__inject_directo__', text: 'fake' },
    { type: 'juego_estado', marker: '__inject_juego__' },
  ];
  for (const m of attempts) {
    publico.send(JSON.stringify(m));
  }
  await drainMs();

  for (const m of attempts) {
    const got = adminReceived.some(
      (recv) => recv.type === m.type && recv.marker === m.marker
    );
    assert.equal(got, false, `publico NO deberia poder inyectar ${m.type} a admin`);
  }

  publico.close();
  admin.close();
});

test('sender-authz: publico SI puede enviar scene y micro_start (PUBLIC_EVENTS, comportamiento legitimo preservado)', async () => {
  const publico = publicoSocket();
  const admin = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  await Promise.all([waitOpen(publico), waitOpen(admin)]);

  await drainMs();

  const adminReceived = [];
  admin.on('message', (data) => {
    try { adminReceived.push(JSON.parse(data.toString())); } catch (_) {}
  });

  const sceneMarker = '__publico_scene_ok__';
  const microMarker = '__publico_micro_start_ok__';

  publico.send(JSON.stringify({ type: 'scene', scene: sceneMarker, visible: true }));
  publico.send(JSON.stringify({ type: 'micro_start' }));

  await drainMs();

  // scene SÍ debe llegar a admin (publico puede emitir PUBLIC_EVENTS).
  const sceneGot = adminReceived.some(
    (m) => m.type === 'scene' && m.scene === sceneMarker
  );
  assert.equal(sceneGot, true, 'publico SI deberia poder emitir scene');

  // micro_start: server lo procesa pero no lo broadcastea como echo al admin
  // (special handler solo notifica al anterior active sender). Verificamos
  // que no crashea y que admin no recibio un mensaje de error.
  const errorMsgs = adminReceived.filter(
    (m) => m.type === 'error' || m.type === 'reject'
  );
  assert.equal(errorMsgs.length, 0, 'admin no deberia recibir errores por micro_start de publico');

  publico.close();
  admin.close();
});

// ─── Bypass fix: parsed.type top-level (no substring matching) ──────────────

test('bypass fix: publico con top-level sms_nuevo + nested micro_start NO llega a admin ni a otros publico', async () => {
  const publico1 = publicoSocket();
  const publico2 = publicoSocket();
  const admin = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  await Promise.all([waitOpen(publico1), waitOpen(publico2), waitOpen(admin)]);

  await drainMs();

  const received = { admin: [], publico2: [] };
  admin.on('message', (data) => {
    try { received.admin.push(JSON.parse(data.toString())); } catch (_) {}
  });
  publico2.on('message', (data) => {
    try { received.publico2.push(JSON.parse(data.toString())); } catch (_) {}
  });

  // Bypass: top-level sms_nuevo (restringido para sender publico) +
  // objeto anidado con type:"micro_start" para tentar el early branch viejo.
  const marker = '__bypass_sms_micro__';
  publico1.send(JSON.stringify({
    type: 'sms_nuevo',
    content: 'injection',
    marker,
    payload: { type: 'micro_start' },
  }));
  await drainMs();

  const adminGot = received.admin.some(
    (m) => m.type === 'sms_nuevo' && m.marker === marker
  );
  const publico2Got = received.publico2.some(
    (m) => m.type === 'sms_nuevo' && m.marker === marker
  );

  assert.equal(adminGot, false, 'admin NO debe recibir sms_nuevo inyectado por publico (bypass)');
  assert.equal(publico2Got, false, 'otro publico NO debe recibir sms_nuevo inyectado (bypass)');

  publico1.close();
  publico2.close();
  admin.close();
});

test('bypass fix: publico con top-level comando_chat + nested micro_stop NO llega a admin', async () => {
  const publico = publicoSocket();
  const admin = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  await Promise.all([waitOpen(publico), waitOpen(admin)]);

  await drainMs();

  const adminReceived = [];
  admin.on('message', (data) => {
    try { adminReceived.push(JSON.parse(data.toString())); } catch (_) {}
  });

  const marker = '__bypass_cmd_micro__';
  publico.send(JSON.stringify({
    type: 'comando_chat',
    text: 'fake',
    marker,
    payload: { type: 'micro_stop' },
  }));
  await drainMs();

  const got = adminReceived.some(
    (m) => m.type === 'comando_chat' && m.marker === marker
  );
  assert.equal(got, false, 'admin NO debe recibir comando_chat inyectado por publico (bypass)');

  publico.close();
  admin.close();
});

test('bypass fix: JSON malformado NO crashea el server ni broadcastea nada', async () => {
  const publico = publicoSocket();
  const admin = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  await Promise.all([waitOpen(publico), waitOpen(admin)]);

  await drainMs();

  const adminReceived = [];
  admin.on('message', (data) => {
    try { adminReceived.push(JSON.parse(data.toString())); } catch (_) {}
  });

  // Tres variantes de JSON malformado
  publico.send('esto no es json {{{');
  publico.send('{ "type": ');
  publico.send('{"type":"sms_nuevo"'); // JSON truncado
  await drainMs();

  // Ningun mensaje del admin debe contener el marker (no se envio ninguno valido)
  const got = adminReceived.some((m) => m && m.marker);
  assert.equal(got, false, 'admin NO debe recibir nada de payloads malformados');

  // Sanity: la conexion sigue viva (el server no crasheo)
  assert.equal(publico.readyState, 1, 'publico sigue conectado tras enviar JSON malformado');
  assert.equal(admin.readyState, 1, 'admin sigue conectado tras recibir silencio del server');

  publico.close();
  admin.close();
});

test('bypass fix: micro_start legitimo de publico sigue funcionando (sin crashear)', async () => {
  const publico = publicoSocket();
  const admin = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  await Promise.all([waitOpen(publico), waitOpen(admin)]);

  await drainMs();

  const adminReceived = [];
  admin.on('message', (data) => {
    try { adminReceived.push(JSON.parse(data.toString())); } catch (_) {}
  });

  // micro_start legitimo: top-level type es micro_start (no restringido para publico)
  const marker = '__legit_micro_start__';
  publico.send(JSON.stringify({
    type: 'micro_start',
    marker,
  }));
  await drainMs();

  // micro_start deberia broadcastearse al admin (canReceive(admin, 'micro_start') === true)
  const got = adminReceived.some(
    (m) => m.type === 'micro_start' && m.marker === marker
  );
  assert.equal(got, true, 'admin SI debe recibir micro_start legitimo de publico');

  const c1 = waitClose(publico);
  const c2 = waitClose(admin);
  publico.close();
  admin.close();
  await Promise.all([c1, c2]);
});

test('voz_pcm: relay al receptor, rechazo de competidor y liberacion al desconectar', async () => {
  const sender = track(new WebSocket(`ws://127.0.0.1:${port}/ws`));
  const competitor = track(new WebSocket(`ws://127.0.0.1:${port}/ws`));
  const receiver = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  await Promise.all([waitOpen(sender), waitOpen(competitor), waitOpen(receiver)]);

  const received = [];
  receiver.on('message', data => {
    try { received.push(JSON.parse(data.toString())); } catch (_) {}
  });

  const first = waitForMessage(receiver, m => m.type === 'voz_pcm' && m.marker === 'first');
  sender.send(JSON.stringify({ type: 'voz_pcm', marker: 'first', samples: [0.1] }));
  await first;

  const rejected = waitForMessage(competitor, m => m.type === 'micro_desactivado');
  competitor.send(JSON.stringify({ type: 'voz_pcm', marker: 'competing', samples: [0.2] }));
  await rejected;
  await drainMs(50);
  assert.equal(received.some(m => m.marker === 'competing'), false, 'PCM competidor no debe llegar al receptor');

  const closed = waitClose(sender);
  sender.close();
  await closed;

  const second = waitForMessage(receiver, m => m.type === 'voz_pcm' && m.marker === 'after-close');
  competitor.send(JSON.stringify({ type: 'voz_pcm', marker: 'after-close', samples: [0.3] }));
  await second;
  competitor.close();
  receiver.close();
});

test('camara: desconexion abrupta del emisor restaura modo monigote', async () => {
  const sender = track(new WebSocket(`ws://127.0.0.1:${port}/ws`));
  const receiver = track(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TEST_PANEL}`));
  await Promise.all([waitOpen(sender), waitOpen(receiver)]);

  const cameraMode = waitForMessage(receiver, m => m.type === 'camara_modo' && m.modo === 'camara');
  sender.send(JSON.stringify({ type: 'camara_start' }));
  await cameraMode;

  const avatarMode = waitForMessage(receiver, m => m.type === 'camara_modo' && m.modo === 'monigote');
  const closed = waitClose(sender);
  sender.terminate();
  await Promise.all([avatarMode, closed]);
  receiver.close();
});
