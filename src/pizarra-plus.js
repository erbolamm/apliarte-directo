'use strict';
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

function privateHost(req) {
  try {
    const host = new URL('http://' + req.headers.host).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' ||
      host.endsWith('.ts.net') || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(host);
  } catch (_) { return false; }
}

async function localObsClient() {
  const { crearClienteObsWebSocket, obtenerConfiguracionObsLocal } = await import('./obs-bridge.js');
  const cfg = obtenerConfiguracionObsLocal();
  return crearClienteObsWebSocket({ puerto: cfg.puerto, password: cfg.password });
}

function createPizarraPlus({ enabled = false, authorize, trustedOrigin, root, createObsClient = localObsClient }) {
  let clientPromise = null;
  let screenshotBusy = false;
  const history = [];
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
        if (!['scene', 'mute'].includes(body.action) || typeof body.name !== 'string' || !body.name || body.name.length > 256) {
          reply(res, 400, { error: 'invalid-action' }); return true;
        }
        const client = await obs();
        if (body.action === 'scene') {
          const state = await client.obtenerEscenas();
          if (!(state.scenes || []).some(s => s.sceneName === body.name)) { reply(res, 400, { error: 'unknown-scene' }); return true; }
          await client.cambiarEscena(body.name);
          reply(res, 200, { ok: true, scene: body.name });
        } else {
          const state = await client.enviarPeticion('GetInputList');
          if (!(state.inputs || []).some(s => s.inputName === body.name)) { reply(res, 400, { error: 'unknown-input' }); return true; }
          const mute = await client.toggleMute(body.name);
          reply(res, 200, { ok: true, input: body.name, muted: Boolean(mute.inputMuted) });
        }
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
  const broadcast = (data, except) => {
    const text = JSON.stringify(data);
    for (const client of clients) if (client !== except && client.readyState === 1 && client.bufferedAmount < 262144) client.send(text);
  };
  function drawingMessage(data) {
    if (data.type !== 'pizarra_draw') return false;
    const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    return point(data.from) && point(data.to) && typeof data.strokeId === 'string' && data.strokeId.length <= 100 && /^#[0-9a-f]{6}$/i.test(data.color || '') && Number.isFinite(data.size) && data.size > 0 && data.size <= 100 && ['stroke', 'rect', 'ellipse', 'arrow', 'line'].includes(data.shape) && ['pen', 'highlighter', 'eraser'].includes(data.tool);
  }
  wss.on('connection', (ws, req) => {
    clients.add(ws);
    const readonly = new URL(req.url, 'http://localhost').searchParams.get('overlay') === '1';
    ws.send(JSON.stringify({ type: 'pizarra_init', history }));
    ws.on('message', raw => {
      let data;
      try { data = JSON.parse(raw.toString()); } catch (_) { return; }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'pizarra_solicitar_estado') { ws.send(JSON.stringify({ type: 'pizarra_init', history })); return; }
      if (readonly) return;
      if (drawingMessage(data)) {
        const clean = { type: data.type, from: data.from, to: data.to, strokeId: data.strokeId, color: data.color, size: data.size, shape: data.shape, tool: data.tool };
        history.push(clean);
        if (history.length > 4000) history.shift();
        broadcast(clean, ws);
      } else if (data.type === 'pizarra_clear') { history.length = 0; broadcast({ type: data.type }, ws); }
      else if (data.type === 'pizarra_undo') {
        const id = history.at(-1)?.strokeId;
        while (history.length && history.at(-1).strokeId === id) history.pop();
        broadcast({ type: data.type }, ws);
      }
    });
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
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
module.exports = { createPizarraPlus };
