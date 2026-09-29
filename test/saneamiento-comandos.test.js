import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sanearComando } = require('../server.js');

test('sanearComando corrige espacios parásitos entre prefijo y comando', () => {
  const casos = [
    ['! so lucas', '!so lucas'],
    ['!   so  lucas', '!so lucas'],
    ['/ announce Gran directo hoy', '/announce Gran directo hoy'],
    ['/  goal 500', '/goal 500'],
    ['! w 1', '!w 1'],
    ['!   salta', '!salta'],
    ['/ clear', '/clear'],
    ['/ slow 10', '/slow 10'],
    ['/ subscribers', '/subscribers'],
  ];

  for (const [input, esperado] of casos) {
    const res = sanearComando(input);
    assert.equal(res.valido, true, `Debería ser válido para: "${input}"`);
    assert.equal(res.comando, esperado, `Esperado "${esperado}" para input "${input}"`);
  }
});

test('sanearComando detecta y rechaza placeholders sin rellenar', () => {
  const casosInvalidos = [
    '!so [usuario]',
    '/timeout [usuario] 600',
    '/ban [usuario] [mensaje]',
    '/raid [canal]',
    '/announce [mensaje]',
    '!liberar [agente]',
    '!beso [USUARIO]',
  ];

  for (const input of casosInvalidos) {
    const res = sanearComando(input);
    assert.equal(res.valido, false, `Debería rechazar placeholder en: "${input}"`);
    assert.match(res.error, /Parámetro sin rellenar en comando/, `Mensaje de error claro para: "${input}"`);
  }
});

test('sanearComando rechaza cadenas vacías o tipos inválidos', () => {
  assert.equal(sanearComando('').valido, false);
  assert.equal(sanearComando('   ').valido, false);
  assert.equal(sanearComando(null).valido, false);
  assert.equal(sanearComando(undefined).valido, false);
  assert.equal(sanearComando(123).valido, false);
});

test('sanearComando colapsa espacios internos respetando el texto', () => {
  const res = sanearComando('!announce   Bienvenidos    al   directo   ');
  assert.equal(res.valido, true);
  assert.equal(res.comando, '!announce Bienvenidos al directo');
});
