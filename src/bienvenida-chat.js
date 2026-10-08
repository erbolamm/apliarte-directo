'use strict';

/**
 * Módulo de bienvenida para espectadores que escriben por primera vez en el chat de Twitch.
 * Lógica pura sin reloj propio ni red.
 */

const BOTS_EXCLUIDOS = Object.freeze([
  'nightbot',
  'streamelements',
  'moobot',
  'botrix',
  'fossabot',
  'wizebot',
  'soundalerts',
]);

const USUARIOS_SISTEMA = Object.freeze([
  'ja',
  'apliarte',
  'erbolamm',
]);

const COOLDOWN_SALUDO_MS = 10000; // Mínimo 10s entre dos emisiones de saludo
const COOLDOWN_FIESTA_MS = 30000; // Mínimo 30s entre fiestas automáticas por bienvenida
const COOLDOWN_RE_SALUDO_MS = 6 * 60 * 60 * 1000; // Mínimo 6 horas antes de volver a saludar al mismo usuario

/**
 * Limpia nombres de usuario para evitar inyecciones de HTML o caracteres de control.
 */
function limpiarNombre(nombre) {
  return String(nombre || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\r\n\t]/g, '')
    .trim()
    .slice(0, 30);
}

/**
 * Parsea una línea de IRC de Twitch buscando mensajes PRIVMSG.
 * Devuelve { usuario, nombreVisible, texto } o null si no es PRIVMSG.
 */
function parsearLineaPrivmsg(linea) {
  if (!linea || typeof linea !== 'string') return null;
  let raw = linea.trim();
  if (!raw) return null;

  const tags = {};
  if (raw.startsWith('@')) {
    const spaceIdx = raw.indexOf(' ');
    if (spaceIdx === -1) return null;
    const tagPart = raw.slice(1, spaceIdx);
    raw = raw.slice(spaceIdx + 1);

    for (const item of tagPart.split(';')) {
      const eqIdx = item.indexOf('=');
      const k = (eqIdx === -1 ? item : item.slice(0, eqIdx)).trim();
      const v = eqIdx === -1 ? '' : item.slice(eqIdx + 1);
      if (k) tags[k] = v;
    }
  }

  // Prefijo :nick!nick@host
  let usuario = null;
  if (raw.startsWith(':')) {
    const spaceIdx = raw.indexOf(' ');
    if (spaceIdx === -1) return null;
    const prefix = raw.slice(1, spaceIdx);
    raw = raw.slice(spaceIdx + 1);

    const bangIdx = prefix.indexOf('!');
    usuario = (bangIdx === -1 ? prefix : prefix.slice(0, bangIdx)).toLowerCase();
  }

  // Separar comando y trailing (:texto)
  let texto = null;
  const trailingIdx = raw.indexOf(' :');
  if (trailingIdx !== -1) {
    texto = raw.slice(trailingIdx + 2).replace(/[\r\n]+/g, ' ').trim();
    raw = raw.slice(0, trailingIdx);
  }

  const comando = raw.split(' ')[0] || '';
  if (comando.toUpperCase() !== 'PRIVMSG') {
    return null;
  }

  if (!usuario) {
    const matchUser = linea.match(/:([a-zA-Z0-9_]{3,25})!/);
    if (matchUser) usuario = matchUser[1].toLowerCase();
  }

  if (!usuario) return null;

  const rawDisplayName = tags['display-name'] || usuario;
  const nombreVisible = limpiarNombre(rawDisplayName) || usuario;

  return {
    usuario: usuario.toLowerCase(),
    nombreVisible,
    texto: texto || '',
    color: tags.color || null,
  };
}

function formatearTextoChat(usuarios) {
  if (!usuarios || usuarios.length === 0) return '';
  const nombres = usuarios.map((u) => `@${u.nombreVisible}`);
  if (nombres.length === 1) {
    return `¡Bienvenido/a ${nombres[0]} al directo! 🎉`;
  }
  if (nombres.length === 2) {
    return `¡Bienvenidos/as ${nombres[0]} y ${nombres[1]} al directo! 🎉`;
  }
  const primero = nombres[0];
  const segundo = nombres[1];
  const restantes = nombres.length - 2;
  return `¡Bienvenidos/as ${primero}, ${segundo} y ${restantes} más al directo! 🎉`;
}

function formatearTextoBocadillo(usuarios) {
  if (!usuarios || usuarios.length === 0) return '';
  if (usuarios.length === 1) {
    return `¡Bienvenido/a, ${usuarios[0].nombreVisible}!`;
  }
  if (usuarios.length === 2) {
    return `¡Bienvenidos, ${usuarios[0].nombreVisible} y ${usuarios[1].nombreVisible}!`;
  }
  return `¡Bienvenidos, ${usuarios[0].nombreVisible} y ${usuarios.length - 1} más!`;
}

/**
 * Crea una instancia del gestor de bienvenida con estado en memoria.
 */
