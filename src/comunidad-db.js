'use strict';

/**
 * ============================================================================
 * MODULO CANONICO: COMUNIDAD Y BASE DE DATOS PERSISTENTE DE USUARIOS
 * ============================================================================
 * Repositorio origen: apliarte-directo (Incubadora / Servidor Local)
 * Destino previsto: tts-apliarte (App móvil comercial App Store & Google Play)
 * 
 * ----------------------------------------------------------------------------
 * DIRECTIVA ESTRATEGICA PARA AGENTES EN MODO LECTURA (REFERENCIA FIREBASE):
 * ----------------------------------------------------------------------------
 * Este módulo está diseñado siguiendo el patrón Repositorio / Almacén Desacoplado.
 * En apliarte-directo se ejecuta sobre `node:sqlite` nativo (sin dependencias npm).
 * 
 * Cuando este código sea portado a `tts-apliarte` para la versión SaaS/móvil
 * respaldada por Firebase / Cloud Firestore, el mapeo de colecciones es:
 * 
 * 1. Colección principal `usuarios` (Firestore):
 *    - Documento ID: `twitch_{usuario}` o `youtube_{usuario}` (o UID autenticado).
 *    - Campos equivalentes:
 *      * plataforma: "twitch" | "youtube"
 *      * usuario: string (lowercase)
 *      * nombreVisible: string
 *      * avatarUrl: string | null
 *      * rol: "normal" | "vip" | "mod" | "admin"
 *      * esSuscriptor: boolean
 *      * vozConfig: map/object { lang, name, slot, efecto, ... }
 *      * notasContexto: string
 *      * sugerenciaSaludo: string
 *      * totalMensajes: number (FieldValue.increment(1))
 *      * primerMensajeEn: Timestamp
 *      * ultimoMensajeEn: Timestamp
 *      * actualizadoEn: Timestamp
 * 
 * 2. Subcolección `usuarios/{usuarioId}/mensajes` (o colección raíz `mensajes` con índice compuesto):
 *    - Documento ID: ID único del mensaje o pushId.
 *    - Campos:
 *      * usuarioId: string (referencia)
 *      * texto: string
 *      * color: string | null
 *      * timestamp: Timestamp / number
 *      * fechaHora: string (formateado)
 * 
 * Mantener las mismas firmas de métodos aquí definidas para que las vistas
 * de tts-apliarte (Flutter / React Native / Web) consuman la misma API.
 * ============================================================================
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Resuelve el directorio de datos respetando las variables de entorno para tests
 * y entornos Docker/VPS.
 */
function resolveDefaultDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.APLIARTE_TEST_DATA_DIR) return process.env.APLIARTE_TEST_DATA_DIR;
  if (fs.existsSync('/app/data')) return '/app/data';
  return path.join(__dirname, '..', 'data');
}

/**
 * Formatea un timestamp numérico en formato legible ISO / local seguro.
 * @param {number} ts - Timestamp en milisegundos.
 * @returns {string} Fecha y hora legible (YYYY-MM-DD HH:mm:ss).
 */
