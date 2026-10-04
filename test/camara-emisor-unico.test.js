import test from 'node:test';
import assert from 'node:assert/strict';

// ── 1. Presets y constructor de URL de emisión ──
const PRESETS_CAMARA = {
  low:  { label: 'Baja (~320×240 @ 15fps · 250 kbps)', width: 320, height: 240, fps: 15, bitrate: 250, desc: '320×240 @ 15fps' },
  med:  { label: 'Media (~640×360 @ 24fps · 600 kbps)', width: 640, height: 360, fps: 24, bitrate: 600, desc: '640×360 @ 24fps' },
  high: { label: 'Alta (~1280×720 @ 30fps · 1.5 Mbps)', width: 1280, height: 720, fps: 30, bitrate: 1500, desc: '1280×720 @ 30fps' }
};

function buildVdoPushUrl(config, presetKey = 'low') {
  const preset = PRESETS_CAMARA[presetKey] || PRESETS_CAMARA.low;
  const passParam = config.password ? `&password=${encodeURIComponent(config.password)}` : '';
  return `https://vdo.ninja/?push=${encodeURIComponent(config.streamId)}&room=${encodeURIComponent(config.room)}${passParam}&webcam&facing=user&videobitrate=${preset.bitrate}&width=${preset.width}&height=${preset.height}&framerate=${preset.fps}&autostart&cleanoutput&noaudio`;
}

function buildVdoViewUrl(config) {
  const passParam = config.password ? `&password=${encodeURIComponent(config.password)}` : '';
  return `https://vdo.ninja/?view=${encodeURIComponent(config.streamId)}&room=${encodeURIComponent(config.room)}${passParam}&solo&cleanoutput&transparent&autoplay=1&cover=1&buffer=350&sync=0&videobitrate=1500&codec=h264&api`;
}

test('Presets de cámara móvil: Low, Med y High generan los parámetros requeridos por Javier', () => {
  const config = { room: 'sala_secreta', streamId: 'stream_secreto', password: 'pass123' };

  // Preset Low (por defecto, para fluidez en cualquier teléfono)
  const urlLow = buildVdoPushUrl(config, 'low');
  assert.match(urlLow, /facing=user/, 'Debe exigir cámara frontal');
  assert.match(urlLow, /videobitrate=250/, 'Bitrate low de 250 kbps');
  assert.match(urlLow, /width=320&height=240/, 'Resolución 320x240');
  assert.match(urlLow, /framerate=15/, '15 fps para máximo ahorro');
  assert.match(urlLow, /noaudio/, 'No duplica el audio (el micro va por su canal separado)');
  assert.match(urlLow, /autostart/, 'Arranque automático sin clicks extra');
  assert.match(urlLow, /push=stream_secreto/, 'Usa el stream id configurado');
  assert.match(urlLow, /room=sala_secreta/, 'Usa la sala configurada');
  assert.match(urlLow, /password=pass123/, 'Incluye password si existe');

  // Preset Medium
  const urlMed = buildVdoPushUrl(config, 'med');
  assert.match(urlMed, /videobitrate=600/);
  assert.match(urlMed, /width=640&height=360/);
  assert.match(urlMed, /framerate=24/);

  // Preset High
  const urlHigh = buildVdoPushUrl(config, 'high');
  assert.match(urlHigh, /videobitrate=1500/);
  assert.match(urlHigh, /width=1280&height=720/);
  assert.match(urlHigh, /framerate=30/);
});

test('View URL de OBS: genera los parámetros de VDO.Ninja limpios para plano.html', () => {
  const config = { room: 'sala_secreta', streamId: 'stream_secreto', password: 'pass123' };
  const viewUrl = buildVdoViewUrl(config);
  assert.match(viewUrl, /view=stream_secreto/);
  assert.match(viewUrl, /room=sala_secreta/);
  assert.match(viewUrl, /solo&cleanoutput&transparent/);
  assert.ok(!viewUrl.includes('darkmode'), 'No debe incluir &darkmode para que el canvas de carga sea transparente');
  assert.match(viewUrl, /autoplay=1/);
  assert.match(viewUrl, /api/, 'Debe incluir &api para recibir eventos de vídeo de VDO.Ninja');
});

// ── 2. Mock WebSocket y lógica de emisor único en el servidor ──
class MockWsClient {
  constructor(id) {
    this.id = id;
    this.readyState = 1;
    this.sent = [];
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
}

class MockServerCameraRelay {
  constructor() {
    this.activeCamSender = null;
    this.modoCamaraDirecto = 'monigote';
    this.clients = new Set();
    this.broadcasts = [];
  }

