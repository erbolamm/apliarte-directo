import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WalkSignaling } from '../src/walk-signaling.js';

class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
    this.closed = false;
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.closed = true;
    this.emit('close');
  }
}

test('WalkSignaling rechaza conexion sin sessionId', () => {
  const signaling = new WalkSignaling();
  const socket = new MockSocket();
  signaling.manejar(socket, '');
  assert.equal(socket.closed, true);
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].type, 'error');
  assert.equal(socket.sent[0].reason, 'session_id_requerido');
});

test('WalkSignaling conecta primer peer como guest y segundo como host', () => {
  const signaling = new WalkSignaling();
  const s1 = new MockSocket();
  const s2 = new MockSocket();

  signaling.manejar(s1, 'SESION1');
  assert.equal(s1.sent.length, 1);
  assert.equal(s1.sent[0].type, 'peer-joined');
  assert.equal(s1.sent[0].rol, 'guest');
  assert.equal(signaling.contarPeers(), 1);

  signaling.manejar(s2, 'SESION1');
  assert.equal(s2.sent.length, 1);
  assert.equal(s2.sent[0].type, 'peer-joined');
  assert.equal(s2.sent[0].rol, 'host');
  assert.equal(signaling.contarPeers(), 2);

  // s1 debe haber recibido aviso de peer-status ready
  assert.equal(s1.sent.length, 2);
  assert.equal(s1.sent[1].type, 'peer-status');
  assert.equal(s1.sent[1].ready, true);
});

test('WalkSignaling reenvia ofertas, answers e ice-candidates entre peers', () => {
  const signaling = new WalkSignaling();
  const s1 = new MockSocket();
  const s2 = new MockSocket();

  signaling.manejar(s1, 'SESION_E2E');
  signaling.manejar(s2, 'SESION_E2E');

  // s2 (app móvil / host) envía una oferta SDP
  s2.emit('message', JSON.stringify({
    type: 'offer',
    sdp: 'v=0\r\no=...',
    sdpType: 'offer',
  }));

  const ultimoS1 = s1.sent[s1.sent.length - 1];
  assert.equal(ultimoS1.type, 'offer');
  assert.equal(ultimoS1.sdp, 'v=0\r\no=...');
  assert.equal(ultimoS1.sessionId, 'SESION_E2E');

  // s1 (walk.html / guest) responde con answer SDP
  s1.emit('message', JSON.stringify({
    type: 'answer',
    sdp: 'v=0\r\no=answer...',
    sdpType: 'answer',
  }));

  const ultimoS2 = s2.sent[s2.sent.length - 1];
  assert.equal(ultimoS2.type, 'answer');
  assert.equal(ultimoS2.sdp, 'v=0\r\no=answer...');
  assert.equal(ultimoS2.sessionId, 'SESION_E2E');

  // s2 envía candidato ICE
  s2.emit('message', JSON.stringify({
    type: 'ice-candidate',
    candidate: 'candidate:1 1 UDP...',
    sdpMid: '0',
    sdpMLineIndex: 0,
  }));

  const iceParaS1 = s1.sent[s1.sent.length - 1];
  assert.equal(iceParaS1.type, 'ice-candidate');
  assert.equal(iceParaS1.candidate, 'candidate:1 1 UDP...');
});

test('WalkSignaling notifica peer-left y limpia sesion al desconectar', () => {
  const signaling = new WalkSignaling();
  const s1 = new MockSocket();
  const s2 = new MockSocket();

  signaling.manejar(s1, 'SESION_LEAVE');
  signaling.manejar(s2, 'SESION_LEAVE');

  s2.close();
  assert.equal(signaling.contarPeers(), 1);

  const avisoLeave = s1.sent[s1.sent.length - 1];
  assert.equal(avisoLeave.type, 'peer-left');
  assert.equal(avisoLeave.rol, 'host');

  s1.close();
  assert.equal(signaling.contarPeers(), 0);
});
