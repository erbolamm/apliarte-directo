import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseWsAuth, parseWsPanelCookie, verifyWsToken, canReceive, canSend, decideWsRole, isTrustedWsOrigin } = require('../src/ws-auth.js');

// ─── parseWsAuth ─────────────────────────────────────────────────────────────

test('parseWsAuth: extrae token de ?token=PANEL_PASS', () => {
  const req = { url: '/ws?token=abc123' };
  assert.equal(parseWsAuth(req), 'abc123');
});

test('parseWsAuth: extrae token de URL con otros params', () => {
  const req = { url: '/ws?foo=bar&token=secret123&baz=qux' };
  assert.equal(parseWsAuth(req), 'secret123');
});

test('parseWsAuth: devuelve null si no hay param token', () => {
  const req = { url: '/ws' };
  assert.equal(parseWsAuth(req), null);
});

test('parseWsAuth: devuelve null si req no tiene url', () => {
  assert.equal(parseWsAuth({}), null);
  assert.equal(parseWsAuth(null), null);
});

test('parseWsAuth: token vacío devuelve null (no string vacía)', () => {
  const req = { url: '/ws?token=' };
  assert.equal(parseWsAuth(req), null);
});

test('parseWsAuth: token con solo espacios devuelve null', () => {
  const req = { url: '/ws?token=%20%20' };
  assert.equal(parseWsAuth(req), null);
});

test('parseWsPanelCookie: accepts only matching browser Origin and Host', () => {
  const req = { url: '/ws', headers: {
    host: 'directo.example:7979', origin: 'https://directo.example:7979',
    cookie: 'other=x; tts_auth=panel-cookie; theme=dark'
  } };
  assert.equal(parseWsPanelCookie(req), 'panel-cookie');
  assert.equal(parseWsPanelCookie({ ...req, headers: { ...req.headers, origin: 'https://other.example' } }), null);
  assert.equal(parseWsPanelCookie({ ...req, headers: { ...req.headers, origin: 'null' } }), null);
  assert.equal(parseWsPanelCookie({ ...req, headers: { ...req.headers, origin: undefined } }), null);
});

test('parseWsPanelCookie: explicit query token never falls back to cookie', () => {
  const headers = { host: 'localhost:7979', origin: 'http://localhost:7979', cookie: 'tts_auth=panel-cookie' };
  assert.equal(parseWsPanelCookie({ url: '/ws?token=wrong', headers }), null);
  assert.equal(parseWsPanelCookie({ url: '/ws?token=', headers }), null);
  assert.equal(parseWsPanelCookie({ url: '/ws', headers: { ...headers, cookie: 'tts_auth=' } }), null);
});

// ─── verifyWsToken ───────────────────────────────────────────────────────────

test('verifyWsToken: rechaza token null', () => {
  assert.equal(verifyWsToken('ws', null), false);
});

test('verifyWsToken: rechaza token vacío', () => {
  assert.equal(verifyWsToken('ws', ''), false);
});

test('verifyWsToken: rechaza token no string', () => {
  assert.equal(verifyWsToken('ws', 12345), false);
  assert.equal(verifyWsToken('ws', {}), false);
});

test('verifyWsToken: rechaza canal desconocido', () => {
  assert.equal(verifyWsToken('inventado', 'whatever'), false);
});

test('verifyWsToken: ws acepta token correcto', () => {
  process.env.PANEL_PASS = 'test-panel-pass-1234567890';
  try {
    assert.equal(verifyWsToken('ws', 'test-panel-pass-1234567890'), true);
  } finally {
    delete process.env.PANEL_PASS;
  }
});

test('verifyWsToken: ws rechaza token incorrecto', () => {
  process.env.PANEL_PASS = 'test-panel-pass-1234567890';
  try {
    assert.equal(verifyWsToken('ws', 'wrong-token'), false);
  } finally {
    delete process.env.PANEL_PASS;
  }
});

test('verifyWsToken: ws rechaza token de longitud diferente (defensa contra timing)', () => {
  process.env.PANEL_PASS = 'a'.repeat(40);
  try {
    assert.equal(verifyWsToken('ws', 'a'.repeat(20)), false);
    assert.equal(verifyWsToken('ws', 'a'.repeat(60)), false);
  } finally {
    delete process.env.PANEL_PASS;
  }
});

test('verifyWsToken: ws rechaza si PANEL_PASS no está configurada', () => {
  delete process.env.PANEL_PASS;
  assert.equal(verifyWsToken('ws', 'c'.repeat(40)), false);
});

// ─── canReceive ──────────────────────────────────────────────────────────────

test('canReceive: publico recibe scene, layer_*, stream_state, twitch_state', () => {
  assert.equal(canReceive('publico', 'scene'), true);
  assert.equal(canReceive('publico', 'layer_add'), true);
  assert.equal(canReceive('publico', 'layer_remove'), true);
  assert.equal(canReceive('publico', 'layer_update'), true);
  assert.equal(canReceive('publico', 'layer_reorder'), true);
  assert.equal(canReceive('publico', 'stream_state'), true);
  assert.equal(canReceive('publico', 'twitch_state'), true);
  assert.equal(canReceive('publico', 'ping'), true);
  assert.equal(canReceive('publico', 'pong'), true);
});

