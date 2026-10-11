// test/avatar-paseo-autonomo.test.mjs
// Verifica el sistema de paseo aleatorio autónomo de avatares libres por la oficina 3D:
// 1. Catálogo de puntos seguros WANDER_SPOTS y propiedades iniciales.
// 2. Activación de paseo (triggerWander y applyCommand !paseo).
// 3. Ciclo de paseo en tick: caminar al punto -> esperar con pose contextual -> volver al lounge.
// 4. Cancelación inmediata ante tareas de trabajo o minijuegos prioritarios.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require(fileURLToPath(new URL('../oficina-3d/node_modules/esbuild', import.meta.url)));

async function loadRuntime() {
  const out = await esbuild.build({
    entryPoints: [fileURLToPath(new URL('../oficina-3d/src/office/runtime.ts', import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
  });
  const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
  return { OfficeRuntime: mod.OfficeRuntime, WANDER_SPOTS: mod.WANDER_SPOTS };
}

test('Wander: WANDER_SPOTS contiene zonas seguras de la oficina 3D', async () => {
  const { WANDER_SPOTS } = await loadRuntime();
  assert.ok(Array.isArray(WANDER_SPOTS), 'WANDER_SPOTS debe ser un array');
  assert.ok(WANDER_SPOTS.length >= 8, 'Debe tener al menos 8 puntos de paseo');

  for (const item of WANDER_SPOTS) {
    assert.ok(item.spot && typeof item.spot.x === 'number' && typeof item.spot.y === 'number');
    assert.ok(item.spot.x > 0 && item.spot.x < 1280, 'Coordenada X debe estar dentro de la oficina');
    assert.ok(item.spot.y > 0 && item.spot.y < 860, 'Coordenada Y debe estar dentro de la oficina');
    assert.ok(typeof item.desc === 'string' && item.desc.length > 0);
    assert.ok(typeof item.pose === 'string' && item.pose.length > 0);
  }
});

test('Wander: triggerWander inicia paseo en un avatar libre y no en Javier', async () => {
  const { OfficeRuntime } = await loadRuntime();
  const rt = new OfficeRuntime();

  // Javier ('ja') no debe pasear
  const resJa = rt.triggerWander('ja');
  assert.equal(resJa, false, 'Javier nunca debe entrar en paseo autónomo');

  // Avatar libre 'cl' inicia paseo
  const resCl = rt.triggerWander('cl', 0); // spot 0 = cafetería
  assert.equal(resCl, true, 'Avatar libre cl debe poder iniciar paseo');

  const w = rt.getWander('cl');
  assert.ok(w, 'Debe existir estado de paseo para cl');
  assert.equal(w.phase, 'walking_to');
  assert.equal(w.desc, 'cafetería');
  assert.equal(w.waitPose, 'coffee');

  const personCl = rt.people.find(p => p.id === 'cl');
  assert.ok(personCl);
  assert.match(personCl.status, /Paseando/);
});

test('Wander: applyCommand !paseo dispara paseo autónomo', async () => {
  const { OfficeRuntime } = await loadRuntime();
  const rt = new OfficeRuntime();

  const ok = rt.applyCommand({ comando: 'paseo', agente: 'ge' }, 1000);
  assert.equal(ok, true);

  const w = rt.getWander('ge');
  assert.ok(w);
  assert.equal(w.phase, 'walking_to');
});

test('Wander: ciclo completo de paseo (ir -> esperar con pose -> volver)', async () => {
  const { OfficeRuntime } = await loadRuntime();
  const rt = new OfficeRuntime();
  rt.update({ valid: true, states: { 'por-hacer': [], haciendo: [], hecho: [] } }, 1000);

  rt.triggerWander('co', 0); // cafetería: { x: 96, y: 320 }, pose: 'coffee'
  const p = rt.people.find(x => x.id === 'co');
  assert.ok(p);

  // 1. Simulamos llegada a destino
  p.pos = { x: 96, y: 320 };
  p.path = null;

  // Tick cuando llega
  rt.tick(2000, 0.1);
  const w1 = rt.getWander('co');
  assert.equal(w1.phase, 'waiting', 'Al llegar al punto debe pasar a fase waiting');
  assert.equal(p.pose, 'coffee', 'Debe adoptar la pose contextual del punto (coffee)');
  assert.match(p.status, /Paseando · cafetería/);

  // 2. Espera durante waitEnd
  rt.tick(w1.waitEnd - 100, 0.1);
  assert.equal(rt.getWander('co').phase, 'waiting');

  // 3. Termina la espera: inicia regreso al lounge
  rt.tick(w1.waitEnd + 100, 0.1);
  const w2 = rt.getWander('co');
  assert.equal(w2.phase, 'walking_home', 'Al vencer el tiempo de espera debe pasar a walking_home');
  assert.match(p.status, /Volviendo al lounge/);

  // 4. Llega de vuelta a su posición de inicio en el lounge
  const home = rt.homeTarget('co');
  p.pos = { ...home };
  p.path = null;

  rt.tick(w1.waitEnd + 5000, 0.1);
  const w3 = rt.getWander('co');
  assert.equal(w3.phase, 'idle', 'Al llegar a casa debe quedar en fase idle programando el siguiente paseo');
  assert.equal(p.status, 'Descansando');
});

test('Wander: se cancela inmediatamente si el agente recibe una tarea en haciendo', async () => {
  const { OfficeRuntime } = await loadRuntime();
  const rt = new OfficeRuntime();

  rt.triggerWander('cl', 0);
  assert.equal(rt.getWander('cl').phase, 'walking_to');

  // Llega tarea a cl en haciendo
  rt.update({
    valid: true,
    states: {
      'por-hacer': [],
      haciendo: [{ role: 'cl', project: 'test', title: 'Tarea urgente', fileName: 'test.md', priority: 'alta' }],
      hecho: []
    }
  }, 3000);

  const w = rt.getWander('cl');
  assert.equal(w.phase, 'idle', 'El paseo debe cancelarse inmediatamente al tener tarea asignada');

  const p = rt.people.find(x => x.id === 'cl');
  assert.equal(p.status, 'Trabajando');
});

test('Wander: minijuegos (fiesta, conga, bronca) tienen prioridad total y anulan paseos', async () => {
  const { OfficeRuntime } = await loadRuntime();
  const rt = new OfficeRuntime();

  // 1. Iniciar paseo en 'ge'
  rt.triggerWander('ge', 0);
  assert.equal(rt.getWander('ge').phase, 'walking_to');

  // 2. Arrancar fiesta
  rt.fiesta(4000);
  assert.equal(rt.fiestaState.phase, 'party');

  // En el siguiente tick, el paseo debe haberse cancelado y el avatar pasa a 'De fiesta'
  rt.tick(4100, 0.1);
  const w = rt.getWander('ge');
  assert.equal(w.phase, 'idle', 'El paseo debe cancelarse al iniciar la fiesta');
  const p = rt.people.find(x => x.id === 'ge');
  assert.equal(p.status, 'De fiesta', 'El avatar debe estar participando en la fiesta');
});