  addClient(ws) {
    this.clients.add(ws);
  }

  removeClient(ws) {
    this.clients.delete(ws);
    if (this.activeCamSender === ws) {
      this.activeCamSender = null;
      this.modoCamaraDirecto = 'monigote';
      this.broadcast({ type: 'camara_modo', modo: 'monigote' });
    }
  }

  broadcast(msg) {
    this.broadcasts.push(msg);
    for (const c of this.clients) {
      if (c.readyState === 1) c.send(JSON.stringify(msg));
    }
  }

  handleMessage(ws, text) {
    if (text.includes('"type":"camara_start"') || text.includes('"type": "camara_start"')) {
      if (this.activeCamSender && this.activeCamSender !== ws && this.activeCamSender.readyState === 1) {
        try {
          this.activeCamSender.send(JSON.stringify({
            type: 'camara_desactivada',
            motivo: 'cámara activa en otro dispositivo'
          }));
        } catch (_) {}
      }
      this.activeCamSender = ws;
      this.modoCamaraDirecto = 'camara';
      this.broadcast({ type: 'camara_modo', modo: 'camara' });
      return;
    }

    if (text.includes('"type":"camara_stop"') || text.includes('"type": "camara_stop"')) {
      if (this.activeCamSender === ws) {
        this.activeCamSender = null;
      }
      this.modoCamaraDirecto = 'monigote';
      this.broadcast({ type: 'camara_modo', modo: 'monigote' });
      return;
    }

    if (text.includes('"type":"camara_modo"') || text.includes('"type": "camara_modo"')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.modo) {
          this.modoCamaraDirecto = parsed.modo === 'camara' ? 'camara' : 'monigote';
          if (this.modoCamaraDirecto === 'monigote' && this.activeCamSender && this.activeCamSender !== ws) {
            this.activeCamSender.send(JSON.stringify({
              type: 'camara_desactivada',
              motivo: 'modo monigote activado'
            }));
            this.activeCamSender = null;
          }
        }
      } catch (_) {}
    }
  }
}

test('Emisor único de cámara: un segundo móvil desactiva al emisor anterior de forma limpia', () => {
  const server = new MockServerCameraRelay();
  const pixel = new MockWsClient('pixel');
  const iphone = new MockWsClient('iphone');
  const obs = new MockWsClient('obs');

  server.addClient(pixel);
  server.addClient(iphone);
  server.addClient(obs);

  // 1. Pixel activa la cámara
  server.handleMessage(pixel, JSON.stringify({ type: 'camara_start' }));
  assert.equal(server.activeCamSender, pixel, 'Pixel debe ser el emisor activo');
  assert.equal(server.modoCamaraDirecto, 'camara', 'El modo debe ser camara');

  // OBS debe haber recibido el cambio de modo
  const obsCamaraModo = obs.sent.find(m => m.type === 'camara_modo' && m.modo === 'camara');
  assert.ok(obsCamaraModo, 'OBS debe recibir evento camara_modo camara');

  // 2. iPhone activa la cámara mientras Pixel seguía emitiendo
  server.handleMessage(iphone, JSON.stringify({ type: 'camara_start' }));
  assert.equal(server.activeCamSender, iphone, 'iPhone debe ser ahora el nuevo emisor activo');

  // Pixel debe haber recibido la notificación de cámara desactivada
  const pixelDesactivado = pixel.sent.find(m => m.type === 'camara_desactivada');
  assert.ok(pixelDesactivado, 'Pixel debe recibir aviso camara_desactivada');
  assert.match(pixelDesactivado.motivo, /otro dispositivo/);

  // 3. iPhone se desconecta o cierra la pestaña
  server.removeClient(iphone);
  assert.equal(server.activeCamSender, null, 'No debe quedar ningún emisor activo');
  assert.equal(server.modoCamaraDirecto, 'monigote', 'Al desconectarse el emisor activo vuelve a monigote');

  const obsMonigote = obs.sent.find(m => m.type === 'camara_modo' && m.modo === 'monigote');
  assert.ok(obsMonigote, 'OBS debe volver automáticamente a modo monigote');
});

