import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearLineaPrivmsg,
  crearGestorBienvenida,
  BOTS_EXCLUIDOS,
  USUARIOS_SISTEMA,
  COOLDOWN_SALUDO_MS,
  COOLDOWN_FIESTA_MS,
  COOLDOWN_RE_SALUDO_MS,
} from '../src/bienvenida-chat.js';

test('parsearLineaPrivmsg: interpreta correctamente una línea PRIVMSG real con etiquetas de Twitch', () => {
  const linea = '@badge-info=;badges=broadcaster/1;color=#00FF7F;display-name=ErBolamm;emotes=;first-msg=0;flags=;id=12345;mod=0;returning-chatter=0;room-id=9876;subscriber=0;tmi-sent-ts=1700000000000;turbo=0;user-id=54321;user-type= :erbolamm!erbolamm@erbolamm.tmi.twitch.tv PRIVMSG #apliarte :Hola gente del directo';

  const res = parsearLineaPrivmsg(linea);
  assert.ok(res !== null, 'Debe parsear una línea PRIVMSG válida');
  assert.equal(res.usuario, 'erbolamm');
  assert.equal(res.nombreVisible, 'ErBolamm');
  assert.equal(res.texto, 'Hola gente del directo');
});

test('parsearLineaPrivmsg: ignora líneas que no sean PRIVMSG (PING, JOIN, 001, etc.)', () => {
  assert.equal(parsearLineaPrivmsg('PING :tmi.twitch.tv'), null);
  assert.equal(parsearLineaPrivmsg(':tmi.twitch.tv 001 apliarte :Welcome, GLHF!'), null);
  assert.equal(parsearLineaPrivmsg(':usuario!usuario@usuario.tmi.twitch.tv JOIN #apliarte'), null);
  assert.equal(parsearLineaPrivmsg(''), null);
  assert.equal(parsearLineaPrivmsg(null), null);
});

test('parsearLineaPrivmsg: limpia inyecciones de \\r\\n o etiquetas <script> en nombres y texto', () => {
  const lineaPeligrosa = '@display-name=Hacker<script>alert(1)</script>\r\nBot :hacker!hacker@tmi.twitch.tv PRIVMSG #apliarte :Texto con\r\nsaltos de linea';
  const res = parsearLineaPrivmsg(lineaPeligrosa);
  assert.ok(res !== null);
  assert.doesNotMatch(res.nombreVisible, /<script>|\r|\n/);
  assert.equal(res.nombreVisible, 'HackerBot');
  assert.doesNotMatch(res.texto, /[\r\n]/);
  assert.equal(res.texto, 'Texto con saltos de linea');
});

test('esUsuarioNuevo: el segundo mensaje del mismo usuario no es nuevo (mayúsculas y minúsculas indistintas)', () => {
  const gestor = crearGestorBienvenida({ canal: 'apliarte' });

  const linea1 = ':maria_gamer!maria_gamer@tmi.twitch.tv PRIVMSG #apliarte :Primer mensaje';
  const saludo1 = gestor.procesarLinea(linea1, 1000);
  assert.ok(saludo1 !== null, 'El primer mensaje debe generar saludo');
  assert.equal(saludo1.total, 1);
  assert.equal(saludo1.usuarios[0].usuario, 'maria_gamer');

  // Segundo mensaje en minúsculas
  const linea2 = ':maria_gamer!maria_gamer@tmi.twitch.tv PRIVMSG #apliarte :Segundo mensaje';
  const saludo2 = gestor.procesarLinea(linea2, 2000);
  assert.equal(saludo2, null, 'El segundo mensaje no debe considerarse nuevo');

  // Tercer mensaje con distinta capitalización
  const linea3 = '@display-name=MARIA_GAMER :MARIA_GAMER!MARIA_GAMER@tmi.twitch.tv PRIVMSG #apliarte :Tercer mensaje';
  const saludo3 = gestor.procesarLinea(linea3, 3000);
  assert.equal(saludo3, null, 'Capitalización diferente del mismo usuario no debe ser nuevo');
});

test('exclusiones: canal, bot propio, ja, apliarte, erbolamm y bots conocidos nunca son nuevos', () => {
  const gestor = crearGestorBienvenida({ canal: 'apliarte', botNick: 'bot_stream' });

  const excluidos = [
    'apliarte',
    'APLIARTE',
    'bot_stream',
    'ja',
    'erbolamm',
    ...BOTS_EXCLUIDOS,
    ...USUARIOS_SISTEMA,
  ];

  for (const usuario of excluidos) {
    const linea = `:${usuario}!${usuario}@tmi.twitch.tv PRIVMSG #apliarte :Mensaje de prueba`;
    const saludo = gestor.procesarLinea(linea, 1000);
    assert.equal(saludo, null, `El usuario excluido "${usuario}" no debe ser saludado`);
  }
});

