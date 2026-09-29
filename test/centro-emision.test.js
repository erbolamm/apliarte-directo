import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { validarConfiguracion } from '../src/configuracion.js';
import { GestorProcesos } from '../src/procesos.js';
import { resolveDestinationKey } from '../src/stream-credentials.js';
import { bridgeOptions } from '../src/obs-bridge-config.js';
const require = createRequire(import.meta.url);
const { saveStreamingConfig, safeState } = require('../src/streaming-config.js');

test('stored Twitch and YouTube keys are write-only, mode 0600, and override optional env fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'centro-keys-'));
  try {
    const state = saveStreamingConfig(dir, { twitchStreamKey: 'test-twitch-key', youtubeStreamKey: 'test-youtube-key' });
    assert.equal(state.hasTwitchStreamKey, true);
    assert.equal(state.hasYoutubeStreamKey, true);
    assert.doesNotMatch(JSON.stringify(state), /test-(twitch|youtube)-key/);
    assert.equal(statSync(join(dir, 'config.json')).mode & 0o777, 0o600);
    assert.equal(resolveDestinationKey({ nombre: 'twitch', variableClave: 'CLAVE_TWITCH' }, dir, { CLAVE_TWITCH: 'old-env' }), 'test-twitch-key');
    assert.equal(resolveDestinationKey({ nombre: 'youtube', variableClave: 'CLAVE_YOUTUBE' }, dir, {}), 'test-youtube-key');
    assert.equal(resolveDestinationKey({ nombre: 'custom', variableClave: 'CUSTOM' }, dir, { CUSTOM: 'fallback' }), 'fallback');
    assert.equal(readFileSync(join(dir, 'config.json'), 'utf8').includes('test-youtube-key'), true);
    assert.doesNotMatch(JSON.stringify(safeState({ streaming: { youtubeStreamKey: 'test-youtube-key' } })), /test-youtube-key/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ready state can use stored keys without exposing their values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'centro-ready-'));
  try {
    saveStreamingConfig(dir, { youtubeStreamKey: 'test-youtube-key' });
    const raw = JSON.parse(readFileSync(new URL('../config.ejemplo.json', import.meta.url), 'utf8'));
    const result = validarConfiguracion(raw, {}, d => Boolean(resolveDestinationKey(d, dir, {})));
    assert.deepEqual(result.configuracion.destinos.map(d => [d.nombre, d.listo]), [['twitch', false], ['youtube', true]]);
    assert.doesNotMatch(JSON.stringify(result), /test-youtube-key/);
    assert.deepEqual(raw.destinos.map(d => d.url), ['rtmp://live.twitch.tv/app', 'rtmp://a.rtmp.youtube.com/live2']);
    assert.doesNotMatch(JSON.stringify(raw), /test-youtube-key/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('process launcher uses the injected key resolver rather than an environment-only key', async () => {
  let args;
  const child = { pid: 100, stderr: { on() {} }, on() {}, exitCode: null, signalCode: null };
  const processes = new GestorProcesos({ lanzar: (_, argv) => { args = argv; return child; }, registrar: () => {}, claveDeDestino: () => 'stored-key' });
  await processes.arrancarRelay({ destino: { nombre: 'twitch', url: 'rtmp://live.twitch.tv/app', variableClave: 'CLAVE_TWITCH' }, entrada: 'rtmp://127.0.0.1:1935/live/demo', entorno: {}, alSalir: () => {} });
  assert.equal(args.at(-1), 'rtmp://live.twitch.tv/app/stored-key');
});

test('OBS bridge defaults to local overlay and can be disabled', () => {
  assert.deepEqual(bridgeOptions({}), { enabled: true, url: 'ws://127.0.0.1:7979/ws' });
  assert.deepEqual(bridgeOptions({ PORT: '7990', OBS_BRIDGE: 'off' }), { enabled: false, url: 'ws://127.0.0.1:7990/ws' });
  assert.equal(bridgeOptions({ OBS_BRIDGE_WS_URL: 'ws://127.0.0.1:12345/ws' }).url, 'ws://127.0.0.1:12345/ws');
  assert.throws(() => bridgeOptions({ OBS_BRIDGE_WS_URL: 'wss://directo.apliarte.com/ws' }), /local|loopback/i);
});