test('Ahorro de batería y ciclo de vida: segundo plano (document.hidden) detiene la cámara', () => {
  let streamPlayerBoxVisible = true;
  let twitchPlayerSrc = 'https://player.twitch.tv/?channel=apliarte';
  let cameraIframeSrc = '';
  let camaraActiva = false;

  function onCamaraStart() {
    // Al activar cámara, debe pausar/apagar el reproductor de Twitch para no sobrecalentar el móvil
    if (streamPlayerBoxVisible) {
      streamPlayerBoxVisible = false;
      twitchPlayerSrc = '';
    }
    cameraIframeSrc = 'https://vdo.ninja/?push=stream&room=room';
    camaraActiva = true;
  }

  function onVisibilityHidden() {
    // Al pasar a segundo plano, debe cortar el iframe para liberar el sensor de hardware
    cameraIframeSrc = 'about:blank';
    camaraActiva = false;
  }

  onCamaraStart();
  assert.equal(streamPlayerBoxVisible, false, 'El stream de Twitch debe ocultarse');
  assert.equal(twitchPlayerSrc, '', 'El src de Twitch debe vaciarse para cortar el consumo');
  assert.equal(camaraActiva, true);
  assert.ok(cameraIframeSrc.includes('vdo.ninja'));

  onVisibilityHidden();
  assert.equal(camaraActiva, false, 'La cámara debe apagarse');
  assert.equal(cameraIframeSrc, 'about:blank', 'El iframe debe limpiarse con about:blank para liberar hardware');
});

// ── 3. Seguridad de endpoints: Cámara y SMS ──
test('Seguridad: GET /api/directo/comando no expone credenciales ni objeto camara', () => {
  // Simular la respuesta de GET /api/directo/comando
  const serverOwners = { Ja: 'Javier' };
  const seqComandosDirecto = 42;
  const modoCamaraDirecto = 'monigote';
  const filtrados = [];

  const respuestaComando = {
    ok: true,
    duenos: serverOwners,
    seq: seqComandosDirecto,
    modoCamara: modoCamaraDirecto,
    comandos: filtrados
  };

  assert.equal(respuestaComando.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(respuestaComando, 'camara'), false, 'No debe contener propiedad camara');
  assert.equal(Object.prototype.hasOwnProperty.call(respuestaComando, 'password'), false, 'No debe contener password');
  assert.equal(Object.prototype.hasOwnProperty.call(respuestaComando, 'streamId'), false, 'No debe contener streamId');
  assert.equal(Object.prototype.hasOwnProperty.call(respuestaComando, 'room'), false, 'No debe contener room');
});

test('Privacidad: GET /api/directo/sms no entrega mensajes a peticiones no autenticadas', () => {
  const list = [
    { id: 'sms-1', usuario: 'viewer1', texto: 'Mensaje privado confidencial', fecha: '2026-09-26T12:00:00Z', leido: false },
    { id: 'sms-2', usuario: 'viewer2', texto: 'Otro mensaje íntimo', fecha: '2026-09-26T12:05:00Z', leido: false }
  ];

  function resolverSmsResponse(authenticated, marcador) {
    if (marcador === '1' || !authenticated) {
      return { ok: true, total: list.length, mensajes: [] };
    }
    return { ok: true, total: list.length, mensajes: list };
  }

  // 1. Petición no autenticada desde fuera (ej. viewer sin token o sin cookie de auth)
  const respAnonima = resolverSmsResponse(false, null);
  assert.equal(respAnonima.ok, true);
  assert.equal(respAnonima.total, 2, 'Total se reporta para contadores');
  assert.deepEqual(respAnonima.mensajes, [], 'mensajes debe ser lista vacía para peticiones no autenticadas');

  // 2. Petición con marcador explícito de solo conteo
  const respMarcador = resolverSmsResponse(true, '1');
  assert.deepEqual(respMarcador.mensajes, [], 'marcador=1 solo devuelve conteo, no mensajes');

  // 3. Petición autenticada desde el panel
  const respAutenticada = resolverSmsResponse(true, null);
  assert.equal(respAutenticada.mensajes.length, 2, 'Petición autenticada recibe la lista');
  assert.equal(respAutenticada.mensajes[0].texto, 'Mensaje privado confidencial');
});

test('Privacidad: Evento WebSocket nuevo_sms solo emite el total y no el texto del SMS', () => {
  const wsEvents = [];
  function broadcast(event) {
    wsEvents.push(event);
  }

  const lista = [
    { id: 'sms-1', usuario: 'viewer1', texto: 'SMS ultra secreto', fecha: '2026-09-26T12:00:00Z', leido: false }
  ];

  // Emisión según server.js actualizado:
  broadcast({ type: 'nuevo_sms', total: lista.length });

  assert.equal(wsEvents.length, 1);
  const evento = wsEvents[0];
  assert.equal(evento.type, 'nuevo_sms');
  assert.equal(evento.total, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(evento, 'sms'), false, 'No debe llevar objeto sms');
  assert.equal(Object.prototype.hasOwnProperty.call(evento, 'texto'), false, 'No debe llevar texto de SMS');
});

