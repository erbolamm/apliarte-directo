'use strict';
const { timingSafeEqual } = require('crypto');

/**
 * Extrae el token de autenticacion de la URL del handshake WS.
 * Acepta: ?token=... (con o sin otros params).
 * Rechaza: token vacio o solo espacios.
 * @param {Object} req - request con propiedad url
 * @returns {string|null} el token si esta presente y no vacio, sino null
 */
function parseWsAuth(req) {
  if (!req || typeof req.url !== 'string') return null;
  try {
    const parsed = new URL(req.url, 'http://localhost');
    const token = parsed.searchParams.get('token');
    if (typeof token !== 'string') return null;
    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (_) {
    return null;
  }
}

/** Browser admin sockets reuse the HttpOnly panel cookie, never a JS-visible URL token.
 * Ignore it unless the browser Origin matches Host to prevent cross-site WS hijacking.
 * Explicit ?token= credentials remain authoritative and never fall back to a cookie.
 */
function parseWsPanelCookie(req) {
  const headers = req && req.headers;
  if (!headers || typeof headers.host !== 'string' || typeof headers.origin !== 'string') return null;
  try {
    if (new URL(req.url, 'http://localhost').searchParams.has('token')) return null;
  } catch (_) { return null; }
  let origin;
  try { origin = new URL(headers.origin); } catch (_) { return null; }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== headers.host) return null;
  const cookie = headers.cookie;
  if (typeof cookie !== 'string') return null;
  const entry = cookie.split(';').map(part => part.trim()).find(part => part.startsWith('tts_auth='));
  if (!entry) return null;
  const token = entry.slice('tts_auth='.length);
  return token.length > 0 ? token : null;
}

/**
 * True when the WS handshake does not come from a foreign web page.
 * Non-browser clients (OBS, native apps) send no Origin. Browsers always send it,
 * so a page on another domain opened on a Tailscale device is not trusted.
 * @param {Object} req - request con headers
 * @returns {boolean}
 */
function isTrustedWsOrigin(req) {
  const headers = req && req.headers;
  if (!headers) return false;
  if (headers.origin === undefined) return true;
  if (typeof headers.origin !== 'string' || typeof headers.host !== 'string') return false;
  let origin;
  try { origin = new URL(headers.origin); } catch (_) { return false; }
  return ['http:', 'https:'].includes(origin.protocol) && origin.host === headers.host;
}

/**
 * Verifica un token contra el secreto configurado para el canal dado,
 * usando comparacion timing-safe.
 *
 * Directo /ws validates against env.PANEL_PASS.
 *
 * @param {'ws'} channel
 * @param {string} token
 * @param {Object} [env] - inyeccion de env para tests; default process.env
 * @returns {boolean}
 */
function verifyWsToken(channel, token, env = process.env) {
  if (typeof token !== 'string' || token.length === 0) return false;

  if (channel !== 'ws') return false;
  const expected = env.PANEL_PASS || '';
  if (!expected) return false;
  if (token.length !== expected.length) return false;

  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return timingSafeEqual(a, b);
}

const PUBLIC_EVENTS = new Set([
  'scene',
  'layer_add',
  'layer_remove',
  'layer_update',
  'layer_reorder',
  'stream_state',
  'twitch_state',
  'ping',
  'pong',
  'camara_start',
  'camara_stop',
  'camara_desactivada',
  'camara_modo',
  'camara_aspecto',
  'micro_start',
  'micro_stop',
  'micro_desactivado',
  'voz_pcm',
  'pizarra_draw',
  'pizarra_clear',
  'pizarra_undo',
  'pizarra_init',
  'pizarra_solicitar_estado',
]);

const RESTRICTED_EVENTS = new Set([
  'sms_nuevo',
  'nuevo_sms',
  'comando_chat',
  'directo_comando',
  'juego_estado',
  'categoria',
]);

/**
 * Decide si un cliente con el rol dado puede recibir un mensaje del tipo dado.
 *
 * - publico: solo PUBLIC_EVENTS
 * - admin: PUBLIC_EVENTS + RESTRICTED_EVENTS
 * - cualquier otro rol o tipo desconocido: false
 *
 * @param {'publico'|'admin'} rol
 * @param {string} msgType
 * @returns {boolean}
 */
function canReceive(rol, msgType) {
  if (typeof msgType !== 'string' || msgType.length === 0) return false;
  const knownEvents = PUBLIC_EVENTS.has(msgType) || RESTRICTED_EVENTS.has(msgType);
  if (!knownEvents) return false;

  if (rol === 'publico') {
    return PUBLIC_EVENTS.has(msgType);
  }
  if (rol === 'admin') {
    return true;
  }
  return false;
}

/**
 * Decide que rol asignar a una conexion WS entrante.
 *
 * Logica:
 *  - /ws: si token valido -> 'admin'. Si no, y la conexion es local/Tailscale ->
 *    'admin' when the origin is trusted (the VPS is reachable only through
 *    Tailscale), otherwise 'publico'. Si no -> null.
 *  - Un token invalido NUNCA cae a 'publico' por isLocal (defensa: que un
 *    atacante con IP spoofeada de Tailscale no abra con token basura).
 *
 * @param {'ws'} channel
 * @param {string|null|undefined} token
 * @param {boolean} isLocalOrTailscale
 * @param {Object} [env] - inyeccion de env para tests; default process.env
 * @param {boolean} [trustedOrigin] - result of isTrustedWsOrigin; defaults to false
 * @returns {'admin'|'publico'|null}
 */
function decideWsRole(channel, token, isLocalOrTailscale, env = process.env, trustedOrigin = false) {
  if (channel !== 'ws') return null;
  if (typeof token === 'string' && token.length > 0) {
    if (verifyWsToken('ws', token, env)) {
      return 'admin';
    }
    return null;
  }

  if (isLocalOrTailscale === true) return trustedOrigin === true ? 'admin' : 'publico';
  return null;
}

/**
 * Decide si un cliente con el rol dado puede ENVIAR un mensaje del tipo dado.
 * Espejo de canReceive para el lado del emisor: publico solo puede emitir
 * PUBLIC_EVENTS; admin puede emitir todo lo conocido. Tipos
 * desconocidos y mensajes no parseables (msgType null/empty) se rechazan
 * en cualquier rol.
 *
 * Cierra el gap donde un cliente 'publico' podia inyectar mensajes
 * restringidos (sms_nuevo, comando_chat, directo_comando, juego_estado,
 * nuevo_sms, categoria) en el broadcast relay.
 *
 * @param {'publico'|'admin'} rol
 * @param {string} msgType
 * @returns {boolean}
 */
function canSend(rol, msgType) {
  if (typeof msgType !== 'string' || msgType.length === 0) return false;
  const knownEvents = PUBLIC_EVENTS.has(msgType) || RESTRICTED_EVENTS.has(msgType);
  if (!knownEvents) return false;

  if (rol === 'publico') {
    return PUBLIC_EVENTS.has(msgType);
  }
  if (rol === 'admin') {
    return true;
  }
  return false;
}

module.exports = { parseWsAuth, parseWsPanelCookie, isTrustedWsOrigin, verifyWsToken, canReceive, canSend, decideWsRole };
