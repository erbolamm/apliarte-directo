/**
 * Tests del módulo tts-fuentes (TTS multiplataforma).
 *
 * Cobertura:
 *  - Parser IRC de Twitch (lógica pura).
 *  - FuenteTwitchIrc con WebSocket mockeado (sin tocar la red).
 *  - FuenteKickPusher: rechaza si faltan parámetros.
 *  - FuenteYoutubeLiveChat: rechaza si faltan parámetros.
 *  - FuenteVpsWebSocket: filtra mensajes que no son type=message.
 *  - crearMensaje: produce un objeto plano y congelado.
 *
 * Sin dependencias externas: usa `node:test` y mocks manuales de WebSocket.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FuenteTwitchIrc,
  FuenteKickPusher,
  FuenteYoutubeLiveChat,
  FuenteVpsWebSocket,
  __test__ as internos,
} from "../public/js/tts-fuentes.js";

const { parsearIrcTwitch, crearMensaje } = internos;

// ─── Parser IRC ──────────────────────────────────────────────────────────────

test("parsearIrcTwitch: PRIVMSG con tags y display-name", () => {
  const linea =
    "@color=#FF0000;display-name=Javier;emotes= :javier!javier@javier.tmi.twitch.tv PRIVMSG #apliarte :hola qué tal";
  const r = parsearIrcTwitch(linea);
  assert.equal(r.comando, "PRIVMSG");
  assert.equal(r.usuario, "javier");
  assert.equal(r.trailing, "hola qué tal");
  assert.equal(r.tags["display-name"], "Javier");
  assert.equal(r.tags.color, "#FF0000");
});

test("parsearIrcTwitch: PING no se considera mensaje", () => {
  const r = parsearIrcTwitch("PING :tmi.twitch.tv");
  assert.equal(r.comando, "PING");
  assert.equal(r.trailing, "tmi.twitch.tv");
});

test("parsearIrcTwitch: línea vacía produce comando vacío", () => {
  const r = parsearIrcTwitch("");
  assert.equal(r.comando, "");
  assert.equal(r.trailing, null);
  assert.equal(r.usuario, null);
});

test("parsearIrcTwitch: usuario con espacios o nicks sin bang", () => {
  const r1 = parsearIrcTwitch(":foo!foo@foo.tmi.twitch.tv PRIVMSG #x :hola");
  assert.equal(r1.usuario, "foo");
  const r2 = parsearIrcTwitch(":justinfan12345 JUSTINFAN12345 JOIN #apliarte");
  assert.equal(r2.usuario, "justinfan12345");
});

test("parsearIrcTwitch: tags sin valor (banderas) salen como string vacía", () => {
  const r = parsearIrcTwitch(
    "@mod=0;subscriber=1 :javier!j@j.tmi.twitch.tv PRIVMSG #x :msg",
  );
  assert.equal(r.tags.mod, "0");
  assert.equal(r.tags.subscriber, "1");
});

// ─── crearMensaje ────────────────────────────────────────────────────────────

test("crearMensaje: devuelve objeto con plataforma, usuario, texto", () => {
  const m = crearMensaje({
    plataforma: "twitch",
    usuario: "Pepe",
    texto: "hola",
  });
  assert.equal(m.plataforma, "twitch");
  assert.equal(m.usuario, "Pepe");
  assert.equal(m.texto, "hola");
});

test('crearMensaje: usuario vacío cae a "alguien"', () => {
  const m = crearMensaje({ plataforma: "twitch", usuario: "", texto: "hola" });
  assert.equal(m.usuario, "alguien");
});

test("crearMensaje: el objeto está congelado (no se puede mutar)", () => {
  const m = crearMensaje({ plataforma: "twitch", usuario: "x", texto: "y" });
  assert.equal(Object.isFrozen(m), true);
});

// ─── FuenteTwitchIrc con WebSocket mockeado ─────────────────────────────────

/** Mock mínimo de WebSocket para no tocar la red. */
class WSMock {
  constructor() {
    this.readyState = 0;
    this.url = "";
    this.sent = [];
    this._handlers = {};
  }
  addEventListener(name, cb) {
    this._handlers[name] ||= [];
    this._handlers[name].push(cb);
  }
  send(data) {
    this.sent.push(String(data));
  }
  close() {
    this.readyState = 3;
    (this._handlers.close || []).forEach((cb) => cb());
  }
  _disparar(name, ev) {
    (this._handlers[name] || []).forEach((cb) => cb(ev));
  }
}

function instalarWSMock() {
  const original = globalThis.WebSocket;
  const ultimaInstancia = { ref: null };
  function MockCtor(url) {
    const ws = new WSMock();
    ws.url = url;
    ultimaInstancia.ref = ws;
    return ws;
  }
  globalThis.WebSocket = MockCtor;
  globalThis.WebSocket.OPEN = 1;
  return {
    restaurar: () => {
      globalThis.WebSocket = original;
    },
    ultimaInstancia: () => ultimaInstancia.ref,
  };
}

