import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPracticeSession, PRACTICE_AGENTS } from '../public/demo-practice.js';
import { AGENTES_OFICINA } from '../public/js/tts-fuentes.js';

test('practice uses real adoptable agent ids and never allows Javier adoption', () => {
  for (const id of Object.keys(PRACTICE_AGENTS)) assert.equal(AGENTES_OFICINA.has(id), true);
  const session = createPracticeSession();
  assert.equal(session.submit('hola').events[0].type, 'notice');
  assert.equal(session.choose('ja').state.selected, null);
  assert.equal(session.submit('!co').state.selected, 'co');
  assert.equal(session.submit('!cl').state.selected, 'cl');
});

test('practice routes chat, speech and commands only through local state', () => {
  const session = createPracticeSession();
  session.choose('cl');
  assert.deepEqual(session.submit('Hola, mundo').events[0], {
    type: 'speech', agent: 'cl', text: 'Hola, mundo', effect: null
  });
  assert.equal(session.submit('!say co Buenos días').events[0].agent, 'co');
  assert.equal(session.submit('!cafe').events[0].effect, 'cafe');
  session.submit('!d 3');
  assert.equal(session.getState().offsets.cl, 3);
  session.submit('!r');
  assert.equal(session.getState().offsets.cl, 0);
  assert.equal(session.submit('!traidor').events[0].type, 'notice');
});

test('practice emits real overlay actions for movement, board squares and reactions', () => {
  const session = createPracticeSession();
  session.choose('co');
  assert.deepEqual(session.submit('!w 2').events.find(e => e.type === 'move').steps, [{ dir: 'w', pasos: 2 }]);
  assert.equal(session.submit('!a1').events[0].type, 'notice');
  assert.equal(session.submit('!damas').events[0].type, 'board');
  assert.deepEqual(session.submit('!a1').events[0], { type: 'square', agent: 'co', square: 'a1' });
  assert.equal(session.submit('!beso cl').events[0].type, 'kiss');
  assert.equal(session.submit('!bronca').events[0].type, 'scold');
  assert.equal(session.submit('!trabajar').events[0].type, 'work');
});

test('practice bundle is browser-local and replicated for VPS', () => {
  const source = readFileSync(new URL('../public/demo-practice.js', import.meta.url), 'utf8');
  const vps = readFileSync(new URL('../vps-overlay/public/demo-practice.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/demo.html', import.meta.url), 'utf8');
  assert.equal(vps, source);
  assert.doesNotMatch(source, /fetch\s*\(|new\s+WebSocket\s*\(|XMLHttpRequest|sendBeacon/);
  assert.match(html, /id="practiceAgent"/);
  assert.match(html, /speechSynthesis\.speak/);
  assert.doesNotMatch(html, /fetch\s*\(\s*['"]\/api\//);
});
