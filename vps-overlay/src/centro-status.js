'use strict';
const http = require('node:http');
const VALID_STATES = new Set(['detenido', 'recibiendo', 'reenviando', 'fallback', 'manual', 'error']);
const VALID_MODES = new Set(['relay', 'respaldo', 'manual']);
function publicStatus(raw) {
  return {
    estado: VALID_STATES.has(raw?.estado) ? raw.estado : 'error',
    obsActivo: raw?.obsActivo === true,
    tieneRespaldo: raw?.tieneRespaldo === true,
    destinos: Array.isArray(raw?.destinos) ? raw.destinos.slice(0, 30).map(d => ({
      nombre: String(d?.nombre || '').slice(0, 48).replace(/[^\p{L}\p{N} _-]/gu, ''),
      listo: d?.listo === true,
      activo: Number.isInteger(d?.pid) && d.pid > 0,
      modo: VALID_MODES.has(d?.modo) ? d.modo : null,
      conError: Boolean(d?.error)
    })) : []
  };
}
function handleCentreStatus(req, res, isAuth, { port = 8790, requester = http.request } = {}) {
  res.setHeader?.('Cache-Control', 'no-store');
  res.removeHeader?.('Access-Control-Allow-Origin');
  if (!isAuth(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false })); }
  if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); return res.end(); }
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
    res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'Centro no disponible' }));
  }
  const upstream = requester({ hostname: '127.0.0.1', port: Number(port), path: '/api/estado', method: 'GET' }, incoming => {
    let body = '';
    incoming.on('data', chunk => {
      body += chunk;
      if (body.length > 65536) upstream.destroy();
    });
    incoming.on('end', () => {
      if (res.writableEnded) return;
      try {
        if (incoming.statusCode !== 200 || body.length > 65536) throw new Error('Centre unavailable');
        const status = publicStatus(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true, ...status }));
      } catch (_) {
        res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Centro no disponible' }));
      }
    });
  });
  upstream.setTimeout?.(1500, () => upstream.destroy());
  upstream.on('error', () => {
    if (res.writableEnded) return;
    res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Centro no disponible' }));
  });
  upstream.end();
}
module.exports = { publicStatus, handleCentreStatus };