test("FuenteTwitchIrc: conectar envía NICK anónimo y JOIN al canal", () => {
  const { restaurar, ultimaInstancia } = instalarWSMock();
  try {
    const f = new FuenteTwitchIrc({ canal: "apliarte" });
    f.conectar();
    const ws = ultimaInstancia();
    ws._disparar("open", {});
    assert.match(ws.sent[0], /^CAP REQ :/);
    assert.match(ws.sent[1], /^NICK justinfan\d{5}$/);
    assert.equal(ws.sent[2], "JOIN #apliarte");
  } finally {
    restaurar();
  }
});

test("FuenteTwitchIrc: PRIVMSG produce mensaje unificado con plataforma=twitch", () => {
  const { restaurar, ultimaInstancia } = instalarWSMock();
  try {
    const f = new FuenteTwitchIrc({ canal: "apliarte" });
    const recibidos = [];
    f.onMensaje((m) => recibidos.push(m));
    f.conectar();
    const ws = ultimaInstancia();
    ws._disparar("open", {});
    ws._disparar("message", {
      data: "@display-name=Pepe;color=#00FF00;id=msg-1 :pepe!p@p.tmi.twitch.tv PRIVMSG #apliarte :hola a todos\r\n",
    });
    assert.equal(recibidos.length, 1);
    assert.equal(recibidos[0].plataforma, "twitch");
    assert.equal(recibidos[0].usuario, "Pepe");
    assert.equal(recibidos[0].texto, "hola a todos");
    assert.equal(recibidos[0].color, "#00FF00");
    assert.equal(recibidos[0].idFuente, "msg-1");
  } finally {
    restaurar();
  }
});

test("FuenteTwitchIrc: PING responde con PONG", () => {
  const { restaurar, ultimaInstancia } = instalarWSMock();
  try {
    const f = new FuenteTwitchIrc({ canal: "x" });
    f.conectar();
    const ws = ultimaInstancia();
    const antesPong = ws.sent.length;
    ws._disparar("message", { data: "PING :tmi.twitch.tv\r\n" });
    assert.equal(ws.sent.length, antesPong + 1);
    assert.equal(ws.sent[ws.sent.length - 1], "PONG :tmi.twitch.tv");
  } finally {
    restaurar();
  }
});

test("FuenteTwitchIrc: !speak -config se ignora como chat y se entrega como config", () => {
  const { restaurar, ultimaInstancia } = instalarWSMock();
  try {
    const f = new FuenteTwitchIrc({ canal: "x" });
    const mensajes = [];
    const configs = [];
    f.onMensaje((m) =>
      m.tipo === "config" ? configs.push(m) : mensajes.push(m),
    );
    f.conectar();
    const ws = ultimaInstancia();
    ws._disparar("open", {});
    ws._disparar("message", {
      data: ":user!u@u.tmi.twitch.tv PRIVMSG #x :!speak -config es-ES 1\r\n",
    });
    assert.equal(mensajes.length, 0);
    assert.equal(configs.length, 1);
    assert.equal(configs[0].usuario, "user");
    assert.match(configs[0].texto, /es-ES/);
  } finally {
    restaurar();
  }
});

test("FuenteTwitchIrc: línea sin PRIVMSG se descarta", () => {
  const { restaurar, ultimaInstancia } = instalarWSMock();
  try {
    const f = new FuenteTwitchIrc({ canal: "x" });
    const recibidos = [];
    f.onMensaje((m) => recibidos.push(m));
    f.conectar();
    const ws = ultimaInstancia();
    ws._disparar("message", { data: ":user!u@u.tmi.twitch.tv JOIN #x\r\n" });
    assert.equal(recibidos.length, 0);
  } finally {
    restaurar();
  }
});

test("FuenteTwitchIrc: conectar con canal vacío lanza error claro", () => {
  const f = new FuenteTwitchIrc({ canal: "" });
  assert.throws(() => f.conectar(), /canal requerido/);
});

// ─── Fuentes pendientes: deben fallar limpio si faltan datos ─────────────────

test("FuenteKickPusher: conectar sin parámetros lanza error claro", () => {
  const f = new FuenteKickPusher();
  assert.throws(() => f.conectar(), /appKey, cluster y channelId/);
});

test("FuenteYoutubeLiveChat: conectar sin parámetros lanza error claro", async () => {
  const f = new FuenteYoutubeLiveChat();
  await assert.rejects(() => f.conectar(), /apiKey y liveChatId/);
});

