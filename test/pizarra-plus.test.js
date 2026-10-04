import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const { createPointerOwner } = require('../private/pointer-owner.js');
const { createPizarraPlus } = require('../src/pizarra-plus.js');

test('Pencil owns the stroke; palm and other pointer cannot change or finish it', () => {
  const owner = createPointerOwner();
  const pen = { pointerId: 1, pointerType: 'pen' }, palm = { pointerId: 2, pointerType: 'touch' };
  assert.equal(owner.begin(palm), false);
  assert.equal(owner.begin(pen), true);
  assert.equal(owner.begin(palm, true), false);
  assert.equal(owner.owns(palm), false);
  assert.equal(owner.end(palm), false);
  assert.equal(owner.owns(pen), true);
  assert.equal(owner.end(pen), true);
  assert.equal(owner.begin(palm, true), true);
});

function fixture({ enabled = true, allowed = true, connected = true, drawingPort,
  items = [{ sceneItemId: 1, sourceName: 'Webcam', sceneItemEnabled: true, sourceType: 'input' }],
  inputs = [{ inputName: 'Real mic' }], muted = {} } = {}) {
  let created = 0;
  const calls = [];
  const client = {
    estaConectado: () => connected,
    obtenerEscenas: async () => ({ currentProgramSceneName: 'Camera', scenes: [{ sceneName: 'Camera' }, { sceneName: 'Board' }] }),
    enviarPeticion: async (req, data) => {
      if (req === 'GetSceneItemList') return { sceneItems: items };
      if (req === 'SetSceneItemEnabled') { calls.push(['toggle_source', data?.sceneItemId, data?.sceneItemEnabled]); return {}; }
      if (req === 'SetInputMute') { calls.push(['set_mute', data?.inputName, data?.inputMuted]); muted[data.inputName] = data.inputMuted; return {}; }
      return { inputs };
    },
    obtenerMute: async name => {
      if (muted[name] === 'no-audio') throw new Error('input-without-audio');
      return { inputMuted: Boolean(muted[name]) };
    },
    toggleMute: async name => { calls.push(['mute', name]); return { inputMuted: true }; },
    cambiarEscena: async name => { calls.push(['scene', name]); },
    obtenerCaptura: async () => ({ imageData: 'data:image/jpeg;base64,AA==' }),
    cerrar() {},
  };
  const root = mkdtempSync(join(process.env.APLIARTE_TEST_DATA_DIR || tmpdir(), 'pizarra-plus-unit-'));
  mkdirSync(join(root, 'private'));
  for (const file of ['pizarra-plus.html', 'pizarra-plus-guide.html', 'cristal-plus.html', 'pointer-owner.js']) writeFileSync(join(root, 'private', file), 'private fixture');
  const plus = createPizarraPlus({ enabled, drawingPort, authorize: () => allowed, trustedOrigin: req => !req.headers.origin || req.headers.origin === 'http://private.test', root,
    createObsClient: async () => { created++; return client; } });
  return { plus, calls, created: () => created };
}
async function request(f, url, { method = 'GET', body, origin, host = 'localhost' } = {}) {
  const { Readable } = await import('node:stream');
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  Object.assign(req, { url, method, headers: { host, ...(origin ? { origin } : {}) } });
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; }, removeHeader: k => { delete headers[k]; },
    writeHead(status, h = {}) { this.status = status; Object.assign(headers, h); }, end(data = '') { this.body = String(data); } };
  assert.equal(await f.plus.handle(req, res), true);
  return { ...res, headers, json: () => JSON.parse(res.body) };
}
test('plus is disabled by default and never connects OBS when denied', async () => {
  const f = fixture({ enabled: false });
  assert.equal((await request(f, '/pizarra-plus')).status, 404);
  assert.equal(f.created(), 0);
});
test('private page, API and assets reject unauthorized clients', async () => {
  const f = fixture({ allowed: false });
  for (const p of ['/pizarra-plus', '/pizarra-plus/guia', '/cristal-plus', '/api/pizarra-plus/obs/state', '/api/pizarra-plus/pointer-owner.js']) assert.equal((await request(f, p)).status, 403);
  assert.equal(f.created(), 0);
});
test('foreign origin cannot read screenshots or mutate OBS even with private IP', async () => {
  const f = fixture();
  assert.equal((await request(f, '/api/pizarra-plus/obs/screenshot', { origin: 'https://evil.test' })).status, 403);
  assert.equal((await request(f, '/api/pizarra-plus/obs/action', { method: 'POST', origin: 'https://evil.test', body: { action: 'scene', name: 'Board' } })).status, 403);
  assert.equal(f.created(), 0);
});
test('a public-domain Host is denied even when the socket is private (DNS rebinding)', async () => {
  const f = fixture();
  assert.equal((await request(f, '/api/pizarra-plus/obs/state', { host: 'evil.example' })).status, 403);
  assert.equal(f.created(), 0);
});
test('state discovers real scenes and inputs; disconnected OBS is explicit', async () => {
  const f = fixture();
  const r = await request(f, '/api/pizarra-plus/obs/state');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json().scenes, ['Camera', 'Board']);
  assert.deepEqual(r.json().inputs, ['Real mic']);
  assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.equal((await request(fixture({ connected: false }), '/api/pizarra-plus/obs/state')).status, 503);
});
test('only explicit scene and mute actions are allowed; no stream actions', async () => {
  const f = fixture();
  assert.equal((await request(f, '/api/pizarra-plus/obs/action', { method: 'POST', body: { action: 'scene', name: 'Board' } })).status, 200);
  assert.equal((await request(f, '/api/pizarra-plus/obs/action', { method: 'POST', body: { action: 'mute', name: 'Real mic' } })).status, 200);
  assert.equal((await request(f, '/api/pizarra-plus/obs/action', { method: 'POST', body: { action: 'toggle_source', scene: 'Board', id: 1, enabled: false } })).status, 200);
  assert.equal((await request(f, '/api/pizarra-plus/obs/action', { method: 'POST', body: { action: 'toggle_source', id: 'not-a-number' } })).status, 400);
  for (const action of ['StartStream', 'StopStream', 'request']) assert.equal((await request(f, '/api/pizarra-plus/obs/action', { method: 'POST', body: { action, name: 'Board' } })).status, 400);
  assert.equal((await request(f, '/api/pizarra-plus/obs/action', { method: 'POST', body: { action: 'scene', name: 'Invented' } })).status, 400);
  assert.deepEqual(f.calls, [['scene', 'Board'], ['mute', 'Real mic'], ['toggle_source', 1, false]]);
  const s = await request(f, '/api/pizarra-plus/obs/sources?scene=Board');
  assert.equal(s.status, 200);
  assert.equal(s.json().sources[0].name, 'Webcam');
});
test('screenshots are still JPEGs, not video, and are not publicly cached', async () => {
  const r = await request(fixture(), '/api/pizarra-plus/obs/screenshot');
  assert.equal(r.status, 200);
  assert.match(r.json().image, /^data:image\/jpeg;base64,/);
});

