import test from 'node:test';
import assert from 'node:assert/strict';
import { PAUSA_RELEVO_MS, planificarRelevo } from '../src/relevo.js';

// Defecto visto en vivo el 2026-09-11: al cortar OBS, el centro mataba el relay y arrancaba el
// respaldo en el mismo instante. El destino remoto aun tenia registrado al publicador anterior y
// rechazaba el nuevo con «already has a publisher». Hace falta un margen.

test('la pausa de relevo es mayor que cero', () => {
  assert.ok(PAUSA_RELEVO_MS > 0, 'sin pausa, el destino rechaza el respaldo');
});

test('la pausa es corta: un directo no puede esperar mucho en negro', () => {
  assert.ok(PAUSA_RELEVO_MS <= 5000, 'mas de 5s en negro es inaceptable en directo');
});

test('planificarRelevo mata primero y arranca despues', async () => {
  const orden = [];
  const plan = await planificarRelevo({
    matar: () => orden.push('matar'),
    arrancar: () => orden.push('arrancar'),
    esperar: (fn) => { orden.push('esperar'); fn(); },
  });
  assert.deepEqual(orden, ['matar', 'esperar', 'arrancar']);
  assert.equal(plan.pausaMs, PAUSA_RELEVO_MS);
});

test('si no hay nada que arrancar, no espera en balde', async () => {
  const orden = [];
  await planificarRelevo({
    matar: () => orden.push('matar'),
    arrancar: null,
    esperar: (fn) => { orden.push('esperar'); fn(); },
  });
  assert.deepEqual(orden, ['matar'], 'sin respaldo que arrancar, no hay pausa');
});

test('acepta una pausa propia', async () => {
  const plan = await planificarRelevo({
    matar: () => {}, arrancar: () => {}, esperar: (fn) => fn(), pausaMs: 1234,
  });
  assert.equal(plan.pausaMs, 1234);
});