test("FuenteVpsWebSocket: filtra mensajes que no son type=message", () => {
  const { restaurar, ultimaInstancia } = instalarWSMock();
  try {
    const f = new FuenteVpsWebSocket({ wsUrl: "wss://test/ws" });
    const mensajes = [];
    f.onMensaje((m) => mensajes.push(m));
    f.conectar();
    const ws = ultimaInstancia();
    // Mensaje de escena OBS: NO debe pasar
    ws._disparar("message", {
      data: '{"type":"scene","scene":"bg","visible":true}',
    });
    // Mensaje de chat: SÍ debe pasar
    ws._disparar("message", {
      data: '{"type":"message","user":"pepe","text":"hola"}',
    });
    assert.equal(mensajes.length, 1);
    assert.equal(mensajes[0].plataforma, "vps");
    assert.equal(mensajes[0].usuario, "pepe");
    assert.equal(mensajes[0].texto, "hola");
  } finally {
    restaurar();
  }
});

// ─── Office chat commands (!cafe, !git, !say, !estado) ───────────────────────

const {
  parsearComandoChat,
  sanearTextoComando,
  crearFiltroCooldown,
  filtrarMensajeDuranteVotacion,
  calcularQuorumEspectadores,
  estaAutorizado,
  AUTORIZADORES_JUEGO,
  QUORUM_ESPECTADORES_MIN,
} = internos;

test("parsearComandoChat: !cafeteria, !entregas, !oficina y !reuniones nombran una zona", () => {
  assert.deepEqual(parsearComandoChat("!cafeteria"), { comando: "zona", zona: "lounge" });
  assert.deepEqual(parsearComandoChat("!cafetería"), { comando: "zona", zona: "lounge" });
  assert.deepEqual(parsearComandoChat("  !CAFETERIA  "), { comando: "zona", zona: "lounge" });
  assert.deepEqual(parsearComandoChat("!entregas"), { comando: "zona", zona: "deliv" });
  assert.deepEqual(parsearComandoChat("!oficina"), { comando: "zona", zona: "work" });
  assert.deepEqual(parsearComandoChat("!reuniones"), { comando: "zona", zona: "orch" });
  assert.deepEqual(parsearComandoChat("!oficina ge"), { comando: "zona", zona: "work", agente: "ge" });
  assert.deepEqual(parsearComandoChat("!cafe"), { comando: "cafe" });
});

test("parsearComandoChat: reconoce !cafe, !git, !estado y !agentes", () => {
  assert.deepEqual(parsearComandoChat("!cafe"), { comando: "cafe" });
  assert.deepEqual(parsearComandoChat("  !CAFE  "), { comando: "cafe" });
  assert.deepEqual(parsearComandoChat("!cafe om"), { comando: "cafe", agente: "om" });
  assert.deepEqual(parsearComandoChat("!cafe pi"), { comando: "cafe", agente: "pi" });
  assert.deepEqual(parsearComandoChat("!git"), { comando: "git" });
  assert.deepEqual(parsearComandoChat("!estado"), { comando: "estado" });
  assert.deepEqual(parsearComandoChat("!agentes"), { comando: "estado" });
  assert.deepEqual(parsearComandoChat("!tema musica"), { comando: "tema", texto: "musica", requiereAutorizacion: true });
  assert.deepEqual(parsearComandoChat("!categoria arte"), { comando: "tema", texto: "arte", requiereAutorizacion: true });
  assert.deepEqual(parsearComandoChat("!fondo"), { comando: "tema", texto: "", requiereAutorizacion: true });
  assert.deepEqual(parsearComandoChat("!claro"), { comando: "tema_modo", modo: "light", requiereAutorizacion: true });
  assert.deepEqual(parsearComandoChat("!dia"), { comando: "tema_modo", modo: "light", requiereAutorizacion: true });
  assert.deepEqual(parsearComandoChat("!oscuro"), { comando: "tema_modo", modo: "dark", requiereAutorizacion: true });
  assert.deepEqual(parsearComandoChat("!noche"), { comando: "tema_modo", modo: "dark", requiereAutorizacion: true });
  assert.deepEqual(parsearComandoChat("!sms hola javier"), { comando: "sms", texto: "hola javier" });
  assert.deepEqual(parsearComandoChat("!mensaje pregunta importante"), { comando: "sms", texto: "pregunta importante" });
  assert.deepEqual(parsearComandoChat("!nota revisar pr"), { comando: "sms", texto: "revisar pr" });
  assert.deepEqual(parsearComandoChat("!sms"), { comando: "sms", texto: "" });
  assert.deepEqual(parsearComandoChat("!w"), { comando: "mover", dir: "w", pasos: 1 });
  assert.deepEqual(parsearComandoChat("!aaaaa"), { comando: "mover", dir: "a", pasos: 5 });
  assert.deepEqual(parsearComandoChat("!s 3"), { comando: "mover", dir: "s", pasos: 3 });
  assert.deepEqual(parsearComandoChat("!dddddddddd"), { comando: "mover", dir: "d", pasos: 6 });
  // Mixed routes in one message (requested live on 2026-09-26): runs of the same letter.
  assert.deepEqual(parsearComandoChat("!wwsaaasddadss"), {
    comando: "mover",
    ruta: [
      { dir: "w", pasos: 2 }, { dir: "s", pasos: 1 }, { dir: "a", pasos: 3 }, { dir: "s", pasos: 1 },
      { dir: "d", pasos: 2 }, { dir: "a", pasos: 1 }, { dir: "d", pasos: 1 }, { dir: "s", pasos: 2 },
    ],
  });
  assert.deepEqual(parsearComandoChat("!WWSD"), {
    comando: "mover",
    ruta: [{ dir: "w", pasos: 2 }, { dir: "s", pasos: 1 }, { dir: "d", pasos: 1 }],
  });
  // A route never exceeds 24 steps in total, however long the message is.
  const larga = parsearComandoChat("!" + "wd".repeat(40));
  assert.equal(larga.comando, "mover");
  assert.equal(larga.ruta.reduce((t, r) => t + r.pasos, 0), 24);
  assert.deepEqual(parsearComandoChat("!salta"), { comando: "salta" });
  assert.deepEqual(parsearComandoChat("!jump"), { comando: "salta" });
  assert.deepEqual(parsearComandoChat("!r"), { comando: "reset" });
  assert.deepEqual(parsearComandoChat("!volver"), { comando: "reset" });
  assert.deepEqual(parsearComandoChat("!fiesta"), { comando: "fiesta", requiereAutorizacion: true });
  assert.deepEqual(parsearComandoChat("!trabaja"), { comando: "trabajar" });
  assert.deepEqual(parsearComandoChat("!bronca"), { comando: "bronca", requiereAutorizacion: true });
  assert.deepEqual(parsearComandoChat("!beso ge"), { comando: "beso", agente: "ge" });
  assert.deepEqual(parsearComandoChat("!info"), { comando: "info" });
  assert.deepEqual(parsearComandoChat("!ayuda"), { comando: "info" });
  assert.deepEqual(parsearComandoChat("!comandos"), { comando: "info" });
  assert.deepEqual(parsearComandoChat("!juego"), {
    comando: "juego",
    variante: null,
    requiereAutorizacion: true,
  });
  assert.deepEqual(parsearComandoChat("!carrera"), {
    comando: "juego",
    variante: "trofeo",
    requiereAutorizacion: true,
  });
});

