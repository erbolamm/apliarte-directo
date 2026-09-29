import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
process.env.PANEL_PASS = process.env.PANEL_PASS || 'test-secret-panel-pass-12345!';
const { isTailscaleOrLocal } = require('../server.js');

const HOME = '203.0.113.7';
const ENV_HOME = { TRUSTED_CLIENT_IPS: ` ${HOME} , 198.51.100.9 ` };

test('TRUSTED_CLIENT_IPS: IP listada llegando por el proxy es de confianza', () => {
  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '172.20.0.1' },
    headers: { 'x-forwarded-for': HOME },
  }, ENV_HOME), true);
});

test('TRUSTED_CLIENT_IPS: IP listada con conexión directa también es de confianza', () => {
  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: HOME },
    headers: {},
  }, ENV_HOME), true);
});

test('TRUSTED_CLIENT_IPS: vacía o ausente no confía en ninguna IP pública', () => {
  const req = { socket: { remoteAddress: '172.20.0.1' }, headers: { 'x-forwarded-for': HOME } };
  assert.equal(isTailscaleOrLocal(req, {}), false);
  assert.equal(isTailscaleOrLocal(req, { TRUSTED_CLIENT_IPS: '' }), false);
  assert.equal(isTailscaleOrLocal(req, { TRUSTED_CLIENT_IPS: ' , ' }), false);
});

test('TRUSTED_CLIENT_IPS: IP no listada sigue rechazada', () => {
  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '172.20.0.1' },
    headers: { 'x-forwarded-for': '198.51.100.20' },
  }, ENV_HOME), false);
});

test('TRUSTED_CLIENT_IPS: una IP listada falsificada a la izquierda de X-Forwarded-For no cuela', () => {
  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '172.20.0.1' },
    headers: { 'x-forwarded-for': `${HOME}, 198.51.100.20` },
  }, ENV_HOME), false);
});

test('TRUSTED_CLIENT_IPS: conexión directa externa con cabecera falsa de IP listada no cuela', () => {
  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '198.51.100.20' },
    headers: { 'x-forwarded-for': HOME },
  }, ENV_HOME), false);
});

test('TRUSTED_CLIENT_IPS: solo coincidencia exacta, no prefijos', () => {
  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '203.0.113.70' },
    headers: {},
  }, ENV_HOME), false);
});
