import test from 'node:test';
import assert from 'node:assert/strict';

// ── 1. Punto a y b: WebRTC Mic, Cámara a Monigote y Emisor Único ──
function buildVdoPushUrl(config, tipo = 'camara', presetKey = 'low') {
  const PRESETS_CAMARA = {
    low:  { width: 320, height: 240, fps: 15, bitrate: 250 },
    med:  { width: 640, height: 360, fps: 24, bitrate: 600 },
    high: { width: 1280, height: 720, fps: 30, bitrate: 1500 }
  };
  const passParam = config.password ? `&password=${encodeURIComponent(config.password)}` : '';
  if (tipo === 'mic') {
    return `https://vdo.ninja/?push=${encodeURIComponent(config.streamId)}&room=${encodeURIComponent(config.room)}${passParam}&mic&novideo&autostart&cleanoutput`;
  }
  const preset = PRESETS_CAMARA[presetKey] || PRESETS_CAMARA.low;
  return `https://vdo.ninja/?push=${encodeURIComponent(config.streamId)}&room=${encodeURIComponent(config.room)}${passParam}&webcam&facing=user&videobitrate=${preset.bitrate}&width=${preset.width}&height=${preset.height}&framerate=${preset.fps}&autostart&cleanoutput`;
}

test('Punto b: WebRTC Mic genera URL con &mic&novideo y sin sensor de vídeo', () => {
  const config = { room: 'sala123', streamId: 'ja_cam_directo', password: 'secretpassword' };
  const micUrl = buildVdoPushUrl(config, 'mic');

  assert.match(micUrl, /push=ja_cam_directo/, 'Usa el mismo streamId para emisor único');
  assert.match(micUrl, /room=sala123/);
  assert.match(micUrl, /password=secretpassword/);
  assert.match(micUrl, /&mic/, 'Debe activar captura de micrófono');
  assert.match(micUrl, /&novideo/, 'Debe omitir la cámara para ahorrar batería');
  assert.match(micUrl, /&autostart&cleanoutput/);
  assert.ok(!micUrl.includes('webcam'), 'No debe solicitar hardware de webcam');
});

test('Punto b: Cámara WebRTC transmite vídeo Y audio sin &noaudio', () => {
  const config = { room: 'sala123', streamId: 'ja_cam_directo', password: '' };
  const camUrl = buildVdoPushUrl(config, 'camara', 'low');

  assert.match(camUrl, /push=ja_cam_directo/);
  assert.match(camUrl, /&webcam&facing=user/);
  assert.match(camUrl, /videobitrate=250/);
  assert.ok(!camUrl.includes('&noaudio'), 'No debe incluir &noaudio para enviar audio de alta calidad por WebRTC');
});

test('Punto a: Activar micrófono con cámara encendida apaga la cámara y conmuta a monigote en OBS', () => {
  const wsMensajes = [];
  let camaraActiva = true;
  let modoActual = 'camara';
  let pushIframeSrc = 'https://vdo.ninja/?push=ja_cam&webcam';
  let microActivo = false;

  function detenerCamara(motivo) {
    camaraActiva = false;
    modoActual = 'monigote';
    wsMensajes.push({ type: 'camara_stop', motivo });
  }

  function toggleMicro() {
    if (!microActivo) {
      // Si la cámara estaba activa, apagarla inmediatamente para volver al monigote en OBS
      if (camaraActiva || modoActual === 'camara') {
        detenerCamara('Cámara apagada al activar micrófono');
      }
      pushIframeSrc = 'https://vdo.ninja/?push=ja_cam&mic&novideo';
      microActivo = true;
      wsMensajes.push({ type: 'micro_start' });
    } else {
      microActivo = false;
      pushIframeSrc = 'about:blank';
      wsMensajes.push({ type: 'micro_stop' });
    }
  }

  // Ejecutar activación de micrófono mientras la cámara está en antena
  toggleMicro();

  assert.equal(camaraActiva, false, 'La cámara debe apagarse');
  assert.equal(modoActual, 'monigote', 'El modo debe conmutar a monigote en OBS');
  assert.equal(microActivo, true, 'El micrófono debe quedar activo');
  assert.match(pushIframeSrc, /&mic&novideo/, 'El stream WebRTC debe pasar a solo audio');

  // Comprobar secuencia de mensajes WebSocket enviados
  assert.equal(wsMensajes.length, 2);
  assert.equal(wsMensajes[0].type, 'camara_stop', 'Primero emite camara_stop para que OBS pinte el monigote');
  assert.equal(wsMensajes[1].type, 'micro_start', 'Luego emite micro_start para el estado del micro');
});