test('canReceive: publico recibe camara_*, micro_*, voz_pcm', () => {
  assert.equal(canReceive('publico', 'camara_start'), true);
  assert.equal(canReceive('publico', 'camara_stop'), true);
  assert.equal(canReceive('publico', 'camara_desactivada'), true);
  assert.equal(canReceive('publico', 'camara_modo'), true);
  assert.equal(canReceive('publico', 'camara_aspecto'), true);
  assert.equal(canReceive('publico', 'micro_start'), true);
  assert.equal(canReceive('publico', 'micro_stop'), true);
  assert.equal(canReceive('publico', 'micro_desactivado'), true);
  assert.equal(canReceive('publico', 'voz_pcm'), true);
});

test('canReceive: publico NO recibe sms_nuevo ni nuevo_sms', () => {
  assert.equal(canReceive('publico', 'sms_nuevo'), false);
  assert.equal(canReceive('publico', 'nuevo_sms'), false);
});

test('canReceive: publico NO recibe comando_chat ni directo_comando', () => {
  assert.equal(canReceive('publico', 'comando_chat'), false);
  assert.equal(canReceive('publico', 'directo_comando'), false);
});

test('canReceive: publico NO recibe juego_estado ni categoria', () => {
  assert.equal(canReceive('publico', 'juego_estado'), false);
  assert.equal(canReceive('publico', 'categoria'), false);
});

test('canReceive: admin recibe todos los eventos conocidos', () => {
  assert.equal(canReceive('admin', 'scene'), true);
  assert.equal(canReceive('admin', 'sms_nuevo'), true);
  assert.equal(canReceive('admin', 'juego_estado'), true);
  assert.equal(canReceive('admin', 'categoria'), true);
});

test('canReceive: admin NO recibe tipos desconocidos', () => {
  assert.equal(canReceive('admin', 'tipo_inventado'), false);
});

test('canReceive: rol desconocido rechaza todo', () => {
  assert.equal(canReceive('inventado', 'scene'), false);
  assert.equal(canReceive(null, 'scene'), false);
  assert.equal(canReceive(undefined, 'scene'), false);
});

// ─── canSend ─────────────────────────────────────────────────────────────────

test('canSend: publico puede enviar scene, layer_*, stream_state, twitch_state', () => {
  assert.equal(canSend('publico', 'scene'), true);
  assert.equal(canSend('publico', 'layer_add'), true);
  assert.equal(canSend('publico', 'layer_remove'), true);
  assert.equal(canSend('publico', 'layer_update'), true);
  assert.equal(canSend('publico', 'layer_reorder'), true);
  assert.equal(canSend('publico', 'stream_state'), true);
  assert.equal(canSend('publico', 'twitch_state'), true);
});

test('canSend: publico puede enviar ping/pong', () => {
  assert.equal(canSend('publico', 'ping'), true);
  assert.equal(canSend('publico', 'pong'), true);
});

test('canSend: publico puede enviar camara_*, micro_*, voz_pcm (PUBLIC_EVENTS)', () => {
  assert.equal(canSend('publico', 'camara_start'), true);
  assert.equal(canSend('publico', 'camara_stop'), true);
  assert.equal(canSend('publico', 'camara_desactivada'), true);
  assert.equal(canSend('publico', 'camara_modo'), true);
  assert.equal(canSend('publico', 'camara_aspecto'), true);
  assert.equal(canSend('publico', 'micro_start'), true);
  assert.equal(canSend('publico', 'micro_stop'), true);
  assert.equal(canSend('publico', 'micro_desactivado'), true);
  assert.equal(canSend('publico', 'voz_pcm'), true);
});

test('canSend: publico NO puede enviar sms_nuevo ni nuevo_sms', () => {
  assert.equal(canSend('publico', 'sms_nuevo'), false);
  assert.equal(canSend('publico', 'nuevo_sms'), false);
});

test('canSend: publico NO puede enviar comando_chat ni directo_comando', () => {
  assert.equal(canSend('publico', 'comando_chat'), false);
  assert.equal(canSend('publico', 'directo_comando'), false);
});

test('canSend: publico NO puede enviar juego_estado ni categoria', () => {
  assert.equal(canSend('publico', 'juego_estado'), false);
  assert.equal(canSend('publico', 'categoria'), false);
});

test('canSend: admin puede enviar todo lo conocido (PUBLIC + RESTRICTED)', () => {
  assert.equal(canSend('admin', 'scene'), true);
  assert.equal(canSend('admin', 'voz_pcm'), true);
  assert.equal(canSend('admin', 'sms_nuevo'), true);
  assert.equal(canSend('admin', 'nuevo_sms'), true);
  assert.equal(canSend('admin', 'comando_chat'), true);
  assert.equal(canSend('admin', 'directo_comando'), true);
  assert.equal(canSend('admin', 'juego_estado'), true);
  assert.equal(canSend('admin', 'categoria'), true);
});

