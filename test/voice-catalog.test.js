import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const blog = read('voces-blogger.html');
const catalog = read('DOCUMENTATION/VOICE-CATALOG.md');

test('all 26 locale commands and both slots remain copyable', () => {
  const locales = [...new Set([...blog.matchAll(/data-comando="!speak -config ([a-z]{2}-[A-Z]{2}) [12]"/g)].map(m => m[1]))];
  assert.equal(locales.length, 26);
  for (const locale of locales) {
    for (const slot of [1, 2]) assert.ok(blog.includes(`data-comando="!speak -config ${locale} ${slot}"`));
    assert.match(catalog, new RegExp(`^\\| ${locale} \\|`, 'm'));
  }
  assert.match(blog, /navigator\.clipboard\.writeText/);
  assert.match(blog, /document\.execCommand\('copy'\)/);
});

test('Blogger page stays viewer-facing until the new voices are live in the stream', () => {
  // Decision 2026-09-29: the published page keeps its current wording; internal
  // catalog notes (candidates, unverified gender, not connected) live in the catalog.
  assert.doesNotMatch(blog, /candidat|sin verificar|no est[aá] conectado/i);
  assert.match(catalog, /unknown/);
  assert.match(catalog, /CC BY/);
});

test('voice models are never shipped: each install downloads them from the official source', () => {
  assert.match(catalog, /No voice model is shipped with ApliArte Directo/);
  assert.match(read('tts-lab/README.md'), /No voice model is shipped with ApliArte Directo/);
});

test('offline eSpeak option is allowlisted and isolated', () => {
  const service = read('tts-lab/service.py');
  const compose = read('tts-lab/compose.yaml');
  assert.match(read('tts-lab/Dockerfile'), /espeak-ng/);
  assert.match(service, /ESPEAK_VOICES = \{/);
  assert.match(service, /engine == 'espeak'/);
  assert.match(service, /'--stdin'/);
  assert.match(compose, /127\.0\.0\.1:8765:8765/);
});
