/**
 * Módulo TTS de fuentes multiplataforma (modo lectura de voz).
 *
 * Punto único para que `tts-multiplataforma.html` lea mensajes de chat
 * de Twitch, Kick, YouTube y VPS, los unifique en un mismo formato y los
 * encole en `speechSynthesis` del navegador.
 *
 * Estado verificado (2026-09-19):
 *   - Twitch IRC: funcional (verificado en vivo con `wss://irc-ws.chat.twitch.tv:443`).
 *   - VPS (`wss://directo.apliarte.com/ws`): emite `{type:'scene', scene, visible}`,
 *     NO mensajes de chat. El chat del contenedor `apliarte-directos` se pinta
 *     como HTML en `#chat-wrap`, no se distribuye por WS.
 *   - Kick Pusher: la app key pública documentada (`eb1d5f283079a3529666e5a5c1b22ec5`)
 *     devuelve 4001 "App key not in this cluster". Falta el cluster real.
 *   - YouTube Live Chat API: requiere clave de API + `liveChatId`. La API pública
 *     no expone el chat sin esos parámetros.
 *
 * Las fuentes no verificadas (Kick/YouTube/VPS) tienen la interfaz lista y un
 * error claro al activarlas, para que cuando Javier dé los datos reales se
 * enchufen sin tocar el resto del módulo.
 *
 * Diseño: una clase por fuente, todas con la misma forma:
 *   - `new FuenteX(opciones)`
 *   - `fuente.conectar()`          // puede lanzar si faltan parámetros
 *   - `fuente.desconectar()`
 *   - `fuente.onMensaje(cb)`      // cb({ plataforma, usuario, texto, ... })
 *   - `fuente.onEstado(cb)`       // cb({ fuente, estado })
 *   - `fuente.estado`             // 'detenido' | 'conectando' | 'conectado' | 'error' | 'cerrado'
 *
 * Compatible con navegador y Node 21.7+ (WebSocket global).
 */

export const TTS_FUENTES_VERSION = "0.1.0";

/** Mensaje unificado que entrega cada fuente. */
export function crearMensaje({
  plataforma,
  usuario,
  texto,
  color,
  idFuente,
  tipo,
}) {
  return Object.freeze({
    plataforma,
    usuario: (usuario || "alguien").toString(),
    texto: (texto || "").toString(),
    color: color ?? null,
    idFuente: idFuente ?? null,
    tipo: tipo ?? null,
  });
}

/** Parser de IRC de Twitch: replica `parsearIrc` de `tts-twitch.html` (puro). */
export function parsearIrcTwitch(raw) {
  let buffer = String(raw ?? "");
  const tags = {};
  if (buffer.startsWith("@")) {
    const i = buffer.indexOf(" ");
    if (i !== -1) {
      for (const par of buffer.slice(1, i).split(";")) {
        const eq = par.indexOf("=");
        const k = (eq === -1 ? par : par.slice(0, eq)).trim();
        const v = eq === -1 ? "" : par.slice(eq + 1);
        if (k) tags[k] = v;
      }
      buffer = buffer.slice(i + 1);
    }
  }
  let usuario = null;
  if (buffer.startsWith(":")) {
    const i = buffer.indexOf(" ");
    if (i !== -1) {
      const prefijo = buffer.slice(1, i);
      buffer = buffer.slice(i + 1);
      const bang = prefijo.indexOf("!");
      usuario = bang === -1 ? prefijo : prefijo.slice(0, bang);
    }
  }
  let trailing = null;
  const ti = buffer.indexOf(" :");
  if (ti !== -1) {
    trailing = buffer.slice(ti + 2);
    buffer = buffer.slice(0, ti);
  }
  const comando = buffer.split(" ")[0] || "";
  return { tags, comando, trailing, texto: trailing, usuario };
}

const RE_SPEAK = /^!speak\s+-config\s+([a-z]{2}(?:-[a-z]{2,4})?)\s+([12])\b/i;

/* ─── Office chat commands (!cafe, !git, !say, !hablar, !estado, !agentes) ── */

