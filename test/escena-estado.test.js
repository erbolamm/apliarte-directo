import test from 'node:test';
import assert from 'node:assert/strict';
import { analizarEscenaGuardada } from '../src/escena-estado.js';

test('acepta una escena valida guardada', () => {
  assert.equal(analizarEscenaGuardada('{"escena":"hablando"}'), 'hablando');
});

test('devuelve null si el archivo no existe (texto vacio o null)', () => {
  assert.equal(analizarEscenaGuardada(null), null);
  assert.equal(analizarEscenaGuardada(''), null);
});

test('devuelve null si el JSON esta corrupto, sin lanzar', () => {
  assert.doesNotThrow(() => analizarEscenaGuardada('{esto no es json'));
  assert.equal(analizarEscenaGuardada('{esto no es json'), null);
});

test('devuelve null si la escena guardada ya no es valida', () => {
  assert.equal(analizarEscenaGuardada('{"escena":"cine"}'), null);
});
