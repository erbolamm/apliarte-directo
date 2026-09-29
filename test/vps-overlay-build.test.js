import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('VPS Docker context contains its auth and streaming configuration modules', () => {
  const dockerfile = readFileSync(new URL('../vps-overlay/Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /COPY src \.\/src/);
  assert.match(dockerfile, /COPY public \.\/public/);
  for (const name of ['ws-auth.js', 'streaming-config.js', 'centro-status.js']) {
    const shared = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    const deployed = readFileSync(new URL(`../vps-overlay/src/${name}`, import.meta.url), 'utf8');
    assert.equal(deployed, shared, `VPS ${name} must remain in parity`);
  }
});