function crearGestorBienvenida(opciones = {}) {
  const resolverCanal = typeof opciones.canal === 'function'
    ? opciones.canal
    : () => String(opciones.canal || 'apliarte').trim().toLowerCase().replace(/^#/, '');
  const resolverBotNick = typeof opciones.botNick === 'function'
    ? opciones.botNick
    : () => String(opciones.botNick || '').trim().toLowerCase();
  let activo = opciones.activo !== undefined ? Boolean(opciones.activo) : true;
  const cooldownReSaludoMs = Number(opciones.cooldownReSaludoMs) || COOLDOWN_RE_SALUDO_MS;

  const vistos = new Map();
  if (opciones.vistosIniciales && typeof opciones.vistosIniciales === 'object') {
    const ahora = Date.now();
    for (const [u, ts] of Object.entries(opciones.vistosIniciales)) {
      if (typeof ts === 'number' && (ahora - ts) < cooldownReSaludoMs) {
        vistos.set(u.toLowerCase(), ts);
      }
    }
  }

  const pendientes = [];
  let ultimoSaludoTs = -Infinity;
  let ultimaFiestaTs = -Infinity;

  function exportarVistos(ahoraMs = Date.now()) {
    const obj = {};
    for (const [u, ts] of vistos.entries()) {
      if ((ahoraMs - ts) < cooldownReSaludoMs) {
        obj[u] = ts;
      }
    }
    return obj;
  }

  function notificarCambioVistos(ahoraMs) {
    if (typeof opciones.onCambioVistos === 'function') {
      try { opciones.onCambioVistos(exportarVistos(ahoraMs)); } catch (_) {}
    }
  }

  function esExcluido(usuario) {
    const u = String(usuario || '').toLowerCase();
    if (!u) return true;
    const canal = String(resolverCanal() || '').trim().toLowerCase().replace(/^#/, '');
    const botNick = String(resolverBotNick() || '').trim().toLowerCase();
    if (u === canal || (botNick && u === botNick)) return true;
    if (USUARIOS_SISTEMA.includes(u)) return true;
    if (BOTS_EXCLUIDOS.includes(u)) return true;
    return false;
  }

  function esNuevo(usuario, ahoraMs = Date.now()) {
    const u = String(usuario || '').toLowerCase();
    if (esExcluido(u)) return false;
    const ultimo = vistos.get(u);
    if (ultimo === undefined) return true;
    return (ahoraMs - ultimo) >= cooldownReSaludoMs;
  }

  function registrarVisto(usuario, ahoraMs = Date.now()) {
    const u = String(usuario || '').toLowerCase();
    if (u) {
      vistos.set(u, ahoraMs);
      notificarCambioVistos(ahoraMs);
    }
  }

  function revisarPendientes(ahoraMs = Date.now()) {
    if (!activo || pendientes.length === 0) return null;

    if (ahoraMs - ultimoSaludoTs < COOLDOWN_SALUDO_MS) {
      return null;
    }

    const usuariosASaludar = pendientes.splice(0, pendientes.length);
    ultimoSaludoTs = ahoraMs;

    const lanzarFiesta = (ahoraMs - ultimaFiestaTs) >= COOLDOWN_FIESTA_MS;
    if (lanzarFiesta) {
      ultimaFiestaTs = ahoraMs;
    }

    return {
      usuarios: usuariosASaludar,
      total: usuariosASaludar.length,
      textoChat: formatearTextoChat(usuariosASaludar),
      textoBocadillo: formatearTextoBocadillo(usuariosASaludar),
      lanzarFiesta,
    };
  }

  function procesarUsuario(datos, ahoraMs = Date.now()) {
    if (!datos || typeof datos !== 'object') return null;
    const u = String(datos.usuario || '').toLowerCase();
    const nombreVisible = datos.nombreVisible || u;

    if (esExcluido(u)) {
      vistos.set(u, ahoraMs);
      return null;
    }

    const ultimoVisto = vistos.get(u);
    if (ultimoVisto !== undefined && (ahoraMs - ultimoVisto) < cooldownReSaludoMs) {
      return null;
    }

    vistos.set(u, ahoraMs);
    notificarCambioVistos(ahoraMs);

    if (!activo) {
      return null;
    }

    pendientes.push({ usuario: u, nombreVisible, ts: ahoraMs });
    return revisarPendientes(ahoraMs);
  }

  function procesarLinea(linea, ahoraMs = Date.now()) {
    const parsed = parsearLineaPrivmsg(linea);
    if (!parsed) return null;
    return procesarUsuario(parsed, ahoraMs);
  }

  return {
    parsearLineaPrivmsg,
    esExcluido,
    esNuevo,
    registrarVisto,
    procesarUsuario,
    procesarLinea,
    revisarPendientes,
    exportarVistos,
    setActivo: (val) => { activo = Boolean(val); },
    estaActivo: () => activo,
    totalVistos: () => vistos.size,
    totalPendientes: () => pendientes.length,
    reiniciar: () => {
      vistos.clear();
      pendientes.length = 0;
      ultimoSaludoTs = -Infinity;
      ultimaFiestaTs = -Infinity;
      notificarCambioVistos(Date.now());
    },
  };
}

module.exports = {
  BOTS_EXCLUIDOS,
  USUARIOS_SISTEMA,
  COOLDOWN_SALUDO_MS,
  COOLDOWN_FIESTA_MS,
  COOLDOWN_RE_SALUDO_MS,
  limpiarNombre,
  parsearLineaPrivmsg,
  formatearTextoChat,
  formatearTextoBocadillo,
  crearGestorBienvenida,
};