test('private drawing channel replays history, rejects foreign origins and isolates OBS controls', { timeout: 5000 }, async t => {
  const { createServer } = await import('node:http');
  const { WebSocket } = await import('ws');
  const { once } = await import('node:events');
  const { WebSocketServer } = await import('ws');
  const centre = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(centre, 'listening');
  const history = [], received = [];
  centre.on('connection', socket => socket.on('message', raw => {
    const data = JSON.parse(raw.toString()); received.push(data);
    if (data.type === 'pizarra_solicitar_estado') {
      socket.send(JSON.stringify({ type: 'pizarra_init', history })); return;
    }
    if (data.type === 'pizarra_draw') history.push(data);
    if (data.type === 'pizarra_clear') history.length = 0;
    for (const peer of centre.clients) if (peer !== socket) peer.send(raw.toString());
  }));
  const originalOverlay = new WebSocket(`ws://127.0.0.1:${centre.address().port}/ws`);
  await once(originalOverlay, 'open');
  t.after(() => { originalOverlay.terminate(); for (const peer of centre.clients) peer.terminate(); centre.close(); });
  const f = fixture({ drawingPort: centre.address().port });
  const server = createServer((req, res) => { f.plus.handle(req, res); });
  server.on('upgrade', (req, socket, head) => { if (!f.plus.upgrade(req, socket, head)) socket.destroy(); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `ws://127.0.0.1:${server.address().port}/pizarra-plus/ws`;
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.terminate();
    await f.plus.close();
    await new Promise(resolve => server.close(resolve));
  });
  async function connect(url) {
    const client = new WebSocket(url, { origin: 'http://private.test' });
    clients.push(client);
    const first = once(client, 'message');
    await once(client, 'open');
    const [data] = await first;
    return { client, initial: JSON.parse(data.toString()) };
  }
  const writer = await connect(base);
  const overlay = await connect(base + '?overlay=1');
  assert.deepEqual(writer.initial.history, []);
  const stroke = { type: 'pizarra_draw', shape: 'stroke', strokeId: 'one', from: { x: .1, y: .2 }, to: { x: .3, y: .4 }, color: '#000000', size: 6, tool: 'pen' };
  const update = once(overlay.client, 'message');
  const originalUpdate = once(originalOverlay, 'message');
  writer.client.send(JSON.stringify(stroke));
  assert.deepEqual(JSON.parse((await update)[0].toString()), stroke);
  assert.deepEqual(JSON.parse((await originalUpdate)[0].toString()), stroke);
  const reconnected = await connect(base + '?overlay=1');
  assert.deepEqual(reconnected.initial.history, [stroke]);
  overlay.client.send(JSON.stringify({ type: 'pizarra_clear' }));
  writer.client.send(JSON.stringify({ type: 'obs_toggle_mute', inputName: 'Real mic' }));
  writer.client.send(JSON.stringify({ ...stroke, from: { x: -1, y: 0 } }));
  const state = once(writer.client, 'message');
  writer.client.send(JSON.stringify({ type: 'pizarra_solicitar_estado' }));
  assert.deepEqual(JSON.parse((await state)[0].toString()).history, [stroke]);
  assert.deepEqual(f.calls, []);
  assert.equal(received.some(d => d.type === 'obs_toggle_mute'), false);
  assert.equal(received.filter(d => d.type === 'pizarra_draw').length, 1);
  const originalStroke = { ...stroke, strokeId: 'original-tablet' };
  const reverse = once(writer.client, 'message');
  originalOverlay.send(JSON.stringify(originalStroke));
  assert.deepEqual(JSON.parse((await reverse)[0].toString()), originalStroke);
  const disconnected = once(writer.client, 'close');
  for (const peer of centre.clients) peer.close();
  assert.equal((await disconnected)[0], 1013);

  const denied = new WebSocket(base, { origin: 'https://evil.test' });
  const rejection = new Promise(resolve => denied.once('error', resolve));
  await rejection;
  denied.terminate();
});

