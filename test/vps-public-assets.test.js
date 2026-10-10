import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('VPS public demo and docs match the source served by the local server', () => {
  for (const name of ['demo.html', 'docs/index.html', 'avatares.html', 'contexto.html', 'sms-pantalla.html']) {
    const source = readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
    const vps = readFileSync(new URL(`../vps-overlay/public/${name}`, import.meta.url), 'utf8');
    assert.equal(vps, source, `${name} differs between local and VPS`);
  }
});

test('VPS server.js routes match public landing, demo and docs endpoints', () => {
  const vpsServer = readFileSync(new URL('../vps-overlay/server.js', import.meta.url), 'utf8');
  assert.match(vpsServer, /path === '\/landing'/);
  assert.match(vpsServer, /path === '\/demo'/);
  assert.match(vpsServer, /path === '\/docs'/);
});