// ─── Comandos de juegos (!juego, !trofeo, !traidor) ──────────────────────────

test("parsearComandoChat: !juego, !juegos, !minijuego y !partida marcan requiereAutorizacion=true con variante null", () => {
  assert.deepEqual(parsearComandoChat("!juego"), {
    comando: "juego",
    variante: null,
    requiereAutorizacion: true,
  });
  assert.deepEqual(parsearComandoChat("  !JUEGO  "), {
    comando: "juego",
    variante: null,
    requiereAutorizacion: true,
  });
  assert.deepEqual(parsearComandoChat("!juegos"), {
    comando: "juego",
    variante: null,
    requiereAutorizacion: true,
  });
  assert.deepEqual(parsearComandoChat("!minijuego"), {
    comando: "juego",
    variante: null,
    requiereAutorizacion: true,
  });
  assert.deepEqual(parsearComandoChat("!partida"), {
    comando: "juego",
    variante: null,
    requiereAutorizacion: true,
  });
  assert.deepEqual(parsearComandoChat("!abrirjuegos"), {
    comando: "juego",
    variante: null,
    requiereAutorizacion: true,
  });
});

test("parsearComandoChat: !trofeo y !carrera son alias canónicos de la variante trofeo", () => {
  assert.deepEqual(parsearComandoChat("!trofeo"), {
    comando: "juego",
    variante: "trofeo",
    requiereAutorizacion: true,
  });
  assert.deepEqual(parsearComandoChat("!TROFEO"), {
    comando: "juego",
    variante: "trofeo",
    requiereAutorizacion: true,
  });
  assert.deepEqual(parsearComandoChat("!carrera"), {
    comando: "juego",
    variante: "trofeo",
    requiereAutorizacion: true,
  });
  assert.deepEqual(parsearComandoChat("!game"), {
    comando: "juego",
    variante: "trofeo",
    requiereAutorizacion: true,
  });
  assert.equal(
    parsearComandoChat("!trofeo").variante,
    parsearComandoChat("!carrera").variante,
  );
});

test("parsearComandoChat: !traidor mapea a variante traidor", () => {
  assert.deepEqual(parsearComandoChat("!traidor"), {
    comando: "juego",
    variante: "traidor",
    requiereAutorizacion: true,
  });
  assert.deepEqual(parsearComandoChat("!TRAIDOR"), {
    comando: "juego",
    variante: "traidor",
    requiereAutorizacion: true,
  });
});

test("AUTORIZADORES_JUEGO contiene a Javier y QUORUM_ESPECTADORES_MIN vale 3", () => {
  assert.equal(AUTORIZADORES_JUEGO instanceof Set, true);
  assert.equal(AUTORIZADORES_JUEGO.has("ja"), true);
  assert.equal(AUTORIZADORES_JUEGO.has("apliarte"), true);
  assert.equal(QUORUM_ESPECTADORES_MIN, 3);
});