/** Maximum length of any spoken text forwarded to the office. */
export const COMANDO_TEXTO_MAX = 120;
/** Global cooldown between forwarded commands, in milliseconds. */
export const COMANDO_COOLDOWN_MS = 4000;
/** Local office endpoint that receives chat commands. */
export const PUENTE_OFICINA_URL = "http://127.0.0.1:8791/api/directo/comando";
/** Agent ids known by the office (mirrors `tareas/oficina-3d/src/office/agents.ts`). */
export const AGENTES_OFICINA = new Set([
  "co", "cl", "pi", "ja", "ge", "gr", "op", "om", "ex", "be",
]);
/** Agent ids autorizados a lanzar `!juego` (Javier, el presentador, en la oficina y en Twitch). */
export const AUTORIZADORES_JUEGO = new Set(["ja", "apliarte", "erbolamm"]);
/** Quórum mínimo de espectadores de Twitch para iniciar una partida. */
export const QUORUM_ESPECTADORES_MIN = 3;

const RE_ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b[@-_]/g;
const RE_HTML = /<[^>]*>/g;
// eslint-disable-next-line no-control-regex
const RE_CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** Strips ANSI escapes, HTML tags and control characters; caps the length. */
export function sanearTextoComando(texto, max = COMANDO_TEXTO_MAX) {
  const limpio = String(texto ?? "")
    .replace(RE_ANSI, "")
    .replace(RE_HTML, "")
    .replace(/[<>]/g, "")
    .replace(RE_CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(limpio).slice(0, max).join("").trim();
}

/**
 * Parses a chat line into an office command, or returns null.
 *   !cafe                  → { comando: "cafe" }
 *   !git                   → { comando: "git" }
 *   !estado | !agentes     → { comando: "estado" }
 *   !say <agente> <texto>  → { comando: "say", agente, texto }
 *   !hablar <texto>        → { comando: "say", agente: null, texto }
 */
/** Maximum total steps for a mixed WASD route (!wwsaaasdd…). */
const MAX_PASOS_RUTA = 24;

export function parsearComandoChat(texto) {
  const linea = String(texto ?? "").trim();
  const m = /^!([a-záéíóú]+)(?:\s+([\s\S]*))?$/i.exec(linea);
  if (!m) return null;
  const nombre = m[1].toLowerCase();
  const resto = m[2] ?? "";
  if (nombre === "cafe" || nombre === "café") {
    const posibleAgente = resto.trim().split(/\s+/)[0]?.toLowerCase();
    const agente = posibleAgente && AGENTES_OFICINA.has(posibleAgente) ? posibleAgente : null;
    return agente ? { comando: "cafe", agente } : { comando: "cafe" };
  }
  if (nombre === "git") return { comando: "git" };
  if (nombre === "estado" || nombre === "agentes") return { comando: "estado" };
  if (nombre === "hablar") {
    const dicho = sanearTextoComando(resto);
    return dicho ? { comando: "say", agente: null, texto: dicho } : null;
  }
  if (nombre === "say") {
    const partes = resto.trim().split(/\s+/);
    const candidato = (partes[0] || "").toLowerCase();
    const conAgente = AGENTES_OFICINA.has(candidato);
    const dicho = sanearTextoComando(
      conAgente ? partes.slice(1).join(" ") : resto,
    );
    if (!dicho) return null;
    return { comando: "say", agente: conAgente ? candidato : null, texto: dicho };
  }
  if (nombre === "liberar") {
    const param = resto.trim().split(/\s+/)[0]?.toLowerCase().replace(/^@/, "");
    if (!param) return { comando: "liberar" };
    if (param === "todos" || param === "all") {
      return { comando: "liberar", agente: "todos", requiereAutorizacion: true };
    }
    if (AGENTES_OFICINA.has(param)) {
      return { comando: "liberar", agente: param, requiereAutorizacion: true };
    }
    return { comando: "liberar", usuarioObjetivo: param, requiereAutorizacion: true };
  }
  if (nombre === "tema" || nombre === "categoria" || nombre === "categoría" || nombre === "fondo" || nombre === "color") {
    const cat = sanearTextoComando(resto).toLowerCase();
    return { comando: "tema", texto: cat, requiereAutorizacion: true };
  }
  if (nombre === "apps" || nombre === "codigo" || nombre === "código") {
    return { comando: "tema", texto: "apps", requiereAutorizacion: true };
  }
  if (nombre === "musica" || nombre === "música") {
    return { comando: "tema", texto: "musica", requiereAutorizacion: true };
  }
  if (nombre === "arte" || nombre === "dibujo" || nombre === "dibujar") {
    return { comando: "tema", texto: "arte", requiereAutorizacion: true };
  }
  if (nombre === "andando" || nombre === "paseo" || nombre === "calle") {
    return { comando: "tema", texto: "andando", requiereAutorizacion: true };
  }
  if (nombre === "charlando" || nombre === "hablar") {
    return { comando: "tema", texto: "charlando", requiereAutorizacion: true };
  }
  if (nombre === "sms" || nombre === "mensaje" || nombre === "nota") {
    const dicho = sanearTextoComando(resto);
    return { comando: "sms", texto: dicho };
  }
  if (nombre === "cam" || nombre === "camara" || nombre === "cámara") {
    const accion = sanearTextoComando(resto).toLowerCase();
    return { comando: "cam", accion };
  }
  // Movimiento WASD: !w, !a, !s, !d, !aaaaa, !w 3, etc.
  if (/^[wasd]+$/i.test(nombre)) {
    const primera = nombre[0].toLowerCase();
    const esRepetida = nombre.toLowerCase().split("").every(c => c === primera);
    if (esRepetida) {
      let pasos = nombre.length;
      if (resto.trim() && /^\d+$/.test(resto.trim())) {
        pasos = parseInt(resto.trim(), 10) || pasos;
      }
      return { comando: "mover", dir: primera, pasos: Math.min(pasos, 6) };
    }
    // Mixed route in one message, e.g. !wwsaaasddadss → runs of the same letter,
    // capped at MAX_PASOS_RUTA steps in total so nobody can flood the overlay.
    const ruta = [];
    let total = 0;
    for (const letra of nombre.toLowerCase()) {
      if (total >= MAX_PASOS_RUTA) break;
      const ultimo = ruta[ruta.length - 1];
      if (ultimo && ultimo.dir === letra) ultimo.pasos += 1;
      else ruta.push({ dir: letra, pasos: 1 });
      total += 1;
    }
    return { comando: "mover", ruta };
  }
  if (nombre === "salta" || nombre === "saltar" || nombre === "jump" || nombre === "brinca") {
    return { comando: "salta" };
  }
  if (nombre === "r" || nombre === "reset" || nombre === "volver" || nombre === "sitio" || nombre === "mesa") {
    return { comando: "reset" };
  }
  if (nombre === "fiesta" || nombre === "party" || nombre === "bailar" || nombre === "baile") {
    return { comando: "fiesta", requiereAutorizacion: true };
  }
  if (nombre === "trabaja" || nombre === "trabajar" || nombre === "currar") {
    return { comando: "trabajar" };
  }
  if (nombre === "bronca" || nombre === "regañar" || nombre === "reñir") {
    return { comando: "bronca", requiereAutorizacion: true };
  }
  if (nombre === "beso" || nombre === "kiss") {
    const posibleAgente = resto.trim().split(/\s+/)[0]?.toLowerCase();
    const agente = posibleAgente && AGENTES_OFICINA.has(posibleAgente) ? posibleAgente : null;
    return { comando: "beso", agente };
  }
  if (nombre === "claro" || nombre === "dia" || nombre === "día" || nombre === "light") {
    return { comando: "tema_modo", modo: "light", requiereAutorizacion: true };
  }
  if (nombre === "oscuro" || nombre === "noche" || nombre === "dark") {
    return { comando: "tema_modo", modo: "dark", requiereAutorizacion: true };
  }
  if (nombre === "info" || nombre === "ayuda" || nombre === "comandos" || nombre === "help") {
    return { comando: "info" };
  }
  if (nombre === "juego" || nombre === "juegos" || nombre === "minijuego" || nombre === "partida" || nombre === "abrirjuegos") {
    return { comando: "juego", variante: null, requiereAutorizacion: true };
  }
  if (nombre === "trofeo" || nombre === "carrera" || nombre === "game") {
    return { comando: "juego", variante: "trofeo", requiereAutorizacion: true };
  }
  if (nombre === "traidor") {
    return { comando: "juego", variante: "traidor", requiereAutorizacion: true };
  }
  if (AGENTES_OFICINA.has(nombre)) {
    const dicho = sanearTextoComando(resto);
    if (dicho) {
      return { comando: "say", agente: nombre, texto: dicho };
    }
    return { comando: "adoptar", agente: nombre };
  }
  return null;
}

/**
 * Devuelve `true` cuando el emisor puede ejecutar `comando`.
 * Para comandos sin la bandera `requiereAutorizacion`, devuelve `true` siempre.
 * Para `!juego` y cualquier comando con `requiereAutorizacion: true`, exige
 * que el identificador del emisor esté en `AUTORIZADORES_JUEGO` o tenga badge de broadcaster.
 */
export function estaAutorizado(comando, emisor, {
  autorizadores = AUTORIZADORES_JUEGO,
  badges = null,
} = {}) {
  if (!comando || !comando.requiereAutorizacion) return true;
  if (badges && String(badges).includes("broadcaster")) return true;
  if (!(autorizadores instanceof Set) || autorizadores.size === 0) return false;
  const id = String(emisor ?? "").trim().toLowerCase();
  if (!id) return false;
  return autorizadores.has(id);
}

/**
 * Filtro estricto del mensaje durante la fase de votación (1 min o 45 s):
 * ignora cualquier texto o comando regular y extrae exclusivamente el
 * primer entero positivo válido (`1`, `2`, …). Devuelve `null` si el
 * mensaje no contiene un voto válido.
 */
export function filtrarMensajeDuranteVotacion(texto) {
  const linea = String(texto ?? "").trim();
  if (!linea) return null;
  const m = linea.match(/\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Cuenta los avatares adoptados por espectadores de Twitch para el quórum.
 * Excluye explícitamente a Javier (`ja`): ni el avatar `ja` ni las
 * adopciones cuyo dueño sea `ja` cuentan hacia el quórum de espectadores.
 *
 * @param {Record<string, string|null|undefined>} avatarOwners
 *   Mapa `avatarId -> twitchUser` (o null/undefined si el avatar está libre).
 * @param {{umbral?: number}} [opciones]
 *   Umbral mínimo de espectadores; por defecto `QUORUM_ESPECTADORES_MIN` (3).
 * @returns {{
 *   cumplen: boolean,
 *   actual: number,
 *   faltan: number,
 *   umbral: number,
 *   espectadores: Array<{avatarId: string, owner: string}>,
 * }}
 */
export function calcularQuorumEspectadores(
  avatarOwners,
  { umbral = QUORUM_ESPECTADORES_MIN } = {},
) {
  const umbralNorm = Number.isFinite(umbral) && umbral >= 0 ? Math.floor(umbral) : 0;
  const mapa =
    avatarOwners != null && typeof avatarOwners === "object" && !Array.isArray(avatarOwners)
      ? avatarOwners
      : {};
  const espectadores = [];
  for (const [avatarId, owner] of Object.entries(mapa)) {
    if (avatarId === "ja") continue;
    if (owner == null || owner === "") continue;
    const ownerNorm = String(owner).trim().toLowerCase();
    if (ownerNorm === "ja") continue;
    espectadores.push({ avatarId, owner: String(owner) });
  }
  const actual = espectadores.length;
  const faltan = Math.max(0, umbralNorm - actual);
  return {
    cumplen: actual >= umbralNorm,
    actual,
    faltan,
    umbral: umbralNorm,
    espectadores,
  };
}

/** Returns `permitir()`: true at most once per `ms` window (global anti-spam). */
export function crearFiltroCooldown(ms = COMANDO_COOLDOWN_MS, reloj = () => Date.now()) {
  let ultimo = -Infinity;
  return function permitir() {
    const ahora = reloj();
    if (ahora - ultimo < ms) return false;
    ultimo = ahora;
    return true;
  };
}

/**
 * Sends an office command to the local panel. Never throws: the live chat must
 * keep working even if the office is closed.
 */
export async function enviarComandoOficina(
  comando,
  { url = PUENTE_OFICINA_URL, fetchImpl = globalThis.fetch } = {},
) {
  if (!url || typeof fetchImpl !== "function") return false;
  try {
    const r = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erbolamm-directo": "comando",
      },
      body: JSON.stringify(comando),
    });
    return Boolean(r && r.ok);
  } catch (_) {
    return false;
  }
}

