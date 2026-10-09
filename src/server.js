/**
 * Centro de restream local.
 *
 * OBS publica en rtmp://localhost:1935/live/<ruta>. Desde ahí se reenvía a cada destino con un
 * FFmpeg propio. Si OBS deja de publicar, se sustituye por el vídeo de respaldo en bucle.
 */

import { createServer } from "node:http";
import { randomInt, timingSafeEqual } from "node:crypto";
import {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { corsPanelLocal } from "./panel-origin.js";
import { Server as ServidorSocket } from "socket.io";
import NodeMediaServer from "node-media-server";

import { validarConfiguracion } from "./configuracion.js";
import { CentroEstado, ESTADOS } from "./estado.js";
import { ReintentosRelay, puedeReintentar } from "./reintento-relay.js";
import { GestorProcesos } from "./procesos.js";
import { rutaDeSesion, nombreDeFlujo } from "./sesion-rtmp.js";
import {
  CATEGORIAS,
  CATEGORIA_POR_DEFECTO,
  esCategoriaValida,
  paletaDe,
} from "./categorias.js";
import { analizarCategoriaGuardada } from "./categoria-estado.js";
import { ajustarGracia, GRACIA_POR_DEFECTO_MS } from "./gracia.js";
import { planificarRelevo, PAUSA_RELEVO_MS } from "./relevo.js";
import { WalkSignaling } from "./walk-signaling.js";
import { crearRutasPanel } from "./panel-rutas.js";
import { iniciarObsBridge } from "./obs-bridge.js";
import { esParadaDeliberada, hayEmisionQueCerrar } from "./cierre-obs.js";
import { bridgeOptions } from "./obs-bridge-config.js";
import { resolveDestinationKey } from "./stream-credentials.js";
import { cargarHistorial, crearGuardador } from "./pizarra-historial.js";
import ContextoNms from "node-media-server/src/core/context.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
// Local, gitignored launch settings (data/directo.local.json → {"env": {...}}).
// Explicit environment variables still win.
try {
  const local = JSON.parse(readFileSync(join(RAIZ, "data", "directo.local.json"), "utf8"));
  for (const [k, v] of Object.entries(local.env || {})) {
    if (process.env[k] === undefined) process.env[k] = String(v);
  }
} catch (_) { /* no local settings: public defaults */ }

const DATA_DIR = process.env.DATA_DIR || join(RAIZ, "data");
const destinationKey = (destination) => resolveDestinationKey(destination, DATA_DIR, process.env);

// GAME_HUB_START — pure state machine, kept here because this task owns server.js only.
function createGameHub({ randomIndex = randomInt, now = Date.now } = {}) {
  const durations = { lobby_votacion: 60000, traidor_intro: 5000, traidor_debate: 300000, traidor_votacion: 45000, muerte_subita: 45000 };
  let state = { fase: "idle", expiresAt: 0, players: [], owners: {}, traitorId: null,
    votes: new Map(), round: 0, lastExpelled: null, winner: null };
  function phase(fase) { state.fase = fase; state.expiresAt = durations[fase] ? now() + durations[fase] : 0; }
  function counts() {
    const result = Object.fromEntries(state.players.map((_, i) => [String(i + 1), 0]));
    for (const choice of state.votes.values()) if (choice in result) result[choice]++;
    return result;
  }
  function expire() {
    if (!state.expiresAt || now() < state.expiresAt) return;
    if (state.fase === "lobby_votacion") phase("idle");
    else if (state.fase === "traidor_intro") phase("traidor_debate");
    else if (state.fase === "traidor_debate") { state.votes.clear(); phase("traidor_votacion"); }
    else if (["traidor_votacion", "muerte_subita"].includes(state.fase)) phase("traidor_expulsion");
  }
  function publicState() {
    expire();
    return { fase: state.fase, tiempoRestanteMs: Math.max(0, state.expiresAt - now()),
      quoromMinimo: 3, espectadoresAdoptados: Object.values(state.owners),
      juegoSeleccionado: state.traitorId ? "traidor" : null, votos: counts(),
      rondaTraidor: state.round, jugadoresVivos: [...state.players],
      ultimoExpulsado: state.lastExpelled, ganador: state.winner };
  }
  function privateState() {
    const secret = state.traitorId && state.fase !== "idle"
      ? { avatarId: state.traitorId, twitchUser: state.owners[state.traitorId] } : null;
    return { partidaActiva: state.fase !== "idle", fase: state.fase, traidorSecreto: secret };
  }
  function lobby() {
    expire();
    if (state.fase !== "idle") throw new Error("A game is already active");
    state = { fase: "idle", expiresAt: 0, players: [], owners: {}, traitorId: null,
      votes: new Map(), round: 0, lastExpelled: null, winner: null };
    phase("lobby_votacion");
    return publicState();
  }
  function startTraitor(owners) {
    expire();
    if (state.fase !== "lobby_votacion") throw new Error("Traitor can start only from the lobby");
    const entries = Object.entries(owners ?? {}).filter(([id, user]) =>
      id !== "ja" && /^[a-z]{2}$/.test(id) && typeof user === "string" && /^[a-zA-Z0-9_]{1,25}$/.test(user));
    const uniqueUsers = new Set(entries.map(([, user]) => user.toLowerCase()));
    if (entries.length < 3 || uniqueUsers.size !== entries.length) throw new Error("At least three distinct adopted avatars are required");
    state.players = entries.map(([id]) => id);
    state.owners = Object.fromEntries(entries);
    state.traitorId = state.players[randomIndex(state.players.length)];
    state.round = 1;
    phase("traidor_intro");
    return publicState();
  }
  function startMockTraitor() {
    expire();
    if (state.fase === "idle") phase("lobby_votacion");
    const mockOwners = { co: "pepe", cl: "marta", pi: "lucas", ge: "elena" };
    startTraitor(mockOwners);
    state.isMock = true;
    return publicState();
  }
  function advance() {
    expire();
    if (state.fase === "traidor_intro") phase("traidor_debate");
    else if (state.fase === "traidor_debate") { state.votes.clear(); phase("traidor_votacion"); }
    else if (["traidor_votacion", "muerte_subita"].includes(state.fase)) phase("traidor_expulsion");
    else if (state.fase === "traidor_expulsion") return resolveExpulsion();
    else throw new Error("This phase cannot be advanced");
    return publicState();
  }
  function vote(user, choice) {
    expire();
    if (!["traidor_votacion", "muerte_subita"].includes(state.fase)) throw new Error("Voting is closed");
    if (typeof user !== "string" || !/^[a-zA-Z0-9_]{1,25}$/.test(user)) throw new Error("Invalid voter");
    if (typeof choice !== "string" || !/^[1-9]\d*$/.test(choice) || Number(choice) > state.players.length)
      throw new Error("Invalid numeric vote");
    state.votes.set(user.toLowerCase(), choice);
    return publicState();
  }
  function resolveExpulsion() {
    if (state.fase !== "traidor_expulsion") throw new Error("Expulsion is not open");
    const tally = counts();
    const max = Math.max(0, ...Object.values(tally));
    const leaders = Object.keys(tally).filter((key) => tally[key] === max);
    if (!max || leaders.length !== 1) throw new Error("No unique voted player; repeat the vote");
    const index = Number(leaders[0]) - 1;
    const expelled = state.players[index];
    state.lastExpelled = expelled;
    state.players.splice(index, 1);
    state.votes.clear();
    if (expelled === state.traitorId) { state.winner = "inocentes"; phase("finalizado"); }
    else if (state.players.length < 3) { state.winner = "traidor"; phase("finalizado"); }
    else {
      state.round++;
      phase(state.players.length === 3 ? "muerte_subita" : "traidor_debate");
    }
    return publicState();
  }
  function repeatVote() {
    if (state.fase !== "traidor_expulsion") throw new Error("No vote to repeat");
    state.votes.clear();
    phase(state.players.length === 3 ? "muerte_subita" : "traidor_votacion");
    return publicState();
  }
  function reset() {
    state = { fase: "idle", expiresAt: 0, players: [], owners: {}, traitorId: null,
      votes: new Map(), round: 0, lastExpelled: null, winner: null };
    return publicState();
  }
  return { publicState, privateState, lobby, startTraitor, startMockTraitor, advance, vote, repeatVote, reset };
}
// GAME_HUB_END

// ─── Configuración ────────────────────────────────────────────────────────────
const rutaConfig = existsSync(join(RAIZ, "config.local.json"))
  ? join(RAIZ, "config.local.json")
  : join(RAIZ, "config.ejemplo.json");

const bruta = JSON.parse(readFileSync(rutaConfig, "utf8"));
const { ok, errores, avisos, configuracion } = validarConfiguracion(
  bruta,
  process.env,
  (destination) => Boolean(destinationKey(destination)),
);

console.log(`Configuración leída de ${rutaConfig.replace(RAIZ, ".")}`);
avisos.forEach((a) => console.warn(`  aviso: ${a}`));
if (!ok) {
  errores.forEach((e) => console.error(`  error: ${e}`));
  console.error("\nLa configuración no es válida. El centro no arranca.");
  process.exit(1);
}

const carpetaVideos = join(RAIZ, "medios", "videos");
const rutaConfigRespaldo = join(RAIZ, "data", "respaldo-config.json");

function obtenerRespaldoActivo() {
  try {
    if (existsSync(rutaConfigRespaldo)) {
      const cfg = JSON.parse(readFileSync(rutaConfigRespaldo, "utf8"));
      if (cfg?.archivo && existsSync(join(carpetaVideos, cfg.archivo))) {
        return cfg.archivo;
      }
    }
  } catch (_) {}
  return "pausa-tecnica.mp4";
}

function resolverArchivoRespaldo() {
  const activo = obtenerRespaldoActivo();
  const rutaDirecta = join(carpetaVideos, activo);
  if (existsSync(rutaDirecta)) return rutaDirecta;
  if (configuracion.respaldo) {
    const rutaConf = resolve(RAIZ, configuracion.respaldo);
    if (existsSync(rutaConf)) return rutaConf;
  }
  return null;
}

const archivoRespaldo = resolverArchivoRespaldo();
const tieneRespaldo = Boolean(archivoRespaldo && existsSync(archivoRespaldo));
if (configuracion.respaldo && !tieneRespaldo) {
  console.log(
    `  Opcional: si pones un vídeo en ${configuracion.respaldo}, se emitirá mientras OBS esté cortado.`,
  );
}

process.stdout?.on("error", (err) => {
  if (err.code === "EPIPE") return;
});
process.stderr?.on("error", (err) => {
  if (err.code === "EPIPE") return;
});

// ─── Estado y procesos ────────────────────────────────────────────────────────
const registro = [];
const anotar = (linea) => {
  const entrada = `${new Date().toISOString().slice(11, 19)} ${linea}`;
  registro.push(entrada);
  if (registro.length > 200) registro.shift();
  try {
    console.log(entrada);
  } catch (_) {}
  try {
    io?.emit("registro", entrada);
  } catch (_) {}
};

const centro = new CentroEstado({
  destinos: configuracion.destinos,
  tieneRespaldo,
});
const procesos = new GestorProcesos({ registrar: anotar, claveDeDestino: destinationKey });

function refreshDestination(destination) {
  destination.listo = destination.variableClave ? Boolean(destinationKey(destination)) : true;
  const state = centro.destinos.get(destination.nombre);
  if (state) state.listo = destination.listo;
  return destination.listo;
}

const difundir = () =>
  io?.emit("estado", {
    ...centro.instantanea(),
    registro: registro.slice(-40),
  });

const reintentos = new ReintentosRelay();

async function arrancarRelays(rutaEntrada) {
  const revision = revisionEntrada;
  const entrada = `rtmp://127.0.0.1:${configuracion.puertoRtmp}/${configuracion.rutaEntrada}/${rutaEntrada}`;
  reintentos.olvidarTodo();
  for (const destino of configuracion.destinos) {
    if (!refreshDestination(destino)) {
      anotar(`[${destino.nombre}] omitido: falta la clave de emisión.`);
      continue;
    }
    await lanzarRelay(destino, entrada, revision);
  }
  difundir();
}

async function lanzarRelay(destino, entrada, revision) {
  const pid = await procesos.arrancarRelay({
    destino,
    entrada,
    entorno: process.env,
    alSalir: (motivo) => {
      centro.procesoFallo(destino.nombre, motivo);
      if (centro.debePasarARespaldo()) {
        anotar(
          `El reenvío cayó: respaldo en ${PAUSA_RELEVO_MS / 1000}s (margen para que el destino suelte al publicador).`,
        );
        pasarARespaldo();
      } else {
        programarReintento(destino, entrada, revision);
      }
      difundir();
    },
  });
  if (pid !== null && revision === revisionEntrada && !cerrando) {
    centro.relayArrancado(destino.nombre, pid);
    reintentos.arrancado(destino.nombre);
  }
}

function programarReintento(destino, entrada, revision) {
  const espera = reintentos.siguienteEspera(destino.nombre);
  anotar(
    `[${destino.nombre}] el reenvío cayó: reintento en ${espera / 1000}s.`,
  );
  setTimeout(() => {
    const procede = puedeReintentar({
      obsActivo: centro.obsActivo,
      manual: centro.estado === ESTADOS.MANUAL,
      mismaSesion: revision === revisionEntrada,
      cerrando,
      yaActivo: procesos.propios.has(destino.nombre),
    });
    if (!procede) return;
    lanzarRelay(destino, entrada, revision)
      .then(difundir)
      .catch((error) =>
        anotar(`[${destino.nombre}] no se pudo reintentar: ${error.message}`),
      );
  }, espera).unref();
}

let relevoEnMarcha = false;
let relevoPendiente = false;
let revisionEntrada = 0;
let cierreVoluntario = false;

// Cierre a propósito: lo piden el panel y OBS al detener la transmisión.
async function finalizarEmisionVoluntaria(motivo) {
  cierreVoluntario = true;
  // Si el respaldo estaba arrancando, que no llegue a salir tras el cierre.
  revisionEntrada++;
  relevoPendiente = false;
  relevoEnMarcha = false;
  for (const d of configuracion.destinos) {
    if (centro.destinos.has(d.nombre)) {
      centro.destinos.get(d.nombre).ultimoModo = "respaldo";
    }
  }
  await procesos.detenerTodos();
  centro.finalizarEmision();
  anotar(motivo);
  difundir();
}

let cierrePorObsEnCurso = false;

// Aviso del OBS Bridge (evento StreamStateChanged). Un corte de red no pasa de aquí.
function alCambiarEmisionObs(datosEvento) {
  if (cerrando || !esParadaDeliberada(datosEvento)) return;
  // OBS avisa dos veces (parando y parado): la segunda ya no encuentra nada que cerrar.
  const pendiente = hayEmisionQueCerrar({
    obsActivo: centro.obsActivo,
    estado: centro.estado,
    relevoEnMarcha,
  });
  // El cierre tarda lo que tarde FFmpeg en morir: el segundo aviso puede llegar a mitad.
  if (!pendiente || cierrePorObsEnCurso) return;
  cierrePorObsEnCurso = true;
  finalizarEmisionVoluntaria("Emisión finalizada: se detuvo la transmisión en OBS")
    .catch((error) => anotar(`Error al finalizar emisión: ${error.message}`))
    .finally(() => {
      cierrePorObsEnCurso = false;
    });
}

async function pasarARespaldo() {
  if (relevoEnMarcha) {
    relevoPendiente = true;
    return;
  } // no perder un corte nuevo
  relevoEnMarcha = true;

  const revision = revisionEntrada;
  const plan = centro.decidirTrasCorte();
  const nombres = new Set(plan.arrancarRespaldoEn);
  // El callback exit puede haber retirado el relay antes del aviso donePublish.
  // No recuperar destinos detenidos a mano ni respaldos que ya fallaron.
  for (const d of centro.destinos.values()) {
    if (
      d.ultimoModo === "relay" ||
      (procesos.propios.has(d.nombre) && d.ultimoModo !== "respaldo")
    )
      nombres.add(d.nombre);
  }
  const aArrancar = [...nombres]
    .map((n) => configuracion.destinos.find((d) => d.nombre === n))
    .filter((d) => d && refreshDestination(d));

  try {
    await planificarRelevo({
      matar: async () => {
        await procesos.detenerTodos();
        if (revision !== revisionEntrada || cerrando) return;
        centro.obsDejaDePublicar();
        difundir();
      },
      arrancar: aArrancar.length
        ? async () => {
            if (revision !== revisionEntrada || cerrando) return;
            for (const destino of aArrancar) {
              if (revision !== revisionEntrada || cerrando) break;
              const pid = await procesos.arrancarRespaldo({
                destino,
                archivo: resolverArchivoRespaldo() || archivoRespaldo,
                entorno: process.env,
                alSalir: (motivo) => {
                  centro.procesoFallo(destino.nombre, motivo);
                  difundir();
                },
              });
              if (pid !== null && revision === revisionEntrada && !cerrando)
                centro.respaldoArrancado(destino.nombre, pid);
            }
            difundir();
          }
        : null,
    });
  } catch (error) {
    anotar(`Relevo detenido por seguridad: ${error.message}`);
  } finally {
    relevoEnMarcha = false;
    difundir();
    if (relevoPendiente && !cerrando) {
      relevoPendiente = false;
      pasarARespaldo().catch((error) => anotar(error.message));
    }
  }
}

// ─── Ingesta RTMP ─────────────────────────────────────────────────────────────
const nms = new NodeMediaServer({
  // Only this machine may push video to the channels; set RTMP_BIND to open it on purpose.
  bind: process.env.RTMP_BIND || "127.0.0.1",
  store: {
    path: "./data/nms",
  },
  rtmp: {
    port: configuracion.puertoRtmp,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
});

// node-media-server v4 emite un unico argumento: la sesion. Ver src/sesion-rtmp.js.
nms.on("postPublish", (sesion) => {
  cierreVoluntario = false;
  const ruta = rutaDeSesion(sesion);
  const flujo = nombreDeFlujo(ruta) || configuracion.rutaEntrada;
  anotar(`OBS empezó a publicar en ${ruta || "(ruta desconocida)"}`);

  // Sin esto, el aviso de corte tardaría 30 s y el directo se quedaría en negro.
  try {
    if (ajustarGracia(ContextoNms, ruta, GRACIA_POR_DEFECTO_MS)) {
      anotar(`Aviso de corte ajustado a ${GRACIA_POR_DEFECTO_MS / 1000}s.`);
    } else {
      anotar(
        "AVISO: no se pudo acortar la ventana de gracia; el corte tardará hasta 30s en detectarse.",
      );
    }
  } catch (e) {
    anotar(
      `AVISO: no se pudo acortar la ventana de gracia (${e.message}); el corte tardará hasta 30s en detectarse.`,
    );
  }
  revisionEntrada++;
  relevoPendiente = false;
  centro.obsPublica();
  arrancarRelays(flujo).catch((error) =>
    anotar(`No se pudo iniciar reenvío: ${error.message}`),
  );
});

nms.on("donePublish", (sesion) => {
  revisionEntrada++;
  anotar(
    `OBS dejó de publicar en ${rutaDeSesion(sesion) || "(ruta desconocida)"}`,
  );
  if (cierreVoluntario) {
    procesos.detenerTodos().catch((error) => anotar(error.message));
    centro.finalizarEmision();
    difundir();
  } else if (!tieneRespaldo) {
    procesos.detenerTodos().catch((error) => anotar(error.message));
    centro.obsDejaDePublicar();
    difundir();
  } else {
    pasarARespaldo();
  }
});

// ─── Panel ────────────────────────────────────────────────────────────────────
const app = express();
const gameHub = createGameHub();
const gameOrigins = new Set(["http://127.0.0.1:8790", "http://localhost:8790",
  "http://127.0.0.1:8791", "http://localhost:8791"]);
// This router runs before the shared CORS middleware: Authorization must be
// allowed for Javier's panel, while file:// OBS may read public state only.
const gameRouter = express.Router();
gameRouter.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && !gameOrigins.has(origin) && !(req.method === "GET" && origin === "null"))
    return res.status(403).json({ error: "Origin not allowed" });
  if (origin) {
    res.set("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
gameRouter.use(express.json());
function requireGamePanel(req, res, next) {
  const expected = process.env.DIRECTO_JUEGO_PANEL_TOKEN;
  if (!expected || expected.length < 32) return res.status(503).json({ error: "Game panel token is not configured" });
  const supplied = req.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: "Unauthorized" });
  next();
}
gameRouter.get("/estado", (_req, res) => res.json(gameHub.publicState()));
gameRouter.get("/privado-javier", requireGamePanel, (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(gameHub.privateState());
});
function gameAction(action) {
  return async (req, res) => {
    try { res.json(await action(req)); }
    catch (error) { res.status(error instanceof TypeError ? 503 : 409).json({ error: error.message }); }
  };
}
gameRouter.post("/lobby", requireGamePanel, gameAction(() => gameHub.lobby()));
gameRouter.post("/iniciar-traidor", requireGamePanel, gameAction(async () => {
  // Read the authoritative, current adoption map. Never accept owners from a client body.
  const response = await fetch("http://127.0.0.1:8791/api/directo/comando?desde=-1", {
    signal: AbortSignal.timeout(3000), cache: "no-store",
  });
  if (!response.ok) throw new TypeError("Office avatar roster is unavailable");
  return gameHub.startTraitor((await response.json()).duenos);
}));
gameRouter.post("/probar-traidor", requireGamePanel, gameAction(() => gameHub.startMockTraitor()));
gameRouter.post("/modo-prueba", requireGamePanel, gameAction(() => gameHub.startMockTraitor()));
gameRouter.post("/avanzar", requireGamePanel, gameAction(() => gameHub.advance()));
gameRouter.post("/forzar-votacion", requireGamePanel, gameAction(() => gameHub.advance()));
gameRouter.post("/voto", requireGamePanel, gameAction((req) => gameHub.vote(req.body?.usuario, req.body?.voto)));
gameRouter.post("/voto-simulado", requireGamePanel, gameAction((req) => {
  // Vote for a target (e.g. target 1, 2, 3) with mock users
  const target = String(req.body?.voto || "2");
  gameHub.vote("viewer_1", target);
  gameHub.vote("viewer_2", target);
  gameHub.vote("viewer_3", "1");
  return gameHub.publicState();
}));
gameRouter.post("/simular-votos", requireGamePanel, gameAction((req) => {
  const target = String(req.body?.voto || "2");
  gameHub.vote("viewer_1", target);
  gameHub.vote("viewer_2", target);
  gameHub.vote("viewer_3", "1");
  return gameHub.publicState();
}));
gameRouter.post("/repetir-votacion", requireGamePanel, gameAction(() => gameHub.repeatVote()));
gameRouter.post("/reiniciar", requireGamePanel, gameAction(() => gameHub.reset()));
app.use("/api/directo/juego", gameRouter);
app.use(corsPanelLocal);
app.use(express.json());
app.use(express.static(join(RAIZ, "public")));
app.use('/medios', express.static(join(RAIZ, 'medios')));
// El panel vive en la raíz de directo/ (la Oficina lo sirve en :8791/twitch-comandos);
// aquí se expone también para abrirlo sin la Oficina.
app.get("/panel-twitch-comandos.html", (_req, res) =>
  res.sendFile(join(RAIZ, "panel-twitch-comandos.html")),
);
app.get("/cristal", (_req, res) =>
  res.sendFile(join(RAIZ, "public", "cristal.html")),
);
app.get("/pizarra", (_req, res) =>
  res.sendFile(join(RAIZ, "public", "pizarra.html")),
);
app.get("/api/estado", (_req, res) => {
  for (const destination of configuracion.destinos) refreshDestination(destination);
  res.json({ ...centro.instantanea(), cierreVoluntario, registro: registro.slice(-40) });
});

app.get("/api/tts", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 160);
  const tl = String(req.query.tl || "es").trim();
  if (!q) {
    res.status(400).type("text/plain").send("Falta texto");
    return;
  }
  const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q)}`;
  try {
    const gRes = await fetch(ttsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!gRes.ok) {
      res.status(gRes.status).type("text/plain").send("Error TTS");
      return;
    }
    const buf = Buffer.from(await gRes.arrayBuffer());
    res.status(200)
      .header("Content-Type", "audio/mpeg")
      .header("Content-Length", buf.length)
      .header("Cache-Control", "public, max-age=86400")
      .header("Access-Control-Allow-Origin", "*")
      .send(buf);
  } catch (err) {
    res.status(500).type("text/plain").send(err.message);
  }
});

app.post("/api/destino/:nombre/detener", async (req, res) => {
  let parado;
  try {
    parado = await procesos.detener(req.params.nombre);
  } catch (error) {
    res.status(500).json({ parado: false, error: error.message });
    return;
  }
  if (parado) {
    // Se marca como parada intencionada: no debe disparar el respaldo.
    centro.procesoFallo(req.params.nombre, "detenido a mano desde el panel");
    centro.destinos.get(req.params.nombre).ultimoModo = "respaldo";
    difundir();
  }
  res.json({ parado });
});

app.post("/api/emision/finalizar", async (_req, res) => {
  try {
    await finalizarEmisionVoluntaria(
      "Emisión finalizada voluntariamente desde el panel",
    );
    res.json({ ok: true, mensaje: "Emisión finalizada correctamente" });
  } catch (error) {
    anotar(`Error al finalizar emisión: ${error.message}`);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Listas persistidas del panel (usuarios, canales, mensajes, comandos bot) ──
// Rutas y test en panel-rutas.js: no volver a escribirlas a mano aquí.
app.use(crearRutasPanel(join(RAIZ, "data")));

// ─── Vídeos manuales y de respaldo ─────────────────────────────────────────
let colaVideos = [];

app.get("/api/videos", (_req, res) => {
  let archivos = [];
  try {
    if (existsSync(carpetaVideos)) {
      archivos = readdirSync(carpetaVideos)
        .filter(
          (f) => !f.startsWith(".") && (f.endsWith(".mp4") || f.endsWith(".mkv") || f.endsWith(".mov") || f.endsWith(".webm")),
        )
        .map((f) => {
          const stats = statSync(join(carpetaVideos, f));
          return {
            archivo: f,
            tamanoMB: (stats.size / (1024 * 1024)).toFixed(1),
          };
        });
    }
  } catch (_) {}
  res.json({
    archivos,
    reproduciendo: centro.instantanea().archivoManual,
    respaldoActivo: obtenerRespaldoActivo(),
  });
});

app.get("/api/videos/respaldo", (_req, res) => {
  res.json({
    ok: true,
    activo: obtenerRespaldoActivo(),
    ruta: configuracion.respaldo || "medios/respaldo.mp4",
  });
});

app.post("/api/videos/respaldo/seleccionar", (req, res) => {
  const { archivo } = req.body || {};
  if (!archivo || typeof archivo !== "string" || archivo.includes("..") || archivo.includes("/") || archivo.includes("\\")) {
    return res.status(400).json({ ok: false, error: "Nombre de archivo invalido" });
  }
  const rutaOrigen = join(carpetaVideos, archivo);
  if (!existsSync(rutaOrigen)) {
    return res.status(404).json({ ok: false, error: "El video no existe en medios/videos/" });
  }
  try {
    const destinoCanonico = resolve(RAIZ, configuracion.respaldo || "medios/respaldo.mp4");
    copyFileSync(rutaOrigen, destinoCanonico);
    if (!existsSync(join(RAIZ, "data"))) mkdirSync(join(RAIZ, "data"), { recursive: true });
    writeFileSync(rutaConfigRespaldo, JSON.stringify({ archivo, actualizadoEn: Date.now() }, null, 2), "utf8");
    anotar(`Video de corte OBS actualizado a: ${archivo}`);
    res.json({ ok: true, activo: archivo });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/videos/cola", (_req, res) => res.json({ cola: colaVideos }));

app.post("/api/videos/cola/limpiar", (_req, res) => {
  colaVideos = [];
  res.json({ ok: true });
});

app.post("/api/videos/:archivo/encolar", (req, res) => {
  const archivo = req.params.archivo;
  colaVideos.push({ archivo, agregadoEn: Date.now() });
  res.json({ ok: true, cola: colaVideos });
});

let temporizadorManual = null;

async function detenerReproduccionManual() {
  if (temporizadorManual) {
    clearTimeout(temporizadorManual);
    temporizadorManual = null;
  }
  centro.salirDeManual();
  await procesos.detenerTodos();
  difundir();
}

app.post("/api/videos/detener", async (_req, res) => {
  await detenerReproduccionManual();
  res.json({ ok: true });
});

async function reproducirVideoManual(archivo, duracionSegundos = null) {
  const rutaCompleta = join(carpetaVideos, archivo);
  if (!existsSync(rutaCompleta)) {
    anotar(`Vídeo no encontrado: ${archivo}`);
    if (colaVideos.length > 0) {
      const siguiente = colaVideos.shift();
      return reproducirVideoManual(siguiente.archivo);
    }
    await detenerReproduccionManual();
    return false;
  }

  if (temporizadorManual) {
    clearTimeout(temporizadorManual);
    temporizadorManual = null;
  }

  centro.activarManual(archivo);
  for (const destino of configuracion.destinos) {
    if (!refreshDestination(destino)) continue;
    const pid = await procesos.arrancarRespaldo({
      destino,
      archivo: rutaCompleta,
      entorno: process.env,
      duracion: duracionSegundos,
      alSalir: async (motivo) => {
        centro.procesoFallo(destino.nombre, motivo);
        if (centro.archivoManual !== archivo) {
          difundir();
          return;
        }
        if (colaVideos.length > 0) {
          const siguiente = colaVideos.shift();
          anotar(`Reproduciendo siguiente vídeo de la cola: ${siguiente.archivo}`);
          await reproducirVideoManual(siguiente.archivo);
        } else {
          await detenerReproduccionManual();
        }
        difundir();
      },
    });
    if (pid !== null) centro.manualArrancado(destino.nombre, pid);
  }

  if (duracionSegundos) {
    temporizadorManual = setTimeout(async () => {
      anotar(`Finalizada duración programada (${duracionSegundos}s) del vídeo ${archivo}`);
      if (colaVideos.length > 0) {
        const siguiente = colaVideos.shift();
        anotar(`Reproduciendo siguiente vídeo de la cola: ${siguiente.archivo}`);
        await reproducirVideoManual(siguiente.archivo);
      } else {
        await detenerReproduccionManual();
      }
      difundir();
    }, duracionSegundos * 1000);
  }

  difundir();
  return true;
}

app.post("/api/videos/:archivo/reproducir", async (req, res) => {
  const archivo = req.params.archivo;
  const rutaCompleta = join(carpetaVideos, archivo);
  if (!existsSync(rutaCompleta)) {
    res.status(404).json({ error: "Vídeo no encontrado" });
    return;
  }

  const yaReproduciendo = Boolean(centro.archivoManual);
  if (yaReproduciendo && req.body?.encolar) {
    colaVideos.push({ archivo, agregadoEn: Date.now() });
    return res.json({ ok: true, encolado: true, cola: colaVideos });
  }

  const duracionNum = Number(req.body?.duracion);
  const duracionSegundos = Number.isFinite(duracionNum) && duracionNum > 0 ? duracionNum : null;

  await reproducirVideoManual(archivo, duracionSegundos);

  res.json({ ok: true, archivo, duracion: duracionSegundos });
});

// ─── Twitch VOD & Exportación a YouTube ───────────────────────────────────────
app.get("/api/twitch/ultimo-vod", async (_req, res) => {
  try {
    const canal = "apliarte";
    const resp = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query { user(login: "${canal}") { videos(first: 1, type: ARCHIVE) { edges { node { id title publishedAt lengthSeconds } } } } }`,
      }),
    });
    if (!resp.ok) throw new Error(`Twitch GQL HTTP ${resp.status}`);
    const data = await resp.json();
    const videoNode = data?.data?.user?.videos?.edges?.[0]?.node;
    if (!videoNode) {
      res.json({
        encontrado: false,
        gestorUrl: `https://dashboard.twitch.tv/u/${canal}/content/video-producer`,
        archivoUrl: `https://www.twitch.tv/${canal}/videos?filter=archives&sort=time`,
      });
      return;
    }

    const duracionMin = Math.floor((videoNode.lengthSeconds || 0) / 60);
    const duracionSeg = (videoNode.lengthSeconds || 0) % 60;

    res.json({
      encontrado: true,
      id: videoNode.id,
      titulo: videoNode.title,
      publicadoAt: videoNode.publishedAt,
      duracionSegundos: videoNode.lengthSeconds,
      duracionTexto: `${duracionMin}m ${duracionSeg}s`,
      url: `https://www.twitch.tv/videos/${videoNode.id}`,
      gestorUrl: `https://dashboard.twitch.tv/u/${canal}/content/video-producer`,
      archivoUrl: `https://www.twitch.tv/${canal}/videos?filter=archives&sort=time`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Categoría del directo (dibujar / música / apps) ───────────────────────
// Los overlays de OBS (file://) y el panel de la oficina (otro puerto) llaman
// a esto desde otro origen: sin CORS abierto aquí, ninguno de los dos podría
// leer ni cambiar la categoría.
const archivoCategoria = join(RAIZ, "data", "categoria.json");
let categoriaActual =
  analizarCategoriaGuardada(
    existsSync(archivoCategoria)
      ? readFileSync(archivoCategoria, "utf8")
      : null,
  ) ?? CATEGORIA_POR_DEFECTO;

app.get("/api/categoria", (_req, res) => {
  res.json({
    categoria: categoriaActual,
    paleta: paletaDe(categoriaActual),
    disponibles: Object.keys(CATEGORIAS),
  });
});

app.options("/api/categoria", (_req, res) => {
  res.sendStatus(204);
});

app.post("/api/categoria", (req, res) => {
  const { categoria } = req.body ?? {};
  if (!esCategoriaValida(categoria)) {
    res
      .status(400)
      .json({
        error: `Categoría desconocida: «${categoria}».`,
        disponibles: Object.keys(CATEGORIAS),
      });
    return;
  }
  categoriaActual = categoria;
  try {
    mkdirSync(dirname(archivoCategoria), { recursive: true });
    writeFileSync(
      archivoCategoria,
      JSON.stringify({ categoria: categoriaActual }),
    );
  } catch (e) {
    anotar(`No se pudo guardar la categoría en disco: ${e.message}`);
  }
  anotar(`Categoría del directo → ${categoriaActual}`);
  res.json({ categoria: categoriaActual, paleta: paletaDe(categoriaActual) });
});

// ─── Buzón SMS del directo ────────────────────────────────────────────────
const archivoSms = join(RAIZ, "data", "buzon-sms.json");

function leerSms() {
  try {
    if (existsSync(archivoSms)) {
      return JSON.parse(readFileSync(archivoSms, "utf8"));
    }
  } catch (_) {}
  return [];
}

function guardarSms(lista) {
  try {
    mkdirSync(dirname(archivoSms), { recursive: true });
    writeFileSync(archivoSms, JSON.stringify(lista, null, 2), "utf8");
  } catch (e) {
    anotar(`No se pudo guardar buzón SMS: ${e.message}`);
  }
}

app.get("/api/directo/sms", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  const lista = leerSms();
  const esLocal = req.ip === "127.0.0.1" || req.ip === "::1" || req.query.auth === "1";
  if (esLocal) {
    res.json({ ok: true, total: lista.length, mensajes: lista });
  } else {
    res.json({ ok: true, total: lista.length });
  }
});

app.options("/api/directo/sms", (_req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(204);
});

app.post("/api/directo/sms", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  const { usuario, texto } = req.body ?? {};
  if (!texto || typeof texto !== "string" || !texto.trim()) {
    res.status(400).json({ ok: false, error: "Texto vacío o inválido" });
    return;
  }
  const lista = leerSms();
  const nuevo = {
    id: `sms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    usuario: String(usuario || "anónimo").trim().slice(0, 50),
    texto: String(texto).trim().slice(0, 280),
    fecha: new Date().toISOString(),
    leido: false,
  };
  lista.unshift(nuevo);
  guardarSms(lista.slice(0, 200));
  anotar(`[SMS] Nuevo mensaje de @${nuevo.usuario}: ${nuevo.texto}`);
  io?.emit("nuevo_sms", nuevo);
  res.json({ ok: true, sms: nuevo });
});

app.post("/api/directo/sms/marcar-leido", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  const { id } = req.body ?? {};
  const lista = leerSms();
  for (const item of lista) {
    if (item.id === id) item.leido = true;
  }
  guardarSms(lista);
  res.json({ ok: true });
});

app.post("/api/directo/sms/limpiar", (_req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  guardarSms([]);
  res.json({ ok: true });
});

// ─── Comandos y Estado de Directo (Ring buffer persistido en memoria) ────────
let seqComandosDirecto = 0;
const ringComandosDirecto = [];
const directOwners = {};
let modoCamaraDirecto = "monigote";

app.get("/api/directo/comando", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  const desde = parseInt(req.query.desde || "-1", 10);
  const filtrados = desde >= 0 ? ringComandosDirecto.filter((c) => c.id > desde) : [];
  res.json({
    ok: true,
    duenos: directOwners,
    seq: seqComandosDirecto,
    modoCamara: modoCamaraDirecto,
    comandos: filtrados,
  });
});

app.post("/api/directo/comando", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  const cmd = req.body ?? {};
  if (cmd.comando === "adoptar" && cmd.agente && cmd.usuario) {
    for (const [aId, u] of Object.entries(directOwners)) {
      if (String(u).toLowerCase() === String(cmd.usuario).toLowerCase()) delete directOwners[aId];
    }
  } else if (cmd.comando === "liberar") {
    const esJavier = ["ja", "apliarte", "erbolamm"].includes(String(cmd.usuario ?? "").toLowerCase());
    if (esJavier && (cmd.agente === "todos" || cmd.agente === "all")) {
      for (const aId of Object.keys(directOwners)) {
        if (aId !== "ja") delete directOwners[aId];
      }
    } else if (esJavier && cmd.agente && directOwners[cmd.agente]) {
      delete directOwners[cmd.agente];
    } else if (esJavier && cmd.usuarioObjetivo) {
      const uObj = String(cmd.usuarioObjetivo).toLowerCase();
      for (const [aId, u] of Object.entries(directOwners)) {
        if (String(u).toLowerCase() === uObj) delete directOwners[aId];
      }
    } else if (cmd.usuario) {
      for (const [aId, u] of Object.entries(directOwners)) {
        if (String(u).toLowerCase() === String(cmd.usuario).toLowerCase()) delete directOwners[aId];
      }
    }
  } else if (cmd.comando && typeof cmd.comando === "string" && cmd.comando.startsWith("cam ")) {
    const arg = cmd.comando.slice(4).trim().toLowerCase();
    if (arg === "on" || arg === "camara") modoCamaraDirecto = "camara";
    else if (arg === "off" || arg === "monigote") modoCamaraDirecto = "monigote";
  } else if (cmd.modo) {
    modoCamaraDirecto = cmd.modo;
  }
  seqComandosDirecto++;
  const ev = { id: seqComandosDirecto, cmd, timestamp: Date.now() };
  ringComandosDirecto.push(ev);
  if (ringComandosDirecto.length > 100) ringComandosDirecto.shift();

  io?.emit("directo_comando", { cmd, seq: seqComandosDirecto });
  res.json({ ok: true, seq: seqComandosDirecto, duenos: directOwners, modoCamara: modoCamaraDirecto });
});

const http = createServer(app);
const io = new ServidorSocket(http, { cors: { origin: false } });
io.on("connection", (s) =>
  s.emit("estado", { ...centro.instantanea(), registro: registro.slice(-40) }),
);

// ─── Modo paseo (paso 3): signaling WebRTC P2P hacia walk.html ───────────
// El servidor no transporta medios, solo reenvía mensajes JSON
// (offer / answer / ice-candidate) entre los dos peers que comparten
// un sessionId. Sin STUN/TURN: emisor y receptor están en la misma
// LAN y las IPs las anuncia el centro. Ver walk-signaling.js.
import { WebSocketServer } from "ws";
const walkSignaling = new WalkSignaling({ onLog: anotar });
const walkWss = new WebSocketServer({ noServer: true });
walkWss.on("connection", (socket, req) => {
  const url = new URL(req.url, "http://localhost");
  walkSignaling.manejar(socket, url.searchParams.get("session"));
});

// WebSocket para overlay, cristal transparente y pizarra táctil (/ws)
const overlayWss = new WebSocketServer({ noServer: true });
const overlayClients = new Set();
// The board survives a centre restart: history is loaded from disk on startup
// and saved (debounced, atomic) after every change.
const MAX_PIZARRA_HISTORY = 4000;
const PIZARRA_FILE = join(DATA_DIR, "pizarra", "historial.json");
const pizarraHistory = cargarHistorial(PIZARRA_FILE, MAX_PIZARRA_HISTORY);
const guardarPizarra = crearGuardador(PIZARRA_FILE, {
  alFallar: (error) => console.error(`[pizarra] No se pudo guardar el dibujo: ${error.message}`),
});

overlayWss.on("connection", (ws) => {
  overlayClients.add(ws);

  // Al conectar un nuevo cliente (ej. OBS /cristal), enviar el estado actual de la pizarra
  if (pizarraHistory.length > 0) {
    try {
      ws.send(JSON.stringify({ type: "pizarra_init", history: pizarraHistory }));
    } catch (_) {}
  }

  ws.on("message", (msg) => {
    const text = typeof msg === "string" ? msg : msg.toString("utf-8");

    try {
      const data = JSON.parse(text);
      if (data && data.type === "pizarra_draw") {
        pizarraHistory.push(data);
        if (pizarraHistory.length > MAX_PIZARRA_HISTORY) pizarraHistory.shift();
        guardarPizarra.programar(pizarraHistory);
      } else if (data && data.type === "pizarra_clear") {
        pizarraHistory.length = 0;
        guardarPizarra.programar(pizarraHistory);
      } else if (data && data.type === "pizarra_undo") {
        if (pizarraHistory.length > 0) {
          const lastId = pizarraHistory[pizarraHistory.length - 1].strokeId;
          if (lastId) {
            while (pizarraHistory.length > 0 && pizarraHistory[pizarraHistory.length - 1].strokeId === lastId) {
              pizarraHistory.pop();
            }
          } else {
            pizarraHistory.pop();
          }
          guardarPizarra.programar(pizarraHistory);
        }
      } else if (data && data.type === "pizarra_solicitar_estado") {
        ws.send(JSON.stringify({ type: "pizarra_init", history: pizarraHistory }));
        return;
      }
    } catch (_) {}

    for (const client of overlayClients) {
      if (client !== ws && client.readyState === 1) {
        client.send(text);
      }
    }
  });
  ws.on("close", () => overlayClients.delete(ws));
  ws.on("error", () => overlayClients.delete(ws));
});

http.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/ws") {
    overlayWss.handleUpgrade(req, socket, head, (ws) => {
      overlayWss.emit("connection", ws, req);
    });
    return;
  }
  if (url.pathname === "/ws/walk") {
    walkWss.handleUpgrade(req, socket, head, (ws) => {
      walkWss.emit("connection", ws, req);
    });
    return;
  }
  socket.destroy();
});
app.get("/api/walk/peek", (_req, res) => {
  res.json({ peers: walkSignaling.contarPeers() });
});

// ─── Arranque y cierre limpio ──────────────────────────────────────────────
nms.run();
const hostPanel = process.env.HOST || "0.0.0.0";
http.listen(configuracion.puertoPanel, hostPanel, () => {
  console.log(`\n  Panel   → http://${hostPanel}:${configuracion.puertoPanel}`);
  console.log(
    `  OBS     → rtmp://127.0.0.1:${configuracion.puertoRtmp}/${configuracion.rutaEntrada}`,
  );
  console.log(
    `  Respaldo→ ${tieneRespaldo ? configuracion.respaldo : "sin respaldo"}\n`,
  );
  if (process.env.NODE_ENV !== "test") {
    try {
      const bridge = bridgeOptions(process.env);
      if (bridge.enabled) obsBridge = iniciarObsBridge({
          busWsUrl: bridge.url,
          onCambioEmision: alCambiarEmisionObs,
        });
    } catch (e) {
      console.warn(`[OBS-Bridge] Error al iniciar: ${e.message}`);
    }
  }
});

let obsBridge = null;

process.on("uncaughtException", (e) => {
  if (e?.code === "EPIPE") return;
  try {
    anotar(`error no controlado: ${e?.message ?? e}`);
    console.error(e);
  } catch (_) {}
});

let cerrando = false;
const cerrar = async () => {
  if (cerrando) return;
  cerrando = true;
  revisionEntrada++;
  console.log(
    "\nCerrando: se detienen solo los FFmpeg lanzados por este centro.",
  );
  try {
    guardarPizarra.ahora();
  } catch (_) {}
  try {
    obsBridge?.cerrar();
  } catch (_) {}
  try {
    await procesos.detenerTodos();
  } catch (error) {
    anotar(error.message);
  }
  try {
    nms.stop();
  } catch {
    /* ya estaba parado */
  }
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on("SIGINT", cerrar);
process.on("SIGTERM", cerrar);
