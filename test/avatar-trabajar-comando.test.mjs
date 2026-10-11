// test/avatar-trabajar-comando.test.mjs
// Verifica el comportamiento del comando !trabajar:
// 1. Avatares con mesa ocupan su mesa y se ponen de espaldas (isRear = true, pose = 'work').
// 2. Avatares sin mesa se dispersan aleatoriamente en diferentes cuartos (orch, lounge, deliv).
// 3. Cancelación por fiesta, bronca o expiración.

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
  return mod.OfficeRuntime;
}

test('Comando trabajar activa asignaciones de mesas y cuartos', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();

  assert.equal(rt.isTrabajoActive(), false, 'Al inicio trabajo debe estar inactivo');

  const now = 1000;
  rt.trabajar(now, 'ja');

  assert.equal(rt.isTrabajoActive(), true, 'Trabajo debe estar activo tras llamar a trabajar()');

  const deskAgents = ['co', 'cl', 'ge', 'gr', 'op', 'ex', 'ja'];
  for (const id of deskAgents) {
    const assignment = rt.getTrabajoAssignment(id);
    assert.ok(assignment, `El agente con mesa ${id} debe tener asignación de trabajo`);
    assert.equal(assignment.hasDesk, true, `El agente ${id} debe tener hasDesk = true`);
    assert.ok(typeof assignment.spot.x === 'number' && typeof assignment.spot.y === 'number');
  }

  const desklessAgents = ['pi', 'om', 'be'];
  const usedSpots = new Set();
  for (const id of desklessAgents) {
    const assignment = rt.getTrabajoAssignment(id);
    assert.ok(assignment, `El agente sin mesa ${id} debe tener asignación`);
    assert.equal(assignment.hasDesk, false, `El agente sin mesa ${id} debe tener hasDesk = false`);
    const key = `${assignment.spot.x},${assignment.spot.y}`;
    assert.ok(!usedSpots.has(key), `El spot de cuarto para ${id} no debe solaparse`);
    usedSpots.add(key);
  }
});

test('Avatares con mesa se ponen de espaldas y pose work al llegar a su mesa', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();

  const now = 5000;
  rt.trabajar(now, 'ja');

  // Colocar a un agente de mesa directamente en su mesa simulando su llegada
  const co = rt.people.find((p) => p.id === 'co');
  assert.ok(co, 'co debe existir');
  const assignment = rt.getTrabajoAssignment('co');
  assert.ok(assignment);

  // Forzar posición en su mesa y sin path pendiente (llegado)
  co.pos = { ...assignment.spot };
  co.target = { ...assignment.spot };
  co.path = null;

  rt.tick(now + 100, 0.1);

  assert.equal(co.pose, 'work', 'co debe tener pose work en su mesa');
  assert.equal(co.isRear, true, 'co debe estar de espaldas (isRear = true) trabajando');
});

test('Avatares sin mesa adoptan pose contextual y no rear en sus cuartos', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();

  const now = 5000;
  rt.trabajar(now, 'ja');

  const pi = rt.people.find((p) => p.id === 'pi');
  assert.ok(pi, 'pi debe existir');
  const assignment = rt.getTrabajoAssignment('pi');
  assert.ok(assignment);

  // Forzar llegada a su spot de cuarto
  pi.pos = { ...assignment.spot };
  pi.target = { ...assignment.spot };
  pi.path = null;

  rt.tick(now + 100, 0.1);

  assert.equal(pi.isRear, false, 'pi no debe estar de espaldas en su cuarto');
  assert.equal(pi.pose, assignment.pose, 'pi debe adoptar la pose contextual asignada al puesto');
});

test('Fiesta o bronca cancelan el modo trabajo y resetean poses', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();

  rt.trabajar(1000, 'ja');
  assert.equal(rt.isTrabajoActive(), true);

  // Fiesta interrumpe trabajo
  rt.fiesta(2000);
  assert.equal(rt.isTrabajoActive(), false, 'Fiesta debe cancelar el modo trabajo');

  // Reactivar trabajo
  rt.trabajar(3000, 'ja');
  assert.equal(rt.isTrabajoActive(), true);

  // Bronca interrumpe trabajo
  rt.bronca(4000);
  assert.equal(rt.isTrabajoActive(), false, 'Bronca debe cancelar el modo trabajo');
});

test('Modo trabajo expira automáticamente tras su duración', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();

  const start = 1000;
  rt.trabajar(start, 'ja');
  assert.equal(rt.isTrabajoActive(), true);

  // Avanzar tiempo más allá de 60s
  rt.tick(start + 65_000, 1.0);
  assert.equal(rt.isTrabajoActive(), false, 'El modo trabajo debe expirar tras TRABAJO_DURATION_MS');
});
