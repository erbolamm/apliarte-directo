'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ComunidadDb, formatearFechaHora } = require('../src/comunidad-db');

test('ComunidadDb - Inicialización y pragmas de alto rendimiento', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-comunidad-init-'));
  const dbPath = path.join(tmpDir, 'test.sqlite');

  const db = new ComunidadDb({ dbPath });
  assert.ok(fs.existsSync(dbPath), 'El archivo sqlite debe existir');

  // Verificar pragmas
  const journal = db.db.prepare('PRAGMA journal_mode;').get();
  assert.equal(journal.journal_mode.toLowerCase(), 'wal', 'Debe estar en modo WAL');

  const synch = db.db.prepare('PRAGMA synchronous;').get();
  // 1 representa NORMAL en SQLite
  assert.equal(synch.synchronous, 1, 'Debe tener synchronous = NORMAL (1)');

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ComunidadDb - Ingesta de mensajes y actualización de usuarios', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-comunidad-ingesta-'));
  const db = new ComunidadDb({ dataDir: tmpDir });

  const t1 = 1729000000000;
  const res1 = db.registrarMensaje({
    id: 'tw_msg_1',
    plataforma: 'twitch',
    usuario: 'JavierStreamer',
    nombreVisible: 'JavierStreamer',
    texto: '¡Bienvenidos al directo de código!',
    color: '#00ffcc',
    timestamp: t1,
    avatar: 'https://cdn.example.com/javier.png'
  });

  assert.equal(res1.usuarioId, 'twitch:javierstreamer');

  // Consultar usuario
  const u1 = db.obtenerUsuario('twitch:javierstreamer');
  assert.ok(u1);
  assert.equal(u1.usuario, 'javierstreamer');
  assert.equal(u1.nombreVisible, 'JavierStreamer');
  assert.equal(u1.totalMensajes, 1);
  assert.equal(u1.primerMensajeEn, t1);
  assert.equal(u1.ultimoMensajeEn, t1);
  assert.equal(u1.avatarUrl, 'https://cdn.example.com/javier.png');

  // Segundo mensaje del mismo usuario
  const t2 = t1 + 60000;
  db.registrarMensaje({
    id: 'tw_msg_2',
    plataforma: 'twitch',
    usuario: 'javierstreamer',
    texto: 'Segundo mensaje del directo',
    timestamp: t2
  });

  const u2 = db.obtenerUsuario('twitch:javierstreamer');
  assert.equal(u2.totalMensajes, 2);
  assert.equal(u2.ultimoMensajeEn, t2);

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ComunidadDb - Aislamiento estricto entre Twitch y YouTube (nombres iguales)', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-comunidad-plataformas-'));
  const db = new ComunidadDb({ dataDir: tmpDir });

  // Mismo nick 'carlos' en dos plataformas
  db.registrarMensaje({
    plataforma: 'twitch',
    usuario: 'carlos',
    nombreVisible: 'CarlosTwitch',
    texto: 'Hola desde Twitch'
  });

  db.registrarMensaje({
    plataforma: 'youtube',
    usuario: 'carlos',
    nombreVisible: 'CarlosYouTube',
    texto: 'Hola desde YouTube'
  });

  const uTwitch = db.obtenerUsuario('twitch:carlos');
  const uYoutube = db.obtenerUsuario('youtube:carlos');

  assert.ok(uTwitch, 'Debe existir carlos de Twitch');
  assert.ok(uYoutube, 'Debe existir carlos de YouTube');
  assert.notEqual(uTwitch.id, uYoutube.id, 'No deben colisionar las IDs');
  assert.equal(uTwitch.nombreVisible, 'CarlosTwitch');
  assert.equal(uYoutube.nombreVisible, 'CarlosYouTube');

  const stats = db.obtenerEstadisticas();
  assert.equal(stats.totalUsuarios, 2);
  assert.equal(stats.totalTwitch, 1);
  assert.equal(stats.totalYoutube, 1);

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ComunidadDb - Edición de Ficha Técnica (rol, sub, contexto, saludo y voz)', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-comunidad-ficha-'));
  const db = new ComunidadDb({ dataDir: tmpDir });

  db.registrarMensaje({
    plataforma: 'twitch',
    usuario: 'dev_amigo',
    nombreVisible: 'DevAmigo',
    texto: 'Gran proyecto!'
  });

  const uId = 'twitch:dev_amigo';

  // Actualizar ficha técnica
  const voz = { lang: 'es-ES', name: 'Jorge', slot: 2, velocidad: 1.1 };
  const actualizado = db.actualizarUsuario(uId, {
    rol: 'vip',
    esSuscriptor: true,
    notasContexto: 'Siempre pregunta por arquitectura limpia y Three.js',
    sugerenciaSaludo: '¿Cómo va tu proyecto con WebSockets?',
    vozConfig: voz
  });

  assert.ok(actualizado);
  assert.equal(actualizado.rol, 'vip');
  assert.equal(actualizado.esSuscriptor, true);
  assert.equal(actualizado.notasContexto, 'Siempre pregunta por arquitectura limpia y Three.js');
  assert.equal(actualizado.sugerenciaSaludo, '¿Cómo va tu proyecto con WebSockets?');
  assert.deepEqual(actualizado.vozConfig, voz);

  // Comprobar persistencia releyendo de base de datos
  const relectura = db.obtenerUsuario(uId);
  assert.equal(relectura.rol, 'vip');
  assert.equal(relectura.esSuscriptor, true);
  assert.deepEqual(relectura.vozConfig, voz);

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ComunidadDb - Listar usuarios y búsqueda WhatsApp con último mensaje', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-comunidad-listar-'));
  const db = new ComunidadDb({ dataDir: tmpDir });

  db.registrarMensaje({ plataforma: 'twitch', usuario: 'ana', texto: 'Primer mensaje de Ana', timestamp: 1000 });
  db.registrarMensaje({ plataforma: 'twitch', usuario: 'berta', texto: 'Berta saluda', timestamp: 2000 });
  db.registrarMensaje({ plataforma: 'youtube', usuario: 'carlos', texto: 'Carlos en YouTube', timestamp: 3000 });

  // Actualizar contexto en Berta para buscar por contexto
  db.actualizarUsuario('twitch:berta', { notasContexto: 'Experta en Docker y VPS' });

  // Listar todos (ordenado por ultimo_mensaje_en DESC)
  const l1 = db.listarUsuarios();
  assert.equal(l1.total, 3);
  assert.equal(l1.usuarios[0].usuario, 'carlos');
  assert.equal(l1.usuarios[0].ultimoTexto, 'Carlos en YouTube');
  assert.equal(l1.usuarios[1].usuario, 'berta');
  assert.equal(l1.usuarios[2].usuario, 'ana');

  // Búsqueda por texto en usuario o visible
  const b1 = db.listarUsuarios({ q: 'ana' });
  assert.equal(b1.total, 1);
  assert.equal(b1.usuarios[0].usuario, 'ana');

  // Búsqueda por texto en notas_contexto
  const b2 = db.listarUsuarios({ q: 'Docker' });
  assert.equal(b2.total, 1);
  assert.equal(b2.usuarios[0].usuario, 'berta');

  // Filtro por plataforma
  const b3 = db.listarUsuarios({ plataforma: 'youtube' });
  assert.equal(b3.total, 1);
  assert.equal(b3.usuarios[0].usuario, 'carlos');

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ComunidadDb - Historial agrupado por día y búsqueda global de mensajes', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-comunidad-historial-'));
  const db = new ComunidadDb({ dataDir: tmpDir });

  // Mensaje día 1
  const tDia1 = new Date('2026-10-15T10:00:00Z').getTime();
  db.registrarMensaje({
    plataforma: 'twitch',
    usuario: 'juan',
    texto: 'Mensaje del jueves',
    timestamp: tDia1
  });

  // Mensaje día 2
  const tDia2 = new Date('2026-10-16T12:00:00Z').getTime();
  db.registrarMensaje({
    plataforma: 'twitch',
    usuario: 'juan',
    texto: 'Mensaje del viernes con palabra clave SecretoDirecto',
    timestamp: tDia2
  });

  const historial = db.obtenerMensajesUsuario('twitch:juan');
  assert.equal(historial.total, 2);
  assert.equal(historial.mensajes.length, 2);

  // Verificar agrupación por día
  const dias = Object.keys(historial.agrupadosPorDia);
  assert.equal(dias.length, 2);

  // Búsqueda global de mensajes
  const busqueda = db.buscarMensajes('SecretoDirecto');
  assert.equal(busqueda.total, 1);
  assert.equal(busqueda.mensajes[0].usuario, 'juan');
  assert.equal(busqueda.mensajes[0].texto, 'Mensaje del viernes con palabra clave SecretoDirecto');

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ComunidadDb - Moderación, silenciamiento, baneo y memoria histórica de auditoría', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-comunidad-mod-'));
  const db = new ComunidadDb({ dataDir: tmpDir });

  // Ingestar bot kofistreambot con rol de moderador
  db.registrarMensaje({
    plataforma: 'twitch',
    usuario: 'kofistreambot',
    nombreVisible: 'KoFiStreamBot',
    rol: 'mod',
    texto: 'Visit ApliArte\'s Ko-fi page'
  });

  const uId = 'twitch:kofistreambot';
  const botInicial = db.obtenerUsuario(uId);
  assert.equal(botInicial.rol, 'mod');
  assert.equal(botInicial.esBaneado, false);
  assert.equal(botInicial.esSilenciado, false);
  assert.deepEqual(botInicial.historialModeracion, []);

  // 1. Quitar rol MOD (despromover a normal porque es un bot ruidoso)
  db.actualizarUsuario(uId, { rol: 'normal' });
  const trasDemocion = db.obtenerUsuario(uId);
  assert.equal(trasDemocion.rol, 'normal');
  assert.equal(trasDemocion.historialModeracion.length, 1);
  assert.equal(trasDemocion.historialModeracion[0].accion, 'cambio_rol');
  assert.equal(trasDemocion.historialModeracion[0].rolAnterior, 'mod');
  assert.equal(trasDemocion.historialModeracion[0].rolNuevo, 'normal');

  // 2. Silenciar en voz TTS
  db.actualizarUsuario(uId, { esSilenciado: true, razon: 'Bot automatizado' });
  const trasSilencio = db.obtenerUsuario(uId);
  assert.equal(trasSilencio.esSilenciado, true);
  assert.equal(trasSilencio.historialModeracion.length, 2);
  assert.equal(trasSilencio.historialModeracion[1].accion, 'mute');

  // 3. Banear de chat
  db.actualizarUsuario(uId, { esBaneado: true, razon: 'Spam no solicitado' });
  const trasBan = db.obtenerUsuario(uId);
  assert.equal(trasBan.esBaneado, true);
  assert.equal(trasBan.historialModeracion.length, 3);
  assert.equal(trasBan.historialModeracion[2].accion, 'ban');

  // 4. Registrar evento de time out
  db.actualizarUsuario(uId, { eventoModeracion: { accion: 'timeout', duracion: 600 } });
  const trasTimeout = db.obtenerUsuario(uId);
  assert.equal(trasTimeout.historialModeracion.length, 4);
  assert.equal(trasTimeout.historialModeracion[3].accion, 'timeout');
  assert.equal(trasTimeout.historialModeracion[3].duracion, 600);

  // 5. Restaurar rol MOD y desbanear (un-ban) desde la memoria histórica
  db.actualizarUsuario(uId, { rol: 'mod', esBaneado: false, esSilenciado: false });
  const restaurado = db.obtenerUsuario(uId);
  assert.equal(restaurado.rol, 'mod');
  assert.equal(restaurado.esBaneado, false);
  assert.equal(restaurado.esSilenciado, false);
  assert.equal(restaurado.historialModeracion.length, 7);

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