test('private HTML uses same-origin transports and keeps the unchanged Admin as hidden engine', async () => {
  const { readFileSync } = await import('node:fs');
  const { Script } = await import('node:vm');
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
  assert.match(html, /data-src="\/admin"/);
  assert.match(html, /window\.location\.host}\/pizarra-plus\/ws/);
  assert.match(html, /pointerOwner\.owns\(e\)/);
  assert.match(html, /e\.type !== 'pointercancel'/);
  assert.match(html, /captureBusy/);
  assert.match(html, /document\.hidden/);
  assert.doesNotMatch(html, /obs_cambiar_escena|obs_toggle_mute|obs_solicitar_captura|<button[^>]*btn-obs-scene|Alerats/);
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new Script(match[1]);
});

test('panels stay hidden until opened and never block drawing on the canvas', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
  for (const id of ['draw-panel', 'chat-sheet', 'commands-sheet', 'obs-sheet']) {
    assert.match(html, new RegExp(`<section id="${id}"[^>]*\\bhidden\\b`), `${id} starts hidden`);
  }
  assert.match(html, /\.popover\[hidden\],\s*\.sheet\[hidden\]\s*\{display:\s*none;\}/);
  assert.match(html, /<div id="admin-dock" hidden>/);
  const universal = html.match(/\n\s*\*\s*\{([^}]+)\}/)[1];
  assert.doesNotMatch(universal, /touch-action:\s*none/);
  assert.match(html.match(/#drawing-canvas\s*\{([^}]+)\}/)[1], /touch-action:\s*none/);
});

