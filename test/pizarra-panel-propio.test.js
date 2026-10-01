// Pizarra Plus own panel (Javier, 2026-10-01): the toolbar is attached under the
// 16:9 drawing stage and never under the iPad status bar; each control shows a
// single icon; Chat, Commands and TTS are the Pizarra's own panels, and only the
// gear opens the complete Admin. Camera, microphone and TTS keep using the
// existing Admin engine, loaded hidden, so no capture or data is duplicated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function extract(name) {
  const match = script.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n    \\}`));
  assert.ok(match, `function ${name} must exist in the inline script`);
  return match[0];
}
function load(names, context = {}) {
  const exported = names.map(n => `${n}: typeof ${n} === 'function' ? ${n} : undefined`).join(', ');
  runInNewContext(names.map(extract).join('\n') + `;this.api = { ${exported} };`, context);
  return context.api;
}

const TOOLBAR_IDS = [
  'btn-draw-menu', 'btn-undo', 'btn-redo', 'btn-clear', 'btn-obs-snapshot',
  'btn-device-camera', 'btn-tablet-mic', 'btn-chat-view', 'btn-commands-view',
  'btn-tts', 'btn-obs-menu', 'btn-settings',
];

test('the toolbar sits directly under the 16:9 stage, never at the top of the screen', () => {
  const stage = html.match(/<main id="canvas-wrapper">([\s\S]*?)<\/main>/);
  assert.ok(stage, 'stage wrapper exists');
  const inner = stage[1];
  assert.ok(inner.indexOf('id="canvas-container"') < inner.indexOf('id="toolbar"'),
    'toolbar follows the drawing area inside the same stage group');
  assert.doesNotMatch(html, /<header>/, 'no top header bar');
  assert.doesNotMatch(html, /<footer>/, 'no separate footer bar');
});

test('the page respects the iPad safe areas instead of drawing under the status bar', () => {
  const app = html.match(/#app-container\s*\{([^}]+)\}/)[1];
  for (const side of ['top', 'right', 'bottom', 'left']) {
    assert.match(app, new RegExp(`env\\(safe-area-inset-${side}\\)`), `padding uses safe-area-inset-${side}`);
  }
});

test('every toolbar control exists and shows exactly one icon, without disclosure markers', () => {
  const toolbar = html.match(/<nav id="toolbar"[\s\S]*?<\/nav>/)[0];
  for (const id of TOOLBAR_IDS) {
    const button = toolbar.match(new RegExp(`<button[^>]*id="${id}"[\\s\\S]*?<\\/button>`));
    assert.ok(button, `${id} is in the toolbar`);
    assert.equal((button[0].match(/<svg/g) || []).length, 1, `${id} has exactly one icon`);
    assert.match(button[0], /aria-label="[^"]+"/, `${id} has an accessible name`);
  }
  assert.doesNotMatch(html, /<details|<summary/, 'no <details>/<summary> disclosure triangles');
  assert.doesNotMatch(toolbar, /[\p{Extended_Pictographic}]/u, 'no emoji in the toolbar');
});

test('the stage keeps 16:9 and leaves room below for the toolbar on any screen', () => {
  const { fitStage } = load(['fitStage']);
  // iPad 2018 landscape (4:3): touches the sides, toolbar fits below.
  const ipad = fitStage(1024 - 16, 768 - 16, 56, 8);
  assert.equal(ipad.w, 1008);
  assert.equal(ipad.h, Math.floor(1008 * 9 / 16));
  assert.ok(ipad.h + 56 + 8 <= 752);
  // 16:9 screen: the stage shrinks a little so the toolbar never covers it.
  const wide = fitStage(1920, 1080, 56, 8);
  assert.equal(wide.h, 1080 - 56 - 8);
  assert.equal(wide.w, Math.floor((1080 - 56 - 8) * 16 / 9));
  // Phone portrait: width bound.
  const phone = fitStage(374, 700, 112, 8);
  assert.equal(phone.w, 374);
});

test('Chat is the Pizarra own panel: Twitch chat, or the Botrix widget when Todos is on', () => {
  const { chatUrl } = load(['chatUrl', 'esUrlBotrix']);
  const twitch = chatUrl(null, 'mac.tail.ts.net', 'apliarte');
  assert.match(twitch, /^https:\/\/www\.twitch\.tv\/embed\/apliarte\/chat\?/);
  assert.match(twitch, /parent=mac\.tail\.ts\.net/);
  const botrix = 'https://botrix.live/widgets/chat/?bid=abc';
  assert.equal(chatUrl({ todos: true, botrixUrl: botrix }, 'h', 'apliarte'), botrix);
  assert.match(chatUrl({ todos: false, botrixUrl: botrix }, 'h', 'apliarte'), /twitch\.tv/);
  assert.match(chatUrl({ todos: true, botrixUrl: 'javascript:alert(1)' }, 'h', 'apliarte'), /twitch\.tv/);
  assert.match(chatUrl({ todos: 'yes', botrixUrl: botrix }, 'h', 'apliarte'), /twitch\.tv/);
  assert.match(html, /<iframe id="chat-frame"/, 'own chat frame, not the Admin');
});

test('Chat and Commands never open Admin tabs; only the gear shows the complete Admin', () => {
  assert.doesNotMatch(script, /'tab-chat'|'tab-comandos'/);
  assert.doesNotMatch(script, /\.nav-item\[data-tab/);
  assert.equal((html.match(/id="admin-frame"/g) || []).length, 1, 'still one Admin engine');
  assert.match(script, /getElementById\('btn-settings'\)/);
});

test('commands fill their placeholders in order, like the Admin does', () => {
  const { buildCommand, placeholdersOf } = load(['buildCommand', 'placeholdersOf']);
  assert.deepEqual([...placeholdersOf('!so [usuario]')], ['usuario']);
  assert.deepEqual([...placeholdersOf('/ban [usuario] [mensaje]')], ['usuario', 'mensaje']);
  assert.deepEqual([...placeholdersOf('!fiesta')], []);
  assert.equal(buildCommand('!so [usuario]', ['midudev']), '!so midudev');
  assert.equal(buildCommand('/ban [usuario] [mensaje]', ['troll', 'spam']), '/ban troll spam');
  assert.equal(buildCommand('!fiesta', []), '!fiesta');
});

test('sending a command uses the existing endpoint and reports failures honestly', async () => {
  const calls = [];
  const ok = { fetch: async (url, opts) => { calls.push([url, JSON.parse(opts.body)]); return new Response(JSON.stringify({ twitchEnviado: true }), { status: 200 }); } };
  const { sendCommand } = load(['sendCommand'], ok);
  const sent = await sendCommand('!so midudev');
  assert.equal(sent.ok, true);
  assert.deepEqual(calls[0], ['/api/directo/comando', { comando: '!so midudev', usuario: 'ja' }]);

  const denied = load(['sendCommand'], { fetch: async () => new Response('{}', { status: 401 }) }).sendCommand;
  assert.equal((await denied('!x')).ok, false);
  const offline = load(['sendCommand'], { fetch: async () => { throw new TypeError('offline'); } }).sendCommand;
  const result = await offline('!x');
  assert.equal(result.ok, false);
  assert.match(result.message, /conexión/);
  const explained = load(['sendCommand'], { fetch: async () => new Response(JSON.stringify({ ok: false, error: 'Twitch no está configurado (falta token)' }), { status: 400 }) }).sendCommand;
  const r400 = await explained('!so midudev');
  assert.equal(r400.ok, false);
  assert.match(r400.message, /Twitch no está configurado/, 'the server explanation reaches the user');
  const notSent = load(['sendCommand'], { fetch: async () => new Response(JSON.stringify({ twitchEnviado: false, error: 'Twitch desconectado' }), { status: 200 }) }).sendCommand;
  const r2 = await notSent('!x');
  assert.equal(r2.ok, false);
  assert.match(r2.message, /Twitch desconectado/);
});

test('TTS, camera and microphone delegate to the existing Admin engine', () => {
  for (const id of ['btn-tts-main-toggle', 'badge-tts-estado', 'btn-micro-toggle', 'btn-apagar-camara', 'btn-toggle-camara-modo']) {
    assert.ok(script.includes(id), `${id} is driven through the Admin engine`);
  }
  assert.match(script, /Escuchando en vivo/);
  assert.doesNotMatch(html, /getUserMedia|speechSynthesis/, 'no second capture or voice engine');
});

test('the drawing button gathers tools, colours, free colour picker, size and finger drawing', () => {
  const panel = html.match(/<section id="draw-panel"[\s\S]*?<\/section>/);
  assert.ok(panel, 'one drawing panel');
  for (const id of ['tools-group', 'palette-group', 'custom-color', 'size-range', 'allow-touch']) {
    assert.match(panel[0], new RegExp(`id="${id}"`), `${id} lives in the drawing panel`);
  }
  assert.ok((panel[0].match(/data-color="/g) || []).length >= 12, 'at least 12 quick colours');
  assert.match(panel[0], /id="size-range" type="range"/);
});

test('sheets open full screen inside the safe area and close with a visible button', () => {
  for (const id of ['chat-sheet', 'commands-sheet', 'obs-sheet']) {
    const sheet = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?<\\/section>`));
    assert.ok(sheet, `${id} exists`);
    assert.match(sheet[0], /hidden/, `${id} starts hidden`);
    assert.match(sheet[0], /class="[^"]*\bsheet-close\b/, `${id} has a close button`);
  }
  assert.match(html, /\.sheet\s*\{[^}]*position:\s*fixed/);
});