test('agrupación y cooldown: 300 usuarios nuevos en 2 segundos producen pocos saludos, no 300', () => {
  const gestor = crearGestorBienvenida({ canal: 'apliarte' });
  const saludosEmitidos = [];

  // Emitir 300 usuarios en 2000 ms (uno cada ~6ms)
  for (let i = 0; i < 300; i++) {
    const tiempoMs = 1000 + Math.floor((i * 2000) / 300);
    const linea = `@display-name=Usuario_${i} :user_${i}!user_${i}@tmi.twitch.tv PRIVMSG #apliarte :Hola a todos`;
    const res = gestor.procesarLinea(linea, tiempoMs);
    if (res) saludosEmitidos.push(res);
  }

  // Durante esos primeros 2 segundos (<= 3000ms), a causa del cooldown (10s) solo puede dispararse 1 saludo
  assert.ok(
    saludosEmitidos.length <= 2,
    `300 usuarios en 2s deben generar muy pocos saludos inmediatos (generó ${saludosEmitidos.length})`
  );
  assert.ok(saludosEmitidos.length >= 1, 'Al menos el primer saludo debe haber salido');

  // Comprobar que los restantes 299 quedaron en cola de pendientes
  assert.ok(gestor.totalPendientes() > 200, 'Los usuarios no saludados deben quedar en pendientes');

  // Al pasar el cooldown (a los 15 segundos), revisarPendientes debe drenar a todos en un único saludo agrupado
  const saludoGrupal = gestor.revisarPendientes(15000);
  assert.ok(saludoGrupal !== null, 'Debe emitir el saludo grupal tras expirar el cooldown');
  assert.ok(saludoGrupal.total > 200, 'Debe agrupar a todos los usuarios pendientes restantes');
  assert.match(saludoGrupal.textoChat, /y \d+ más/, 'El texto de chat debe usar el formato "y N más"');
  assert.match(saludoGrupal.textoBocadillo, /y \d+ más|compañía/, 'El bocadillo debe usar formato resumido');
});

test('fiesta: no se dispara fiesta continua en cada saludo si no ha pasado el cooldown de fiesta', () => {
  const gestor = crearGestorBienvenida({ canal: 'apliarte' });

  // Saludo 1 a t=0ms
  const s1 = gestor.procesarLinea(':user_a!user_a@tmi.twitch.tv PRIVMSG #apliarte :Hola', 0);
  assert.ok(s1 && s1.lanzarFiesta === true, 'El primer saludo debe lanzar fiesta');

  // Saludo 2 a t=11000ms (pasó COOLDOWN_SALUDO_MS de 10s pero NO COOLDOWN_FIESTA_MS de 30s)
  const s2 = gestor.procesarLinea(':user_b!user_b@tmi.twitch.tv PRIVMSG #apliarte :Hola', 11000);
  assert.ok(s2 !== null, 'Debe emitir el segundo saludo');
  assert.equal(s2.lanzarFiesta, false, 'No debe lanzar fiesta porque no han pasado 30s desde la última fiesta');

  // Saludo 3 a t=35000ms (pasaron más de 30s)
  const s3 = gestor.procesarLinea(':user_c!user_c@tmi.twitch.tv PRIVMSG #apliarte :Hola', 35000);
  assert.ok(s3 !== null);
  assert.equal(s3.lanzarFiesta, true, 'Debe lanzar fiesta nuevamente tras pasar COOLDOWN_FIESTA_MS');
});

test('interruptor desactivado: cuando el gestor está inactivo no emite saludos ni fiestas', () => {
  const gestor = crearGestorBienvenida({ canal: 'apliarte', activo: false });

  const linea = ':nuevo_1!nuevo_1@tmi.twitch.tv PRIVMSG #apliarte :Hola';
  const res = gestor.procesarLinea(linea, 1000);
  assert.equal(res, null, 'Con gestor inactivo no debe generar saludo');
  assert.equal(gestor.totalPendientes(), 0, 'No debe acumular pendientes');
});

