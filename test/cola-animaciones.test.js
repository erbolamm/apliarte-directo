// test/cola-animaciones.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ColaAnimaciones, MAX_COLA_ANIMACIONES, DURACIONES_MS } from '../src/cola-animaciones.js';

test('ColaAnimaciones: dos animaciones seguidas no se solapan', () => {
  const iniciadas = [];
  const terminadas = [];
  const cola = new ColaAnimaciones({
    onIniciar: (a) => iniciadas.push(a.tipo),
    onTerminar: (a) => terminadas.push(a.tipo),
  });

  const t0 = 1000;
  // 1. Encolar bronca
  assert.equal(cola.encolar({ tipo: 'bronca', usuario: 'ja' }, t0), true);
  assert.equal(cola.getAnimacionActiva().tipo, 'bronca');
  assert.equal(iniciadas.length, 1);
  assert.equal(iniciadas[0], 'bronca');

  // 2. Encolar conga mientras la bronca sigue activa
  assert.equal(cola.encolar({ tipo: 'conga', usuario: 'ja' }, t0 + 1000), true);
  assert.equal(cola.getAnimacionActiva().tipo, 'bronca', 'La bronca sigue siendo la activa');
  assert.equal(cola.getLongitudCola(), 1, 'La conga espera en la cola');
  assert.equal(iniciadas.length, 1, 'No se ha iniciado la conga todavía');
});

test('ColaAnimaciones: la segunda animación empieza al acabar la primera', () => {
  const iniciadas = [];
  const terminadas = [];
  const cola = new ColaAnimaciones({
    duraciones: { bronca: 15_000, conga: 40_000 },
    onIniciar: (a) => iniciadas.push(a.tipo),
    onTerminar: (a) => terminadas.push(a.tipo),
  });

  const t0 = 1000;
  cola.encolar({ tipo: 'bronca', usuario: 'ja' }, t0);
  cola.encolar({ tipo: 'conga', usuario: 'ja' }, t0 + 500);

  // A t = t0 + 10_000, la bronca sigue en curso
  cola.revisar(t0 + 10_000);
  assert.equal(cola.getAnimacionActiva().tipo, 'bronca');
  assert.equal(terminadas.length, 0);

  // A t = t0 + 15_000, la bronca vence y arranca la conga
  cola.revisar(t0 + 15_000);
  assert.equal(terminadas.length, 1);
  assert.equal(terminadas[0], 'bronca');
  assert.equal(iniciadas.length, 2);
  assert.equal(iniciadas[1], 'conga');
  assert.equal(cola.getAnimacionActiva().tipo, 'conga');
  assert.equal(cola.getLongitudCola(), 0);
});

test('ColaAnimaciones: una bienvenida a mitad corta la actual y vacía la cola', () => {
  const cortadas = [];
  const iniciadas = [];
  const cola = new ColaAnimaciones({
    onIniciar: (a) => iniciadas.push(a.tipo),
    onCortar: (a) => cortadas.push(a.tipo),
  });

  const t0 = 1000;
  cola.encolar({ tipo: 'bronca', usuario: 'ja' }, t0);
  cola.encolar({ tipo: 'conga', usuario: 'ja' }, t0 + 100);
  assert.equal(cola.getLongitudCola(), 1);

  // Entra bienvenida de nuevo usuario
  const tBienvenida = t0 + 3000;
  assert.equal(cola.encolar({ tipo: 'fiesta', usuario: 'ja', esBienvenida: true }, tBienvenida), true);

  // La bronca debe haber sido cortada
  assert.equal(cortadas.length, 1);
  assert.equal(cortadas[0], 'bronca');

  // La cola debe estar vacía (la conga se descartó)
  assert.equal(cola.getLongitudCola(), 0);

  // La fiesta de bienvenida es ahora la activa
  assert.equal(cola.getAnimacionActiva().tipo, 'fiesta');
  assert.equal(cola.getAnimacionActiva().esBienvenida, true);
});

test('ColaAnimaciones: segunda bienvenida mientras la primera está activa no la corta', () => {
  const cortadas = [];
  const iniciadas = [];
  const cola = new ColaAnimaciones({
    onIniciar: (a) => iniciadas.push(a.tipo),
    onCortar: (a) => cortadas.push(a.tipo),
  });

  const t0 = 1000;
  // Primera bienvenida
  cola.encolar({ tipo: 'fiesta', usuario: 'ja', esBienvenida: true }, t0);
  assert.equal(iniciadas.length, 1);

  // Segunda bienvenida 2 segundos después
  const aceptada = cola.encolar({ tipo: 'fiesta', usuario: 'ja', esBienvenida: true }, t0 + 2000);
  assert.equal(aceptada, false, 'No corta la fiesta de bienvenida en curso');
  assert.equal(cortadas.length, 0, 'No hubo corte de fiesta activa');
  assert.equal(cola.getAnimacionActiva().iniciadaEn, t0, 'Mantiene la fiesta original');
});

test('ColaAnimaciones: cola llena descarta y deja aviso', () => {
  const cola = new ColaAnimaciones({ maxCola: 2 });
  const t0 = 1000;

  // 1 activa
  assert.equal(cola.encolar({ tipo: 'fiesta' }, t0), true);
  // 2 en cola (máximo permitido)
  assert.equal(cola.encolar({ tipo: 'bronca' }, t0), true);
  assert.equal(cola.encolar({ tipo: 'conga' }, t0), true);
  assert.equal(cola.getLongitudCola(), 2);

  // Intentar una tercera en cola -> debe descartar
  assert.equal(cola.encolar({ tipo: 'bronca' }, t0), false);
  assert.equal(cola.getLongitudCola(), 2);
});