test('rows hidden in the command steps really disappear', () => {
  assert.match(html, /\.panel-row\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
});

test('Clear needs a second tap within a few seconds, without browser dialogs', () => {
  const { clearArmed } = load(['clearArmed']);
  assert.equal(clearArmed(0, 1000), false, 'never armed');
  assert.equal(clearArmed(1000, 2500), true, 'second tap in time');
  assert.equal(clearArmed(1000, 4500), false, 'too late: arm again');
  assert.doesNotMatch(script, /\bconfirm\(|\balert\(/);
});

test('tool, colour, size and finger drawing are remembered on this device only', () => {
  const { readPrefs } = load(['readPrefs']);
  const store = value => ({ getItem: () => value });
  assert.deepEqual({ ...readPrefs(store(JSON.stringify({ tool: 'arrow', color: '#ff0000', size: 12, touch: true }))) }, { tool: 'arrow', color: '#ff0000', size: 12, touch: true });
  assert.deepEqual({ ...readPrefs(store('{"tool":"rm -rf","color":"red;x","size":999,"touch":"yes"}')) }, {}, 'invalid values are ignored');
  assert.deepEqual({ ...readPrefs(store('not json')) }, {});
  assert.deepEqual({ ...readPrefs({ getItem() { throw new Error('blocked'); } }) }, {});
});

test('the drawing button shows the current colour and the offline state is visible', () => {
  assert.match(script, /drawButton\.style\.setProperty\('--current-color'/);
  assert.match(html, /#btn-draw-menu\s*\{[^}]*--current-color/);
  assert.match(html, /<span id="status-text"[^>]*>/);
  assert.match(script, /statusText\.hidden = /);
});

test('desktop shortcuts undo and redo, but never while typing', () => {
  assert.match(script, /key === 'z'/);
  assert.match(script, /closest\?\.\('input, textarea, select'\)/);
});