test('cooldown 6 horas: no se vuelve a saludar al mismo usuario hasta pasadas 6h', () => {
  const gestor = crearGestorBienvenida({ canal: 'apliarte' });
  const t0 = 1000000;
  const TRES_HORAS = 3 * 60 * 60 * 1000;
  const SEIS_HORAS = 6 * 60 * 60 * 1000;

  // Primer mensaje hoy a t0
  const s1 = gestor.procesarLinea(':juan!juan@tmi.twitch.tv PRIVMSG #apliarte :Hola!', t0);
  assert.ok(s1 !== null, 'Primer mensaje debe saludar');
  assert.equal(s1.usuarios[0].usuario, 'juan');

  // Mensaje a las 3 horas
  const s2 = gestor.procesarLinea(':juan!juan@tmi.twitch.tv PRIVMSG #apliarte :Sigo por aqui', t0 + TRES_HORAS);
  assert.equal(s2, null, 'Mensaje a las 3h no debe saludar');

  // Mensaje a las 5 horas y 59 minutos
  const s3 = gestor.procesarLinea(':juan!juan@tmi.twitch.tv PRIVMSG #apliarte :Casi 6h', t0 + SEIS_HORAS - 60000);
  assert.equal(s3, null, 'Mensaje antes de 6h no debe saludar');

  // Mensaje pasadas las 6 horas exactas
  const s4 = gestor.procesarLinea(':juan!juan@tmi.twitch.tv PRIVMSG #apliarte :Buenas de nuevo!', t0 + SEIS_HORAS);
  assert.ok(s4 !== null, 'Pasadas 6 horas debe volver a saludar');
  assert.equal(s4.usuarios[0].usuario, 'juan');

  // Otro mensaje 5 minutos después del re-saludo
  const s5 = gestor.procesarLinea(':juan!juan@tmi.twitch.tv PRIVMSG #apliarte :Ya estoy dentro', t0 + SEIS_HORAS + 300000);
  assert.equal(s5, null, 'Mensaje 5min después del re-saludo no debe volver a saludar');
});

test('persistencia y vistosIniciales: hidrata estado previo y poda entradas mayores a 6h', () => {
  const ahora = Date.now();
  const SIETE_HORAS = 7 * 60 * 60 * 1000;
  const DOS_HORAS = 2 * 60 * 60 * 1000;

  let guardado = null;
  const gestor = crearGestorBienvenida({
    canal: 'apliarte',
    vistosIniciales: {
      antiguo: ahora - SIETE_HORAS, // > 6h: expirado, debe ser considerado nuevo
      reciente: ahora - DOS_HORAS,  // 2h: activo, no debe ser saludado
    },
    onCambioVistos: (v) => { guardado = v; },
  });

  // 'reciente' escribe: no debe saludar
  assert.equal(gestor.esNuevo('reciente', ahora), false);
  const sReciente = gestor.procesarUsuario({ usuario: 'reciente', nombreVisible: 'Reciente' }, ahora);
  assert.equal(sReciente, null, 'Usuario visto hace 2h no debe ser saludado');

  // 'antiguo' escribe: expiró hace más de 6h, debe ser saludado
  assert.equal(gestor.esNuevo('antiguo', ahora), true);
  const sAntiguo = gestor.procesarUsuario({ usuario: 'antiguo', nombreVisible: 'Antiguo' }, ahora);
  assert.ok(sAntiguo !== null, 'Usuario visto hace 7h debe ser saludado');
  assert.equal(sAntiguo.usuarios[0].usuario, 'antiguo');

  // onCambioVistos debió haber sido llamado con los vistos vigentes
  assert.ok(guardado !== null);
  assert.equal(typeof guardado.antiguo, 'number');
  assert.equal(guardado.antiguo, ahora);
  // exportarVistos poda entradas > 6h
  const exportados = gestor.exportarVistos(ahora);
  assert.equal(exportados.antiguo, ahora);
});

test('procesarUsuario: procesa mensajes directos (YouTube o Twitch) con las mismas reglas de 6h', () => {
  const gestor = crearGestorBienvenida({ canal: 'apliarte' });
  const t0 = 5000000;

  // Mensaje desde YouTube
  const yt1 = gestor.procesarUsuario({ usuario: 'viewer_yt', nombreVisible: 'ViewerYT' }, t0);
  assert.ok(yt1 !== null, 'Espectador de YouTube en su primer mensaje debe ser saludado');
  assert.equal(yt1.usuarios[0].nombreVisible, 'ViewerYT');

  // Segundo mensaje a la media hora
  const yt2 = gestor.procesarUsuario({ usuario: 'viewer_yt', nombreVisible: 'ViewerYT' }, t0 + 1800000);
  assert.equal(yt2, null, 'Segundo mensaje no debe ser saludado');

  // Reiniciar estado borra vistos y limpia pendientes
  gestor.reiniciar();
  assert.equal(gestor.totalVistos(), 0);
  assert.equal(gestor.esNuevo('viewer_yt', t0 + 1800000), true);
});

