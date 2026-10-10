import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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

test('Seguimiento de cámara: avatarForCommand identifica correctamente al avatar que camina', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();

  rt.setAvatarOwners({ co: 'viewer_co', pi: 'viewer_pi' });

  // 1. Comando explícito con agente
  assert.equal(rt.avatarForCommand({ comando: 'zona', zona: 'work', agente: 'ge' }), 'ge');

  // 2. Espectador que adoptó avatar 'co'
  assert.equal(rt.avatarForCommand({ comando: 'zona', zona: 'lounge', usuario: 'viewer_co' }), 'co');

  // 3. Javier Mateo (apliarte / erbolamm / ja)
  assert.equal(rt.avatarForCommand({ comando: 'zona', zona: 'orch', usuario: 'apliarte' }), 'ja');
  assert.equal(rt.avatarForCommand({ comando: 'zona', zona: 'deliv', usuario: 'javier' }), 'ja');

  // 4. Usuario desconocido sin avatar asignado
  assert.equal(rt.avatarForCommand({ comando: 'zona', zona: 'work', usuario: 'fantasma_xyz' }), null);
});

test('Seguimiento de cámara: goToZone inicia ruta y emite evento erbolamm:track-agent', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();

  let trackedEvent = null;
  const originalWindow = globalThis.window;
  globalThis.window = {
    dispatchEvent: (ev) => {
      if (ev.type === 'erbolamm:track-agent') trackedEvent = ev.detail;
    },
  };

  try {
    const ok = rt.goToZone('ge', 'work', 1000);
    assert.equal(ok, true, 'goToZone debe retornar true para un agente válido');
    assert.ok(trackedEvent, 'Debe emitir el evento erbolamm:track-agent');
    assert.equal(trackedEvent.id, 'ge');
    assert.equal(trackedEvent.zone, 'work');

    const p = rt.people.find((person) => person.id === 'ge');
    assert.ok(p.path && p.path.length > 0, 'El avatar debe tener asignada una ruta de navegación');
    assert.equal(p.pose, 'walk', 'El avatar debe estar en pose de caminata');
  } finally {
    globalThis.window = originalWindow;
  }
});

test('Damas 3D: Tablero y coordenadas preservan 3D y tienen estilos de contraste legibles', () => {
  const css = readFileSync(new URL('../public/office-3d.css', import.meta.url), 'utf8');
  const interfaceCss = readFileSync(new URL('../oficina-3d/src/interface.css', import.meta.url), 'utf8');
  const floorPlan = readFileSync(new URL('../oficina-3d/src/components/FloorPlan.tsx', import.meta.url), 'utf8');

  // 1. transform-style: preserve-3d en .damas-board
  assert.match(css, /\.damas-board\s*\{[^}]*transform-style:\s*preserve-3d/);
  assert.match(interfaceCss, /\.damas-board\{[^}]*transform-style:preserve-3d/);

  // 2. .damas-label con elevación translateZ y text-shadow
  assert.match(css, /\.damas-label\s*\{[^}]*translateZ\(4px\)/);
  assert.match(interfaceCss, /\.damas-label\{[^}]*translateZ\(4px\)/);

  // 3. Renderizado de letras en mayúsculas en FloorPlan.tsx
  assert.match(floorPlan, /letter\.toUpperCase\(\)/);

  // 4. Clases y transiciones de cámara dinámica is-tracking
  assert.match(css, /\.volume-viewport\.is-tracking/);
  assert.match(interfaceCss, /\.volume-viewport\.is-tracking/);
  assert.match(floorPlan, /trackingAgent \? 'is-tracking' : ''/);
});
