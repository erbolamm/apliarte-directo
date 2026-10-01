import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import express from 'express';

test('Archivos public/cristal.html y public/pizarra.html existen y son validos', () => {
  const cristalPath = join(process.cwd(), 'public', 'cristal.html');
  const pizarraPath = join(process.cwd(), 'public', 'pizarra.html');

  assert.ok(existsSync(cristalPath), 'public/cristal.html debe existir');
  assert.ok(existsSync(pizarraPath), 'public/pizarra.html debe existir');

  const cristalContent = readFileSync(cristalPath, 'utf8');
  const pizarraContent = readFileSync(pizarraPath, 'utf8');

  // cristal.html
  assert.match(cristalContent, /background:\s*transparent\s*!important/i, 'cristal.html debe tener fondo transparente');
  assert.match(cristalContent, /<canvas id="canvas"/, 'cristal.html debe contener el canvas');
  assert.match(cristalContent, /pizarra_draw/, 'cristal.html debe escuchar eventos pizarra_draw');
  assert.match(cristalContent, /pizarra_clear/, 'cristal.html debe escuchar eventos pizarra_clear');
  // Shapes are painted by the shared renderer (test/pizarra-formas.test.js).
  assert.match(cristalContent, /<script src="\/js\/pizarra-render\.js\?v=\d+"><\/script>/, 'cristal.html carga el renderizador compartido');
  const renderer = readFileSync(join(process.cwd(), 'public', 'js', 'pizarra-render.js'), 'utf8');
  for (const shape of ['rect', 'ellipse', 'arrow', 'line']) assert.ok(renderer.includes(`'${shape}'`), `el renderizador soporta ${shape}`);

  // pizarra.html
  assert.match(pizarraContent, /<canvas id="drawing-canvas"/, 'pizarra.html debe contener el canvas de dibujo');
  assert.match(pizarraContent, /<canvas id="preview-canvas"/, 'pizarra.html debe contener el canvas de previsualización');
  assert.match(pizarraContent, /<img id="obs-preview-bg"/, 'pizarra.html debe contener la capa de vista previa OBS');
  assert.match(pizarraContent, /touch-action:\s*none/, 'pizarra.html debe bloquear gestos de zoom/scroll por defecto');
  assert.match(pizarraContent, /pizarra_draw/, 'pizarra.html debe emitir eventos pizarra_draw');
  assert.match(pizarraContent, /pizarra_clear/, 'pizarra.html debe emitir eventos pizarra_clear');
  assert.match(pizarraContent, /pizarra_undo/, 'pizarra.html debe emitir eventos pizarra_undo');
  assert.match(pizarraContent, /btn-redo/, 'pizarra.html debe contener botón rehacer');
  assert.match(pizarraContent, /data-tool="arrow"/, 'pizarra.html debe incluir herramienta flecha');
  assert.match(pizarraContent, /data-tool="rect"/, 'pizarra.html debe incluir herramienta rectángulo');
  assert.match(pizarraContent, /data-tool="ellipse"/, 'pizarra.html debe incluir herramienta elipse');
  assert.match(pizarraContent, /data-tool="line"/, 'pizarra.html debe incluir herramienta línea');
  assert.match(pizarraContent, /btn-obs-scene/, 'pizarra.html debe incluir botones conmutadores de escenas OBS');
  assert.match(pizarraContent, /btn-obs-mute/, 'pizarra.html debe incluir botón de mute de micrófono');
  assert.match(pizarraContent, /btn-obs-preview/, 'pizarra.html debe incluir botón de ver OBS en vivo');
  assert.match(pizarraContent, /data-color="#000000"/, 'pizarra.html debe incluir el color negro en la paleta');
  assert.match(pizarraContent, /@media\s*\(max-width:\s*860px\)/, 'pizarra.html debe incluir reglas responsivas para tablets');
});

