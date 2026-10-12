// test/fiesta-bronca-audio.test.mjs
// Verificaciones automatizadas para el controlador de audio y recursos de !fiesta y !bronca.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

test('los archivos de audio fiesta.mp3, bronca.mp3 y trabajo.mp3 existen en public y vps-overlay', () => {
  const pFiesta = join(root, 'public', 'sonidos', 'fiesta.mp3');
  const pBronca = join(root, 'public', 'sonidos', 'bronca.mp3');
  const pTrabajo = join(root, 'public', 'sonidos', 'trabajo.mp3');
  const vFiesta = join(root, 'vps-overlay', 'public', 'sonidos', 'fiesta.mp3');
  const vBronca = join(root, 'vps-overlay', 'public', 'sonidos', 'bronca.mp3');
  const vTrabajo = join(root, 'vps-overlay', 'public', 'sonidos', 'trabajo.mp3');

  assert.ok(existsSync(pFiesta), 'public/sonidos/fiesta.mp3 debe existir');
  assert.ok(existsSync(pBronca), 'public/sonidos/bronca.mp3 debe existir');
  assert.ok(existsSync(pTrabajo), 'public/sonidos/trabajo.mp3 debe existir');
  assert.ok(existsSync(vFiesta), 'vps-overlay/public/sonidos/fiesta.mp3 debe existir');
  assert.ok(existsSync(vBronca), 'vps-overlay/public/sonidos/bronca.mp3 debe existir');
  assert.ok(existsSync(vTrabajo), 'vps-overlay/public/sonidos/trabajo.mp3 debe existir');

  // Comprobar que no son archivos vacíos (deben tener un tamaño razonable para audio mp3)
  assert.ok(statSync(pFiesta).size > 100_000, 'fiesta.mp3 debe contener datos de audio');
  assert.ok(statSync(pBronca).size > 100_000, 'bronca.mp3 debe contener datos de audio');
  assert.ok(statSync(pTrabajo).size > 100_000, 'trabajo.mp3 debe contener datos de audio');
});

test('fiesta-bronca-audio.js está sincronizado en public y vps-overlay', () => {
  const src = readFileSync(join(root, 'public', 'js', 'fiesta-bronca-audio.js'), 'utf8');
  const vps = readFileSync(join(root, 'vps-overlay', 'public', 'js', 'fiesta-bronca-audio.js'), 'utf8');
  assert.equal(src, vps, 'fiesta-bronca-audio.js debe ser idéntico en public y vps-overlay');
});

test('plano.html, index.html y demo.html incluyen la carga de fiesta-bronca-audio.js', () => {
  const targets = [
    join(root, 'public', 'plano.html'),
    join(root, 'vps-overlay', 'public', 'plano.html'),
    join(root, 'public', 'index.html'),
    join(root, 'vps-overlay', 'public', 'index.html'),
    join(root, 'public', 'demo.html'),
    join(root, 'vps-overlay', 'public', 'demo.html'),
  ];

  for (const t of targets) {
    const content = readFileSync(t, 'utf8');
    assert.match(content, /fiesta-bronca-audio\.js/, `${t} debe incluir fiesta-bronca-audio.js`);
  }
});

