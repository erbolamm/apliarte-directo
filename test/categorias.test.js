import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIAS, esCategoriaValida, paletaDe, CATEGORIA_POR_DEFECTO } from '../src/categorias.js';

// Colores verificados contra fuente real el 2026-09-11, no inventados:
// - arte (Calca): color carne #f5cba7 y marrón oscuro #3e2723 (Javier, 2026-09-19).
// - musica: rosa fuerte #ff1493, rosa #e91e63 y fondo #260519 (Javier, 2026-09-19).
// - apps (ApliArte): azul claro #5ecef5 y azul oscuro #00467b, Kit de Marca (Javier, 2026-09-19).
// - andando (modo paseo): verdes #00e676/#00c853, fondo #0a3d1c (Javier, 2026-09-19).

test('hay exactamente cinco categorias: andando, apps, arte, charlando y musica', () => {
  assert.deepEqual(Object.keys(CATEGORIAS).sort(), ['andando', 'apps', 'arte', 'charlando', 'musica']);
});

test('arte usa color carne y marrón oscuro', () => {
  assert.equal(CATEGORIAS.arte.primario, '#f5cba7');
  assert.equal(CATEGORIAS.arte.secundario, '#3e2723');
  // Fondo de la misma familia (marrón muy oscuro), como el resto de
  // categorías; antes heredaba el azul noche #0f0c29.
  assert.equal(CATEGORIAS.arte.oscuro, '#1a0f0b');
});

test('musica armoniza tonos de rosa fuerte', () => {
  assert.equal(CATEGORIAS.musica.primario, '#ff1493');
  assert.equal(CATEGORIAS.musica.secundario, '#e91e63');
  assert.equal(CATEGORIAS.musica.oscuro, '#260519');
});

test('apps usa los azules del Kit de Marca ApliArte', () => {
  assert.equal(CATEGORIAS.apps.primario, '#5ecef5');
  assert.equal(CATEGORIAS.apps.secundario, '#00467b');
});

test('andando es verde: claro, intenso y fondo oscuro', () => {
  assert.equal(CATEGORIAS.andando.primario, '#00e676');
  assert.equal(CATEGORIAS.andando.secundario, '#00c853');
  assert.equal(CATEGORIAS.andando.oscuro, '#0a3d1c');
});

test('charlando usa tonos cálidos del Kit de Marca ApliArte', () => {
  assert.equal(CATEGORIAS.charlando.primario, '#e8955e');
  assert.equal(CATEGORIAS.charlando.secundario, '#b46734');
  assert.equal(CATEGORIAS.charlando.oscuro, '#1c1208');
});

test('cada categoria declara un fondo oscuro propio', () => {
  for (const nombre of Object.keys(CATEGORIAS)) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(CATEGORIAS[nombre].oscuro), nombre);
  }
});

test('esCategoriaValida acepta las cinco y rechaza el resto', () => {
  assert.equal(esCategoriaValida('arte'), true);
  assert.equal(esCategoriaValida('musica'), true);
  assert.equal(esCategoriaValida('apps'), true);
  assert.equal(esCategoriaValida('andando'), true);
  assert.equal(esCategoriaValida('charlando'), true);
  assert.equal(esCategoriaValida('cine'), false);
  assert.equal(esCategoriaValida(''), false);
  assert.equal(esCategoriaValida(undefined), false);
});

test('paletaDe devuelve la paleta completa de una categoria valida', () => {
  const p = paletaDe('musica');
  assert.deepEqual(Object.keys(p).sort(), ['oscuro', 'primario', 'secundario']);
});

test('paletaDe rechaza una categoria desconocida en vez de devolver algo a medias', () => {
  assert.throws(() => paletaDe('cine'), /categoría desconocida/i);
});

test('la categoria por defecto es una de las tres, y es apps', () => {
  assert.equal(CATEGORIA_POR_DEFECTO, 'apps');
  assert.equal(esCategoriaValida(CATEGORIA_POR_DEFECTO), true);
});
