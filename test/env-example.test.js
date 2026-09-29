import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('public environment template never supplies working credentials or demo passwords', () => {
  const source = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  for (const name of ['PANEL_PASS', 'TWITCH_STREAM_KEY', 'VDO_ROOM', 'VDO_PASS', 'VDO_CAM_PASS']) {
    assert.match(source, new RegExp(`^${name}=$`, 'm'), `${name} must require local setup`);
  }
});
