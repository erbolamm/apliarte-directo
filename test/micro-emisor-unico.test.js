import test from 'node:test';
import assert from 'node:assert/strict';

// ── 1. Prueba de lógica de descarte de silencio en el panel ──
function debeDescartarChunkAudio(channelData, umbral = 0.001) {
  let maxAmp = 0;
  for (let i = 0; i < channelData.length; i++) {
    const a = Math.abs(channelData[i]);
    if (a > maxAmp) maxAmp = a;
  }
  return maxAmp < umbral;
}

test('Detección de silencio: descarta chunks con todo ceros o ruido despreciable', () => {
  const ceros = new Float32Array(4096);
  assert.equal(debeDescartarChunkAudio(ceros), true, 'Un buffer de ceros debe ser descartado');

  const ruidoBajo = new Float32Array(4096);
  ruidoBajo[100] = 0.0005;
  ruidoBajo[500] = -0.0008;
  assert.equal(debeDescartarChunkAudio(ruidoBajo), true, 'Ruido por debajo de 0.001 debe ser descartado');

  const vozReal = new Float32Array(4096);
  vozReal[100] = 0.05;
  vozReal[500] = -0.12;
  assert.equal(debeDescartarChunkAudio(vozReal), false, 'Voz real con amplitud audible no debe descartarse');
});

// ── 2. Prueba de limitación de cola en OBS (cap a 500 ms) ──
function calcularSiguientePlayTime(nextPlayTime, currentTime, audioDuration, maxBacklog = 0.5) {
  let next = nextPlayTime;
  if (next - currentTime > maxBacklog || next < currentTime) {
    next = currentTime + 0.04;
  }
  const scheduledTime = next;
  next += audioDuration;
  return { scheduledTime, nextPlayTime: next };
}

test('OBS audio queue cap: recorta el backlog si el retardo acumulado supera 500 ms', () => {
  const now = 100.0;
  const chunkDuration = 0.085; // 85 ms por chunk

  // Caso 1: Inicio en tiempo real
  let res = calcularSiguientePlayTime(0, now, chunkDuration);
  assert.equal(res.scheduledTime, 100.04);
  assert.equal(Math.round(res.nextPlayTime * 1000), 100125);

  // Caso 2: Cola normal dentro de los 500 ms (ej. 200 ms adelante)
  const normalNext = now + 0.20;
  res = calcularSiguientePlayTime(normalNext, now, chunkDuration);
  assert.equal(res.scheduledTime, 100.20);
  assert.equal(Math.round(res.nextPlayTime * 1000), 100285);

  // Caso 3: Backlog excesivo (ej. 1.2 segundos acumulados por acumulación de pestañas)
  const delayedNext = now + 1.2;
  res = calcularSiguientePlayTime(delayedNext, now, chunkDuration);
  // Debe recortar el backlog y programar a now + 0.04
  assert.equal(res.scheduledTime, 100.04, 'Debe recortar a now + 0.04 al superar los 500 ms');
  assert.equal(Math.round(res.nextPlayTime * 1000), 100125);
});

// ── 3. Prueba de emisor único en el router WebSocket del servidor ──
class MockWsClient {
  constructor(id) {
    this.id = id;
    this.readyState = 1; // OPEN
    this.sent = [];
  }
  send(data) {
    this.sent.push(typeof data === 'string' ? JSON.parse(data) : data);
  }
}

class MockWsServerRelay {
  constructor() {
    this.clients = new Set();
    this.activeMicSender = null;
  }
  addClient(ws) {
    this.clients.add(ws);
  }
  removeClient(ws) {
    this.clients.delete(ws);
    if (this.activeMicSender === ws) this.activeMicSender = null;
  }
  handleMessage(ws, messageText) {
    if (messageText.includes('"type":"micro_start"') || messageText.includes('"type": "micro_start"')) {
      if (this.activeMicSender && this.activeMicSender !== ws && this.activeMicSender.readyState === 1) {
        this.activeMicSender.send(JSON.stringify({
          type: 'micro_desactivado',
          motivo: 'micro activo en otro dispositivo'
        }));
      }
      this.activeMicSender = ws;
      return;
    }

    if (messageText.includes('"type":"micro_stop"') || messageText.includes('"type": "micro_stop"')) {
      if (this.activeMicSender === ws) {
        this.activeMicSender = null;
      }
      return;
    }

    if (messageText.includes('"type":"voz_pcm"') || messageText.includes('"type": "voz_pcm"')) {
      if (!this.activeMicSender) {
        this.activeMicSender = ws;
      } else if (this.activeMicSender !== ws) {
        ws.send(JSON.stringify({
          type: 'micro_desactivado',
          motivo: 'micro activo en otro dispositivo'
        }));
        return; // Descartado
      }
    }

    // Broadcast a los demás
    for (const client of this.clients) {
      if (client !== ws && client.readyState === 1) {
        client.send(messageText);
      }
    }
  }
}

test('Emisor único de micrófono: reemplaza al emisor previo y descarta chunks de emisores inactivos', () => {
  const relay = new MockWsServerRelay();
  const clientA = new MockWsClient('mobile');
  const clientB = new MockWsClient('macmini');
  const clientOBS = new MockWsClient('obs');

  relay.addClient(clientA);
  relay.addClient(clientB);
  relay.addClient(clientOBS);

  // 1. Cliente A inicia micro
  relay.handleMessage(clientA, JSON.stringify({ type: 'micro_start' }));
  assert.equal(relay.activeMicSender, clientA);

  // 2. Cliente A envía audio -> llega a OBS
  relay.handleMessage(clientA, JSON.stringify({ type: 'voz_pcm', pcm: 'AAAA' }));
  const obsVoz1 = clientOBS.sent.filter(m => m.type === 'voz_pcm');
  assert.equal(obsVoz1.length, 1);
  assert.equal(obsVoz1[0].pcm, 'AAAA');

  // 3. Cliente B (segunda pestaña) reclama micro
  relay.handleMessage(clientB, JSON.stringify({ type: 'micro_start' }));
  assert.equal(relay.activeMicSender, clientB, 'Cliente B toma el control del micrófono');
  
  // Cliente A debe haber recibido el aviso de desactivación
  const descA = clientA.sent.filter(m => m.type === 'micro_desactivado');
  assert.equal(descA.length, 1, 'Cliente A recibe notificación de micro_desactivado');
  assert.equal(descA[0].motivo, 'micro activo en otro dispositivo');

  // 4. Si Cliente A intenta seguir enviando paquetes de audio, son bloqueados y descartados
  relay.handleMessage(clientA, JSON.stringify({ type: 'voz_pcm', pcm: 'ZZZZ_ROGUE' }));
  const obsVoz2 = clientOBS.sent.filter(m => m.pcm === 'ZZZZ_ROGUE');
  assert.equal(obsVoz2.length, 0, 'Audio de emisor inactivo no debe llegar a OBS');

  // 5. Cliente B envía audio -> llega a OBS
  relay.handleMessage(clientB, JSON.stringify({ type: 'voz_pcm', pcm: 'BBBB' }));
  const obsVoz3 = clientOBS.sent.filter(m => m.pcm === 'BBBB');
  assert.equal(obsVoz3.length, 1, 'Audio de emisor activo llega a OBS');

  // 6. Cliente B se desconecta -> libera activeMicSender
  relay.removeClient(clientB);
  assert.equal(relay.activeMicSender, null);
});
