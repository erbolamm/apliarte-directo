import test from 'node:test';
import assert from 'node:assert/strict';
import { rutaDeSesion, nombreDeFlujo } from '../src/sesion-rtmp.js';

// node-media-server v4 emite un unico argumento `session` con `streamPath`.
// La v3 emitia (id, streamPath). Confundirlos tumbaba el servidor al publicar OBS.

test('extrae streamPath de la sesion de la v4', () => {
  assert.equal(rutaDeSesion({ streamPath: '/live/obs' }), '/live/obs');
});

test('tolera una sesion sin streamPath sin reventar', () => {
  assert.equal(rutaDeSesion({}), '');
  assert.equal(rutaDeSesion(undefined), '');
  assert.equal(rutaDeSesion(null), '');
});

test('tolera que llegue una cadena suelta, como en la v3', () => {
  assert.equal(rutaDeSesion('/live/obs'), '/live/obs');
});

test('nombreDeFlujo devuelve el ultimo segmento', () => {
  assert.equal(nombreDeFlujo('/live/obs'), 'obs');
  assert.equal(nombreDeFlujo('/live/mi-clave-larga'), 'mi-clave-larga');
});

test('nombreDeFlujo sobre una ruta vacia devuelve cadena vacia, no undefined', () => {
  assert.equal(nombreDeFlujo(''), '');
  assert.equal(nombreDeFlujo(undefined), '');
});
