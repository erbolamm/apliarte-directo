import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { CATEGORIAS } from '../src/categorias.js';

// Auditoría del panel de Twitch (2026-09-19): enlaces de cabecera equivocados y la categoría
// «andando» sin botón aunque el servidor la acepta.
const html = readFileSync(new URL('../panel-twitch-comandos.html', import.meta.url), 'utf8');
const adminHtml = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
const servidor = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('cada categoría del servidor tiene su botón en el cockpit online', () => {
  for (const categoria of Object.keys(CATEGORIAS)) {
    assert.match(adminHtml, new RegExp(`data-categoria="${categoria}"|data-cat="${categoria}"`), `falta el botón de «${categoria}»`);
  }
});

test('el panel local abre el cockpit de la propia instalación, nunca por el dominio público', () => {
  // Since 2026-09-26 the public domain only serves the 3D showcase. Since 2026-09-29 the link is
  // the local install's panel, so it works on any install and ships no private Tailscale machine name.
  assert.match(html, /href="http:\/\/127\.0\.0\.1:7979\/admin"/);
  assert.doesNotMatch(html, /class="btn-cockpit-link"[^>]*href="https:\/\/directo\.apliarte\.com/);
  assert.doesNotMatch(html, /href="https:\/\/directo\.apliarte\.com\/"[^>]*btn-cockpit-link/);
});

test('la cabecera enlaza al centro de directo', () => {
  assert.match(html, /href="http:\/\/127\.0\.0\.1:8790\/"/);
});

test('el botón de escuchar lleva al TTS multiplataforma', () => {
  assert.match(html, /href="http:\/\/127\.0\.0\.1:8790\/tts-multiplataforma\.html"/);
});

test('el panel local gestiona el cierre de directo con vídeo y VOD', () => {
  assert.match(html, /id="categoria-cierre"/);
  assert.match(html, /id="btn-cerrar-con-video"/);
  assert.match(html, /id="btn-consultar-vod"/);
});

test('el panel local gestiona la librería de vídeos manuales', () => {
  assert.match(html, /id="t-videos"/);
  assert.match(html, /id="videos-lista"/);
});

test('el servidor de directo sirve el panel en /panel-twitch-comandos.html', () => {
  assert.match(servidor, /app\.get\(['"]\/panel-twitch-comandos\.html['"]/);
});

test('el cockpit online carga la lista de comandos predeterminados del bot', () => {
  assert.match(adminHtml, /COMANDOS_PREDETERMINADOS/);
  assert.match(adminHtml, /\/api\/panel\/comandos-bot/);
});

const gameSource = servidor.slice(servidor.indexOf('function createGameHub'), servidor.indexOf('// GAME_HUB_END'));
const createGameHub = runInNewContext(`${gameSource}\ncreateGameHub`, { randomInt: () => 0 });
const owners = { ja: 'apliarte', co: 'alice', cl: 'bob', pi: 'carol', ge: 'dave' };

test('game hub selects an adopted non-Javier avatar using the random index', () => {
  for (let index = 0; index < 4; index++) {
    const game = createGameHub({ randomIndex: () => index });
    game.lobby();
    game.startTraitor(owners);
    assert.equal(game.privateState().traidorSecreto.avatarId, ['co', 'cl', 'pi', 'ge'][index]);
    assert.equal(game.publicState().juegoSeleccionado, 'traidor');
    assert.doesNotMatch(JSON.stringify(game.publicState()), /traidorSecreto|traitorId|avatarId|twitchUser/);
  }
});

test('game hub rejects missing quorum and duplicate adopted users', () => {
  const game = createGameHub();
  game.lobby();
  assert.throws(() => game.startTraitor({ co: 'alice', cl: 'bob' }), /three/);
  assert.throws(() => game.startTraitor({ co: 'alice', cl: 'ALICE', pi: 'carol' }), /distinct/);
});

test('numeric votes are validated, replace one voter vote, and expel only a unique leader', () => {
  const game = createGameHub({ randomIndex: () => 0 });
  game.lobby(); game.startTraitor(owners); game.advance(); game.advance();
  assert.throws(() => game.vote('alice', '0'), /numeric/);
  assert.throws(() => game.vote('alice', '2abc'), /numeric/);
  assert.throws(() => game.vote('alice', '5'), /numeric/);
  game.vote('viewer', '2'); game.vote('VIEWER', '3');
  assert.equal(game.publicState().votos['2'], 0);
  assert.equal(game.publicState().votos['3'], 1);
  game.vote('other', '2'); game.advance();
  assert.throws(() => game.advance(), /unique/);
  game.repeatVote(); game.vote('viewer', '1'); game.vote('other', '1');
  game.advance(); game.advance();
  assert.equal(game.publicState().ganador, 'inocentes');
});

test('innocent expulsion with three survivors enters sudden death', () => {
  const game = createGameHub({ randomIndex: () => 0 });
  game.lobby(); game.startTraitor(owners); game.advance(); game.advance();
  game.vote('viewer', '2'); game.advance(); game.advance();
  assert.equal(game.publicState().fase, 'muerte_subita');
  assert.equal(game.publicState().jugadoresVivos.length, 3);
});

test('phase deadlines advance automatically and an expired lobby closes', () => {
  let clock = 1000;
  const game = createGameHub({ now: () => clock, randomIndex: () => 0 });
  game.lobby();
  assert.equal(game.publicState().tiempoRestanteMs, 60000);
  clock += 60000;
  assert.equal(game.publicState().fase, 'idle');
  game.lobby(); game.startTraitor(owners);
  clock += 5000;
  assert.equal(game.publicState().fase, 'traidor_debate');
  clock += 300000;
  assert.equal(game.publicState().fase, 'traidor_votacion');
  clock += 45000;
  assert.equal(game.publicState().fase, 'traidor_expulsion');
});

test('private endpoint and every mutation require authentication, public route has no secret source', () => {
  assert.match(servidor, /gameRouter\.get\("\/privado-javier", requireGamePanel/);
  assert.match(servidor, /gameRouter\.get\("\/estado", \(_req, res\) => res\.json\(gameHub\.publicState\(\)\)\)/);
  for (const route of ['lobby', 'iniciar-traidor', 'avanzar', 'voto', 'repetir-votacion', 'reiniciar']) {
    assert.match(servidor, new RegExp(`gameRouter\\.post\\("/${route}", requireGamePanel`));
  }
  assert.match(servidor, /DIRECTO_JUEGO_PANEL_TOKEN/);
  assert.doesNotMatch(gameSource.slice(gameSource.indexOf('function publicState()'), gameSource.indexOf('function privateState()')), /traidorSecreto|avatarId|twitchUser/);
  assert.match(adminHtml, /btn-game-iniciar/);
  assert.match(adminHtml, /\/privado-javier/);
});

test('gameHub.startMockTraitor() works and initializes 4 players and secret traitor', () => {
  const game = createGameHub({ randomIndex: () => 2 });
  const pub = game.startMockTraitor();
  assert.equal(pub.jugadoresVivos.length, 4);
  assert.deepEqual([...pub.jugadoresVivos], ['co', 'cl', 'pi', 'ge']);
  assert.equal(pub.juegoSeleccionado, 'traidor');
  assert.equal(pub.fase, 'traidor_intro');
  assert.equal(pub.espectadoresAdoptados.length, 4);
  assert.deepEqual([...pub.espectadoresAdoptados], ['pepe', 'marta', 'lucas', 'elena']);
  const priv = game.privateState();
  assert.ok(priv.traidorSecreto);
  assert.equal(priv.traidorSecreto.avatarId, 'pi');
  assert.equal(priv.traidorSecreto.twitchUser, 'lucas');
});

test('gameRouter includes probar-traidor and voto-simulado endpoints', () => {
  assert.match(servidor, /gameRouter\.post\(['"]\/probar-traidor['"], requireGamePanel/);
  assert.match(servidor, /gameRouter\.post\(['"]\/voto-simulado['"], requireGamePanel/);
});

test('el servidor expone los endpoints de cola de vídeos y medios estáticos', () => {
  assert.match(servidor, /app\.get\(['"]\/api\/videos\/cola['"]/);
  assert.match(servidor, /app\.post\(['"]\/api\/videos\/cola\/limpiar['"]/);
  assert.match(servidor, /app\.post\(['"]\/api\/videos\/:archivo\/encolar['"]/);
  assert.match(servidor, /app\.use\(['"]\/medios['"],\s*express\.static/);
  assert.match(servidor, /req\.body\?\.encolar/);
  assert.match(servidor, /colaVideos\.shift\(\)/);
});

test('flujo de votos simulados funciona sobre una partida mock del traidor', () => {
  const game = createGameHub({ randomIndex: () => 0 });
  game.startMockTraitor();
  game.advance(); // intro -> debate
  game.advance(); // debate -> votacion
  assert.equal(game.publicState().fase, 'traidor_votacion');
  game.vote('viewer_1', '2');
  game.vote('viewer_2', '2');
  game.vote('viewer_3', '1');
  const pub = game.publicState();
  assert.equal(pub.votos['2'], 2);
  assert.equal(pub.votos['1'], 1);
  assert.equal(pub.votos['3'], 0);
  assert.equal(pub.votos['4'], 0);
});

test('admin.html incluye reproductor Twitch con autoplay y fullscreen', () => {
  assert.match(adminHtml, /id="twitch-player-frame"[^>]*allow="autoplay;\s*fullscreen"/);
});

test('admin.html incluye chat embebido y fallback Popout directo para móvil', () => {
  assert.match(adminHtml, /id="twitch-chat-frame"/);
  assert.match(adminHtml, /id="btn-chat-popout"/);
  assert.match(adminHtml, /href="https:\/\/www\.twitch\.tv\/popout\/apliarte\/chat\?popout="/);
});

test('admin.html implementa activarPestanaChat con soporte de parents de Tailscale y público', () => {
  assert.match(adminHtml, /function activarPestanaChat\(/);
  assert.match(adminHtml, /directo\.apliarte\.com/);
  // The current host (e.g. a Tailscale name) is added at runtime; no private name is hardcoded.
  assert.match(adminHtml, /if \(host\) parents\.add\(host\)/);
  assert.match(adminHtml, /cambiarPestana\(['"]tab-chat['"]\)/);
});


