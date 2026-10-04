'use strict';
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

function privateHost(req) {
  try {
    const host = new URL('http://' + req.headers.host).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' ||
      host.endsWith('.ts.net') || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(host);
  } catch (_) { return false; }
}

// Drawing messages the private tablet may send. New shapes travel with only
// these optional fields: fill/dash (booleans) and text (text shape, 1-120 chars).
const DRAW_SHAPES = ['stroke', 'rect', 'ellipse', 'arrow', 'arrow2', 'line', 'text'];
const MAX_TEXT = 120;

function drawingMessage(data) {
  if (!data || data.type !== 'pizarra_draw') return false;
  const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  if (!(point(data.from) && point(data.to) && typeof data.strokeId === 'string' && data.strokeId.length <= 100 && /^#[0-9a-f]{6}$/i.test(data.color || '') && Number.isFinite(data.size) && data.size > 0 && data.size <= 100 && DRAW_SHAPES.includes(data.shape) && ['pen', 'highlighter', 'eraser'].includes(data.tool))) return false;
  if (data.fill !== undefined && typeof data.fill !== 'boolean') return false;
  if (data.dash !== undefined && typeof data.dash !== 'boolean') return false;
  if (data.shape === 'text') return typeof data.text === 'string' && data.text.length > 0 && data.text.length <= MAX_TEXT;
  return true;
}

function cleanDraw(data) {
  const clean = { type: data.type, from: { x: data.from.x, y: data.from.y }, to: { x: data.to.x, y: data.to.y }, strokeId: data.strokeId, color: data.color, size: data.size, shape: data.shape, tool: data.tool };
  if (data.fill === true) clean.fill = true;
  if (data.dash === true) clean.dash = true;
  if (data.shape === 'text' && typeof data.text === 'string') clean.text = data.text.slice(0, MAX_TEXT);
  return clean;
}

// Audio-only OBS input kinds (microphones, desktop audio). Their scene item
// visibility says nothing useful: what matters on air is whether they are muted.
const AUDIO_INPUT_KIND = /^(coreaudio|wasapi|pulse|alsa|jack|oss|sndio)_|^sck_audio_capture$|^pipewire[-_]audio/;

async function localObsClient() {
  const { crearClienteObsWebSocket, obtenerConfiguracionObsLocal } = await import('./obs-bridge.js');
  const cfg = obtenerConfiguracionObsLocal();
  return crearClienteObsWebSocket({ puerto: cfg.puerto, password: cfg.password });
}

function createPizarraPlus({ enabled = false, authorize, trustedOrigin, root, createObsClient = localObsClient, drawingPort = Number(process.env.CENTRO_PANEL_PORT || 8790) }) {
  let clientPromise = null;
  let screenshotBusy = false;
  if (!Number.isInteger(drawingPort) || drawingPort < 1 || drawingPort > 65535) throw new Error('invalid-drawing-port');
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
  const clients = new Set();
  const assets = new Map([
    ['/pizarra-plus', ['pizarra-plus.html', 'text/html; charset=utf-8']],
    ['/pizarra-plus/guia', ['pizarra-plus-guide.html', 'text/html; charset=utf-8']],
    ['/cristal-plus', ['cristal-plus.html', 'text/html; charset=utf-8']],
    ['/api/pizarra-plus/pointer-owner.js', ['pointer-owner.js', 'application/javascript; charset=utf-8']],
  ]);
  function reply(res, status, data) {
    res.setHeader('Cache-Control', 'no-store');
    res.removeHeader('Access-Control-Allow-Origin');
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
  async function obs() {
    if (!clientPromise) clientPromise = Promise.resolve().then(createObsClient).catch(e => { clientPromise = null; throw e; });
    const client = await clientPromise;
    if (!client.estaConectado()) throw new Error('obs-disconnected');
    return client;
  }
  async function readBody(req) {
    let text = '';
    const timeout = setTimeout(() => req.destroy(), 3000);
    try {
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 16384) throw new Error('invalid-body');
      }
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid-body');
      return data;
    } finally { clearTimeout(timeout); }
  }
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    if (!assets.has(pathname) && !pathname.startsWith('/api/pizarra-plus/')) return false;
    if (!enabled) { reply(res, 404, { error: 'not-found' }); return true; }
    if (!privateHost(req) || !authorize(req) || !trustedOrigin(req)) { reply(res, 403, { error: 'private-access-required' }); return true; }
    res.setHeader('Cache-Control', 'no-store');
    res.removeHeader('Access-Control-Allow-Origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (assets.has(pathname)) {
      if (req.method !== 'GET') { reply(res, 405, { error: 'method-not-allowed' }); return true; }
      const [file, mime] = assets.get(pathname);
      res.writeHead(200, { 'Content-Type': mime, 'Content-Security-Policy': "frame-ancestors 'self'" });
      res.end(fs.readFileSync(path.join(root, 'private', file)));
      return true;
    }
    try {
      if (pathname === '/api/pizarra-plus/obs/action' && req.method === 'POST') {
        let body;
        try { body = await readBody(req); } catch (_) { reply(res, 400, { error: 'invalid-body' }); return true; }
        if (!['scene', 'mute', 'toggle_source'].includes(body.action)) {
          reply(res, 400, { error: 'invalid-action' }); return true;
        }
        const client = await obs();
        if (body.action === 'scene') {
          if (typeof body.name !== 'string' || !body.name || body.name.length > 256) {
            reply(res, 400, { error: 'invalid-action' }); return true;
          }
          const state = await client.obtenerEscenas();
          if (!(state.scenes || []).some(s => s.sceneName === body.name)) { reply(res, 400, { error: 'unknown-scene' }); return true; }
          await client.cambiarEscena(body.name);
          reply(res, 200, { ok: true, scene: body.name });
        } else if (body.action === 'mute') {
          if (typeof body.name !== 'string' || !body.name || body.name.length > 256 || (body.muted !== undefined && typeof body.muted !== 'boolean')) {
            reply(res, 400, { error: 'invalid-action' }); return true;
          }
          const state = await client.enviarPeticion('GetInputList');
          if (!(state.inputs || []).some(s => s.inputName === body.name)) { reply(res, 400, { error: 'unknown-input' }); return true; }
          // An explicit target state cannot invert a stale view the way a blind toggle does.
          if (typeof body.muted === 'boolean') {
            await client.enviarPeticion('SetInputMute', { inputName: body.name, inputMuted: body.muted });
            reply(res, 200, { ok: true, input: body.name, muted: body.muted });
          } else {
            const mute = await client.toggleMute(body.name);
            reply(res, 200, { ok: true, input: body.name, muted: Boolean(mute.inputMuted) });
          }
        } else {
          if (typeof body.id !== 'number' || typeof body.enabled !== 'boolean') {
            reply(res, 400, { error: 'invalid-action' }); return true;
          }
          const state = await client.obtenerEscenas();
          const targetScene = (typeof body.scene === 'string' && body.scene) ? body.scene : state.currentProgramSceneName;
          await client.enviarPeticion('SetSceneItemEnabled', {
            sceneName: targetScene,
            sceneItemId: body.id,
            sceneItemEnabled: body.enabled,
          });
          reply(res, 200, { ok: true, scene: targetScene, id: body.id, enabled: body.enabled });
        }
      } else if (pathname === '/api/pizarra-plus/obs/sources' && req.method === 'GET') {
        const client = await obs();
        const state = await client.obtenerEscenas();
        const requestedScene = url.searchParams.get('scene') || state.currentProgramSceneName;
        const [items, inputList] = await Promise.all([
          client.enviarPeticion('GetSceneItemList', { sceneName: requestedScene }).catch(() => ({ sceneItems: [] })),
          client.enviarPeticion('GetInputList').catch(() => ({ inputs: [] })),
        ]);
        const audioInputs = new Set((inputList.inputs || [])
          .filter(i => AUDIO_INPUT_KIND.test(i.unversionedInputKind || i.inputKind || ''))
          .map(i => i.inputName));
        const sources = await Promise.all((items.sceneItems || []).map(async i => {
          const mute = audioInputs.has(i.sourceName) ? await client.obtenerMute(i.sourceName).catch(() => null) : null;
          const source = { id: i.sceneItemId, name: i.sourceName, enabled: Boolean(i.sceneItemEnabled), type: i.sourceType || '', audio: Boolean(mute) };
          // For audio the eye mirrors the real mute state, not the scene item visibility.
          if (mute) { source.muted = Boolean(mute.inputMuted); source.enabled = !source.muted; }
          return source;
        }));
        reply(res, 200, { ok: true, scene: requestedScene, sources });
      } else if (pathname === '/api/pizarra-plus/obs/state' && req.method === 'GET') {
        const client = await obs();
        const [state, inputs] = await Promise.all([client.obtenerEscenas(), client.enviarPeticion('GetInputList')]);
        const input = url.searchParams.get('input');
        let muted = null;
        if (input && (inputs.inputs || []).some(i => i.inputName === input)) {
          const mute = await client.obtenerMute(input).catch(() => null);
          if (mute) muted = Boolean(mute.inputMuted);
        }
        reply(res, 200, { ok: true, scene: state.currentProgramSceneName, scenes: (state.scenes || []).map(s => s.sceneName), inputs: (inputs.inputs || []).map(i => i.inputName), muted });
      } else if (pathname === '/api/pizarra-plus/obs/screenshot' && req.method === 'GET') {
        if (screenshotBusy) { reply(res, 429, { error: 'capture-in-progress' }); return true; }
        screenshotBusy = true;
        try {
          const client = await obs();
          const state = await client.obtenerEscenas();
          const snap = await client.obtenerCaptura(state.currentProgramSceneName);
          if (!/^data:image\/jpeg;base64,/.test(snap.imageData || '') || snap.imageData.length > 1500000) throw new Error('capture-unavailable');
          reply(res, 200, { ok: true, image: snap.imageData });
        } finally { screenshotBusy = false; }
      } else { reply(res, 404, { error: 'not-found' }); }
    } catch (_) { reply(res, 503, { error: 'obs-unavailable', message: 'OBS no está conectado o no pudo completar la petición.' }); }
    return true;
  }
  wss.on('connection', (ws, req) => {
    clients.add(ws);
    const readonly = new URL(req.url, 'http://localhost').searchParams.get('overlay') === '1';
    // The original centre owns history and delivery to the existing OBS source.
    const upstream = new WebSocket(`ws://127.0.0.1:${drawingPort}/ws`, { maxPayload: 2097152, handshakeTimeout: 5000 });
    let ready = false;
    const send = (socket, data) => {
      if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 262144) socket.send(JSON.stringify(data));
    };
    upstream.on('open', () => send(upstream, { type: 'pizarra_solicitar_estado' }));
    upstream.on('message', raw => {
      let data;
      try { data = JSON.parse(raw.toString()); } catch (_) { return; }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'pizarra_init' && Array.isArray(data.history) && data.history.length <= 4000) {
        ready = true;
        send(ws, { type: 'pizarra_init', history: data.history.filter(drawingMessage).map(cleanDraw) });
      } else if (drawingMessage(data)) send(ws, cleanDraw(data));
      else if (['pizarra_clear', 'pizarra_undo'].includes(data.type)) send(ws, { type: data.type });
    });
    upstream.on('error', () => ws.close(1013, 'Drawing centre unavailable'));
    upstream.on('close', () => ws.close(1013, 'Drawing centre disconnected'));
    ws.on('message', raw => {
      let data;
      try { data = JSON.parse(raw.toString()); } catch (_) { return; }
      if (!ready || !data || typeof data !== 'object') return;
      if (data.type === 'pizarra_solicitar_estado') send(upstream, { type: data.type });
      else if (!readonly && drawingMessage(data)) send(upstream, cleanDraw(data));
      else if (!readonly && ['pizarra_clear', 'pizarra_undo'].includes(data.type)) send(upstream, { type: data.type });
    });
    const dispose = () => { clients.delete(ws); upstream.terminate(); };
    ws.on('close', dispose);
    ws.on('error', dispose);
  });
  function upgrade(req, socket, head) {
    if (req.url.split('?')[0] !== '/pizarra-plus/ws') return false;
    if (!enabled || !privateHost(req) || !authorize(req) || !trustedOrigin(req)) { socket.destroy(); return true; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    return true;
  }
  async function close() {
    for (const client of clients) client.close();
    wss.close();
    if (clientPromise) (await clientPromise).cerrar();
  }
  return { handle, upgrade, close };
}
module.exports = { createPizarraPlus, drawingMessage, cleanDraw };