test('canSend: admin NO puede enviar tipos desconocidos', () => {
  assert.equal(canSend('admin', 'inventado'), false);
});

test('canSend: tipo vacio o no-string devuelve false', () => {
  assert.equal(canSend('publico', ''), false);
  assert.equal(canSend('publico', null), false);
  assert.equal(canSend('publico', undefined), false);
  assert.equal(canSend('admin', ''), false);
});

test('canSend: rol desconocido rechaza todo', () => {
  assert.equal(canSend('inventado', 'scene'), false);
  assert.equal(canSend('inventado', 'sms_nuevo'), false);
  assert.equal(canSend(null, 'scene'), false);
  assert.equal(canSend(undefined, 'voz_pcm'), false);
});

// ─── decideWsRole ───────────────────────────────────────────────────────────

const ENV_FULL = {
  PANEL_PASS: 'secret-123',
};

test('decideWsRole: ws + token PANEL_PASS válido → admin', () => {
  assert.equal(decideWsRole('ws', 'secret-123', false, ENV_FULL), 'admin');
});

test('decideWsRole: ws + token incorrecto → null (no cae a publico)', () => {
  assert.equal(decideWsRole('ws', 'wrong', false, ENV_FULL), null);
});

test('decideWsRole: ws + token incorrecto + local → null (token malo nunca abre)', () => {
  assert.equal(decideWsRole('ws', 'wrong', true, ENV_FULL), null);
});

test('decideWsRole: ws + sin token + Tailscale/local + mismo origen → admin', () => {
  assert.equal(decideWsRole('ws', null, true, ENV_FULL, true), 'admin');
});

test('decideWsRole: ws + sin token + Tailscale/local + origen ajeno → publico', () => {
  assert.equal(decideWsRole('ws', null, true, ENV_FULL, false), 'publico');
});

test('decideWsRole: sin trustedOrigin explícito, Tailscale/local → publico (default seguro)', () => {
  assert.equal(decideWsRole('ws', null, true, ENV_FULL), 'publico');
});

test('decideWsRole: origen confiable nunca abre una IP remota sin token', () => {
  assert.equal(decideWsRole('ws', null, false, ENV_FULL, true), null);
});

test('decideWsRole: ws + sin token + IP remota → null', () => {
  assert.equal(decideWsRole('ws', null, false, ENV_FULL), null);
});

test('decideWsRole: ws + token vacío + remoto → null', () => {
  assert.equal(decideWsRole('ws', '', false, ENV_FULL), null);
});

test('decideWsRole: canal desconocido → null', () => {
  assert.equal(decideWsRole('inventado', 'whatever', false, ENV_FULL), null);
});

test('decideWsRole: env sin PANEL_PASS + ws sin token + local + mismo origen → admin', () => {
  const env = {};
  assert.equal(decideWsRole('ws', null, true, env, true), 'admin');
});

test('decideWsRole: env vacío + ws + cualquier token → null', () => {
  assert.equal(decideWsRole('ws', 'anytoken', false, {}), null);
});

test('decideWsRole: env vacío + ws + sin token + local → publico (env no afecta a publico)', () => {
  assert.equal(decideWsRole('ws', null, true, {}), 'publico');
});

test('decideWsRole: defaults a process.env cuando no se pasa env', () => {
  process.env.PANEL_PASS = 'env-pass-1234567890';
  try {
    assert.equal(decideWsRole('ws', 'env-pass-1234567890', false), 'admin');
    assert.equal(decideWsRole('ws', null, true), 'publico');
  } finally {
    delete process.env.PANEL_PASS;
  }
});

// ─── isTrustedWsOrigin ──────────────────────────────────────────────────────

test('isTrustedWsOrigin: sin cabecera Origin (OBS, clientes nativos) → true', () => {
  assert.equal(isTrustedWsOrigin({ headers: { host: 'directo.apliarte.com' } }), true);
});

test('isTrustedWsOrigin: Origin del mismo host → true', () => {
  assert.equal(isTrustedWsOrigin({ headers: { host: 'directo.apliarte.com', origin: 'https://directo.apliarte.com' } }), true);
});

test('isTrustedWsOrigin: Origin de otro dominio → false', () => {
  assert.equal(isTrustedWsOrigin({ headers: { host: 'directo.apliarte.com', origin: 'https://evil.example' } }), false);
});

test('isTrustedWsOrigin: Origin "null" o malformado → false', () => {
  assert.equal(isTrustedWsOrigin({ headers: { host: 'directo.apliarte.com', origin: 'null' } }), false);
});

test('isTrustedWsOrigin: Origin con protocolo no web → false', () => {
  assert.equal(isTrustedWsOrigin({ headers: { host: 'directo.apliarte.com', origin: 'file://directo.apliarte.com' } }), false);
});

test('isTrustedWsOrigin: request sin headers → false', () => {
  assert.equal(isTrustedWsOrigin(null), false);
  assert.equal(isTrustedWsOrigin({}), false);
});