test("estaAutorizado: !juego solo lo puede lanzar Javier (ja o apliarte)", () => {
  const juego = parsearComandoChat("!juego");
  assert.equal(estaAutorizado(juego, "ja"), true);
  assert.equal(estaAutorizado(juego, "JA"), true);
  assert.equal(estaAutorizado(juego, "  ja  "), true);
  assert.equal(estaAutorizado(juego, "apliarte"), true);
  assert.equal(estaAutorizado(juego, "ApliArte"), true);
  assert.equal(estaAutorizado(juego, "viewer1"), false);
  assert.equal(estaAutorizado(juego, ""), false);
  assert.equal(estaAutorizado(juego, null), false);
  assert.equal(estaAutorizado(juego, undefined), false);
});

test("estaAutorizado: cualquier comando sin requiereAutorizacion pasa sin chequeo", () => {
  const cafe = parsearComandoChat("!cafe");
  const git = parsearComandoChat("!git");
  const sms = parsearComandoChat("!sms hola");
  const say = parsearComandoChat("!say cl hola");
  assert.equal(estaAutorizado(cafe, "viewer1"), true);
  assert.equal(estaAutorizado(cafe, "cualquiera"), true);
  assert.equal(estaAutorizado(git, "viewer1"), true);
  assert.equal(estaAutorizado(sms, "viewer1"), true);
  assert.equal(estaAutorizado(say, "viewer1"), true);
  assert.equal(estaAutorizado(null, "viewer1"), true);
});

test("estaAutorizado: acepta un Set de autorizadores personalizado", () => {
  const juego = parsearComandoChat("!juego");
  const allow = new Set(["apliarte", "co"]);
  assert.equal(estaAutorizado(juego, "apliarte", { autorizadores: allow }), true);
  assert.equal(estaAutorizado(juego, "co", { autorizadores: allow }), true);
  assert.equal(estaAutorizado(juego, "ja", { autorizadores: allow }), false);
});

// ─── filtrarMensajeDuranteVotacion ───────────────────────────────────────────

test("filtrarMensajeDuranteVotacion: extrae el primer entero positivo del texto", () => {
  assert.equal(filtrarMensajeDuranteVotacion("1"), 1);
  assert.equal(filtrarMensajeDuranteVotacion("2"), 2);
  assert.equal(filtrarMensajeDuranteVotacion("voto 1"), 1);
  assert.equal(filtrarMensajeDuranteVotacion("opcion 2 porfa"), 2);
  assert.equal(filtrarMensajeDuranteVotacion("yo voto 1 y no 2"), 1);
  assert.equal(filtrarMensajeDuranteVotacion("  3  "), 3);
});

test("filtrarMensajeDuranteVotacion: ignora comandos regulares y devuelve el número si lo hay", () => {
  assert.equal(filtrarMensajeDuranteVotacion("!trofeo 1"), 1);
  assert.equal(filtrarMensajeDuranteVotacion("!cafe 2"), 2);
  assert.equal(filtrarMensajeDuranteVotacion("!say cl 1"), 1);
  assert.equal(filtrarMensajeDuranteVotacion("!traidor 2 gracias"), 2);
});

test("filtrarMensajeDuranteVotacion: texto sin número devuelve null", () => {
  assert.equal(filtrarMensajeDuranteVotacion("hola"), null);
  assert.equal(filtrarMensajeDuranteVotacion("!trofeo"), null);
  assert.equal(filtrarMensajeDuranteVotacion("!cafe"), null);
  assert.equal(filtrarMensajeDuranteVotacion(""), null);
  assert.equal(filtrarMensajeDuranteVotacion("   "), null);
  assert.equal(filtrarMensajeDuranteVotacion(null), null);
  assert.equal(filtrarMensajeDuranteVotacion(undefined), null);
});

test("filtrarMensajeDuranteVotacion: cero, números negativos y no-enteros no son votos válidos", () => {
  assert.equal(filtrarMensajeDuranteVotacion("0"), null);
  assert.equal(filtrarMensajeDuranteVotacion("-1"), 1);
  assert.equal(filtrarMensajeDuranteVotacion("-2"), 2);
  assert.equal(filtrarMensajeDuranteVotacion("00"), null);
  assert.equal(filtrarMensajeDuranteVotacion("+1"), 1);
  assert.equal(filtrarMensajeDuranteVotacion("3.5"), 3);
});

test("filtrarMensajeDuranteVotacion: procesa enteros enormes pero finitos sin colapsar", () => {
  const enorme = "1".repeat(100);
  assert.equal(
    filtrarMensajeDuranteVotacion(enorme),
    Number.parseInt("1".repeat(100), 10),
  );
});

// ─── calcularQuorumEspectadores ──────────────────────────────────────────────