/** Mezcla helpers de oyentes en una clase base común. */
function conOyentes(Clase) {
  return class extends Clase {
    constructor(...args) {
      super(...args);
      this._oyentesMensaje = new Set();
      this._oyentesEstado = new Set();
    }
    onMensaje(cb) {
      this._oyentesMensaje.add(cb);
      return () => this._oyentesMensaje.delete(cb);
    }
    onEstado(cb) {
      this._oyentesEstado.add(cb);
      return () => this._oyentesEstado.delete(cb);
    }
    _emitirMensaje(msg) {
      for (const cb of this._oyentesMensaje) {
        try {
          cb(msg);
        } catch (_) {}
      }
    }
    _emitirEstado() {
      const ev = { fuente: this.tipo, estado: this.estado };
      for (const cb of this._oyentesEstado) {
        try {
          cb(ev);
        } catch (_) {}
      }
    }
  };
}

export class FuenteTwitchIrc extends conOyentes(Object) {
  constructor({
    canal = "apliarte",
    wsUrl = "wss://irc-ws.chat.twitch.tv:443",
    puenteOficina = PUENTE_OFICINA_URL,
    cooldownMs = COMANDO_COOLDOWN_MS,
    reloj = () => Date.now(),
    fetchImpl,
  } = {}) {
    super();
    this.tipo = "twitch-irc";
    this.puenteOficina = puenteOficina;
    this._permitirComando = crearFiltroCooldown(cooldownMs, reloj);
    this._fetchImpl = fetchImpl;
    this.canal = String(canal || "")
      .trim()
      .toLowerCase();
    this.wsUrl = wsUrl;
    this.ws = null;
    this.estado = "detenido";
  }

