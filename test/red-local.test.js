const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPrivateLan, isTailscaleAddress, lanAddresses, tailscaleAddress, isReachableFromNetwork,
  serveUrlForPort, describeTailscale, handleRedLocal,
} = require('../src/red-local');

const INTERFACES = {
  lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  en0: [
    { address: 'fe80::1', family: 'IPv6', internal: false },
    { address: '192.168.1.40', family: 'IPv4', internal: false },
  ],
  en5: [{ address: '10.0.0.7', family: 4, internal: false }],
  utun4: [{ address: '100.75.119.108', family: 'IPv4', internal: false }],
  bridge0: [{ address: '8.8.8.8', family: 'IPv4', internal: false }],
};
const SERVE = {
  TCP: { 8446: { HTTPS: true } },
  Web: {
    'equipo.tailnet.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:8791' } } },
    'equipo.tailnet.ts.net:8446': { Handlers: { '/': { Proxy: 'http://127.0.0.1:7979' } } },
  },
};
const cli = (payload) => (_binary, _args, _options, done) => done(null, JSON.stringify(payload));
const noCli = (_binary, _args, _options, done) => done(new Error('ENOENT'));

function response() {
  return {
    status: 0, headers: {}, body: '',
    removeHeader() {},
    writeHead(code, headers = {}) { this.status = code; this.headers = headers; },
    end(body = '') { this.body = body; },
  };
}

test('private LAN and Tailscale ranges are told apart', () => {
  for (const address of ['10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.0.10']) assert.equal(isPrivateLan(address), true, address);
  for (const address of ['172.15.0.1', '172.32.0.1', '100.75.119.108', '8.8.8.8', '192.169.1.1', 'fe80::1', '', '999.1.1.1']) assert.equal(isPrivateLan(address), false, address);
  for (const address of ['100.64.0.1', '100.75.119.108', '100.127.255.254']) assert.equal(isTailscaleAddress(address), true, address);
  for (const address of ['100.63.0.1', '100.128.0.1', '10.0.0.1', '192.168.1.1']) assert.equal(isTailscaleAddress(address), false, address);
});

test('interfaces yield only external private IPv4 addresses and the Tailscale one', () => {
  assert.deepEqual(lanAddresses(INTERFACES), ['192.168.1.40', '10.0.0.7']);
  assert.equal(tailscaleAddress(INTERFACES), '100.75.119.108');
  assert.deepEqual(lanAddresses({ lo0: INTERFACES.lo0 }), []);
  assert.equal(tailscaleAddress({ en0: INTERFACES.en0 }), null);
});

test('a loopback-bound server is reported as unreachable from the network', () => {
  for (const host of ['127.0.0.1', 'localhost', '::1', '', undefined]) assert.equal(isReachableFromNetwork(host), false, String(host));
  for (const host of ['0.0.0.0', '::', '192.168.1.40']) assert.equal(isReachableFromNetwork(host), true, host);
});

test('the Tailscale Serve front is matched by the proxied port only', () => {
  assert.equal(serveUrlForPort(SERVE, 7979), 'https://equipo.tailnet.ts.net:8446');
  assert.equal(serveUrlForPort(SERVE, 8791), 'https://equipo.tailnet.ts.net');
  assert.equal(serveUrlForPort(SERVE, 1234), null);
  assert.equal(serveUrlForPort(null, 7979), null);
  assert.equal(serveUrlForPort({ Web: { 'evil.example.com:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:7979' } } } } }, 7979), null);
});

test('Tailscale is inactive without a 100.64/10 interface and never calls the CLI', async () => {
  let called = false;
  const run = (...args) => { called = true; return cli(SERVE)(...args); };
  assert.deepEqual(await describeTailscale({ port: 7979, interfaces: { en0: INTERFACES.en0 }, env: {}, run }), { active: false, ip: null, url: null });
  assert.equal(called, false);
});

test('Tailscale reports the HTTPS front, a configured address, or plain HTTP as fallback', async () => {
  assert.deepEqual(await describeTailscale({ port: 7979, interfaces: INTERFACES, env: {}, run: cli(SERVE) }),
    { active: true, ip: '100.75.119.108', url: 'https://equipo.tailnet.ts.net:8446' });
  assert.deepEqual(await describeTailscale({ port: 7979, interfaces: INTERFACES, env: {}, run: noCli }),
    { active: true, ip: '100.75.119.108', url: 'http://100.75.119.108:7979' });
  assert.deepEqual(await describeTailscale({ port: 7979, interfaces: INTERFACES, env: { TAILSCALE_PANEL_URL: 'https://otro.ts.net:9000/ruta' }, run: noCli }),
    { active: true, ip: '100.75.119.108', url: 'https://otro.ts.net:9000' });
  // A non-HTTPS override is ignored instead of being trusted.
  assert.equal((await describeTailscale({ port: 7979, interfaces: INTERFACES, env: { TAILSCALE_PANEL_URL: 'javascript:alert(1)' }, run: noCli })).url, 'http://100.75.119.108:7979');
});

test('the endpoint is GET-only, authenticated and returns only addresses', async () => {
  const denied = response();
  await handleRedLocal({ method: 'GET' }, denied, () => false, { port: 7979, host: '0.0.0.0', interfaces: INTERFACES, env: {}, run: cli(SERVE) });
  assert.equal(denied.status, 401);
  assert.deepEqual(JSON.parse(denied.body), { ok: false });

  const method = response();
  await handleRedLocal({ method: 'POST' }, method, () => true, { port: 7979, host: '0.0.0.0', interfaces: INTERFACES, env: {}, run: cli(SERVE) });
  assert.equal(method.status, 405);

  const ok = response();
  await handleRedLocal({ method: 'GET' }, ok, () => true, { port: 7979, host: '0.0.0.0', interfaces: INTERFACES, env: {}, run: cli(SERVE) });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['Cache-Control'], 'no-store');
  assert.deepEqual(JSON.parse(ok.body), {
    ok: true,
    port: 7979,
    lan: ['192.168.1.40', '10.0.0.7'],
    lanReachable: true,
    tailscale: { active: true, ip: '100.75.119.108', url: 'https://equipo.tailnet.ts.net:8446' },
  });

  const loopback = response();
  await handleRedLocal({ method: 'GET' }, loopback, () => true, { port: 7979, host: '127.0.0.1', interfaces: { en0: INTERFACES.en0 }, env: {}, run: noCli });
  assert.deepEqual(JSON.parse(loopback.body), {
    ok: true, port: 7979, lan: ['192.168.1.40'], lanReachable: false, tailscale: { active: false, ip: null, url: null },
  });
});
