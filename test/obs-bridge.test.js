import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPA_CATEGORIAS_ESCENAS, obtenerConfiguracionObsLocal } from '../src/obs-bridge.js';

test('MAPA_CATEGORIAS_ESCENAS mapea todas las categorias principales a escenas de OBS', () => {
  assert.equal(MAPA_CATEGORIAS_ESCENAS.apps, 'PLANO-INTERACTIVO');
  assert.equal(MAPA_CATEGORIAS_ESCENAS.arte, 'Solo_Calca');
  assert.equal(MAPA_CATEGORIAS_ESCENAS.charlando, 'CON_CAMARA');
  assert.equal(MAPA_CATEGORIAS_ESCENAS.andando, 'CAM');
  assert.equal(MAPA_CATEGORIAS_ESCENAS.musica, 'PLANO-INTERACTIVO');
});

test('obtenerConfiguracionObsLocal devuelve un objeto con puerto y password', () => {
  const cfg = obtenerConfiguracionObsLocal();
  assert.ok(typeof cfg.puerto === 'number');
  assert.ok(typeof cfg.password === 'string');
});