  conectar() {
    if (this.ws) return;
    if (!this.canal) throw new Error("FuenteTwitchIrc: canal requerido");
    const WS = globalThis.WebSocket;
    if (typeof WS !== "function")
      throw new Error("FuenteTwitchIrc: WebSocket no disponible");
    this.estado = "conectando";
    this._emitirEstado();
    const ws = new WS(this.wsUrl);
    this.ws = ws;

    ws.addEventListener("open", () => {
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 90000)}`);
      ws.send(`JOIN #${this.canal}`);
      this.estado = "conectado";
      this._emitirEstado();
    });
    ws.addEventListener("message", (ev) => {
      for (const line of String(ev.data).split("\r\n")) {
        if (!line) continue;
        if (line.startsWith("PING")) {
          try {
            ws.send("PONG :tmi.twitch.tv");
          } catch (_) {}
          continue;
        }
        const { tags, comando, trailing, usuario } = parsearIrcTwitch(line);
        if (comando !== "PRIVMSG" || !trailing) continue;
        const texto = trailing.trim();
        if (RE_SPEAK.test(texto)) {
          this._emitirMensaje(
            crearMensaje({
              plataforma: "twitch",
              usuario: tags["display-name"] || usuario || "alguien",
              texto,
              color: tags.color,
              idFuente: tags.id,
              tipo: "config",
            }),
          );
          continue;
        }
        this._reenviarComando(texto, {
          usuario: tags["display-name"] || usuario || "alguien",
          idFuente: tags.id ?? null,
          badges: tags.badges ?? null,
        });
        this._emitirMensaje(
          crearMensaje({
            plataforma: "twitch",
            usuario: tags["display-name"] || usuario || "alguien",
            texto,
            color: tags.color,
            idFuente: tags.id,
          }),
        );
      }
    });
    ws.addEventListener("error", () => {
      this.estado = "error";
      this._emitirEstado();
    });
    ws.addEventListener("close", () => {
      this.estado = "cerrado";
      this._emitirEstado();
    });
  }

  desconectar() {
    if (!this.ws) return;
    try {
      this.ws.close();
    } catch (_) {}
    this.ws = null;
    this.estado = "detenido";
    this._emitirEstado();
  }

  /** Forwards a recognised `!` command to the office, honouring the cooldown. */
  _reenviarComando(texto, { usuario, idFuente, badges }) {
    if (!this.puenteOficina) return null;
    const comando = parsearComandoChat(texto);
    if (!comando || !this._permitirComando()) return null;
    if (!estaAutorizado(comando, usuario, { badges })) return null;
    const payload = {
      ...comando,
      usuario: sanearTextoComando(usuario, 40),
      idFuente,
    };
    enviarComandoOficina(payload, {
      url: this.puenteOficina,
      fetchImpl: this._fetchImpl ?? globalThis.fetch,
    });
    return payload;
  }
}

