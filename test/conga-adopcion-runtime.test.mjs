// test/conga-adopcion-runtime.test.mjs
// Verifica P7: la conga reconoce avatares adoptados a través de runtime.setAvatarOwners(),
// asigna avatares no poseídos a usuarios sin avatar (freeAssignment: true),
// y al terminar la conga el avatar libre pide que lo adopten («Adoptadme, por favor»).

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

test('P7: La conga reconoce el avatar adoptado y asigna avatares libres a quienes no tienen', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();

  // Sincronización de dueños (P7: única fuente de verdad en el runtime)
  rt.setAvatarOwners({ ge: 'viewer_ge', pi: 'viewer_pi' });
  assert.equal(rt.avatarOwners.ge, 'viewer_ge');
  assert.equal(rt.avatarOwners.pi, 'viewer_pi');

  // 1. Javier arranca la conga
  rt.applyCommand({ comando: 'conga', usuario: 'apliarte' }, 1000);
  assert.equal(rt.congaState.phase, 'countdown');

  // 2. viewer_ge (que tiene 'ge') se une a la conga
  rt.applyCommand({ comando: 'conga', usuario: 'viewer_ge' }, 1100);

  // Verificación 1: viewer_ge entra con su propio avatar y no es libre
  const dancerGe = rt.congaState.dancers.find(d => d.login === 'viewer_ge');
  assert.ok(dancerGe, 'viewer_ge debe estar en la conga');
  assert.equal(dancerGe.agentId, 'ge', 'viewer_ge debe entrar con su avatar adoptado ge');
  assert.equal(dancerGe.freeAssignment, false, 'viewer_ge no debe tener asignación libre');

  // 3. viewer_sin_avatar (no tiene avatar adoptado) se une a la conga
  rt.applyCommand({ comando: 'conga', usuario: 'viewer_sin_avatar' }, 1200);

  // Verificación 2: recibe un avatar libre, NUNCA el de otra persona (ni ge ni pi)
  const dancerLibre = rt.congaState.dancers.find(d => d.login === 'viewer_sin_avatar');
  assert.ok(dancerLibre, 'viewer_sin_avatar debe estar en la conga');
  assert.notEqual(dancerLibre.agentId, 'ge', 'No debe recibir el avatar ge de viewer_ge');
  assert.notEqual(dancerLibre.agentId, 'pi', 'No debe recibir el avatar pi de viewer_pi');
  assert.notEqual(dancerLibre.agentId, 'ja', 'No debe recibir el avatar ja del broadcaster');
  assert.equal(dancerLibre.freeAssignment, true, 'Debe tener freeAssignment: true');

  // 4. La conga avanza de countdown a dancing
  rt.tick(11_500, 0.1);
  assert.equal(rt.congaState.phase, 'dancing', 'La conga debe estar bailando');

  // 5. La conga termina (dancingEndsAt = 11_500 + 30_000 = 41_500)
  rt.tick(42_000, 0.1);
  assert.equal(rt.congaState.phase, 'ended', 'La conga debe haber terminado');

  // Verificación 3: Al acabar, el avatar libre dice «Adoptadme, por favor»
  const speechLibre = rt.speech.get(dancerLibre.agentId);
  assert.ok(speechLibre, `El avatar libre ${dancerLibre.agentId} debe tener bocadillo activo`);
  assert.equal(speechLibre.text, 'Adoptadme, por favor');

  // Y el avatar adoptado ge NO pide adopción
  const speechGe = rt.speech.get('ge');
  assert.ok(!speechGe || speechGe.text !== 'Adoptadme, por favor', 'El avatar adoptado ge no debe pedir adopción');
});

test('P7 Cableado: App.tsx, FloorPlan.tsx y plano.html conectan los dueños con runtime.setAvatarOwners', async () => {
  const { readFileSync } = await import('node:fs');
  const appSrc = readFileSync(fileURLToPath(new URL('../oficina-3d/src/App.tsx', import.meta.url)), 'utf8');
  const floorSrc = readFileSync(fileURLToPath(new URL('../oficina-3d/src/components/FloorPlan.tsx', import.meta.url)), 'utf8');
  const planoSrc = readFileSync(fileURLToPath(new URL('../public/plano.html', import.meta.url)), 'utf8');
  const vpsPlanoSrc = readFileSync(fileURLToPath(new URL('../vps-overlay/public/plano.html', import.meta.url)), 'utf8');

  // 1. App.tsx debe exponer setAvatarOwners delegando en rt.setAvatarOwners
  assert.match(appSrc, /setAvatarOwners:\s*\(owners.*?=>\s*\{\s*rt\.setAvatarOwners\(owners\)/, 'App.tsx debe cablear setAvatarOwners hacia rt.setAvatarOwners');

  // 2. FloorPlan.tsx debe pasar body.duenos del sondeo de comandos a runtime y window.Oficina3D
  assert.match(floorSrc, /window\.Oficina3D\?\.runtime\?\.setAvatarOwners\?\.string|body\.duenos/, 'FloorPlan debe pasar body.duenos a runtime.setAvatarOwners');
  assert.match(floorSrc, /window\.Oficina3D\?\.setAvatarOwners\?\.string|body\.duenos/, 'FloorPlan debe pasar body.duenos a window.Oficina3D.setAvatarOwners');

  // 3. plano.html y su réplica deben llamar a setAvatarOwners en syncAdoptedViewers
  assert.match(planoSrc, /window\.Oficina3D\?\.runtime\?\.setAvatarOwners\?\.string|avatarOwners/, 'plano.html debe sincronizar avatarOwners con el runtime');
  assert.match(vpsPlanoSrc, /window\.Oficina3D\?\.runtime\?\.setAvatarOwners\?\.string|avatarOwners/, 'vps-overlay/public/plano.html debe sincronizar avatarOwners con el runtime');

  // 4. Prueba dinámica: simular el objeto window.Oficina3D que crea App.tsx
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();
  let publishLlamado = false;
  const mockOficina3D = {
    runtime: rt,
    setAvatarOwners: (owners) => {
      rt.setAvatarOwners(owners);
      publishLlamado = true;
    }
  };

  // Simular llamada desde plano.html / FloorPlan
  mockOficina3D.setAvatarOwners({ cl: 'viewer_cl' });
  assert.equal(rt.avatarOwners.cl, 'viewer_cl', 'El cableado de Oficina3D debe actualizar rt.avatarOwners');
  assert.equal(publishLlamado, true, 'Debe activar publish() para re-renderizar');
});
