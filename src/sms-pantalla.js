'use strict';
// One SMS from the mailbox shown on the stream, chosen by hand in the panel.
// The mailbox itself stays private: no text ever leaves it automatically,
// and nothing is broadcast over the public WebSocket. The on-screen page
// (public/sms-pantalla.html) polls GET /api/directo/sms/pantalla instead.

const MAX_BODY_BYTES = 4096;
const AVATAR_CACHE_MS = 60 * 60 * 1000;
const ROUTES = new Set(['/api/directo/sms/pantalla', '/api/directo/sms/mostrar', '/api/directo/sms/ocultar']);

// Only an https picture is ever handed to the page.
function safeAvatar(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : null;
  } catch (_) { return null; }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      text += chunk;
      if (text.length > MAX_BODY_BYTES) { tooLarge = true; text = ''; }
    });
    req.on('end', () => {
      if (tooLarge) { reject(new Error('too-large')); return; }
      try {
        const data = JSON.parse(text || '{}');
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid');
        resolve(data);
      } catch (_) { reject(new Error('invalid')); }
    });
    req.on('error', () => reject(new Error('invalid')));
  });
}

function createSmsPantalla({ getSmsList, lookupAvatar = async () => null, now = () => Date.now() }) {
  let current = null;
  const avatars = new Map();

  async function avatarFor(user) {
    const key = String(user || '').toLowerCase();
    const cached = avatars.get(key);
    if (cached && now() - cached.at < AVATAR_CACHE_MS) return cached.url;
    let url = null;
    try { url = safeAvatar(await lookupAvatar(key)); } catch (_) { url = null; }
    avatars.set(key, { url, at: now() });
    return url;
  }

  // A message deleted from the mailbox must not stay on screen.
  function currentIfStillThere() {
    if (current && !getSmsList().some(message => message && message.id === current.id)) current = null;
    return current;
  }

  async function show(id) {
    const message = getSmsList().find(entry => entry && entry.id === id);
    if (!message) return null;
    current = {
      id: message.id,
      usuario: String(message.usuario || 'anónimo'),
      texto: String(message.texto || ''),
      avatar: await avatarFor(message.usuario),
    };
    return current;
  }

  function hide() { current = null; }

  const matches = path => ROUTES.has(path);

  async function handle(req, res, path, isAuth) {
    res.removeHeader?.('Access-Control-Allow-Origin');
    if (!isAuth(req)) { sendJson(res, 401, { ok: false, error: 'No autorizado' }); return; }
    if (path === '/api/directo/sms/pantalla') {
      if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end(); return; }
      sendJson(res, 200, { ok: true, mensaje: currentIfStillThere() });
      return;
    }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); res.end(); return; }
    if (path === '/api/directo/sms/ocultar') {
      hide();
      sendJson(res, 200, { ok: true, mensaje: null });
      return;
    }
    let body;
    try { body = await readJsonBody(req); } catch (_) { sendJson(res, 400, { ok: false, error: 'Petición no válida' }); return; }
    if (typeof body.id !== 'string' || !body.id) { sendJson(res, 400, { ok: false, error: 'Falta el mensaje' }); return; }
    const shown = await show(body.id);
    if (!shown) { sendJson(res, 404, { ok: false, error: 'Ese mensaje ya no está en el buzón' }); return; }
    sendJson(res, 200, { ok: true, mensaje: shown });
  }

  return { matches, handle, show, hide, get current() { return currentIfStillThere(); } };
}

module.exports = { createSmsPantalla, safeAvatar };
