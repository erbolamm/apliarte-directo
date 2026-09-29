import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { loadWhipConfig } = require('../whip/runtime-config.js');

test('WHIP remains unconfigured without all three credentials', () => {
  const dir = mkdtempSync(join(tmpdir(), 'directo-whip-'));
  try {
    assert.equal(loadWhipConfig({}, dir), null);
    assert.equal(loadWhipConfig({ TWITCH_STREAM_KEY: 'test-key', VDO_ROOM: 'test-room' }, dir), null);
    assert.deepEqual(loadWhipConfig({ TWITCH_STREAM_KEY: 'test-key', VDO_ROOM: 'test-room', VDO_PASS: 'test-pass' }, dir), {
      streamKey: 'test-key', room: 'test-room', password: 'test-pass'
    });
  } finally { rmSync(dir, { recursive: true }); }
});

test('WHIP reads saved panel credentials on each start and preserves environment fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'directo-whip-'));
  try {
    const env = { TWITCH_STREAM_KEY: 'env-key', VDO_ROOM: 'env-room', VDO_PASS: 'env-pass' };
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ streaming: {
      twitchStreamKey: 'saved-key', vdoRoom: 'saved-room', vdoPassword: 'saved-pass'
    } }));
    assert.deepEqual(loadWhipConfig(env, dir), { streamKey: 'saved-key', room: 'saved-room', password: 'saved-pass' });
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ streaming: { twitchStreamKey: 'updated-key' } }));
    assert.deepEqual(loadWhipConfig(env, dir), { streamKey: 'updated-key', room: 'env-room', password: 'env-pass' });
  } finally { rmSync(dir, { recursive: true }); }
});

test('VPS WHIP loader matches local loader and has no nonempty VDO password default', () => {
  const local = readFileSync(new URL('../whip/runtime-config.js', import.meta.url), 'utf8');
  const vps = readFileSync(new URL('../vps-overlay/whip/runtime-config.js', import.meta.url), 'utf8');
  const compose = readFileSync(new URL('../vps-overlay/docker-compose.yml', import.meta.url), 'utf8');
  assert.equal(vps, local);
  assert.match(compose, /VDO_PASS=\$\{VDO_PASS:-\}/);
});
