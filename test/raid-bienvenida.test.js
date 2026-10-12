import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocket } from 'ws';

const require = createRequire(import.meta.url);
const { parsearLineaRaid } = require('../src/bienvenida-chat.js');
const { canReceive } = require('../src/ws-auth.js');

const dataDir = mkdtempSync(join(tmpdir(), 'directo-raid-'));
process.env.DATA_DIR = dataDir;
process.env.PANEL_PASS = 'raid-test-panel-pass';
process.env.NODE_ENV = 'test';
const { server } = require('../server.js');

let base;
let wsUrl;

test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  base = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}/ws`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  rmSync(dataDir, { recursive: true, force: true });
});

test('ws-auth: canReceive autoriza eventos de raid tanto a público como a admin', () => {
  assert.equal(canReceive('publico', 'raid_aviso'), true);
  assert.equal(canReceive('publico', 'raid_bienvenida_iniciar'), true);
  assert.equal(canReceive('publico', 'raid_bienvenida_fin'), true);
  assert.equal(canReceive('admin', 'raid_aviso'), true);
  assert.equal(canReceive('admin', 'raid_bienvenida_iniciar'), true);
  assert.equal(canReceive('admin', 'raid_bienvenida_fin'), true);
});

test('parsearLineaRaid: distingue entre raids de 5 o menos y de más de 5', () => {
  const linea5 = '@msg-id=raid;msg-param-displayName=Paco;msg-param-login=paco;msg-param-viewerCount=5 :tmi.twitch.tv USERNOTICE #apliarte';
  const r5 = parsearLineaRaid(linea5);
  assert.ok(r5 !== null);
  assert.equal(r5.viewers, 5);
  assert.equal(r5.raider, 'paco');

  const linea12 = '@msg-id=raid;msg-param-displayName=Maria;msg-param-login=maria;msg-param-viewerCount=12 :tmi.twitch.tv USERNOTICE #apliarte';
  const r12 = parsearLineaRaid(linea12);
  assert.ok(r12 !== null);
  assert.equal(r12.viewers, 12);
  assert.equal(r12.raider, 'maria');
  assert.equal(r12.raiderNombre, 'Maria');
});

test('POST /api/panel/probar-raid: lanza el evento y emite por WebSocket', async () => {
  // Conectar cliente WS anónimo (rol publico en 127.0.0.1)
  const ws = new WebSocket(wsUrl);
  const mensajesRecibidos = [];

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString('utf8'));
      mensajesRecibidos.push(data);
    } catch (_) {}
  });

  // Petición al endpoint probar-raid con inmediato: true
  const res = await fetch(`${base}/api/panel/probar-raid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raider: 'CompañeroGamer', viewers: 14, inmediato: true })
  });

  assert.equal(res.status, 200);
  const resJson = await res.json();
  assert.equal(resJson.ok, true);
  assert.equal(resJson.raider, 'CompañeroGamer');
  assert.equal(resJson.viewers, 14);
  assert.equal(resJson.inmediato, true);

  // Esperar a que el mensaje llegue por WS
  await new Promise(r => setTimeout(r, 200));

  ws.close();

  const aviso = mensajesRecibidos.find(m => m.type === 'raid_aviso');
  assert.ok(aviso, 'Debe haber recibido evento raid_aviso por WebSocket');
  assert.equal(aviso.raider, 'CompañeroGamer');
  assert.equal(aviso.viewers, 14);

  const inicio = mensajesRecibidos.find(m => m.type === 'raid_bienvenida_iniciar');
  assert.ok(inicio, 'Debe haber recibido evento raid_bienvenida_iniciar por WebSocket');
  assert.equal(inicio.raider, 'CompañeroGamer');
  assert.equal(inicio.viewers, 14);
  assert.equal(inicio.duracionMs, 75000, 'La duración debe ser 75s (presentación coral + fiesta + cierre CTA)');
});

test('bloqueo inmediato: al detectarse una raid (>5) con delay de 20s, el chat se bloquea de inmediato', async () => {
  const ws = new WebSocket(wsUrl);
  const mensajes = [];

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  ws.on('message', (raw) => {
    try {
      mensajes.push(JSON.parse(raw.toString('utf8')));
    } catch (_) {}
  });

  // Lanzar raid con delay normal (20s)
  const res = await fetch(`${base}/api/panel/probar-raid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raider: 'RaidTester', viewers: 25, inmediato: false })
  });
  assert.equal(res.status, 200);

  await new Promise(r => setTimeout(r, 100));

  const aviso = mensajes.find(m => m.type === 'raid_aviso');
  assert.ok(aviso, 'Debe haber recibido raid_aviso de inmediato');
  assert.equal(aviso.delayMs, 20000);

  // Intentar enviar un mensaje de chat por WS durante el periodo de aviso
  ws.send(JSON.stringify({
    type: 'chat_mensaje',
    usuario: 'espectador_chat',
    texto: 'Hola durante la raid'
  }));

  await new Promise(r => setTimeout(r, 150));

  // El mensaje NO debe haber sido retransmitido
  const chatEcho = mensajes.find(m => m.type === 'chat_mensaje' && m.texto === 'Hola durante la raid');
  assert.equal(chatEcho, undefined, 'El mensaje de chat debe ser bloqueado inmediatamente durante la raid');

  ws.close();
});

