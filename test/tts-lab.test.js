import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../tts-lab/${name}`, import.meta.url), 'utf8');

test('TTS lab is a standalone loopback-only Docker service', () => {
  assert.match(read('compose.yaml'), /127\.0\.0\.1:8765:8765/);
  assert.doesNotMatch(read('compose.yaml'), /network_mode:\s*host/);
  assert.match(read('Dockerfile'), /piper-tts/);
  assert.match(read('Dockerfile'), /edge-tts/);
  assert.doesNotMatch(read('compose.yaml'), /server\.js/);
});

test('edge pitch changes independently of speed and piper requires a local model', () => {
  const service = read('service.py');
  assert.match(service, /f"--pitch=\{request\['pitch_hz'\]:\+d\}Hz", '--rate=\+0%'/);
  assert.match(service, /engine == 'piper' and pitch != 0/);
  assert.match(service, /MAX_TEXT = 500/);
});

test('the lab lets you pick a voice per engine to compare accents', () => {
  const service = read('service.py');
  const page = read('index.html');
  // Piper voices are chosen by file name from models/, validated before use.
  assert.match(service, /PIPER_VOICE_PATTERN = re\.compile\(/);
  assert.match(service, /DEFAULT_PIPER_VOICE = 'es_ES-davefx-medium'/);
  assert.match(service, /MODELS_DIR \/ f"\{request\['voice'\]\}\.onnx"/);
  // The page offers the four Spanish accents in Edge and the free-licence Piper voices.
  for (const voice of ['es-ES-ElviraNeural', 'es-MX-DaliaNeural', 'es-AR-ElenaNeural', 'es-CO-SalomeNeural',
    'es_ES-davefx-medium', 'es_MX-ald-medium', 'es_MX-claude-high', 'es_AR-daniela-high']) {
    assert.ok(page.includes(voice), `falta la voz ${voice}`);
  }
  assert.match(page, /voice:form\.elements\.voice\.value/);
});

test('the README documents each voice licence and the engine licences', () => {
  const readme = read('README.md');
  for (const text of ['CC0', 'Unlicense', 'Apache-2.0', 'CC BY-SA 4.0', 'GPL-3.0-or-later']) {
    assert.ok(readme.includes(text), `falta ${text}`);
  }
});
