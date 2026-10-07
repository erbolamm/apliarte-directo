'use strict';
// Read-only description of how other devices can reach this panel: the
// machine's private IPv4 addresses on the local network and, when present,
// its Tailscale address. Nothing here changes any state.
const os = require('os');
const { execFile } = require('child_process');

// The CLI is not always on the PATH of the process that starts the server.
const TAILSCALE_BINARIES = [
  'tailscale',
  '/usr/local/bin/tailscale',
  '/opt/homebrew/bin/tailscale',
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
];
const CLI_TIMEOUT_MS = 2000;
const CACHE_MS = 30000;

function ipv4Octets(address) {
  const parts = String(address || '').split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map(part => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return octets.every(value => value >= 0 && value <= 255) ? octets : null;
}

// RFC 1918: 10/8, 172.16/12 and 192.168/16.
function isPrivateLan(address) {
  const octets = ipv4Octets(address);
  if (!octets) return false;
  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// Tailscale hands out addresses from the CGNAT range 100.64.0.0/10.
function isTailscaleAddress(address) {
  const octets = ipv4Octets(address);
  return Boolean(octets) && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
}

function externalIpv4(interfaces) {
  const found = [];
  for (const entries of Object.values(interfaces || {})) {
    for (const entry of entries || []) {
      const family = entry && (entry.family === 4 ? 'IPv4' : entry.family);
      if (!entry || entry.internal || family !== 'IPv4') continue;
      if (!found.includes(entry.address)) found.push(entry.address);
    }
  }
  return found;
}

function lanAddresses(interfaces = os.networkInterfaces()) {
  return externalIpv4(interfaces).filter(isPrivateLan);
}

function tailscaleAddress(interfaces = os.networkInterfaces()) {
  return externalIpv4(interfaces).find(isTailscaleAddress) || null;
}

// A server bound to loopback cannot be reached from another device.
function isReachableFromNetwork(host) {
  const value = String(host || '').trim().toLowerCase();
  return !(value === '' || value === 'localhost' || value === '::1' || value.startsWith('127.'));
}

// `tailscale serve status --json` lists HTTPS fronts as
// { Web: { "name.ts.net:8446": { Handlers: { "/": { Proxy: "http://127.0.0.1:7979" } } } } }.
// Returns the front that proxies to this panel's port, if any.
function serveUrlForPort(serveStatus, port) {
  const web = serveStatus && typeof serveStatus === 'object' ? serveStatus.Web : null;
  if (!web || typeof web !== 'object') return null;
  const suffix = `:${port}`;
  for (const [front, config] of Object.entries(web)) {
    const handlers = config && typeof config === 'object' ? config.Handlers : null;
    if (!handlers || typeof handlers !== 'object') continue;
    const proxiesHere = Object.values(handlers).some(handler => {
      const target = String((handler && handler.Proxy) || '').replace(/\/+$/, '');
      return target.endsWith(suffix);
    });
    if (!proxiesHere) continue;
    const [name, frontPort] = front.split(':');
    if (!/^[a-z0-9.-]+\.ts\.net$/i.test(name)) continue;
    return `https://${name}${frontPort && frontPort !== '443' ? `:${frontPort}` : ''}`;
  }
  return null;
}

function runTailscaleJson(args, run = execFile) {
  return new Promise(resolve => {
    const attempt = index => {
      if (index >= TAILSCALE_BINARIES.length) { resolve(null); return; }
      run(TAILSCALE_BINARIES[index], args, { timeout: CLI_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) { attempt(index + 1); return; }
        try { resolve(JSON.parse(stdout)); } catch (_) { resolve(null); }
      });
    };
    attempt(0);
  });
}

function validHttpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.origin : null;
  } catch (_) { return null; }
}

let cache = { at: 0, port: 0, value: null };

// `url` is the HTTPS address when Tailscale Serve fronts this port (the only
// one where a tablet's camera and microphone work), else plain HTTP on the
// Tailscale address, else null when Tailscale is not active on this machine.
async function describeTailscale({ port, interfaces = os.networkInterfaces(), env = process.env, run = execFile, now = Date.now() } = {}) {
  const ip = tailscaleAddress(interfaces);
  if (!ip) return { active: false, ip: null, url: null };
  const configured = validHttpsUrl(env.TAILSCALE_PANEL_URL);
  if (configured) return { active: true, ip, url: configured };
  if (run === execFile && cache.value && cache.port === port && now - cache.at < CACHE_MS && cache.value.ip === ip) return cache.value;
  const serveStatus = await runTailscaleJson(['serve', 'status', '--json'], run);
  const value = { active: true, ip, url: serveUrlForPort(serveStatus, port) || `http://${ip}:${port}` };
  if (run === execFile) cache = { at: now, port, value };
  return value;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

// GET /api/panel/red
function handleRedLocal(req, res, isAuth, { port, host, interfaces, env, run } = {}) {
  res.removeHeader?.('Access-Control-Allow-Origin');
  if (!isAuth(req)) { sendJson(res, 401, { ok: false }); return Promise.resolve(); }
  if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end(); return Promise.resolve(); }
  const reachable = isReachableFromNetwork(host);
  return describeTailscale({ port, interfaces, env, run })
    .catch(() => ({ active: false, ip: null, url: null }))
    .then(tailscale => sendJson(res, 200, {
      ok: true,
      port,
      lan: lanAddresses(interfaces),
      lanReachable: reachable,
      tailscale,
    }));
}

module.exports = {
  isPrivateLan, isTailscaleAddress, lanAddresses, tailscaleAddress, isReachableFromNetwork,
  serveUrlForPort, describeTailscale, handleRedLocal,
};
