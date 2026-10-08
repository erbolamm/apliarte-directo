// test/bronca-fiesta-interrupcion.test.mjs
// Reproduce el fallo de P5: al entrar una fiesta en mitad de la bronca,
// los avatares dejan de pelear y pasan a bailar fiesta, solapándose ambas.

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

test('P5 resuelto: fiesta lanzada durante una bronca cancela limpiamente la bronca sin solaparse', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();

  // 1. Iniciar bronca a t = 1000 ms
  rt.bronca(1000);
  rt.tick(1100, 0.1);

  assert.equal(rt.isBroncaActive(), true, 'La bronca debe estar activa');
  const ja = rt.people.find((p) => p.id === 'ja');
  assert.equal(ja.status, 'En la bronca', 'El avatar ja debe tener status de bronca');
  assert.equal(ja.pose, 'brawl', 'El avatar ja debe tener pose de pelea');

  // 2. A mitad de la bronca (t = 2000 ms), entra una fiesta (ej. por bienvenida de nuevo espectador)
  rt.fiesta(2000);
  rt.tick(2100, 0.1);

  // 3. Verificación de exclusividad: la fiesta está activa y la bronca se canceló limpiamente sin solaparse
  assert.equal(rt.isFiestaActive(), true, 'La fiesta está activa');
  assert.equal(rt.isBroncaActive(), false, 'La bronca se canceló limpiamente sin solaparse');

  // El avatar ha cambiado limpiamente a "De fiesta":
  assert.equal(ja.status, 'De fiesta', 'El avatar pasa a estado de fiesta');
});

test('P5 resuelto: avatar en bronca no se queda congelado y se mueve continuamente', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();
  rt.bronca(1000);

  let prevPos = null;
  let stillMs = 0;
  let movingMs = 0;

  for (let t = 1000; t <= 3000; t += 50) {
    rt.tick(t, 0.05);
    const ja = rt.people.find((p) => p.id === 'ja');
    if (prevPos) {
      const dist = Math.hypot(ja.pos.x - prevPos.x, ja.pos.y - prevPos.y);
      if (dist > 0.1) movingMs += 50;
      else stillMs += 50;
    }
    prevPos = { ...ja.pos };
  }

  // Comprueba que no hay pausas de 1s: el movimiento es continuo
  assert.ok(movingMs >= 1900, `El avatar se mueve de forma continua (${movingMs} ms)`);
  assert.ok(stillMs <= 100, `El avatar no permanece congelado (tiempo quieto: ${stillMs} ms)`);
});