test("calcularQuorumEspectadores: cumple cuando hay 3 o más espectadores (sin ja)", () => {
  const owners = {
    co: "viewer1",
    cl: "viewer2",
    pi: "viewer3",
    ge: "viewer4",
    be: "viewer5",
  };
  const q = calcularQuorumEspectadores(owners);
  assert.equal(q.cumplen, true);
  assert.equal(q.actual, 5);
  assert.equal(q.faltan, 0);
  assert.equal(q.umbral, 3);
  assert.equal(q.espectadores.length, 5);
});

test("calcularQuorumEspectadores: exacto en el umbral cumple sin faltar", () => {
  const q = calcularQuorumEspectadores({ co: "v1", cl: "v2", pi: "v3" });
  assert.equal(q.cumplen, true);
  assert.equal(q.actual, 3);
  assert.equal(q.faltan, 0);
});

test("calcularQuorumEspectadores: faltan espectadores cuando no llega al umbral", () => {
  const q = calcularQuorumEspectadores({ co: "v1", cl: "v2" });
  assert.equal(q.cumplen, false);
  assert.equal(q.actual, 2);
  assert.equal(q.faltan, 1);
});

test("calcularQuorumEspectadores: excluye el avatar ja aunque esté adoptado", () => {
  const q = calcularQuorumEspectadores({
    co: "v1",
    cl: "v2",
    pi: "v3",
    ja: "apliarte",
  });
  assert.equal(q.cumplen, true);
  assert.equal(q.actual, 3);
  assert.equal(q.espectadores.length, 3);
  assert.ok(q.espectadores.every((e) => e.avatarId !== "ja"));
});

test("calcularQuorumEspectadores: excluye adopciones cuyo dueño es ja (case-insensitive)", () => {
  const q1 = calcularQuorumEspectadores({
    co: "v1",
    cl: "ja",
    pi: "v3",
  });
  assert.equal(q1.cumplen, false);
  assert.equal(q1.actual, 2);
  assert.equal(q1.faltan, 1);
  assert.deepEqual(
    q1.espectadores.map((e) => e.avatarId),
    ["co", "pi"],
  );

  const q2 = calcularQuorumEspectadores({ co: "JA", cl: "  Ja  " });
  assert.equal(q2.actual, 0);
  assert.equal(q2.cumplen, false);
  assert.equal(q2.faltan, 3);
});

test("calcularQuorumEspectadores: ignora avatares no adoptados (null/undefined/empty)", () => {
  const q = calcularQuorumEspectadores({
    co: "v1",
    cl: null,
    pi: undefined,
    ge: "",
    be: "v2",
  });
  assert.equal(q.actual, 2);
  assert.equal(q.cumplen, false);
  assert.equal(q.faltan, 1);
});

test("calcularQuorumEspectadores: entrada vacía o inválida devuelve faltan = umbral", () => {
  assert.equal(calcularQuorumEspectadores({}).cumplen, false);
  assert.equal(calcularQuorumEspectadores({}).actual, 0);
  assert.equal(calcularQuorumEspectadores({}).faltan, 3);

  assert.equal(calcularQuorumEspectadores(null).cumplen, false);
  assert.equal(calcularQuorumEspectadores(null).actual, 0);
  assert.equal(calcularQuorumEspectadores(null).faltan, 3);

  assert.equal(calcularQuorumEspectadores(undefined).cumplen, false);
  assert.equal(calcularQuorumEspectadores(undefined).actual, 0);

  assert.equal(calcularQuorumEspectadores("no es objeto").cumplen, false);
  assert.equal(calcularQuorumEspectadores([1, 2, 3]).cumplen, false);
});

test("calcularQuorumEspectadores: umbral personalizado funciona y se redondea hacia abajo", () => {
  const q1 = calcularQuorumEspectadores({ co: "v1", cl: "v2" }, { umbral: 2 });
  assert.equal(q1.cumplen, true);
  assert.equal(q1.faltan, 0);
  assert.equal(q1.umbral, 2);

  const q2 = calcularQuorumEspectadores({ co: "v1" }, { umbral: 5 });
  assert.equal(q2.cumplen, false);
  assert.equal(q2.faltan, 4);
  assert.equal(q2.umbral, 5);

  const q3 = calcularQuorumEspectadores({ co: "v1" }, { umbral: 2.9 });
  assert.equal(q3.umbral, 2);
  assert.equal(q3.cumplen, false);
  assert.equal(q3.faltan, 1);
});

test("calcularQuorumEspectadores: umbral 0 siempre cumple con 0 o más espectadores", () => {
  const q = calcularQuorumEspectadores({}, { umbral: 0 });
  assert.equal(q.umbral, 0);
  assert.equal(q.actual, 0);
  assert.equal(q.cumplen, true);
  assert.equal(q.faltan, 0);
});