export class FuenteVpsWebSocket extends conOyentes(Object) {
  constructor({
    wsUrl = "wss://directo.apliarte.com/ws",
    filtroMensaje = (m) => m?.type === "message",
  } = {}) {
    super();
    this.tipo = "vps-ws";
    this.wsUrl = wsUrl;
    this.filtroMensaje = filtroMensaje;
    this.ws = null;
    this.estado = "detenido";
  }

  conectar() {
    if (this.ws) return;
    const WS = globalThis.WebSocket;
    if (typeof WS !== "function")
      throw new Error("FuenteVpsWebSocket: WebSocket no disponible");
    this.estado = "conectando";
    this._emitirEstado();
    const ws = new WS(this.wsUrl);
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.estado = "conectado";
      this._emitirEstado();
    });
    ws.addEventListener("message", (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (typeof this.filtroMensaje === "function" && !this.filtroMensaje(m))
        return;
      this._emitirMensaje(
        crearMensaje({
          plataforma: "vps",
          usuario: m?.user?.username || m?.user || "alguien",
          texto: m?.text || m?.message || "",
          idFuente: m?.id,
        }),
      );
    });
    ws.addEventListener("error", () => {
      this.estado = "error";
      this._emitirEstado();
    });
    ws.addEventListener("close", () => {
      this.estado = "cerrado";
      this._emitirEstado();
    });
  }

  desconectar() {
    if (!this.ws) return;
    try {
      this.ws.close();
    } catch (_) {}
    this.ws = null;
    this.estado = "detenido";
    this._emitirEstado();
  }
}

