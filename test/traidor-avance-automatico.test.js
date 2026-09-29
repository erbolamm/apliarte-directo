import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const serverUrl = existsSync(new URL('../server.js', import.meta.url))
  ? new URL('../server.js', import.meta.url)
  : new URL('../vps-overlay/server.js', import.meta.url);
const source = readFileSync(serverUrl, 'utf8');
const hubSource = source.slice(source.indexOf('function createGameHub'), source.indexOf('const gameHub = createGameHub()'));
const createGameHub = runInNewContext(`${hubSource}; createGameHub`, { Map, Set, Object, Math, Date, Number, String, Error });
const owners = { cl: 'ana', co: 'bea', pi: 'carl', gr: 'dani' };

function inVoting(clock) {
  const game = createGameHub({ now: () => clock.t, randomIndex: () => 0 });
  game.startTraitor(owners);
  game.advance();
  return game;
}

test('expulsion resolves by itself after 8 s when one player leads', () => {
  const clock = { t: 1000 };
  const game = inVoting(clock);
  game.vote('ana', '2'); game.vote('bea', '2');
  game.advance();
  assert.equal(game.publicState().fase, 'traidor_expulsion');
  clock.t += 8000;
  const state = game.publicState();
  assert.equal(state.ultimoExpulsado, 'co');
  assert.equal(state.fase, 'muerte_subita');
});

test('a tie or no votes repeats the vote instead of freezing the poster', () => {
  const clock = { t: 1000 };
  const game = inVoting(clock);
  game.advance();
  clock.t += 8000;
  assert.equal(game.publicState().fase, 'traidor_votacion');
});

test('a finished game returns to idle after 20 s', () => {
  const clock = { t: 1000 };
  const game = inVoting(clock);
  game.vote('ana', '1');
  game.advance();
  clock.t += 8000;
  assert.equal(game.publicState().fase, 'finalizado');
  clock.t += 20000;
  assert.equal(game.publicState().fase, 'idle');
});

test('agent names are hidden in the meeting room during the game', () => {
  const planoUrl = existsSync(new URL('../public/plano.html', import.meta.url))
    ? new URL('../public/plano.html', import.meta.url)
    : new URL('../vps-overlay/public/plano.html', import.meta.url);
  const plano = readFileSync(planoUrl, 'utf8');
  assert.match(plano, /#office-3d\.modo-traidor \.person-name/);
});

test('startTraitor requires at least 4 adopted viewers and rejects 3', () => {
  const game = createGameHub();
  assert.throws(() => game.startTraitor({ cl: 'ana', co: 'bea', pi: 'carl' }), /4 avatares/);
  assert.doesNotThrow(() => game.startTraitor({ cl: 'ana', co: 'bea', pi: 'carl', ge: 'dani' }));
});

test('expulsion resolution is available immediately at second 0 of traidor_expulsion', () => {
  const clock = { t: 1000 };
  const game = inVoting(clock);
  game.vote('ana', '2'); // votes for co (index 1)
  game.advance();
  const stateAtStart = game.publicState();
  assert.equal(stateAtStart.fase, 'traidor_expulsion');
  assert.equal(stateAtStart.ultimoExpulsado, 'co');
  assert.equal(stateAtStart.ultimoExpulsadoDuenio, 'bea');
  assert.equal(stateAtStart.ultimoExpulsadoEraTraidor, false);
});

test('player numbers remain fixed and voting for an expelled player is rejected', () => {
  const clock = { t: 1000 };
  const game = inVoting(clock);
  game.vote('ana', '2'); // expels co (player 2)
  game.advance(); // traidor_expulsion
  clock.t += 8000; // muerte_subita
  assert.equal(game.publicState().fase, 'muerte_subita');
  assert.throws(() => game.vote('ana', '2'), /ya ha sido expulsado/);
  // Option 3 still refers to pi and can be voted
  assert.doesNotThrow(() => game.vote('ana', '3'));
  assert.equal(game.publicState().votos['3'], 1);
});

test('two consecutive ties end the game with traitor victory', () => {
  const clock = { t: 1000 };
  const game = inVoting(clock);
  // First tie
  game.advance(); // enters traidor_expulsion with no votes
  clock.t += 8000; // repeats vote
  assert.equal(game.publicState().fase, 'traidor_votacion');
  // Second tie
  game.advance(); // enters traidor_expulsion with double tie
  assert.equal(game.publicState().ganador, 'traidor');
  clock.t += 8000;
  assert.equal(game.publicState().fase, 'finalizado');
  assert.equal(game.publicState().ganador, 'traidor');
});