// ── 2. Punto c: Ocultar vista previa local para ahorro de batería/GPU ──
test('Punto c: Alternar vista previa local colapsa el wrapper manteniendo vivo el iframe WebRTC', () => {
  let previewOculta = false;
  let wrapperHeight = '220px';
  let wrapperVisibility = 'visible';
  let wrapperOpacity = '1';
  let botonTexto = '👁️ Ocultar Preview';

  function togglePreview() {
    previewOculta = !previewOculta;
    if (previewOculta) {
      wrapperHeight = '1px';
      wrapperVisibility = 'hidden';
      wrapperOpacity = '0';
      botonTexto = '🙈 Mostrar Preview';
    } else {
      wrapperHeight = '220px';
      wrapperVisibility = 'visible';
      wrapperOpacity = '1';
      botonTexto = '👁️ Ocultar Preview';
    }
  }

  // 1. Ocultar preview
  togglePreview();
  assert.equal(previewOculta, true);
  assert.equal(wrapperHeight, '1px', 'Reduce a 1px para suspender rasterizado de GPU');
  assert.equal(wrapperVisibility, 'hidden');
  assert.equal(wrapperOpacity, '0');
  assert.equal(botonTexto, '🙈 Mostrar Preview');

  // 2. Restaurar preview
  togglePreview();
  assert.equal(previewOculta, false);
  assert.equal(wrapperHeight, '220px');
  assert.equal(wrapperVisibility, 'visible');
  assert.equal(wrapperOpacity, '1');
  assert.equal(botonTexto, '👁️ Ocultar Preview');
});

// ── 3. Punto d: Fila única de controles junto al chat ──
test('Punto d: Sincronización de estados entre la fila del chat y los controles del panel', () => {
  let ttsActivo = false;
  let microActivo = false;
  let camaraActiva = false;
  let streamVisible = false;

  const botonesChat = {
    tts: { text: '', activeClass: '' },
    mic: { text: '', activeClass: '' },
    camara: { text: '', activeClass: '' },
    stream: { text: '' }
  };

  function sincronizarFilaChat() {
    botonesChat.tts.text = ttsActivo ? 'TTS On' : 'TTS';
    botonesChat.tts.activeClass = ttsActivo ? 'active-purple' : '';

    botonesChat.mic.text = microActivo ? 'Micro' : 'Micro';
    botonesChat.mic.activeClass = microActivo ? 'active-live' : 'touch-btn-primary';

    botonesChat.camara.text = camaraActiva ? 'Cámara' : 'Cámara';
    botonesChat.camara.activeClass = camaraActiva ? 'active-purple' : 'touch-btn-primary';

    botonesChat.stream.text = streamVisible ? 'Stream' : 'Stream';
  }

  // Estado inicial reposo
  sincronizarFilaChat();
  assert.equal(botonesChat.tts.activeClass, '');
  assert.equal(botonesChat.mic.activeClass, 'touch-btn-primary');
  assert.equal(botonesChat.camara.activeClass, 'touch-btn-primary');

  // Activar micrófono en directo
  microActivo = true;
  sincronizarFilaChat();
  assert.equal(botonesChat.mic.activeClass, 'active-live', 'El botón de micro en la barra del chat debe marcar active-live');

  // Activar TTS en directo
  ttsActivo = true;
  sincronizarFilaChat();
  assert.equal(botonesChat.tts.activeClass, 'active-purple', 'TTS en la barra de chat debe marcar active-purple');

  // Activar cámara
  camaraActiva = true;
  sincronizarFilaChat();
  assert.equal(botonesChat.camara.activeClass, 'active-purple', 'Cámara en la barra de chat debe marcar active-purple');
});

// ── 4. Punto f: Modo Pantalla Negra con Screen Wake Lock ──
test('Punto f: Modo Pantalla Negra activa Wake Lock y cualquier toque restaura el panel', async () => {
  let wakeLockActive = false;
  let overlayVisible = false;
  let overlayDisplay = 'none';

  const mockNavigator = {
    wakeLock: {
      request: async (type) => {
        if (type === 'screen') {
          wakeLockActive = true;
          return {
            release: async () => {
              wakeLockActive = false;
            }
          };
        }
      }
    }
  };

  let wakeLockInstance = null;

  async function activarPantallaNegra() {
    if (mockNavigator.wakeLock) {
      wakeLockInstance = await mockNavigator.wakeLock.request('screen');
    }
    overlayVisible = true;
    overlayDisplay = 'flex';
  }

  async function desactivarPantallaNegra() {
    overlayVisible = false;
    overlayDisplay = 'none';
    if (wakeLockInstance) {
      await wakeLockInstance.release();
      wakeLockInstance = null;
    }
  }

  // 1. Activar pantalla negra
  await activarPantallaNegra();
  assert.equal(overlayVisible, true);
  assert.equal(overlayDisplay, 'flex');
  assert.equal(wakeLockActive, true, 'Screen Wake Lock debe estar adquirido para que la pantalla no se apague');

  // 2. Toque del usuario para salir
  await desactivarPantallaNegra();
  assert.equal(overlayVisible, false);
  assert.equal(overlayDisplay, 'none');
  assert.equal(wakeLockActive, false, 'Wake Lock liberado de forma limpia al volver al panel');
});
