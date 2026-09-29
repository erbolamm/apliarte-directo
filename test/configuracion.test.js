import test from 'node:test';
import assert from 'node:assert/strict';
import { validarConfiguracion, enmascararUrl } from '../src/configuracion.js';

test('una configuracion minima valida se acepta', () => {
  const r = validarConfiguracion({
    destinos: [{ nombre: 'twitch', url: 'rtmp://live.twitch.tv/app', variableClave: 'CLAVE_TWITCH' }],
  }, { CLAVE_TWITCH: 'xxx' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
  assert.equal(r.configuracion.destinos.length, 1);
});

test('rechaza un destino sin nombre', () => {
  const r = validarConfiguracion({ destinos: [{ url: 'rtmp://x/app', variableClave: 'C' }] }, { C: 'v' });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /nombre/i);
});

test('rechaza un destino cuya url no es rtmp', () => {
  const r = validarConfiguracion({
    destinos: [{ nombre: 'x', url: 'https://ejemplo.com', variableClave: 'C' }],
  }, { C: 'v' });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /rtmp/i);
});

test('rechaza nombres de destino repetidos', () => {
  const r = validarConfiguracion({
    destinos: [
      { nombre: 'x', url: 'rtmp://a/app', variableClave: 'A' },
      { nombre: 'x', url: 'rtmp://b/app', variableClave: 'B' },
    ],
  }, { A: '1', B: '2' });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /repetid/i);
});

test('marca el destino como no listo si su variable de entorno falta, pero no invalida la configuracion', () => {
  const r = validarConfiguracion({
    destinos: [{ nombre: 'twitch', url: 'rtmp://live.twitch.tv/app', variableClave: 'NO_DEFINIDA' }],
  }, {});
  assert.equal(r.ok, true);
  assert.equal(r.configuracion.destinos[0].listo, false);
  assert.match(r.avisos.join(' '), /NO_DEFINIDA/);
  // First-time users paste keys in the panel; the warning must say where (2026-09-29).
  assert.match(r.avisos.join(' '), /«⚙️ Config & OBS» → «🔑 Credenciales & Red»/);
});

test('la configuracion NUNCA guarda el valor de la clave', () => {
  const r = validarConfiguracion({
    destinos: [{ nombre: 'twitch', url: 'rtmp://live.twitch.tv/app', variableClave: 'CLAVE_TWITCH' }],
  }, { CLAVE_TWITCH: 'secreto-real-123' });
  assert.equal(JSON.stringify(r).includes('secreto-real-123'), false);
});

test('enmascararUrl oculta la clave de emision', () => {
  assert.equal(
    enmascararUrl('rtmp://live.twitch.tv/app/live_123456_secretoLargo'),
    'rtmp://live.twitch.tv/app/***',
  );
});

test('enmascararUrl deja intacta una url sin clave', () => {
  assert.equal(enmascararUrl('rtmp://localhost:1935/live'), 'rtmp://localhost:1935/live');
});

test('enmascararUrl tolera entradas vacias', () => {
  assert.equal(enmascararUrl(''), '');
  assert.equal(enmascararUrl(undefined), '');
});

// ── Defectos encontrados probando en vivo el 2026-09-11 ──────────────────────

test('un destino que NO declara variableClave esta listo: emite sin clave', () => {
  const r = validarConfiguracion({
    destinos: [{ nombre: 'local', url: 'rtmp://127.0.0.1:1936/live', variableClave: null }],
  }, {});
  assert.equal(r.configuracion.destinos[0].listo, true,
    'sin variableClave el destino emite sin clave, asi que esta listo');
});

test('un destino que declara variableClave y la tiene, esta listo', () => {
  const r = validarConfiguracion({
    destinos: [{ nombre: 'twitch', url: 'rtmp://a/app', variableClave: 'C' }],
  }, { C: 'valor' });
  assert.equal(r.configuracion.destinos[0].listo, true);
});
