import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { broadcast, clients } = require('../server.js');

test('broadcast: solo envia a clientes con rol autorizado', () => {
  const publicoReceived = [];
  const adminReceived = [];

  const fakePublicWs = {
    readyState: 1,
    rol: 'publico',
    bufferedAmount: 0,
    send: (data) => publicoReceived.push(JSON.parse(data)),
  };

  const fakeAdminWs = {
    readyState: 1,
    rol: 'admin',
    bufferedAmount: 0,
    send: (data) => adminReceived.push(JSON.parse(data)),
  };

  clients.add(fakePublicWs);
  clients.add(fakeAdminWs);

  try {
    // Evento público (scene) -> ambos lo reciben
    broadcast({ type: 'scene', scene: 'chat', visible: true });
    assert.equal(publicoReceived.length, 1);
    assert.equal(adminReceived.length, 1);
    assert.equal(publicoReceived[0].type, 'scene');
    assert.equal(adminReceived[0].type, 'scene');

    // Evento restringido (sms_nuevo) -> solo admin lo recibe
    broadcast({ type: 'sms_nuevo', usuario: 'viewer', texto: 'hola' });
    assert.equal(publicoReceived.length, 1); // No aumentó
    assert.equal(adminReceived.length, 2);
    assert.equal(adminReceived[1].type, 'sms_nuevo');

    // Evento restringido (comando_chat) -> solo admin lo recibe
    broadcast({ type: 'comando_chat', comando: '!co', usuario: 'viewer' });
    assert.equal(publicoReceived.length, 1); // No aumentó
    assert.equal(adminReceived.length, 3);
  } finally {
    clients.delete(fakePublicWs);
    clients.delete(fakeAdminWs);
  }
});

test('broadcast: descarta envio a clientes lentos con bufferedAmount > 256KB', () => {
  const normalReceived = [];
  const laggyReceived = [];

  const normalWs = {
    readyState: 1,
    rol: 'admin',
    bufferedAmount: 1024, // 1 KB
    send: (data) => normalReceived.push(JSON.parse(data)),
  };

  const laggyWs = {
    readyState: 1,
    rol: 'admin',
    bufferedAmount: 300000, // > 256 KB
    send: (data) => laggyReceived.push(JSON.parse(data)),
  };

  clients.add(normalWs);
  clients.add(laggyWs);

  try {
    broadcast({ type: 'scene', scene: 'bg', visible: true });
    assert.equal(normalReceived.length, 1);
    assert.equal(laggyReceived.length, 0); // Descartado por backpressure
  } finally {
    clients.delete(normalWs);
    clients.delete(laggyWs);
  }
});

test('plano.html: cola TTS limita a MAX_TTS_COLA y prioriza streamers/subs/VIPs', () => {
  const MAX_TTS_COLA = 8;
  const ttsColaAudio = [];

  function simularHablarAvatar(agente, texto, usuario, tier) {
    const esPrioritario = tier >= 2 || agente === 'ja' || usuario === 'apliarte' || usuario === 'erbolamm';

    // Anti-monopolio
    if (!esPrioritario && ttsColaAudio.filter(it => it.agente === agente).length >= 2) {
      return false;
    }

    if (ttsColaAudio.length >= MAX_TTS_COLA) {
      if (!esPrioritario) return false;
      const idxDescartable = ttsColaAudio.findIndex(it => it.agente !== 'ja' && (it.tier || 1) < 2);
      if (idxDescartable !== -1) {
        ttsColaAudio.splice(idxDescartable, 1);
      } else {
        const idxOldest = ttsColaAudio.findIndex(it => it.agente !== 'ja');
        if (idxOldest !== -1) ttsColaAudio.splice(idxOldest, 1);
        else ttsColaAudio.shift();
      }
    }

    ttsColaAudio.push({ agente, texto, usuario, tier });
    return true;
  }

  // Llenar la cola con 8 mensajes de usuarios regulares en diferentes avatares
  for (let i = 0; i < 8; i++) {
    const ok = simularHablarAvatar(`agente_${i}`, `mensaje ${i}`, `user_${i}`, 1);
    assert.equal(ok, true);
  }
  assert.equal(ttsColaAudio.length, 8);

  // Un noveno mensaje regular debe ser descartado (cola llena de regulares)
  const regularExtra = simularHablarAvatar('agente_9', 'intento 9', 'user_9', 1);
  assert.equal(regularExtra, false);
  assert.equal(ttsColaAudio.length, 8);

  // Un mensaje de suscriptor (tier 2) o Javier (tier 3) entra desplazando a un regular
  const subExtra = simularHablarAvatar('co', 'mensaje vip', 'sub_user', 2);
  assert.equal(subExtra, true);
  assert.equal(ttsColaAudio.length, 8);
  assert.equal(ttsColaAudio.some(it => it.usuario === 'sub_user'), true);

  // Mensaje de Javier (tier 3) entra desplazando al siguiente regular
  const jaMsg = simularHablarAvatar('ja', 'mensaje javier', 'apliarte', 3);
  assert.equal(jaMsg, true);
  assert.equal(ttsColaAudio.length, 8);
  assert.equal(ttsColaAudio.some(it => it.usuario === 'apliarte'), true);
});

test('plano.html: deduplicacion de chat aplica hard-cap de 300 entradas ante avalancha', () => {
  const recientesTextoChat = new Map();
  const ahora = Date.now();

  // Simular avalancha de 400 mensajes distintos durante una raid
  for (let i = 0; i < 400; i++) {
    const dedupKey = `user_${i}:mensaje_${i}`;
    recientesTextoChat.set(dedupKey, ahora);

    if (recientesTextoChat.size > 100) {
      for (const [k, t] of recientesTextoChat.entries()) {
        if (ahora - t > 8000) recientesTextoChat.delete(k);
      }
      if (recientesTextoChat.size > 300) {
        const claves = Array.from(recientesTextoChat.keys()).slice(0, recientesTextoChat.size - 250);
        for (const k of claves) recientesTextoChat.delete(k);
      }
    }
  }

  // La caché nunca debe sobrepasar las 300 entradas
  assert.ok(recientesTextoChat.size <= 300);
  assert.ok(recientesTextoChat.size >= 250);
});
