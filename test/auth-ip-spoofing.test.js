import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const TEST_PASS = 'test-secret-panel-pass-12345!';
process.env.PANEL_PASS = process.env.PANEL_PASS || TEST_PASS;
const {
  isKnownTrustedProxy,
  getClientIp,
  isTailscaleOrLocal,
  isAuth,
} = require('../server.js');

test('isKnownTrustedProxy: identifica correctamente proxies locales y redes privadas de Docker', () => {
  // Loopback
  assert.equal(isKnownTrustedProxy('127.0.0.1'), true);
  assert.equal(isKnownTrustedProxy('::1'), true);
  assert.equal(isKnownTrustedProxy('::ffff:127.0.0.1'), true);
  assert.equal(isKnownTrustedProxy('localhost'), true);

  // Redes privadas (Docker bridge / custom bridge como 172.20.0.1)
  assert.equal(isKnownTrustedProxy('172.20.0.1'), true);
  assert.equal(isKnownTrustedProxy('172.17.0.1'), true);
  assert.equal(isKnownTrustedProxy('172.31.255.254'), true);
  assert.equal(isKnownTrustedProxy('10.0.0.5'), true);
  assert.equal(isKnownTrustedProxy('192.168.1.100'), true);

  // IPs públicas NO son proxies conocidos
  assert.equal(isKnownTrustedProxy('203.0.113.195'), false);
  assert.equal(isKnownTrustedProxy('8.8.8.8'), false);
  assert.equal(isKnownTrustedProxy('198.51.100.5'), false);
  // Tailscale es cliente final, no proxy interno de la máquina
  assert.equal(isKnownTrustedProxy('100.64.0.1'), false);
});

test('getClientIp: conexión directa externa DESCARTA cabeceras falsificadas', () => {
  const reqDirectoAtacante = {
    socket: { remoteAddress: '203.0.113.195' },
    headers: {
      'x-forwarded-for': '127.0.0.1',
      'x-real-ip': '127.0.0.1',
      'host': 'remote-72',
    },
  };

  // Debe devolver la IP real del socket, ignorando las cabeceras inyectadas por el atacante
  const ip = getClientIp(reqDirectoAtacante);
  assert.equal(ip, '203.0.113.195');
});

test('getClientIp: petición a través de proxy conocido toma la última IP añadida por el proxy', () => {
  // Un atacante envía X-Forwarded-For: 127.0.0.1 al Nginx; Nginx añade la IP real al final
  const reqProxyConAtaque = {
    socket: { remoteAddress: '172.20.0.1' }, // Nginx en red Docker
    headers: {
      'x-forwarded-for': '127.0.0.1, 203.0.113.195',
    },
  };

  const ip = getClientIp(reqProxyConAtaque);
  assert.equal(ip, '203.0.113.195');
});

test('getClientIp: petición Tailscale legítima a través de proxy o serve', () => {
  const reqTailscaleServe = {
    socket: { remoteAddress: '127.0.0.1' }, // tailscale serve en localhost
    headers: {
      'x-forwarded-for': '100.64.0.1',
    },
  };

  const ip = getClientIp(reqTailscaleServe);
  assert.equal(ip, '100.64.0.1');
});

test('isTailscaleOrLocal: NUNCA se fía de cabecera Host falsificada', () => {
  const reqHostFalso = {
    socket: { remoteAddress: '203.0.113.195' },
    headers: {
      'host': 'remote-72',
    },
  };

  assert.equal(isTailscaleOrLocal(reqHostFalso), false);

  const reqHostTailscaleFalso = {
    socket: { remoteAddress: '203.0.113.195' },
    headers: {
      'host': '100.64.0.1:8443',
    },
  };

  assert.equal(isTailscaleOrLocal(reqHostTailscaleFalso), false);
});