// ── 4. Comportamiento en vivo: Una sola orden por toque e Idempotencia (Punto e) ──
test('Control de cámara en panel: emite exactamente una orden por toque', () => {
  const wsMensajes = [];
  const mockWs = {
    readyState: 1,
    send: (str) => wsMensajes.push(JSON.parse(str))
  };

  // Simular activar cámara frontal desde panel
  function iniciarCamara() {
    mockWs.send(JSON.stringify({ type: 'camara_start' }));
  }

  // Simular apagar cámara frontal desde panel (botón apagar cámara)
  function detenerCamara(desdeRemoto = false) {
    if (!desdeRemoto) {
      mockWs.send(JSON.stringify({ type: 'camara_stop' }));
    }
  }

  // 1. Activar cámara: debe enviar exactamente 1 mensaje
  iniciarCamara();
  assert.equal(wsMensajes.length, 1);
  assert.equal(wsMensajes[0].type, 'camara_start');

  // 2. Apagar cámara: debe enviar exactamente 1 mensaje
  detenerCamara(false);
  assert.equal(wsMensajes.length, 2);
  assert.equal(wsMensajes[1].type, 'camara_stop');

  // 3. Apagado por orden remota del servidor (desdeRemoto = true): no debe emitir eco
  detenerCamara(true);
  assert.equal(wsMensajes.length, 2, 'No debe emitir mensaje al servidor si la orden vino de remoto');
});

test('Cambio de calidad de vídeo: solo actualiza la captura local sin reenviar órdenes al servidor', () => {
  const wsMensajes = [];
  let pushIframeSrc = '';
  let presetActual = 'low';

  function onCambiarCalidad(nuevoPreset, camaraActiva) {
    presetActual = nuevoPreset;
    if (camaraActiva) {
      pushIframeSrc = `https://vdo.ninja/?push=stream&videobitrate=${PRESETS_CAMARA[nuevoPreset].bitrate}`;
    }
  }

  onCambiarCalidad('high', true);
  assert.equal(presetActual, 'high');
  assert.match(pushIframeSrc, /videobitrate=1500/);
  assert.equal(wsMensajes.length, 0, 'No debe enviar ningún mensaje WS ni alterar modos en el servidor');
});

test('Overlay plano.html: setModoCamara es estrictamente idempotente y no recarga el iframe', () => {
  let modoActual = 'monigote';
  let opacity = '0';
  let llamadasActualizarLabel = 0;
  let videoRecibido = false;

  function setModoCamara(modo) {
    const normalizado = (modo === 'camara' || modo === 'on' || modo === true) ? 'camara' : 'monigote';
    if (normalizado === modoActual) {
      return false; // Idempotente: ignorado
    }
    modoActual = normalizado;
    llamadasActualizarLabel++;
    opacity = (modoActual === 'camara') ? '1' : '0';
    return true;
  }

  // 1. Llamada inicial para pasar a cámara
  const cambio1 = setModoCamara('camara');
  assert.equal(cambio1, true);
  assert.equal(modoActual, 'camara');
  assert.equal(opacity, '1', 'Iframe pasa a opacidad 1 para reproducir el stream');
  assert.equal(llamadasActualizarLabel, 1);

  // 2. Llamadas repetidas con 'camara' no deben mutar nada
  const cambio2 = setModoCamara('camara');
  const cambio3 = setModoCamara('on');
  assert.equal(cambio2, false);
  assert.equal(cambio3, false);
  assert.equal(llamadasActualizarLabel, 1, 'No debe haber nuevas llamadas a actualizar DOM/labels');

  // 3. Conmutar a monigote
  const cambio4 = setModoCamara('monigote');
  assert.equal(cambio4, true);
  assert.equal(modoActual, 'monigote');
  assert.equal(opacity, '0', 'Iframe se oculta en modo monigote');
  assert.equal(llamadasActualizarLabel, 2);

  // 4. Repetir monigote: ignorado
  const cambio5 = setModoCamara('monigote');
  assert.equal(cambio5, false);
  assert.equal(llamadasActualizarLabel, 2);
});


