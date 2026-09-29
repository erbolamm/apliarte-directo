import test from 'node:test';
import assert from 'node:assert/strict';
import { analizarCategoriaGuardada } from '../src/categoria-estado.js';

test('acepta una categoria valida guardada', () => {
  assert.equal(analizarCategoriaGuardada('{"categoria":"musica"}'), 'musica');
});

test('devuelve null si el archivo no existe (texto vacio o null)', () => {
  assert.equal(analizarCategoriaGuardada(null), null);
  assert.equal(analizarCategoriaGuardada(''), null);
});

test('devuelve null si el JSON esta corrupto, sin lanzar', () => {
  assert.doesNotThrow(() => analizarCategoriaGuardada('{esto no es json'));
  assert.equal(analizarCategoriaGuardada('{esto no es json'), null);
});

test('devuelve null si la categoria guardada ya no es valida', () => {
  assert.equal(analizarCategoriaGuardada('{"categoria":"cine"}'), null);
});