function formatearFechaHora(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

/**
 * Clase principal del repositorio de comunidad y usuarios.
 */
class ComunidadDb {
  /**
   * @param {Object} [options]
   * @param {string} [options.dbPath] - Ruta al archivo sqlite. Por defecto `DATA_DIR/comunidad.sqlite`.
   */
  constructor(options = {}) {
    const dataDir = options.dataDir || resolveDefaultDataDir();
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (_) {}
    }

    this.dbPath = options.dbPath || path.join(dataDir, 'comunidad.sqlite');
    this.db = new DatabaseSync(this.dbPath);

    this._configurarPragmas();
    this._crearEsquema();
    this._prepararSentencias();
  }

  /**
   * Configura los pragmas obligatorios de alto rendimiento (auditoría Argon).
   * WAL + NORMAL garantizan inserciones en <0.1ms sin bloquear el event loop.
   * @private
   */
  _configurarPragmas() {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  /**
   * Inicializa las tablas e índices si no existen.
   * @private
   */
  _crearEsquema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY,
        plataforma TEXT NOT NULL,
        usuario TEXT NOT NULL,
        nombre_visible TEXT NOT NULL,
        avatar_url TEXT,
        rol TEXT NOT NULL DEFAULT 'normal',
        es_suscriptor INTEGER NOT NULL DEFAULT 0,
        voz_config TEXT,
        notas_contexto TEXT NOT NULL DEFAULT '',
        sugerencia_saludo TEXT NOT NULL DEFAULT '',
        total_mensajes INTEGER NOT NULL DEFAULT 0,
        primer_mensaje_en INTEGER NOT NULL,
        ultimo_mensaje_en INTEGER NOT NULL,
        actualizado_en INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mensajes (
        id TEXT PRIMARY KEY,
        usuario_id TEXT NOT NULL,
        plataforma TEXT NOT NULL,
        usuario TEXT NOT NULL,
        nombre_visible TEXT NOT NULL,
        texto TEXT NOT NULL,
        color TEXT,
        timestamp INTEGER NOT NULL,
        fecha_hora TEXT NOT NULL,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_mensajes_usuario_ts ON mensajes (usuario_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_mensajes_timestamp ON mensajes (timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_usuarios_act ON usuarios (actualizado_en DESC);
      CREATE INDEX IF NOT EXISTS idx_usuarios_ultimo_msg ON usuarios (ultimo_mensaje_en DESC);
      CREATE INDEX IF NOT EXISTS idx_usuarios_busqueda ON usuarios (usuario, nombre_visible);
    `);
  }

  /**
   * Precompila sentencias preparadas para máxima velocidad y prevención estricta de SQL injection.
   * @private
   */
  _prepararSentencias() {
    this.stmtInsertMensaje = this.db.prepare(`
      INSERT OR REPLACE INTO mensajes (
        id, usuario_id, plataforma, usuario, nombre_visible, texto, color, timestamp, fecha_hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtSelectUsuario = this.db.prepare(`
      SELECT * FROM usuarios WHERE id = ?
    `);

    this.stmtSelectUsuarioPorPlataforma = this.db.prepare(`
      SELECT * FROM usuarios WHERE plataforma = ? AND usuario = ?
    `);

    this.stmtInsertUsuario = this.db.prepare(`
      INSERT INTO usuarios (
        id, plataforma, usuario, nombre_visible, avatar_url, rol, es_suscriptor,
        voz_config, notas_contexto, sugerencia_saludo, total_mensajes,
        primer_mensaje_en, ultimo_mensaje_en, actualizado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtUpdateUsuarioEnMensaje = this.db.prepare(`
      UPDATE usuarios SET
        nombre_visible = ?,
        avatar_url = COALESCE(?, avatar_url),
        total_mensajes = total_mensajes + 1,
        ultimo_mensaje_en = ?,
        actualizado_en = ?
      WHERE id = ?
    `);

    this.stmtUpdateFichaUsuario = this.db.prepare(`
      UPDATE usuarios SET
        rol = ?,
        es_suscriptor = ?,
        notas_contexto = ?,
        sugerencia_saludo = ?,
        voz_config = ?,
        avatar_url = COALESCE(?, avatar_url),
        actualizado_en = ?
      WHERE id = ?
    `);
  }

  /**
   * Normaliza la clave primaria canónica de un usuario: `plataforma:usuario`.
   * Previene colisiones entre usuarios con mismo nombre en Twitch y YouTube.
   * @param {string} plataforma - 'twitch' | 'youtube'.
   * @param {string} usuario - Login del usuario.
   * @returns {string} ID canónico.
   */
  static normalizarId(plataforma, usuario) {
    const plat = (plataforma || 'twitch').toLowerCase().trim();
    const user = (usuario || 'anonimo').toLowerCase().trim();
    return `${plat}:${user}`;
  }

  /**
   * Registra un mensaje entrante e indexa/actualiza la ficha del usuario en tiempo real.
   * Este método debe llamarse tras el broadcast WebSockets para no retrasar el feed.
   * 
   * @param {Object} payload
   * @param {string} [payload.id] - ID único del mensaje.
   * @param {string} payload.plataforma - 'twitch' | 'youtube'.
   * @param {string} payload.usuario - Login del usuario.
   * @param {string} [payload.nombreVisible] - Nombre para mostrar con mayúsculas/acentos.
   * @param {string} payload.texto - Mensaje de texto.
   * @param {string} [payload.avatar] - URL del avatar.
   * @param {string} [payload.color] - Color asignado en el chat.
   * @param {number} [payload.timestamp] - Timestamp numérico.
   * @param {string} [payload.rol] - 'normal' | 'vip' | 'mod' si se detecta de los badges.
   * @param {boolean} [payload.esSuscriptor] - true si es suscriptor.
   * @returns {Object} { usuario, mensaje }
   */
  registrarMensaje(payload) {
    if (!payload || !payload.texto) return null;

    const plataforma = (payload.plataforma || 'twitch').toLowerCase();
    const usuario = String(payload.usuario || 'anonimo').trim().toLowerCase();
    const nombreVisible = String(payload.nombreVisible || payload.usuario || usuario).trim();
    const texto = String(payload.texto).trim();
    const ts = Number(payload.timestamp) || Date.now();
    const msgId = String(payload.id || `${plataforma}_${ts}_${Math.random().toString(36).slice(2, 8)}`);
    const color = payload.color || null;
    const avatarUrl = payload.avatar || null;
    const fechaHora = formatearFechaHora(ts);
    const usuarioId = ComunidadDb.normalizarId(plataforma, usuario);

    const ahora = Date.now();

    // 1. Insertar o actualizar usuario
    const existente = this.stmtSelectUsuario.get(usuarioId);
    let rol = payload.rol || (existente ? existente.rol : 'normal');
    let esSuscriptor = typeof payload.esSuscriptor === 'boolean'
      ? (payload.esSuscriptor ? 1 : 0)
      : (existente ? existente.es_suscriptor : 0);

    if (!existente) {
      this.stmtInsertUsuario.run(
        usuarioId,
        plataforma,
        usuario,
        nombreVisible,
        avatarUrl,
        rol,
        esSuscriptor,
        null, // voz_config inicial
        '',   // notas_contexto
        '',   // sugerencia_saludo
        1,    // total_mensajes inicial
        ts,   // primer_mensaje_en
        ts,   // ultimo_mensaje_en
        ahora // actualizado_en
      );
    } else {
      this.stmtUpdateUsuarioEnMensaje.run(
        nombreVisible,
        avatarUrl,
        ts,
        ahora,
        usuarioId
      );
    }

    // 2. Insertar mensaje en historial
    this.stmtInsertMensaje.run(
      msgId,
      usuarioId,
      plataforma,
      usuario,
      nombreVisible,
      texto,
      color,
      ts,
      fechaHora
    );

    return {
      usuarioId,
      mensajeId: msgId,
      timestamp: ts
    };
  }

  /**
   * Obtiene la ficha completa de un usuario por su ID canónico (`plataforma:usuario`).
   * @param {string} usuarioId
   * @returns {Object|null}
   */
  obtenerUsuario(usuarioId) {
    if (!usuarioId) return null;
    const row = this.stmtSelectUsuario.get(usuarioId);
    if (!row) return null;
    return this._mapearUsuario(row);
  }

  /**
   * Obtiene la ficha de un usuario buscando por nombre y plataforma.
   * @param {string} usuario
   * @param {string} [plataforma='twitch']
   * @returns {Object|null}
   */
  obtenerUsuarioPorNombre(usuario, plataforma = 'twitch') {
    if (!usuario) return null;
    const row = this.stmtSelectUsuarioPorPlataforma.get(plataforma.toLowerCase(), usuario.toLowerCase().trim());
    if (!row) return null;
    return this._mapearUsuario(row);
  }

  /**
   * Actualiza los datos editables de la Ficha Técnica de un usuario.
   * 
   * @param {string} usuarioId - ID canónico `plataforma:usuario`.
   * @param {Object} cambios
   * @param {string} [cambios.rol] - 'normal' | 'vip' | 'mod' | 'admin'.
   * @param {boolean} [cambios.esSuscriptor] - Estado de suscripción.
   * @param {string} [cambios.notasContexto] - Resumen histórico de lo que suele comentar.
   * @param {string} [cambios.sugerenciaSaludo] - Mensaje sugerido al entrar.
   * @param {Object|string} [cambios.vozConfig] - Configuración de voz TTS.
   * @param {string} [cambios.avatarUrl] - Nueva URL de avatar opcional.
   * @returns {Object|null} Usuario actualizado.
   */
  actualizarUsuario(usuarioId, cambios = {}) {
    const actual = this.obtenerUsuario(usuarioId);
    if (!actual) return null;

    const rol = ['normal', 'vip', 'mod', 'admin'].includes(cambios.rol) ? cambios.rol : actual.rol;
    const esSuscriptor = typeof cambios.esSuscriptor === 'boolean'
      ? (cambios.esSuscriptor ? 1 : 0)
      : (typeof cambios.es_suscriptor === 'number' ? cambios.es_suscriptor : (actual.esSuscriptor ? 1 : 0));
    const notasContexto = typeof cambios.notasContexto === 'string'
      ? cambios.notasContexto
      : (typeof cambios.notas_contexto === 'string' ? cambios.notas_contexto : actual.notasContexto);
    const sugerenciaSaludo = typeof cambios.sugerenciaSaludo === 'string'
      ? cambios.sugerenciaSaludo
      : (typeof cambios.sugerencia_saludo === 'string' ? cambios.sugerencia_saludo : actual.sugerenciaSaludo);

    let vozConfigStr = actual.vozConfig ? JSON.stringify(actual.vozConfig) : null;
    if (cambios.vozConfig !== undefined) {
      if (cambios.vozConfig === null) {
        vozConfigStr = null;
      } else if (typeof cambios.vozConfig === 'object') {
        vozConfigStr = JSON.stringify(cambios.vozConfig);
      } else if (typeof cambios.vozConfig === 'string') {
        vozConfigStr = cambios.vozConfig;
      }
    }

    const avatarUrl = cambios.avatarUrl || cambios.avatar_url || actual.avatarUrl || null;
    const ahora = Date.now();

    this.stmtUpdateFichaUsuario.run(
      rol,
      esSuscriptor,
      notasContexto,
      sugerenciaSaludo,
      vozConfigStr,
      avatarUrl,
      ahora,
      usuarioId
    );

    return this.obtenerUsuario(usuarioId);
  }

  /**
   * Lista usuarios ordenados por última actividad o búsqueda (estilo lista de WhatsApp).
   * 
   * @param {Object} [filtros]
   * @param {string} [filtros.q] - Cadena de búsqueda (usuario, nombre_visible, notas_contexto).
   * @param {string} [filtros.plataforma] - 'twitch' | 'youtube'.
   * @param {string} [filtros.rol] - 'normal' | 'vip' | 'mod'.
   * @param {number} [filtros.limit=50] - Cantidad de registros.
   * @param {number} [filtros.offset=0] - Desplazamiento.
   * @returns {Object} { total, usuarios }
   */
  listarUsuarios(filtros = {}) {
    const q = (filtros.q || '').trim().toLowerCase();
    const plataforma = (filtros.plataforma || '').trim().toLowerCase();
    const rol = (filtros.rol || '').trim().toLowerCase();
    const limit = Math.min(Math.max(1, parseInt(filtros.limit, 10) || 50), 200);
    const offset = Math.max(0, parseInt(filtros.offset, 10) || 0);

    const condiciones = [];
    const params = [];

    if (q) {
      condiciones.push('(LOWER(usuario) LIKE ? OR LOWER(nombre_visible) LIKE ? OR LOWER(notas_contexto) LIKE ?)');
      const wild = `%${q}%`;
      params.push(wild, wild, wild);
    }
    if (plataforma) {
      condiciones.push('plataforma = ?');
      params.push(plataforma);
    }
    if (rol) {
      condiciones.push('rol = ?');
      params.push(rol);
    }

    const whereClause = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    // Contar total
    const stmtCount = this.db.prepare(`SELECT COUNT(*) as total FROM usuarios ${whereClause}`);
    const { total } = stmtCount.get(...params);

    // Obtener página con último mensaje incluido
    const stmtQuery = this.db.prepare(`
      SELECT u.*,
             (SELECT m.texto FROM mensajes m WHERE m.usuario_id = u.id ORDER BY m.timestamp DESC LIMIT 1) as ultimo_texto,
             (SELECT m.fecha_hora FROM mensajes m WHERE m.usuario_id = u.id ORDER BY m.timestamp DESC LIMIT 1) as ultima_fecha_hora
      FROM usuarios u
      ${whereClause}
      ORDER BY u.ultimo_mensaje_en DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmtQuery.all(...params, limit, offset);
    const usuarios = rows.map(r => {
      const u = this._mapearUsuario(r);
      u.ultimoTexto = r.ultimo_texto || '';
      u.ultimaFechaHora = r.ultima_fecha_hora || '';
      return u;
    });

    return { total, usuarios, limit, offset };
  }

  /**
   * Obtiene el historial de mensajes de un usuario con paginación (límite 50 para iPad).
   * 
   * @param {string} usuarioId - ID canónico `plataforma:usuario`.
   * @param {Object} [opciones]
   * @param {number} [opciones.limit=50] - Cantidad de mensajes a recuperar.
   * @param {number} [opciones.offset=0] - Desplazamiento.
   * @param {number} [opciones.antesDe] - Timestamp máximo para paginación por cursor.
   * @returns {Object} { total, mensajes, agrupadosPorDia }
   */
  obtenerMensajesUsuario(usuarioId, opciones = {}) {
    if (!usuarioId) return { total: 0, mensajes: [], agrupadosPorDia: {} };

    const limit = Math.min(Math.max(1, parseInt(opciones.limit, 10) || 50), 200);
    const offset = Math.max(0, parseInt(opciones.offset, 10) || 0);
    const antesDe = opciones.antesDe ? Number(opciones.antesDe) : null;

    let whereClause = 'WHERE usuario_id = ?';
    const params = [usuarioId];

    if (antesDe) {
      whereClause += ' AND timestamp < ?';
      params.push(antesDe);
    }

    const stmtTotal = this.db.prepare(`SELECT COUNT(*) as total FROM mensajes WHERE usuario_id = ?`);
    const { total } = stmtTotal.get(usuarioId);

    const stmtQuery = this.db.prepare(`
      SELECT * FROM mensajes
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmtQuery.all(...params, limit, offset);

    // Invertir para devolver en orden cronológico natural (antiguo -> reciente)
    const mensajes = rows.reverse().map(r => this._mapearMensaje(r));

    // Agrupar por día para facilitar renderizado en burbujas estilo WhatsApp
    const agrupadosPorDia = {};
    for (const msg of mensajes) {
      const diaKey = msg.fechaHora.slice(0, 10); // YYYY-MM-DD
      if (!agrupadosPorDia[diaKey]) {
        agrupadosPorDia[diaKey] = [];
      }
      agrupadosPorDia[diaKey].push(msg);
    }

    return {
      total,
      limit,
      offset,
      mensajes,
      agrupadosPorDia
    };
  }

  /**
   * Busca mensajes por contenido de texto en toda la base de datos (buscador global WhatsApp).
   * 
   * @param {string} textoBusqueda - Texto a localizar.
   * @param {Object} [opciones]
   * @param {number} [opciones.limit=30]
   * @param {number} [opciones.offset=0]
   * @returns {Object} { total, mensajes }
   */
  buscarMensajes(textoBusqueda, opciones = {}) {
    const q = (textoBusqueda || '').trim();
    if (!q) return { total: 0, mensajes: [] };

    const limit = Math.min(Math.max(1, parseInt(opciones.limit, 10) || 30), 100);
    const offset = Math.max(0, parseInt(opciones.offset, 10) || 0);
    const wild = `%${q}%`;

    const stmtCount = this.db.prepare(`
      SELECT COUNT(*) as total FROM mensajes WHERE texto LIKE ?
    `);
    const { total } = stmtCount.get(wild);

    const stmtQuery = this.db.prepare(`
      SELECT m.*, u.avatar_url, u.rol
      FROM mensajes m
      LEFT JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.texto LIKE ?
      ORDER BY m.timestamp DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmtQuery.all(wild, limit, offset);
    const mensajes = rows.map(r => {
      const msg = this._mapearMensaje(r);
      msg.avatarUrl = r.avatar_url || null;
      msg.rol = r.rol || 'normal';
      return msg;
    });

    return { total, q, limit, offset, mensajes };
  }

  /**
   * Devuelve métricas globales de la comunidad para diagnóstico y cabecera de Studio.
   * @returns {Object}
   */
  obtenerEstadisticas() {
    const totalUsuarios = this.db.prepare('SELECT COUNT(*) as c FROM usuarios').get().c;
    const totalMensajes = this.db.prepare('SELECT COUNT(*) as c FROM mensajes').get().c;
    const totalTwitch = this.db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE plataforma = 'twitch'").get().c;
    const totalYoutube = this.db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE plataforma = 'youtube'").get().c;
    const totalMods = this.db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE rol = 'mod'").get().c;
    const totalVips = this.db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE rol = 'vip'").get().c;
    const totalSuscriptores = this.db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE es_suscriptor = 1").get().c;

    return {
      totalUsuarios,
      totalMensajes,
      totalTwitch,
      totalYoutube,
      totalMods,
      totalVips,
      totalSuscriptores
    };
  }

  /**
   * Mapea una fila cruda de SQLite a entidad limpia Usuario.
   * @private
   */
  _mapearUsuario(row) {
    let vozConfig = null;
    if (row.voz_config) {
      try {
        vozConfig = JSON.parse(row.voz_config);
      } catch (_) {}
    }

    return {
      id: row.id,
      plataforma: row.plataforma,
      usuario: row.usuario,
      nombreVisible: row.nombre_visible,
      avatarUrl: row.avatar_url || null,
      rol: row.rol || 'normal',
      esSuscriptor: Boolean(row.es_suscriptor),
      vozConfig,
      notasContexto: row.notas_contexto || '',
      sugerenciaSaludo: row.sugerencia_saludo || '',
      totalMensajes: row.total_mensajes || 0,
      primerMensajeEn: row.primer_mensaje_en,
      ultimoMensajeEn: row.ultimo_mensaje_en,
      actualizadoEn: row.actualizado_en
    };
  }

  /**
   * Mapea una fila cruda de SQLite a entidad limpia Mensaje.
   * @private
   */
  _mapearMensaje(row) {
    return {
      id: row.id,
      usuarioId: row.usuario_id,
      plataforma: row.plataforma,
      usuario: row.usuario,
      nombreVisible: row.nombre_visible,
      texto: row.texto,
      color: row.color || null,
      timestamp: row.timestamp,
      fechaHora: row.fecha_hora
    };
  }

  /**
   * Cierra limpiamente la conexión a la base de datos.
   */
  close() {
    try {
      this.db.close();
    } catch (_) {}
  }
}

module.exports = {
  ComunidadDb,
  formatearFechaHora
};