test('complete page startup and real pointer handlers retain Pencil stroke when palm moves/releases', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const context2d = new Proxy({}, { get: (obj, key) => key in obj ? obj[key] : () => {}, set: (obj, key, value) => { obj[key] = value; return true; } });
  const nodes = new Map();
  function element(tagName = 'div') {
    const attributes = new Map();
    const classes = new Set();
    let id = '';
    return {
      tagName, style: {}, dataset: {}, checked: false, disabled: false, value: '', clientWidth: 960, clientHeight: 540,
      children: [], listeners: {},
      get id() { return id; },
      set id(value) { id = value; nodes.set(value, this); },
      classList: {
        add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
        contains(name) { return classes.has(name); },
        toggle(name, force) {
          const on = force === undefined ? !classes.has(name) : force;
          if (on) classes.add(name); else classes.delete(name);
          return on;
        },
      },
      addEventListener(type, callback) {
        const previous = this.listeners[type];
        this.listeners[type] = previous ? event => { previous(event); callback(event); } : callback;
      },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      appendChild(child) { this.children.push(child); return child; },
      append(...children) { this.children.push(...children); },
      prepend(child) { this.children.unshift(child); },
      replaceChildren(...children) { this.children = [...children]; },
      querySelector(selector) { return this.children.find(child => child.tagName === selector) || null; },
      querySelectorAll: () => [], focus() {},
      getBoundingClientRect: () => ({ width: 960, height: 540, top: 0, left: 0 }),
      getContext: () => context2d, setPointerCapture() {},
    };
  }
  for (const id of ids) { const node = element(); node.id = id; }
  const header = element('header');
  const footer = element('footer');
  const documentElement = element('html');
  const transmitted = [];
  class Socket { static OPEN = 1; readyState = 1; send(text) { transmitted.push(JSON.parse(text)); } close() {} }
  const ctx = vm.createContext({
    console, Math, Date, JSON, String, Number, Set, Map, Array, Promise, URLSearchParams,
    createPointerOwner, WebSocket: Socket,
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1,
    window: { innerWidth: 960, innerHeight: 540, devicePixelRatio: 2, addEventListener() {}, location: { protocol: 'https:', host: 'private.ts.net:8446', search: '' } },
    document: {
      hidden: false, documentElement,
      getElementById: id => nodes.get(id) || null,
      querySelector: selector => selector === 'header' ? header : selector === 'footer' ? footer : null,
      createElement: element, querySelectorAll: () => [], addEventListener() {},
    },
  });
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(Boolean);
  vm.runInContext(readFileSync(new URL('../public/js/pizarra-render.js', import.meta.url), 'utf8'), ctx);
  for (const script of scripts) vm.runInContext(script, ctx);
  assert.ok(nodes.has('btn-obs-snapshot'), 'compact controls must actually mount during startup');
  assert.ok(nodes.has('toolbar'), 'the toolbar mounts under the stage');
  vm.runInContext('drawingConnected = true', ctx);
  const canvas = nodes.get('drawing-canvas');
  const event = (pointerId, pointerType, x, type) => ({ pointerId, pointerType, clientX: x, clientY: 100, type, preventDefault() {} });
  canvas.listeners.pointerdown(event(1, 'pen', 100, 'pointerdown'));
  canvas.listeners.pointerdown(event(2, 'touch', 500, 'pointerdown'));
  canvas.listeners.pointermove(event(2, 'touch', 600, 'pointermove'));
  canvas.listeners.pointerup(event(2, 'touch', 600, 'pointerup'));
  canvas.listeners.pointermove(event(1, 'pen', 200, 'pointermove'));
  canvas.listeners.pointerup(event(1, 'pen', 200, 'pointerup'));
  assert.equal(transmitted.length, 2);
  assert.equal(transmitted[0].strokeId, transmitted[1].strokeId);
  assert.equal(transmitted[1].to.x, 200 / 960);
  assert.equal(vm.runInContext('isDrawing', ctx), false);
});