test("calcularQuorumEspectadores: devuelve los pares avatar/owner de los adoptantes", () => {
  const q = calcularQuorumEspectadores({
    co: "viewer1",
    cl: "viewer2",
    pi: "viewer3",
  });
  assert.deepEqual(q.espectadores, [
    { avatarId: "co", owner: "viewer1" },
    { avatarId: "cl", owner: "viewer2" },
    { avatarId: "pi", owner: "viewer3" },
  ]);
});

test("parsearComandoChat: !say con agente conocido y !hablar sin agente", () => {
  assert.deepEqual(parsearComandoChat("!say cl hola equipo"), {
    comando: "say",
    agente: "cl",
    texto: "hola equipo",
  });
  assert.deepEqual(parsearComandoChat("!say hola sin agente"), {
    comando: "say",
    agente: null,
    texto: "hola sin agente",
  });
  assert.deepEqual(parsearComandoChat("!hablar buenas tardes"), {
    comando: "say",
    agente: null,
    texto: "buenas tardes",
  });
});

test("parsearComandoChat: reconoce adopción de avatar (!<agente>), hablar directo y !liberar", () => {
  assert.deepEqual(parsearComandoChat("!ge"), { comando: "adoptar", agente: "ge" });
  assert.deepEqual(parsearComandoChat("!cl"), { comando: "adoptar", agente: "cl" });
  assert.deepEqual(parsearComandoChat("!om"), { comando: "adoptar", agente: "om" });
  assert.deepEqual(parsearComandoChat("!ge hola a todos"), {
    comando: "say",
    agente: "ge",
    texto: "hola a todos",
  });
  assert.deepEqual(parsearComandoChat("!liberar"), { comando: "liberar" });
  assert.deepEqual(parsearComandoChat("!liberar todos"), {
    comando: "liberar",
    agente: "todos",
    requiereAutorizacion: true,
  });
  assert.deepEqual(parsearComandoChat("!liberar ge"), {
    comando: "liberar",
    agente: "ge",
    requiereAutorizacion: true,
  });
  assert.deepEqual(parsearComandoChat("!liberar @noto90"), {
    comando: "liberar",
    usuarioObjetivo: "noto90",
    requiereAutorizacion: true,
  });
});

test("parsearComandoChat: ignora chat normal, comandos desconocidos y textos vacíos", () => {
  assert.equal(parsearComandoChat("hola !cafe"), null);
  assert.equal(parsearComandoChat("!speak -config es-ES 1"), null);
  assert.equal(parsearComandoChat("!desconocido"), null);
  assert.equal(parsearComandoChat("!say cl"), null);
  assert.equal(parsearComandoChat("!hablar    "), null);
  assert.equal(parsearComandoChat(""), null);
});

test("sanearTextoComando: elimina HTML, ANSI y control, y limita a 120 caracteres", () => {
  assert.equal(
    sanearTextoComando("<b>hola</b> \u001b[31mrojo\u001b[0m\u0007 fin"),
    "hola rojo fin",
  );
  assert.equal(sanearTextoComando("<script>alert(1)</script>x"), "alert(1)x");
  assert.equal(sanearTextoComando("a".repeat(300)).length, 120);
  const dicho = parsearComandoChat(`!hablar ${"b".repeat(500)}`);
  assert.equal(dicho.texto.length, 120);
});

test("crearFiltroCooldown: deja pasar uno cada 4 segundos", () => {
  let ahora = 1000;
  const permitir = crearFiltroCooldown(4000, () => ahora);
  assert.equal(permitir(), true);
  ahora += 3999;
  assert.equal(permitir(), false);
  ahora += 1;
  assert.equal(permitir(), true);
});

test("FuenteTwitchIrc: reenvía comandos a la oficina con cooldown y sigue emitiendo el chat", async () => {
  const { restaurar, ultimaInstancia } = instalarWSMock();
  try {
    let ahora = 0;
    const llamadas = [];
    const fetchImpl = async (url, init) => {
      llamadas.push({ url, init });
      return { ok: true };
    };
    const f = new FuenteTwitchIrc({
      canal: "x",
      reloj: () => ahora,
      fetchImpl,
    });
    const recibidos = [];
    f.onMensaje((m) => recibidos.push(m));
    f.conectar();
    const ws = ultimaInstancia();
    ws._disparar("open", {});
    const linea = (id, texto) =>
      `@display-name=Pepe;id=${id} :pepe!p@p.tmi.twitch.tv PRIVMSG #x :${texto}\r\n`;
    ws._disparar("message", { data: linea("m1", "!say cl <i>hola</i>") });
    ws._disparar("message", { data: linea("m2", "!cafe") }); // cooldown
    ws._disparar("message", { data: linea("m3", "chat normal") });
    ahora = 4000;
    ws._disparar("message", { data: linea("m4", "!cafe") });

    assert.equal(recibidos.length, 4, "el chat se sigue emitiendo entero");
    assert.equal(llamadas.length, 2);
    assert.equal(llamadas[0].url, "http://127.0.0.1:8791/api/directo/comando");
    assert.equal(llamadas[0].init.method, "POST");
    assert.equal(llamadas[0].init.headers["x-erbolamm-directo"], "comando");
    assert.deepEqual(JSON.parse(llamadas[0].init.body), {
      comando: "say",
      agente: "cl",
      texto: "hola",
      usuario: "Pepe",
      idFuente: "m1",
    });
    assert.equal(JSON.parse(llamadas[1].init.body).comando, "cafe");
  } finally {
    restaurar();
  }
});

