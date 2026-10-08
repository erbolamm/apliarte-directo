import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/estudio.html', import.meta.url), 'utf8');

function cargarTroceo() {
  const match = html.match(/function splitForServerVoice\([^)]*\)\s*\{[\s\S]*?\n    \}/);
  assert.ok(match, 'estudio.html must define splitForServerVoice');
  return new Function(`const SERVER_VOICE_MAX = 160; ${match[0]}; return splitForServerVoice;`)();
}

test('the studio server voice reads a long chat message whole, in pieces of at most 160 characters', () => {
  const split = cargarTroceo();
  const palabras = 'Hola a todos los que estais viendo el directo de hoy vamos a comprobar que la voz del chat lee el mensaje entero sin cortarse a la mitad'.split(' ');
  let texto = '';
  while (texto.length < 500) texto += (texto ? ' ' : '') + palabras[texto.length % palabras.length];
  const trozos = split(texto);
  assert.ok(trozos.length > 1, 'a 500 character message needs more than one piece');
  for (const trozo of trozos) assert.ok(trozo.length <= 160, `piece too long: ${trozo.length}`);
  assert.equal(trozos.join(' '), texto, 'no word is lost or cut');
});

test('the studio server voice keeps short messages in one piece and breaks a single huge word', () => {
  const split = cargarTroceo();
  assert.deepEqual(split('hola'), ['hola']);
  assert.deepEqual(split('   '), []);
  const enorme = 'a'.repeat(350);
  const trozos = split(enorme);
  assert.deepEqual(trozos.map((t) => t.length), [160, 160, 30]);
});

test('the studio server voice no longer cuts the text before asking for the audio', () => {
  assert.doesNotMatch(html, /text\.slice\(0, 160\)/);
});