test('controlador de audio: arranque, parada, conmutación limpia y exclusión mutua', async () => {
  const scriptContent = readFileSync(join(root, 'public', 'js', 'fiesta-bronca-audio.js'), 'utf8');

  // Creamos un mock de Audio y de entorno DOM
  class MockAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.currentTime = 0;
      this.preload = 'none';
      this.isPlaying = false;
      this.playCalls = 0;
      this.pauseCalls = 0;
    }
    play() {
      this.isPlaying = true;
      this.playCalls++;
      return Promise.resolve();
    }
    pause() {
      this.isPlaying = false;
      this.pauseCalls++;
    }
  }

  const eventListeners = new Map();
  const mockWindow = {
    Audio: MockAudio,
    addEventListener(name, fn) {
      if (!eventListeners.has(name)) eventListeners.set(name, []);
      eventListeners.get(name).push(fn);
    },
    removeEventListener(name, fn) {
      const arr = eventListeners.get(name) || [];
      eventListeners.set(name, arr.filter(f => f !== fn));
    },
    dispatchEvent(event) {
      const arr = eventListeners.get(event.type) || [];
      for (const fn of arr) fn(event);
    },
    Oficina3D: {
      runtime: {
        fiestaState: { phase: 'idle' },
        broncaState: { phase: 'idle' },
        congaState: { phase: 'idle' },
        trabajoState: { phase: 'idle' },
      },
    },
    console: {
      warn: () => {},
      log: () => {},
    },
  };

  const sandbox = {
    window: mockWindow,
    Audio: MockAudio,
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id),
    console: mockWindow.console,
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptContent, sandbox);

  const ctrl = sandbox.window.FiestaBroncaAudio;
  assert.ok(ctrl, 'FiestaBroncaAudio debe estar expuesto en window');

  // 1. Estado inicial
  let status = ctrl.getStatus();
  assert.equal(status.fiestaPlaying, false);
  assert.equal(status.broncaPlaying, false);
  assert.equal(status.trabajoPlaying, false);
  assert.equal(status.muted, false);

  // 2. Iniciar fiesta
  ctrl.playFiesta();
  status = ctrl.getStatus();
  assert.equal(status.fiestaPlaying, true);
  assert.equal(status.broncaPlaying, false);
  assert.equal(status.trabajoPlaying, false);
  assert.ok(status.audioFiesta.playCalls >= 1);

  // 3. Conmutación mutua: Si empieza la bronca, apaga la fiesta de inmediato
  ctrl.playBronca();
  status = ctrl.getStatus();
  assert.equal(status.fiestaPlaying, false);
  assert.equal(status.broncaPlaying, true);
  assert.equal(status.trabajoPlaying, false);
  assert.ok(status.audioFiesta.pauseCalls >= 1);
  assert.ok(status.audioBronca.playCalls >= 1);

  // 4. Conmutación mutua: Iniciar trabajo apaga la bronca
  ctrl.playTrabajo();
  status = ctrl.getStatus();
  assert.equal(status.broncaPlaying, false);
  assert.equal(status.trabajoPlaying, true);
  assert.ok(status.audioBronca.pauseCalls >= 1);
  assert.ok(status.audioTrabajo.playCalls >= 1);

  // 5. Parada de trabajo
  ctrl.stopTrabajo(true);
  status = ctrl.getStatus();
  assert.equal(status.trabajoPlaying, false);
  assert.ok(status.audioTrabajo.pauseCalls >= 1);

  // 6. Control de volumen y mute
  ctrl.setVolume(0.5);
  status = ctrl.getStatus();
  assert.equal(status.baseVolume, 0.5);

  ctrl.setMuted(true);
  status = ctrl.getStatus();
  assert.equal(status.muted, true);
  assert.equal(status.audioFiesta.volume, 0);
  assert.equal(status.audioBronca.volume, 0);
  assert.equal(status.audioTrabajo.volume, 0);

  ctrl.setMuted(false);
  assert.equal(status.audioFiesta.volume, 0.5);
  assert.equal(status.audioTrabajo.volume, 0.5);

  // 7. Detección automática por ciclo de polling con conga activa
  ctrl.playTrabajo();
  assert.equal(ctrl.getStatus().trabajoPlaying, true);

  // Conga empieza a bailar -> debe detener trabajo
  sandbox.window.Oficina3D.runtime.congaState.phase = 'dancing';
  await new Promise(r => setTimeout(r, 200));

  assert.equal(ctrl.getStatus().trabajoPlaying, false, 'conga en fase dancing debe cortar trabajo');

  // 8. Detección automática por ciclo de polling con trabajoState = 'working'
  sandbox.window.Oficina3D.runtime.congaState.phase = 'idle';
  sandbox.window.Oficina3D.runtime.trabajoState.phase = 'working';
  await new Promise(r => setTimeout(r, 200));

  assert.equal(ctrl.getStatus().trabajoPlaying, true, 'trabajoState en fase working debe activar audio');

  // Limpiar timers para terminar tests limpiamente
  clearInterval(ctrl._pollInterval);
});
