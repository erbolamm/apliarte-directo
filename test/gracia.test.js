import test from 'node:test';
import assert from 'node:assert/strict';
import { ajustarGracia, GRACIA_POR_DEFECTO_MS } from '../src/gracia.js';

test('ajusta la gracia de la emision indicada', () => {
  const emision = { publishGraceMs: 30000 };
  const contexto = { broadcasts: new Map([['/live/obs', emision]]) };
  assert.equal(ajustarGracia(contexto, '/live/obs'), true);
  assert.equal(emision.publishGraceMs, GRACIA_POR_DEFECTO_MS);
});

test('acepta un valor propio', () => {
  const emision = { publishGraceMs: 30000 };
  const contexto = { broadcasts: new Map([['/live/obs', emision]]) };
  ajustarGracia(contexto, '/live/obs', 1500);
  assert.equal(emision.publishGraceMs, 1500);
});

test('devuelve false si la emision no existe, sin lanzar', () => {
  assert.equal(ajustarGracia({ broadcasts: new Map() }, '/live/obs'), false);
});

test('devuelve false si la libreria cambia y ya no hay broadcasts', () => {
  assert.equal(ajustarGracia({}, '/live/obs'), false);
  assert.equal(ajustarGracia(undefined, '/live/obs'), false);
});

test('devuelve false si publishGraceMs deja de ser un numero', () => {
  const contexto = { broadcasts: new Map([['/live/obs', { publishGraceMs: 'treinta' }]]) };
  assert.equal(ajustarGracia(contexto, '/live/obs'), false);
});

test('nunca lanza aunque broadcasts.get reviente', () => {
  const contexto = { broadcasts: { get() { throw new Error('cambio la API'); } } };
  assert.doesNotThrow(() => ajustarGracia(contexto, '/live/obs'));
  assert.equal(ajustarGracia(contexto, '/live/obs'), false);
});
