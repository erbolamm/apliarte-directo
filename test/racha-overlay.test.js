process.env.NODE_ENV = 'test';
process.env.PANEL_PASS = 'racha-test-pass';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsearLineaRacha } = require('../src/bienvenida-chat');
const { server, activarRachaEnPantalla, smsPantalla, DURACION_RACHA_OVERLAY_MS } = require('../server');

let base;

test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server && server.listening) {
    await new Promise(resolve => server.close(resolve));
  }
});

test('parsearLineaRacha: interpreta hitos de racha de visualización (watch-streak)', () => {
  const lineaWatchStreak = '@badge-info=subscriber/6;badges=subscriber/6;color=#FF4500;display-name=StreamViewer;emotes=;id=111-222;login=streamviewer;mod=0;msg-id=viewermilestone;msg-param-category=watch-streak;msg-param-copoReward=350;msg-param-id=xyz;msg-param-value=7;room-id=12345;subscriber=1;system-msg=StreamViewer\\sconmemoró\\ssu\\sracha\\sde\\s7\\sdirectos;tmi-sent-ts=1700000000000;user-id=999 :tmi.twitch.tv USERNOTICE #apliarte :¡Llevo 7 directos seguidos!';

  const res = parsearLineaRacha(lineaWatchStreak);
  assert.ok(res !== null, 'Debe parsear una línea watch-streak');
  assert.equal(res.usuario, 'streamviewer');
  assert.equal(res.nombreVisible, 'StreamViewer');
  assert.equal(res.racha, 7);
  assert.equal(res.tipo, 'watch-streak');
  assert.equal(res.texto, '🔥 ¡Racha de 7 directos seguidos!');
});

test('parsearLineaRacha: interpreta hitos de racha de suscripción (resub)', () => {
  const lineaResub = '@badge-info=subscriber/12;badges=subscriber/12;color=#1E90FF;display-name=SubViewer;emotes=;id=333-444;login=subviewer;mod=0;msg-id=resub;msg-param-cumulative-months=12;msg-param-streak-months=9;msg-param-sub-plan=1000;room-id=12345;subscriber=1;system-msg=SubViewer\\sha\\srenovado\\ssu\\ssuscripción;tmi-sent-ts=1700000000000;user-id=888 :tmi.twitch.tv USERNOTICE #apliarte';

  const res = parsearLineaRacha(lineaResub);
  assert.ok(res !== null, 'Debe parsear una línea resub con racha');
  assert.equal(res.usuario, 'subviewer');
  assert.equal(res.nombreVisible, 'SubViewer');
  assert.equal(res.racha, 9);
  assert.equal(res.tipo, 'resub-streak');
  assert.equal(res.texto, '⭐ ¡Racha de 9 meses suscrito/a!');
});

test('parsearLineaRacha: ignora mensajes normales o eventos que no sean racha', () => {
  assert.equal(parsearLineaRacha('PING :tmi.twitch.tv'), null);
  assert.equal(parsearLineaRacha(':user!user@user.tmi.twitch.tv PRIVMSG #apliarte :Hola a todos'), null);
  assert.equal(parsearLineaRacha('@msg-id=raid;msg-param-viewerCount=10 :tmi.twitch.tv USERNOTICE #apliarte'), null);
  assert.equal(parsearLineaRacha('@msg-id=viewermilestone;msg-param-category=other :tmi.twitch.tv USERNOTICE #apliarte'), null);
  assert.equal(parsearLineaRacha(''), null);
  assert.equal(parsearLineaRacha(null), null);
});

test('parsearLineaRacha: sanea nombres con caracteres de control o inyecciones', () => {
  const linea = '@display-name=Viewer<script>alert(1)</script>;login=viewer_hacker;msg-id=viewermilestone;msg-param-category=watch-streak;msg-param-value=3 :tmi.twitch.tv USERNOTICE #apliarte';
  const res = parsearLineaRacha(linea);
  assert.ok(res !== null);
  assert.equal(res.usuario, 'viewer_hacker');
  assert.doesNotMatch(res.nombreVisible, /<script>/);
  assert.equal(res.racha, 3);
});

test('activarRachaEnPantalla: proyecta en smsPantalla y se oculta tras la duración configurada', async () => {
  const duracionMs = 80;
  const promesa = activarRachaEnPantalla({
    usuario: 'espectador_pro',
    texto: '🔥 ¡Racha de 12 directos seguidos!',
    duracionMs,
  });

  const shown = await promesa;
  assert.ok(shown !== null);
  assert.equal(shown.usuario, 'espectador_pro');
  assert.equal(shown.texto, '🔥 ¡Racha de 12 directos seguidos!');
  assert.ok(shown.fecha);

  // Está en pantalla en el momento de activación
  assert.ok(smsPantalla.current !== null);
  assert.equal(smsPantalla.current.id, shown.id);
  assert.equal(smsPantalla.current.usuario, 'espectador_pro');

  // Esperar a que pase el temporizador de auto-ocultado
  await new Promise(resolve => setTimeout(resolve, duracionMs + 40));

  // Ya no debe estar en pantalla
  assert.equal(smsPantalla.current, null, 'La racha debe ocultarse automáticamente tras expirar la duración');
});

test('DURACION_RACHA_OVERLAY_MS: está configurada a 10 segundos por defecto', () => {
  assert.equal(DURACION_RACHA_OVERLAY_MS, 10000);
});

test('endpoint /api/directo/racha: proyecta racha en overlay y se oculta tras la duración', async () => {
  const resAuth = await fetch(`${base}/api/directo/racha`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ usuario: 'fan_top', racha: 10, duracionMs: 60 })
  });
  assert.equal(resAuth.status, 200);
  const data = await resAuth.json();
  assert.equal(data.ok, true);
  assert.equal(data.mensaje.usuario, 'fan_top');
  assert.equal(data.mensaje.texto, '🔥 ¡Racha de 10 directos seguidos!');

  // Está en pantalla
  assert.equal(smsPantalla.current.usuario, 'fan_top');

  // Esperar a que se oculte
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(smsPantalla.current, null);
});