export class FuenteKickPusher extends conOyentes(Object) {
  constructor({ appKey, cluster, channelId } = {}) {
    super();
    this.tipo = "kick-pusher";
    this.appKey = appKey;
    this.cluster = cluster;
    this.channelId = channelId;
    this.ws = null;
    this.estado = "detenido";
  }

  conectar() {
    if (this.ws) return;
    if (!this.appKey || !this.cluster || !this.channelId) {
      throw new Error(
        "FuenteKickPusher: appKey, cluster y channelId son obligatorios",
      );
    }
    const WS = globalThis.WebSocket;
    if (typeof WS !== "function")
      throw new Error("FuenteKickPusher: WebSocket no disponible");
    this.estado = "conectando";
    this._emitirEstado();
    const ws = new WS(
      `wss://ws-${this.cluster}.pusher.com/app/${this.appKey}?protocol=7&client=js&version=8.4.0&flash=false`,
    );
    this.ws = ws;
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          event: "pusher:subscribe",
          data: { auth: "", channel: `chatroom_${this.channelId}` },
        }),
      );
    });
    ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.event === "pusher:error") {
        this.estado = "error";
        this._emitirEstado();
        return;
      }
      if (
        msg.event === "App\\SignedIn" ||
        msg.event === "pusher:connection_established"
      ) {
        this.estado = "conectado";
        this._emitirEstado();
        return;
      }
      if (
        msg.event === "App\\MessageCreated" ||
        msg.event === "message" ||
        msg.event === "App\\ChatMessage"
      ) {
        let data;
        try {
          data = typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;
        } catch {
          return;
        }
        const usuario =
          data?.sender?.username ||
          data?.username ||
          data?.from?.username ||
          "alguien";
        const texto = data?.content || data?.message || data?.text || "";
        if (!texto) return;
        this._emitirMensaje(
          crearMensaje({ plataforma: "kick", usuario, texto }),
        );
      }
    });
    ws.addEventListener("error", () => {
      this.estado = "error";
      this._emitirEstado();
    });
    ws.addEventListener("close", () => {
      this.estado = "cerrado";
      this._emitirEstado();
    });
  }

  desconectar() {
    if (!this.ws) return;
    try {
      this.ws.close();
    } catch (_) {}
    this.ws = null;
    this.estado = "detenido";
    this._emitirEstado();
  }
}

