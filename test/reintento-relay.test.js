import test from 'node:test';
import assert from 'node:assert/strict';
import { ESPERAS_REINTENTO_MS, ESTABLE_MS, ReintentosRelay, puedeReintentar } from '../src/reintento-relay.js';
import { GRACIA_POR_DEFECTO_MS } from '../src/gracia.js';

// Defecto visto en vivo el 2026-09-19: un relay que caía a mitad del directo no se volvía a
// lanzar (`procesoFallo` solo anotaba el error) y esa plataforma se quedaba sin señal hasta
// reiniciar OBS.

test('la primera espera supera la gracia: un corte de OBS no se confunde con un relay caído', () => {
  assert.ok(ESPERAS_REINTENTO_MS[0] > GRACIA_POR_DEFECTO_MS);
});

test('las esperas crecen y se quedan en la última', () => {
  const r = new ReintentosRelay({ ahora: () => 0 });
  const vistas = Array.from({ length: ESPERAS_REINTENTO_MS.length + 2 }, () => r.siguienteEspera('youtube'));
  assert.deepEqual(vistas.slice(0, ESPERAS_REINTENTO_MS.length), ESPERAS_REINTENTO_MS);
  assert.equal(vistas.at(-1), ESPERAS_REINTENTO_MS.at(-1));
});

test('cada destino lleva su propia cuenta', () => {
  const r = new ReintentosRelay({ ahora: () => 0 });
  r.siguienteEspera('youtube');
  r.siguienteEspera('youtube');
  assert.equal(r.siguienteEspera('kick'), ESPERAS_REINTENTO_MS[0]);
});

test('un relay que aguantó estable reinicia la cuenta', () => {
  let t = 0;
  const r = new ReintentosRelay({ ahora: () => t });
  r.siguienteEspera('youtube');
  r.siguienteEspera('youtube');
  r.arrancado('youtube');
  t += ESTABLE_MS;
  assert.equal(r.siguienteEspera('youtube'), ESPERAS_REINTENTO_MS[0]);
});

test('un relay que cae enseguida sigue subiendo la espera', () => {
  let t = 0;
  const r = new ReintentosRelay({ ahora: () => t });
  r.siguienteEspera('youtube');
  r.arrancado('youtube');
  t += 1000;
  assert.equal(r.siguienteEspera('youtube'), ESPERAS_REINTENTO_MS[1]);
});

test('olvidarTodo vuelve a empezar (nueva sesión de OBS)', () => {
  const r = new ReintentosRelay({ ahora: () => 0 });
  r.siguienteEspera('youtube');
  r.siguienteEspera('youtube');
  r.olvidarTodo();
  assert.equal(r.siguienteEspera('youtube'), ESPERAS_REINTENTO_MS[0]);
});

const base = { obsActivo: true, manual: false, mismaSesion: true, cerrando: false, yaActivo: false };

test('reintenta si OBS sigue publicando en la misma sesión', () => {
  assert.equal(puedeReintentar(base), true);
});

for (const [campo, valor, por] of [
  ['obsActivo', false, 'OBS ya no publica: le toca al respaldo'],
  ['manual', true, 'hay un vídeo manual en antena'],
  ['mismaSesion', false, 'la entrada cambió mientras esperaba'],
  ['cerrando', true, 'el servidor se está cerrando'],
  ['yaActivo', true, 'el destino ya volvió por otra vía'],
]) {
  test(`no reintenta si ${por}`, () => {
    assert.equal(puedeReintentar({ ...base, [campo]: valor }), false);
  });
}