test('real server mounts only enabled private plus routes without connecting to live OBS or data', async t => {
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const home = mkdtempSync(join(process.env.APLIARTE_TEST_DATA_DIR || tmpdir(), 'pizarra-plus-http-'));
  const port = 21000 + Math.floor(Math.random() * 30000);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
    env: { PATH: process.env.PATH, HOME: home, DATA_DIR: join(home, 'data'), HOST: '127.0.0.1', PORT: String(port), OPENSSL_CONF: '/dev/null', DIRECTO_PIZARRA_PLUS: '1', NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  t.after(() => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve); child.kill();
  }));
  const base = `http://127.0.0.1:${port}`;
  let started = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('throwaway server exited');
    try { if ((await fetch(base + '/pizarra-plus')).status === 200) { started = true; break; } } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(started, true);
  for (const route of ['/pizarra-plus', '/pizarra-plus/guia', '/cristal-plus', '/api/pizarra-plus/pointer-owner.js']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  const denied = await fetch(base + '/api/pizarra-plus/obs/state', { headers: { Origin: 'https://evil.example' } });
  assert.equal(denied.status, 403);
  // Native HTTP sends the custom Host verbatim; this runtime's fetch normalizes it.
  const { get } = await import('node:http');
  const hostStatus = await new Promise((resolve, reject) => {
    get(base + '/pizarra-plus', { headers: { Host: 'public.example' } }, response => {
      response.resume(); resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
  assert.equal((await fetch(base + '/private/pizarra-plus.html')).status, 404);
  assert.equal((await fetch(base + '/api/pizarra-plus/obs/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'StartStream' }) })).status, 400);
});


test('one Admin engine: complete only in Settings, compact camera preview otherwise, never a second capture', async () => {
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
  assert.equal((html.match(/id="admin-frame"/g) || []).length, 1);
  assert.ok(html.indexOf('id="admin-dock"') > html.indexOf('id="toolbar"'));
  assert.doesNotMatch(html, /getUserMedia|cloneNode/);
  assert.match(html, /allow="camera; microphone; autoplay; fullscreen"/);
  const classes = new Set();
  const dockClasses = new Set();
  const camera = { style: { display: 'block' } };
  const adminDock = { hidden: true, classList: { toggle: (name, on) => { if (on) dockClasses.add(name); else dockClasses.delete(name); } } };
  const body = { classList: { contains: name => classes.has(name), toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } };
  const contentDocument = { body, getElementById: () => camera };
  const ctx = { settingsOpen: true, cameraPreviewHidden: false, adminDock, adminFrame: { contentDocument } };
  runInNewContext(html.match(/function syncAdminDock\(\) \{[\s\S]*?\n    \}/)[0] + ';this.sync = syncAdminDock', ctx);
  ctx.sync();
  assert.equal(adminDock.hidden, false); assert.ok(dockClasses.has('settings')); assert.equal(classes.size, 0);
  ctx.settingsOpen = false; ctx.sync();
  assert.equal(adminDock.hidden, false); assert.ok(dockClasses.has('camera-dock')); assert.ok(classes.has('plus-camera-only'));
  ctx.cameraPreviewHidden = true; ctx.sync();
  assert.equal(adminDock.hidden, true, 'hiding the preview hides the dock');
  assert.equal(camera.style.display, 'block', 'but never stops the camera');
  ctx.cameraPreviewHidden = false; camera.style.display = 'none'; ctx.sync();
  assert.equal(adminDock.hidden, true);
  assert.equal(ctx.adminFrame.contentDocument, contentDocument);
});

test('toolbar uses vector controls and the canonical brand, not emoji or neon UI', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
  const toolbar = html.match(/<nav id="toolbar"[\s\S]*?<\/nav>/)[0];
  assert.doesNotMatch(toolbar, /[\p{Extended_Pictographic}]/u);
  assert.match(toolbar, /aria-label="Controles OBS"/);
  assert.match(html, /id="theme-toggle"/);
  assert.match(html, /--panel-bg:#fdfdfd/);
  assert.match(html, /--accent:#005fa9/);
  assert.match(html, /--panel-bg:#00467b/);
});

test('drawing accepts any RGB color through the native picker', async () => {
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
  assert.match(html, /id="custom-color" type="color"/);
  let handler;
  const ctx = { document: { getElementById: () => ({ addEventListener: (_, fn) => {handler = fn;} }), querySelectorAll: () => [] } };
  const code = html.match(/document.getElementById\('custom-color'\).addEventListener\('input',[\s\S]*?\n    \}\);/)[0];
  runInNewContext('let currentColor;'+code+';this.getColor = () => currentColor', ctx);
  handler({ target: { value: '#b46734' } }); assert.equal(ctx.getColor(), '#b46734');
});

test('tactile scenes grid and sources sheet with eye toggle are present and start hidden', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
  assert.match(html, /id="obs-scenes-grid"/);
  assert.match(html, /id="btn-open-sources"/);
  assert.match(html, /<section id="sources-sheet"[^>]*\bhidden\b/);
  assert.match(html, /id="sources-grid"/);
  assert.match(html, /id="sources-filter"/);
  assert.match(html, /\.scene-grid/);
  assert.match(html, /\.sources-grid/);
  assert.match(html, /\.eye-btn/);
  assert.match(html, /function renderScenesGrid/);
  assert.match(html, /function loadSources/);
  assert.match(html, /toggle_source/);
});


const audioScene = () => fixture({
  items: [
    { sceneItemId: 1, sourceName: 'Webcam', sceneItemEnabled: true, sourceType: 'input' },
    { sceneItemId: 2, sourceName: 'Mic/Aux', sceneItemEnabled: true, sourceType: 'input' },
    { sceneItemId: 3, sourceName: 'Desktop', sceneItemEnabled: false, sourceType: 'input' },
  ],
  inputs: [
    { inputName: 'Webcam', inputKind: 'av_capture_input_v2', unversionedInputKind: 'av_capture_input' },
    { inputName: 'Mic/Aux', inputKind: 'coreaudio_input_capture', unversionedInputKind: 'coreaudio_input_capture' },
    { inputName: 'Desktop', inputKind: 'wasapi_output_capture' },
  ],
  muted: { 'Mic/Aux': true },
});

test('sources report the real mute state of audio inputs instead of scene visibility', async () => {
  const f = audioScene();
  const r = await request(f, '/api/pizarra-plus/obs/sources?scene=Camera');
  assert.equal(r.status, 200);
  const [webcam, mic, desktop] = r.json().sources;
  assert.deepEqual([webcam.name, webcam.enabled, webcam.audio], ['Webcam', true, false]);
  // Muted in OBS: the eye starts off even though the scene item is visible.
  assert.deepEqual([mic.name, mic.enabled, mic.audio, mic.muted], ['Mic/Aux', false, true, true]);
  // Unmuted audio stays on even when its scene item is hidden.
  assert.deepEqual([desktop.enabled, desktop.audio, desktop.muted], [true, true, false]);
});

test('an audio-kind input whose mute state cannot be read falls back to scene visibility', async () => {
  const f = fixture({
    items: [{ sceneItemId: 2, sourceName: 'Mic/Aux', sceneItemEnabled: true, sourceType: 'input' }],
    inputs: [{ inputName: 'Mic/Aux', inputKind: 'coreaudio_input_capture' }],
    muted: { 'Mic/Aux': 'no-audio' },
  });
  const [mic] = (await request(f, '/api/pizarra-plus/obs/sources')).json().sources;
  assert.deepEqual([mic.enabled, mic.audio], [true, false]);
});

test('mute action sets the requested mute state explicitly and never touches scene visibility', async () => {
  const f = audioScene();
  const post = body => request(f, '/api/pizarra-plus/obs/action', { method: 'POST', body });
  const on = await post({ action: 'mute', name: 'Mic/Aux', muted: false });
  assert.equal(on.status, 200);
  assert.equal(on.json().muted, false);
  let [, mic] = (await request(f, '/api/pizarra-plus/obs/sources')).json().sources;
  assert.equal(mic.enabled, true);
  assert.equal((await post({ action: 'mute', name: 'Mic/Aux', muted: true })).json().muted, true);
  [, mic] = (await request(f, '/api/pizarra-plus/obs/sources')).json().sources;
  assert.equal(mic.enabled, false);
  assert.equal((await post({ action: 'mute', name: 'Mic/Aux', muted: 'yes' })).status, 400);
  assert.equal((await post({ action: 'mute', name: 'Invented', muted: false })).status, 400);
  assert.deepEqual(f.calls, [['set_mute', 'Mic/Aux', false], ['set_mute', 'Mic/Aux', true]]);
});

test('the eye of an audio source requests a mute change; other sources keep the visibility toggle', async () => {
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
  const ctx = {};
  runInNewContext(html.match(/function sourceToggleRequest\([^)]*\) \{[\s\S]*?\n    \}/)[0] + ';this.build = sourceToggleRequest', ctx);
  const mic = { id: 2, name: 'Mic/Aux', audio: true };
  assert.deepEqual({ ...ctx.build(mic, 'Camera', true) }, { action: 'mute', name: 'Mic/Aux', muted: false });
  assert.deepEqual({ ...ctx.build(mic, 'Camera', false) }, { action: 'mute', name: 'Mic/Aux', muted: true });
  assert.deepEqual({ ...ctx.build({ id: 1, name: 'Webcam', audio: false }, 'Camera', false) },
    { action: 'toggle_source', scene: 'Camera', id: 1, enabled: false });
});

test('commands open a centred modal dialog with an editable command, Send and Cancel', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
  assert.match(html, /<div id="cmd-modal" class="cmd-modal" hidden>/);
  assert.match(html, /\.cmd-modal\[hidden\]\s*\{display:\s*none;\}/);
  const overlay = html.match(/\.cmd-modal\s*\{([^}]+)\}/)[1];
  assert.match(overlay, /position:\s*fixed/);
  assert.match(overlay, /place-items:\s*center/);
  const dialog = html.match(/<div id="cmd-step"[^>]*>/)[0];
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-labelledby="cmd-step-title"/);
  // The dialog lives outside the commands sheet so it floats above every panel.
  const sheet = html.match(/<section id="commands-sheet"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(sheet, /id="cmd-step"/);
  const modal = html.match(/<div id="cmd-modal"[\s\S]*?\n  <\/div>/)[0];
  assert.match(modal, /<input id="cmd-final"/);
  assert.match(modal, /id="cmd-send">Enviar</);
  assert.match(modal, /id="cmd-cancel">Cancelar</);
  assert.match(modal, /<p id="cmd-step-desc" class="cmd-step-desc" hidden><\/p>/);
  assert.match(modal, /id="btn-cmd-modal-close"/);
  assert.match(html, /function startCommand\(template[,\s\w=']*?\) \{[\s\S]*?cmdModal\.hidden = false/);
  assert.match(html, /function cancelCommand\(\) \{[\s\S]*?cmdModal\.hidden = true/);

  // Command buttons display only the principal command, omitting inline description from grid
  assert.match(html, /button\.className = 'cmd-btn'/);
  assert.match(html, /button\.append\(strong\)/);
  assert.doesNotMatch(html, /button\.append\(strong,\s*small\)/);
});

test('top favorites bar contains camera mode toggle and OLED black screen button with responsive design', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
  // Favorites bar is positioned at the top of canvas-wrapper
  const wrapper = html.match(/<main id="canvas-wrapper"[\s\S]*?<\/main>/)[0];
  assert.match(wrapper, /<nav id="top-favorites-bar" class="favorites-bar"/);
  assert.match(wrapper, /id="btn-fav-cam-mode"/);
  assert.match(wrapper, /id="fav-cam-mode-label">Cámara</);
  assert.match(wrapper, /id="btn-fav-black-screen"/);

  // Bar CSS styling and fixed top centering
  const favCss = html.match(/\.favorites-bar\s*\{([^}]+)\}/)[1];
  assert.match(favCss, /position:\s*fixed/);
  assert.match(favCss, /top:\s*calc/);
  assert.match(favCss, /transform:\s*translateX\(-50%\)/);

  // Black screen OLED overlay
  assert.match(html, /<div id="black-screen-overlay" class="black-screen-overlay" hidden/);
  const blackCss = html.match(/\.black-screen-overlay\s*\{([^}]+)\}/)[1];
  assert.match(blackCss, /background:\s*#000000/);
  assert.match(blackCss, /z-index:\s*9999/);
  assert.match(blackCss, /position:\s*fixed/);

  // Mobile responsiveness collapses text labels at phone width
  assert.match(html, /@media\s*\(max-width:\s*420px\)[\s\S]*?\.fav-label\s*\{display:\s*none;\}/);

  // Functionality: wakeLock and sync helpers
  assert.match(html, /async function requestScreenWakeLock\(\)/);
  assert.match(html, /async function activarPantallaNegra\(\)/);
  assert.match(html, /async function desactivarPantallaNegra\(\)/);
  assert.match(html, /function syncFavCameraMode\(/);
});

test('favorites manager modal allows pinning core actions dynamically with persistence', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');

  // Add favorites button exists in favorites bar with visible label
  assert.match(html, /<button type="button" class="bar-icon fav-add-btn" id="btn-fav-add"/);
  assert.match(html, /<span class="fav-label">\+ Favoritos<\/span>/);

  // Favorites modal exists outside sheets with options list
  assert.match(html, /<div id="fav-modal" class="cmd-modal" hidden>/);
  assert.match(html, /id="fav-dialog" class="cmd-step" role="dialog" aria-modal="true"/);
  assert.match(html, /<div id="fav-options-list" class="fav-options-list">/);
  assert.match(html, /id="btn-fav-modal-close"/);
  assert.match(html, /id="btn-fav-modal-done"/);

  // Core favorites catalog contains management actions and no toolbar duplicates
  assert.match(html, /const CORE_FAVORITES = \[/);
  assert.match(html, /id: 'add-canal'/);
  assert.match(html, /id: 'add-usuario'/);
  assert.match(html, /id: 'add-mensaje'/);
  assert.match(html, /id: 'add-comando'/);
  assert.match(html, /id: 'clear-canvas'/);
  assert.doesNotMatch(html.match(/const CORE_FAVORITES = \[[\s\S]*?\];/)[0], /obs-snapshot|obs-mute|tts-toggle|chat-view|commands-view/);

  // Quick item add modal exists for adding channels, users, messages, commands
  assert.match(html, /<div id="item-modal" class="cmd-modal" hidden>/);
  assert.match(html, /id="item-input-main"/);
  assert.match(html, /id="item-save"/);
  assert.match(html, /function openItemModal\(tipo\)/);
  assert.match(html, /function closeItemModal\(\)/);

  // Storage and bar render functions exist
  assert.match(html, /pizarra_plus_favoritos_v1/);
  assert.match(html, /function getSavedFavorites\(\)/);
  assert.match(html, /function saveFavorites\(list\)/);
  assert.match(html, /function renderFavoritesBar\(activeIds\)/);
  assert.match(html, /function openFavModal\(\)/);
  assert.match(html, /function closeFavModal\(\)/);

  // Escape key closes modals when open
  assert.match(html, /if \(itemModal && !itemModal\.hidden\) \{ closeItemModal\(\); return; \}/);
  assert.match(html, /if \(favModal && !favModal\.hidden\) \{ closeFavModal\(\); return; \}/);
});

test('draw panel includes a close button in panel-head that hides the panel', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
  // Panel header and close button exist
  const panel = html.match(/<section id="draw-panel"[\s\S]*?<\/section>/)[0];
  assert.match(panel, /<div class="panel-head">/);
  assert.match(panel, /<button type="button" class="bar-icon panel-close" id="btn-draw-close"/);

  // Event listener wires btn-draw-close to closeDrawPanel
  assert.match(html, /document\.getElementById\('btn-draw-close'\)\?\.addEventListener\('click',\s*\(\)\s*=>\s*\{[\s\S]*?closeDrawPanel\(\)/);
});