test("FuenteTwitchIrc: puenteOficina=false no reenvía nada", () => {
  const { restaurar, ultimaInstancia } = instalarWSMock();
  try {
    const llamadas = [];
    const f = new FuenteTwitchIrc({
      canal: "x",
      puenteOficina: false,
      fetchImpl: async (...a) => llamadas.push(a),
    });
    f.conectar();
    const ws = ultimaInstancia();
    ws._disparar("message", {
      data: ":u!u@u.tmi.twitch.tv PRIVMSG #x :!cafe\r\n",
    });
    assert.equal(llamadas.length, 0);
  } finally {
    restaurar();
  }
});

test("FuenteTwitchIrc: !juego de un espectador NO se reenvía a la oficina (sin autorización)", () => {
  const { restaurar, ultimaInstancia } = instalarWSMock();
  try {
    const llamadas = [];
    const fetchImpl = async (url, init) => {
      llamadas.push({ url, init });
      return { ok: true };
    };
    const f = new FuenteTwitchIrc({ canal: "x", fetchImpl });
    f.conectar();
    const ws = ultimaInstancia();
    ws._disparar("open", {});
    ws._disparar("message", {
      data:
        "@display-name=Viewer1;id=m1 :viewer1!v@v.tmi.twitch.tv PRIVMSG #x :!juego\r\n",
    });
    assert.equal(llamadas.length, 0);
  } finally {
    restaurar();
  }
});

test("FuenteTwitchIrc: !juego de Javier (ja) SÍ se reenvía a la oficina", () => {
  const { restaurar, ultimaInstancia } = instalarWSMock();
  try {
    const llamadas = [];
    const fetchImpl = async (url, init) => {
      llamadas.push({ url, init });
      return { ok: true };
    };
    const f = new FuenteTwitchIrc({ canal: "x", fetchImpl });
    f.conectar();
    const ws = ultimaInstancia();
    ws._disparar("open", {});
    ws._disparar("message", {
      data:
        "@display-name=ja;id=m1 :ja!ja@ja.tmi.twitch.tv PRIVMSG #x :!juego\r\n",
    });
    assert.equal(llamadas.length, 1);
    const body = JSON.parse(llamadas[0].init.body);
    assert.equal(body.comando, "juego");
    assert.equal(body.requiereAutorizacion, true);
    assert.equal(body.variante, null);
    assert.equal(body.usuario, "ja");
    assert.equal(body.idFuente, "m1");
  } finally {
    restaurar();
  }
});

test("FuenteTwitchIrc: !trofeo y !traidor requieren autorización de Javier", () => {
  const { restaurar, ultimaInstancia } = instalarWSMock();
  try {
    let ahora = 0;
    const llamadas = [];
    const fetchImpl = async (url, init) => {
      llamadas.push({ url, init });
      return { ok: true };
    };
    const f = new FuenteTwitchIrc({
      canal: "x",
      reloj: () => ahora,
      fetchImpl,
    });
    f.conectar();
    const ws = ultimaInstancia();
    ws._disparar("open", {});
    // Espectadores normales son bloqueados
    ws._disparar("message", {
      data:
        "@display-name=Viewer1;id=m1 :v!v@v.tmi.twitch.tv PRIVMSG #x :!trofeo\r\n",
    });
    ahora = 4000;
    ws._disparar("message", {
      data:
        "@display-name=Viewer2;id=m2 :v!v@v.tmi.twitch.tv PRIVMSG #x :!traidor\r\n",
    });
    assert.equal(llamadas.length, 0);

    // Javier (broadcaster o nick autorizado) sí es admitido
    ahora = 8000;
    ws._disparar("message", {
      data:
        "@badges=broadcaster/1;display-name=Javier;id=m3 :apliarte!apliarte@apliarte.tmi.twitch.tv PRIVMSG #x :!trofeo\r\n",
    });
    ahora = 12000;
    ws._disparar("message", {
      data:
        "@display-name=ja;id=m4 :ja!ja@ja.tmi.twitch.tv PRIVMSG #x :!traidor\r\n",
    });
    assert.equal(llamadas.length, 2);
    assert.equal(JSON.parse(llamadas[0].init.body).variante, "trofeo");
    assert.equal(JSON.parse(llamadas[0].init.body).requiereAutorizacion, true);
    assert.equal(JSON.parse(llamadas[1].init.body).variante, "traidor");
    assert.equal(JSON.parse(llamadas[1].init.body).requiereAutorizacion, true);
  } finally {
    restaurar();
  }
});