test('isTailscaleOrLocal: bloquea spoofing de X-Forwarded-For y X-Real-IP desde internet', () => {
  // Caso 1: Conexión directa con XFF falso
  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '198.51.100.20' },
    headers: { 'x-forwarded-for': '127.0.0.1' },
  }), false);

  // Caso 2: Conexión vía Nginx donde el cliente mandó XFF: 127.0.0.1
  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '172.20.0.1' },
    headers: { 'x-forwarded-for': '127.0.0.1, 198.51.100.20' },
  }), false);

  // Caso 3: Conexión vía Nginx donde el cliente mandó IP Tailscale falsa
  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '172.20.0.1' },
    headers: { 'x-forwarded-for': '100.64.0.1, 198.51.100.20' },
  }), false);
});

test('isTailscaleOrLocal: permite accesos legítimos de Tailscale y localhost', () => {
  // Localhost directo
  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
  }), true);

  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '::1' },
    headers: {},
  }), true);

  // Tailscale IPv4 legítimo (100.64.0.0/10) vía proxy conocido
  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-forwarded-for': '100.64.0.1' },
  }), true);

  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '172.20.0.1' },
    headers: { 'x-forwarded-for': '100.120.5.10' },
  }), true);

  // Tailscale IPv6 legítimo (fd7a:...) vía proxy conocido
  assert.equal(isTailscaleOrLocal({
    socket: { remoteAddress: '172.20.0.1' },
    headers: { 'x-forwarded-for': 'fd7a:115c:a1e0:ab12:4843:cd96:625a:7360' },
  }), true);
});

test('isAuth: rechaza atacantes externos y autoriza accesos legítimos por Tailscale o credencial', () => {
  // Atacante externo intentando bypass con cabeceras falsas
  const reqAtacante = {
    socket: { remoteAddress: '172.20.0.1' },
    headers: {
      'host': 'remote-72',
      'x-forwarded-for': '127.0.0.1, 203.0.113.195',
      'x-real-ip': '127.0.0.1',
    },
  };
  assert.equal(isAuth(reqAtacante), false);

  // Petición legítima por Tailscale
  const reqTailscale = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      'x-forwarded-for': '100.64.0.1',
    },
  };
  assert.equal(isAuth(reqTailscale), true);

  // Petición con cookie válida
  const reqConCookie = {
    socket: { remoteAddress: '203.0.113.195' },
    headers: {
      'cookie': `tts_auth=${TEST_PASS}`,
    },
  };
  assert.equal(isAuth(reqConCookie), true);

  // Petición con Bearer token válido
  const reqConToken = {
    socket: { remoteAddress: '203.0.113.195' },
    headers: {
      'authorization': `Bearer ${TEST_PASS}`,
    },
  };
  assert.equal(isAuth(reqConToken), true);

  // Petición con HTTP Basic Auth válido (usuario ja, pass TEST_PASS)
  const basicCredsValidas = Buffer.from(`ja:${TEST_PASS}`).toString('base64');
  const reqConBasic = {
    socket: { remoteAddress: '203.0.113.195' },
    headers: {
      'authorization': `Basic ${basicCredsValidas}`,
    },
  };
  assert.equal(isAuth(reqConBasic), true);

  // Petición con HTTP Basic Auth inválido
  const basicCredsInvalidas = Buffer.from('ja:wrongpass').toString('base64');
  const reqConBasicInvalido = {
    socket: { remoteAddress: '203.0.113.195' },
    headers: {
      'authorization': `Basic ${basicCredsInvalidas}`,
    },
  };
  assert.equal(isAuth(reqConBasicInvalido), false);

  // Petición con token en query parameter (?auth= o ?token=)
  assert.equal(isAuth({
    socket: { remoteAddress: '203.0.113.195' },
    url: `/admin?auth=${TEST_PASS}`,
    headers: {},
  }), true);

  assert.equal(isAuth({
    socket: { remoteAddress: '203.0.113.195' },
    url: `/admin?token=${TEST_PASS}`,
    headers: {},
  }), true);

  assert.equal(isAuth({
    socket: { remoteAddress: '203.0.113.195' },
    url: '/admin?auth=badtoken',
    headers: {},
  }), false);
});