test('Protocolo WebSocket de sincronizacion de pizarra en tiempo real', async () => {
  const app = express();
  const server = createServer(app);

  const overlayWss = new WebSocketServer({ noServer: true });
  const overlayClients = new Set();
  const pizarraHistory = [];

  overlayWss.on('connection', (ws) => {
    overlayClients.add(ws);
    if (pizarraHistory.length > 0) {
      ws.send(JSON.stringify({ type: 'pizarra_init', history: pizarraHistory }));
    }

    ws.on('message', (msg) => {
      const text = msg.toString('utf8');
      try {
        const data = JSON.parse(text);
        if (data.type === 'pizarra_draw') {
          pizarraHistory.push(data);
        } else if (data.type === 'pizarra_clear') {
          pizarraHistory.length = 0;
        } else if (data.type === 'pizarra_undo') {
          pizarraHistory.pop();
        }
      } catch (_) {}

      for (const client of overlayClients) {
        if (client !== ws && client.readyState === 1) {
          client.send(text);
        }
      }
    });

    ws.on('close', () => overlayClients.delete(ws));
  });

  server.on('upgrade', (req, socket, head) => {
    overlayWss.handleUpgrade(req, socket, head, (ws) => {
      overlayWss.emit('connection', ws, req);
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  // Conectar Tablet (Pizarra) y OBS (Cristal)
  const wsTablet = new WebSocket(`ws://127.0.0.1:${port}`);
  const wsObs = new WebSocket(`ws://127.0.0.1:${port}`);

  await Promise.all([
    new Promise((resolve) => wsTablet.on('open', resolve)),
    new Promise((resolve) => wsObs.on('open', resolve)),
  ]);

  // Probar envio de trazo desde Tablet hacia OBS
  const strokeData = {
    type: 'pizarra_draw',
    strokeId: 's_test_1',
    from: { x: 0.1, y: 0.2 },
    to: { x: 0.15, y: 0.25 },
    color: '#00f0ff',
    size: 6,
    tool: 'pen'
  };

  const receivedOnObs = await new Promise((resolve) => {
    wsObs.on('message', (msg) => {
      const data = JSON.parse(msg.toString('utf8'));
      resolve(data);
    });
    wsTablet.send(JSON.stringify(strokeData));
  });

  assert.equal(receivedOnObs.type, 'pizarra_draw');
  assert.equal(receivedOnObs.strokeId, 's_test_1');
  assert.equal(receivedOnObs.color, '#00f0ff');
  assert.equal(pizarraHistory.length, 1);

  // Probar conexion de nuevo cliente OBS y recepcion de pizarra_init
  const wsObs2 = new WebSocket(`ws://127.0.0.1:${port}`);
  const initReceived = await new Promise((resolve) => {
    wsObs2.on('message', (msg) => {
      const data = JSON.parse(msg.toString('utf8'));
      if (data.type === 'pizarra_init') resolve(data);
    });
  });

  assert.equal(initReceived.type, 'pizarra_init');
  assert.equal(initReceived.history.length, 1);
  assert.equal(initReceived.history[0].strokeId, 's_test_1');

  // Limpiar
  wsTablet.close();
  wsObs.close();
  wsObs2.close();
  overlayWss.close();
  await new Promise((resolve) => server.close(resolve));
});

test('Sincronizacion de formas Excalidraw y eventos de mando OBS', async () => {
  const app = express();
  const server = createServer(app);

  const overlayWss = new WebSocketServer({ noServer: true });
  const overlayClients = new Set();
  const pizarraHistory = [];

  overlayWss.on('connection', (ws) => {
    overlayClients.add(ws);
    ws.on('message', (msg) => {
      const text = msg.toString('utf8');
      try {
        const data = JSON.parse(text);
        if (data.type === 'pizarra_draw') {
          pizarraHistory.push(data);
        }
      } catch (_) {}

      for (const client of overlayClients) {
        if (client !== ws && client.readyState === 1) {
          client.send(text);
        }
      }
    });
    ws.on('close', () => overlayClients.delete(ws));
  });

  server.on('upgrade', (req, socket, head) => {
    overlayWss.handleUpgrade(req, socket, head, (ws) => {
      overlayWss.emit('connection', ws, req);
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const wsTablet = new WebSocket(`ws://127.0.0.1:${port}`);
  const wsObs = new WebSocket(`ws://127.0.0.1:${port}`);
  const wsBridge = new WebSocket(`ws://127.0.0.1:${port}`);

  await Promise.all([
    new Promise((resolve) => wsTablet.on('open', resolve)),
    new Promise((resolve) => wsObs.on('open', resolve)),
    new Promise((resolve) => wsBridge.on('open', resolve)),
  ]);

  // 1. Enviar una forma geométrica (rectángulo Excalidraw)
  const rectShape = {
    type: 'pizarra_draw',
    shape: 'rect',
    strokeId: 's_rect_99',
    from: { x: 0.2, y: 0.2 },
    to: { x: 0.5, y: 0.5 },
    color: '#ffd000',
    size: 14,
    tool: 'rect'
  };

  const receivedShapeOnObs = await new Promise((resolve) => {
    wsObs.on('message', (msg) => {
      const data = JSON.parse(msg.toString('utf8'));
      if (data.type === 'pizarra_draw') resolve(data);
    });
    wsTablet.send(JSON.stringify(rectShape));
  });

  assert.equal(receivedShapeOnObs.shape, 'rect');
  assert.equal(receivedShapeOnObs.strokeId, 's_rect_99');
  assert.equal(receivedShapeOnObs.color, '#ffd000');

  // 2. Enviar petición de cambio de escena OBS desde la tablet hacia el bridge
  const receivedSceneOnBridge = await new Promise((resolve) => {
    wsBridge.on('message', (msg) => {
      const data = JSON.parse(msg.toString('utf8'));
      if (data.type === 'obs_cambiar_escena') resolve(data);
    });
    wsTablet.send(JSON.stringify({ type: 'obs_cambiar_escena', escena: 'CON_CAMARA' }));
  });

  assert.equal(receivedSceneOnBridge.escena, 'CON_CAMARA');

  // 3. Enviar captura desde el bridge hacia la tablet
  const receivedCaptureOnTablet = await new Promise((resolve) => {
    wsTablet.on('message', (msg) => {
      const data = JSON.parse(msg.toString('utf8'));
      if (data.type === 'obs_captura') resolve(data);
    });
    wsBridge.send(JSON.stringify({ type: 'obs_captura', data: 'data:image/jpeg;base64,mockdata' }));
  });

  assert.equal(receivedCaptureOnTablet.data, 'data:image/jpeg;base64,mockdata');

  wsTablet.close();
  wsObs.close();
  wsBridge.close();
  overlayWss.close();
  await new Promise((resolve) => server.close(resolve));
});

