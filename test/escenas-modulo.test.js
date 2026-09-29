import test from 'node:test';
import assert from 'node:assert/strict';
import { ESCENAS, CATEGORIAS_DE_ESCENA, ESCENA_POR_DEFECTO, esEscenaValida, paletaDeEscena } from '../src/escenas.js';

// Este módulo lee directo/config/escenas.json (paso 2). No duplica sus valores;
// solo comprueba que la carga y las funciones puras se comportan bien.

test('carga las 5 escenas de escenas.json', () => {
  assert.deepEqual(Object.keys(ESCENAS).sort(), ['espera', 'final', 'hablando', 'inicio', 'trabajando']);
});

test('esEscenaValida acepta las 5 y rechaza el resto', () => {
  for (const nombre of Object.keys(ESCENAS)) {
    assert.equal(esEscenaValida(nombre), true, nombre);
  }
  assert.equal(esEscenaValida('cine'), false);
  assert.equal(esEscenaValida(''), false);
  assert.equal(esEscenaValida(undefined), false);
});

test('la escena por defecto es una escena valida', () => {
  assert.equal(esEscenaValida(ESCENA_POR_DEFECTO), true);
});

test('paletaDeEscena devuelve la paleta hexadecimal de una categoria real', () => {
  const paleta = paletaDeEscena('inicio', 'musica');
  assert.deepEqual(Object.keys(paleta).sort(), ['oscuro', 'primario', 'secundario']);
  assert.equal(paleta.primario, '#ff1493');
});

test('paletaDeEscena devuelve la paleta de "andando" con los colores oficiales de ApliArte', () => {
  for (const nombre of Object.keys(ESCENAS)) {
    const paleta = paletaDeEscena(nombre, 'andando');
    assert.equal(paleta.primario, '#00e676', nombre);
    assert.equal(paleta.secundario, '#00c853', nombre);
    assert.equal(paleta.oscuro, '#0a3d1c', nombre);
  }
});

test('paletaDeEscena rechaza una escena desconocida', () => {
  assert.throws(() => paletaDeEscena('cine', 'apps'), /escena desconocida/i);
});

test('paletaDeEscena rechaza una categoria desconocida en vez de devolver algo a medias', () => {
  assert.throws(() => paletaDeEscena('inicio', 'cine'), /categoría desconocida/i);
});

test('CATEGORIAS_DE_ESCENA incluye "andando"', () => {
  assert.ok(CATEGORIAS_DE_ESCENA.includes('andando'));
});
