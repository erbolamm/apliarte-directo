// test/avatares-autonomos-juegos.test.mjs
// Verifica el comportamiento de los avatares autónomos (bots/NPCs) en los minijuegos:
// 1. Quórum automático con bots activos en OfficeRuntime.
// 2. Selección de bots y arranque de la carrera de trofeo con avatares autónomos.
// 3. Movimiento autónomo de bots hacia la copa y posibilidad de victoria.
// 4. Control de activación/desactivación de bots (métodos y comando !bots).
// 5. Relleno y votación autónoma de bots en !traidor (servidor).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

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

function loadServerGameHub() {
  const serverUrl = existsSync(new URL('../server.js', import.meta.url))
    ? new URL('../server.js', import.meta.url)
    : new URL('../vps-overlay/server.js', import.meta.url);
  const source = readFileSync(serverUrl, 'utf8');
  const hubSource = source.slice(source.indexOf('function createGameHub'), source.indexOf('const gameHub = createGameHub()'));
  const createGameHub = runInNewContext(`${hubSource}; createGameHub`, { Map, Set, Object, Math, Date, Number, String, Error });
  return createGameHub;
}

test('OfficeRuntime: botsEnabled activo por defecto y garantiza quórum', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();

  assert.equal(rt.botsEnabled, true);
  rt.setAdoptedViewers([]); // Quorum enforced con 0 espectadores
  assert.equal(rt.hasQuorum(), true, 'Debe cumplir quórum porque los bots rellenan');

  rt.setBotsEnabled(false);
  assert.equal(rt.botsEnabled, false);
  assert.equal(rt.hasQuorum(), false, 'Con bots desactivados, 0 adoptados no alcanzan quórum');

  rt.toggleBots();
  assert.equal(rt.botsEnabled, true);
  assert.equal(rt.hasQuorum(), true);
});

test('OfficeRuntime: iniciarJuego selecciona bots autónomos y lanza cuenta atrás', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();
  rt.setAdoptedViewers([]); // Sin espectadores humanos
  rt.setAvatarOwners({});

  const now = 100000;
  const res = rt.iniciarJuego(now, 'ja');
  assert.equal(res.ok, true);
  assert.ok(Array.isArray(res.bots));
  assert.ok(res.bots.length >= 3, 'Debe seleccionar al menos 3 bots para la carrera');
  assert.ok(rt.activeGame !== null);
  assert.equal(rt.activeGame.phase, 'countdown');
  assert.deepEqual(rt.activeGame.bots, res.bots);
});

test('OfficeRuntime: al terminar la cuenta atrás los bots corren hacia el objetivo y pueden ganar', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();
  rt.setAdoptedViewers([]);
  rt.setAvatarOwners({});

  const start = 100000;
  rt.iniciarJuego(start, 'ja');
  assert.equal(rt.activeGame.phase, 'countdown');

  // Avanzamos 5 segundos de cuenta atrás
  rt.tick(start + 5001, 0.05);
  assert.equal(rt.activeGame.phase, 'running');

  // Cada bot participante debe tener manualUntil activo y un camino hacia el objetivo
  const botId = rt.activeGame.bots[0];
  const botPerson = rt.people.find(p => p.id === botId);
  assert.ok(botPerson.manualUntil > start + 5001);
  assert.ok(botPerson.path !== null || botPerson.target !== null);

  // Simulamos que el bot alcanza el objetivo (a menos de 68px)
  botPerson.path = null;
  botPerson.pos = { ...rt.activeGame.target };
  rt.tick(start + 6000, 0.05);

  assert.equal(rt.activeGame.phase, 'won');
  assert.equal(rt.activeGame.winner.id, botId);
  assert.equal(botPerson.jumping, true);
});

test('OfficeRuntime: comando bots permite activar/desactivar y alternar', async () => {
  const OfficeRuntime = await loadRuntime();
  const rt = new OfficeRuntime();
  let now = 1000;

  rt.applyCommand({ comando: 'bots', texto: 'off' }, now++);
  assert.equal(rt.botsEnabled, false);

  rt.applyCommand({ comando: 'bots', texto: 'on' }, now++);
  assert.equal(rt.botsEnabled, true);

  rt.applyCommand({ comando: 'bots', texto: '' }, now++);
  assert.equal(rt.botsEnabled, false);
});

test('Server: startTraitor con allowBots rellena con bots cuando hay pocos humanos', () => {
  const createGameHub = loadServerGameHub();
  const game = createGameHub({ randomIndex: () => 0 });

  // Solo 1 espectador humano adoptando 'cl'
  const state = game.startTraitor({ cl: 'humano_1' }, { allowBots: true });
  assert.equal(state.fase, 'traidor_debate');
  assert.equal(state.jugadoresVivos.length, 4, 'Debe rellenar con bots hasta 4 jugadores');
  assert.ok(state.duenosVivos.some(d => d.startsWith('Bot_')));
});

test('Server: en votación de !traidor, los bots vivos votan automáticamente', () => {
  const createGameHub = loadServerGameHub();
  let clock = 1000;
  const game = createGameHub({ now: () => clock, randomIndex: () => 0 });

  // Iniciamos con 1 humano y 3 bots
  game.startTraitor({ cl: 'humano_1' }, { allowBots: true });
  game.advance(); // Pasa a traidor_votacion
  assert.equal(game.publicState().fase, 'traidor_votacion');

  // El humano vota por la opción 2
  game.vote('humano_1', '2');

  // Avanzamos para cerrar votación: los bots vivos votan automáticamente
  game.advance();
  const st = game.publicState();
  assert.equal(st.fase, 'traidor_expulsion');
  assert.ok(st.ultimoExpulsado !== null);
});