export class FuenteYoutubeLiveChat extends conOyentes(Object) {
  constructor({ apiKey, liveChatId, pollMs = 5000 } = {}) {
    super();
    this.tipo = "youtube-livechat";
    this.apiKey = apiKey;
    this.liveChatId = liveChatId;
    this.pollMs = pollMs;
    this._timer = null;
    this._nextPageToken = null;
    this.estado = "detenido";
  }

  async conectar() {
    if (this._timer) return;
    if (!this.apiKey || !this.liveChatId) {
      throw new Error(
        "FuenteYoutubeLiveChat: apiKey y liveChatId son obligatorios",
      );
    }
    this.estado = "conectando";
    this._emitirEstado();
    await this._sondear();
  }

  async _sondear() {
    if (!this._timer && this.estado === "detenido") return;
    try {
      const url = new URL(
        "https://www.googleapis.com/youtube/v3/liveChat/messages",
      );
      url.searchParams.set("liveChatId", this.liveChatId);
      url.searchParams.set("part", "snippet,authorDetails");
      url.searchParams.set("key", this.apiKey);
      if (this._nextPageToken)
        url.searchParams.set("pageToken", this._nextPageToken);
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      this._nextPageToken = j.nextPageToken || this._nextPageToken;
      for (const m of j.items || []) {
        this._emitirMensaje(
          crearMensaje({
            plataforma: "youtube",
            usuario: m?.authorDetails?.displayName || "alguien",
            texto: m?.snippet?.displayMessage || "",
            idFuente: m?.id,
          }),
        );
      }
      this.estado = "conectado";
      this._emitirEstado();
    } catch (_) {
      this.estado = "error";
      this._emitirEstado();
    }
    this._timer = setTimeout(() => this._sondear(), this.pollMs);
  }

  desconectar() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this.estado = "detenido";
    this._emitirEstado();
  }
}

/** Catálogo de fuentes soportadas, para iterar desde la UI. */
export const FUENTES = Object.freeze({
  "twitch-irc": {
    etiqueta: "Twitch (IRC anónimo)",
    clase: FuenteTwitchIrc,
    campos: ["canal"],
    defaults: { canal: "apliarte" },
  },
  "vps-ws": {
    etiqueta: "VPS (WebSocket)",
    clase: FuenteVpsWebSocket,
    campos: ["wsUrl"],
    defaults: { wsUrl: "wss://directo.apliarte.com/ws" },
  },
  "kick-pusher": {
    etiqueta: "Kick (Pusher)",
    clase: FuenteKickPusher,
    campos: ["appKey", "cluster", "channelId"],
    defaults: {
      appKey: "eb1d5f283079a3529666e5a5c1b22ec5", // gitleaks:allow (public Kick web client key, not a secret)
      cluster: "us2",
      channelId: "13317185",
    },
  },
  "youtube-livechat": {
    etiqueta: "YouTube (Live Chat API)",
    clase: FuenteYoutubeLiveChat,
    campos: ["apiKey", "liveChatId"],
    defaults: {},
  },
});

/** Acceso de solo-lectura para tests. No usar desde el HTML. */
export const __test__ = {
  parsearIrcTwitch,
  crearMensaje,
  RE_SPEAK,
  parsearComandoChat,
  sanearTextoComando,
  crearFiltroCooldown,
  filtrarMensajeDuranteVotacion,
  calcularQuorumEspectadores,
  estaAutorizado,
  AUTORIZADORES_JUEGO,
  QUORUM_ESPECTADORES_MIN,
};
