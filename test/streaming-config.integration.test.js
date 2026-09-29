import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';

const require = createRequire(import.meta.url);
const dataDir = mkdtempSync(join(tmpdir(), 'directo-streaming-'));
process.env.DATA_DIR = dataDir;
process.env.PANEL_PASS = 'integration-test-panel-pass';
process.env.NODE_ENV = 'test';
const { server } = require('../server.js');
const { server: vpsServer } = require('../vps-overlay/server.js');
const { loadWhipConfig } = require('../whip/runtime-config.js');

function getWithHost(url, host) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers: { Host: host } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    }).on('error', reject);
  });
}

let base;
test.before(async () => {
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({ vdo: { room: 'camera-room' } }), { mode: 0o600 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  rmSync(dataDir, { recursive: true });
});

test('panel streaming persists private credentials and WHIP reloads them without exposure', async () => {
  const endpoint = `${base}/api/panel/streaming`;
  const post = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ twitchStreamKey: 'dummy-stream-key', youtubeStreamKey: 'dummy-youtube-key', vdoRoom: 'dummy-room', vdoPassword: 'dummy-pass' })
  });
  assert.equal(post.status, 200);
  const posted = await post.json();
  assert.deepEqual(posted.streaming, { vdoRoom: 'dummy-room', hasTwitchStreamKey: true, hasYoutubeStreamKey: true, hasVdoPassword: true });
  assert.equal(JSON.stringify(posted).includes('dummy-stream-key'), false);
  assert.equal(JSON.stringify(posted).includes('dummy-youtube-key'), false);
  assert.equal(JSON.stringify(posted).includes('dummy-pass'), false);

  const disk = JSON.parse(readFileSync(join(dataDir, 'config.json'), 'utf8'));
  assert.equal(disk.vdo.room, 'camera-room');
  assert.equal(disk.streaming.twitchStreamKey, 'dummy-stream-key');
  assert.equal(disk.streaming.youtubeStreamKey, 'dummy-youtube-key');
  assert.equal(statSync(join(dataDir, 'config.json')).mode & 0o777, 0o600);
  assert.deepEqual(loadWhipConfig({}, dataDir), {
    streamKey: 'dummy-stream-key', room: 'dummy-room', password: 'dummy-pass'
  });

  const get = await fetch(endpoint);
  assert.equal(get.status, 200);
  assert.deepEqual((await get.json()).streaming, posted.streaming);
});

test('existing general panel save preserves WHIP credentials', async () => {
  const response = await fetch(`${base}/api/panel/config`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ openai: {} })
  });
  assert.equal(response.status, 200);
  const disk = JSON.parse(readFileSync(join(dataDir, 'config.json'), 'utf8'));
  assert.equal(disk.streaming.twitchStreamKey, 'dummy-stream-key');
});

test('streaming endpoint rejects cross-origin writes and never reveals saved secrets', async () => {
  const endpoint = `${base}/api/panel/streaming`;
  const rejected = await fetch(endpoint, {
    method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ twitchStreamKey: 'attacker-key' })
  });
  assert.equal(rejected.status, 403);
  const state = await (await fetch(endpoint)).text();
  assert.equal(state.includes('dummy-stream-key'), false);
  assert.equal(state.includes('dummy-youtube-key'), false);
  assert.equal(state.includes('dummy-pass'), false);
  assert.equal(state.includes('attacker-key'), false);
});

test('VPS overlay exposes the same protected streaming configuration endpoint', async () => {
  await new Promise(resolve => vpsServer.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${vpsServer.address().port}/api/panel/streaming`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).streaming, {
      vdoRoom: 'dummy-room', hasTwitchStreamKey: true, hasYoutubeStreamKey: true, hasVdoPassword: true
    });
    const landing = await getWithHost(`http://127.0.0.1:${vpsServer.address().port}/`, 'directo.apliarte.com');
    assert.equal(landing.status, 200);
    assert.match(landing.body, /id="install-commands"/);
  } finally {
    await new Promise(resolve => vpsServer.close(resolve));
  }
});

test('public domain root serves landing while local root remains the overlay', async () => {
  const landing = await getWithHost(`${base}/`, 'directo.apliarte.com');
  assert.equal(landing.status, 200);
  assert.match(landing.body, /id="install-commands"/);
  const overlay = await fetch(`${base}/`);
  assert.equal(overlay.status, 200);
  assert.match(await overlay.text(), /hud-avatars-grid/);
});

test('malformed existing config is not overwritten by a streaming save', async () => {
  const target = join(dataDir, 'config.json');
  writeFileSync(target, '{broken-json', { mode: 0o600 });
  const response = await fetch(`${base}/api/panel/streaming`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ twitchStreamKey: 'replacement' })
  });
  assert.equal(response.status, 400);
  assert.equal(readFileSync(target, 'utf8'), '{broken-json');
});
