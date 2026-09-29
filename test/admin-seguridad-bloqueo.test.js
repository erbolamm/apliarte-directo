import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const TEST_PASS = 'seguridad-test-password-999';
process.env.PANEL_PASS = process.env.PANEL_PASS || TEST_PASS;

const { isAuth, isTailscaleOrLocal } = require('../server.js');
const serverJs = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const vpsServerJs = readFileSync(new URL('../vps-overlay/server.js', import.meta.url), 'utf8');

test('isAuth: soporta HTTP Basic Auth con usuario ja o cualquiera y valida contraseña', () => {
  const reqExternoSinCreds = {
    socket: { remoteAddress: '203.0.113.50' },
    headers: {},
  };
  assert.equal(isAuth(reqExternoSinCreds), false);

  const credsOk = Buffer.from(`ja:${process.env.PANEL_PASS}`).toString('base64');
  const reqBasicOk = {
    socket: { remoteAddress: '203.0.113.50' },
    headers: { authorization: `Basic ${credsOk}` },
  };
  assert.equal(isAuth(reqBasicOk), true);

  const credsBad = Buffer.from('ja:clave_incorrecta').toString('base64');
  const reqBasicBad = {
    socket: { remoteAddress: '203.0.113.50' },
    headers: { authorization: `Basic ${credsBad}` },
  };
  assert.equal(isAuth(reqBasicBad), false);
});

test('isAuth: soporta token en parametro de URL (?auth= y ?token=)', () => {
  assert.equal(isAuth({
    socket: { remoteAddress: '203.0.113.50' },
    url: `/admin?auth=${process.env.PANEL_PASS}`,
    headers: {},
  }), true);

  assert.equal(isAuth({
    socket: { remoteAddress: '203.0.113.50' },
    url: `/admin?token=${process.env.PANEL_PASS}`,
    headers: {},
  }), true);

  assert.equal(isAuth({
    socket: { remoteAddress: '203.0.113.50' },
    url: '/admin?auth=intruso',
    headers: {},
  }), false);
});

test('server.js y vps-overlay/server.js blindan /admin, /admin.html y /directo con 401 y WWW-Authenticate Basic', () => {
  for (const [name, code] of [
    ['server.js', serverJs],
    ['vps-overlay/server.js', vpsServerJs]
  ]) {
    assert.match(
      code,
      /if \(path === '\/admin' \|\| path === '\/admin\.html' \|\| path === '\/directo'\) \{\s*if \(!isAuth\(req\)\) \{/,
      `${name} debe verificar isAuth antes de servir /admin`
    );
    assert.match(
      code,
      /'WWW-Authenticate':\s*'Basic realm="ApliArte Directo - Acceso Restringido"'/,
      `${name} debe emitir el challenge WWW-Authenticate Basic`
    );
    assert.match(
      code,
      /Set-Cookie',\s*`tts_auth=\$\{PASSWORD\}/,
      `${name} debe persistir cookie tts_auth para sesion autenticada`
    );
  }
});

test('server.js y vps-overlay/server.js sirven plano.html como fallback seguro en raiz y no admin.html', () => {
  for (const [name, code] of [
    ['server.js', serverJs],
    ['vps-overlay/server.js', vpsServerJs]
  ]) {
    assert.match(
      code,
      /if \(path === '\/' \|\| path === '\/index\.html'\) \{\s*if \(serveStatic\(req, res, '\/plano\.html'\)\) return;\s*\}/,
      `${name} debe servir plano.html en / para evitar fugas del panel admin`
    );
    assert.doesNotMatch(
      code,
      /if \(path === '\/' \|\| path === '\/index\.html'\)\s*\{\s*if \(serveStatic\(req, res, '\/admin\.html'\)\)/,
      `${name} no debe servir admin.html en /`
    );
  }
});

test('server.js y vps-overlay/server.js protegen endpoints administrativos /api/panel/* con isAuth', () => {
  for (const [name, code] of [
    ['server.js', serverJs],
    ['vps-overlay/server.js', vpsServerJs]
  ]) {
    assert.match(
      code,
      /if \(path === '\/api\/panel\/lista'\) \{\s*cors\(res\);\s*if \(!isAuth\(req\)\)/,
      `${name} debe proteger /api/panel/lista con isAuth`
    );
    assert.match(
      code,
      /if \(path === '\/api\/panel\/comandos-bot'\) \{\s*cors\(res\);\s*if \(!isAuth\(req\)\)/,
      `${name} debe proteger /api/panel/comandos-bot con isAuth`
    );
    assert.match(
      code,
      /if \(path === '\/api\/panel\/usuarios-ignorados'\) \{\s*cors\(res\);\s*if \(!isAuth\(req\)\)/,
      `${name} debe proteger /api/panel/usuarios-ignorados con isAuth`
    );
  }
});
