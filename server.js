'use strict';
const http  = require('http');
const fs    = require('fs');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');
const { parseWsAuth, parseWsPanelCookie, isTrustedWsOrigin, decideWsRole, canReceive, canSend } = require('./src/ws-auth');
const { handleStreamingConfig } = require('./src/streaming-config');
const { handleCentreStatus, handleFinalizarEmision } = require('./src/centro-status');

// Local, gitignored launch settings (data/directo.local.json → {"env": {...}}).
// Applied as defaults so every launcher (npm run directo, erbolamm directo on,
// "Arrancar Panel", double-click) starts with the same configuration.
// Explicit environment variables still win.
try {
  const local = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'data', 'directo.local.json'), 'utf8'));
  for (const [k, v] of Object.entries(local.env || {})) {
    if (process.env[k] === undefined) process.env[k] = String(v);
  }
} catch (_) { /* no local settings: public defaults */ }

const PORT        = parseInt(process.env.PORT || '7979', 10);
// Resolved after DATA_DIR is known: PANEL_PASS, a claimed password, or a one-time claim link.
let PASSWORD    = process.env.PANEL_PASS || '';
const pathMod        = require('path');

function resolveDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (fs.existsSync('/app/data')) return '/app/data';
  return pathMod.join(__dirname, 'data');
}

const DATA_DIR       = resolveDataDir();
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}
const CONFIG_FILE    = `${DATA_DIR}/config.json`;
const LAYERS_FILE    = `${DATA_DIR}/layers.json`;
const PUBLIC_DIR     = process.env.PUBLIC_DIR || pathMod.join(__dirname, 'public');
const CATEGORIA_FILE = `${DATA_DIR}/categoria.json`;
const CAMARA_FILE    = `${DATA_DIR}/camara.json`;

function loadCamaraConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const mainCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (mainCfg && mainCfg.vdo && mainCfg.vdo.camStreamId && mainCfg.vdo.password) {
        return {
          room: mainCfg.vdo.room || process.env.VDO_CAM_ROOM || process.env.VDO_ROOM || 'erbolammapliarte',
          streamId: mainCfg.vdo.camStreamId,
          password: mainCfg.vdo.password
        };
      }
    }
  } catch (_) {}
  try {
    if (fs.existsSync(CAMARA_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CAMARA_FILE, 'utf-8'));
      if (cfg && cfg.streamId && cfg.password) {
        return {
          room: cfg.room || process.env.VDO_CAM_ROOM || process.env.VDO_ROOM || 'erbolammapliarte',
          streamId: cfg.streamId,
          password: cfg.password
        };
      }
    }
  } catch (_) {}

  // Generar identificadores aleatorios seguros y persistir en DATA_DIR/camara.json
  const crypto = require('crypto');
  const room = process.env.VDO_CAM_ROOM || process.env.VDO_ROOM || 'erbolammapliarte';
  const streamId = process.env.VDO_CAM_STREAM || ('ja_cam_' + crypto.randomBytes(8).toString('hex'));
  const password = process.env.VDO_CAM_PASS || crypto.randomBytes(12).toString('base64url');
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CAMARA_FILE, JSON.stringify({ room, streamId, password }, null, 2), { mode: 0o600 });
  } catch (_) {}
  return { room, streamId, password };
}

const camaraSec = loadCamaraConfig();
const VDO_CAM_ROOM   = camaraSec.room;
const VDO_CAM_STREAM = camaraSec.streamId;
const VDO_CAM_PASS   = camaraSec.password;

// Minijuego !traidor / GameHub
function createGameHub({ randomIndex = (max) => Math.floor(Math.random() * max), now = Date.now } = {}) {
  const durations = { lobby_votacion: 60000, traidor_intro: 5000, traidor_debate: 300000, traidor_votacion: 45000, muerte_subita: 45000,
    traidor_expulsion: 8000, finalizado: 20000 };
  let state = { fase: 'idle', expiresAt: 0, players: [], owners: {}, traitorId: null,
    votes: new Map(), round: 0, lastExpelled: null, lastExpelledWasTraitor: null, winner: null,
    expelledPlayers: new Set(), tieBreaker: 0 };
  function phase(fase) { state.fase = fase; state.expiresAt = durations[fase] ? now() + durations[fase] : 0; }
  function counts() {
    const result = Object.fromEntries(state.players.map((_, i) => [String(i + 1), 0]));
    for (const choice of state.votes.values()) if (choice in result) result[choice]++;
    return result;
  }
  function finishVoting() {
    const tally = counts();
    const aliveIndices = state.players
      .map((p, i) => (!state.expelledPlayers.has(p) ? String(i + 1) : null))
      .filter(Boolean);
    const max = Math.max(0, ...aliveIndices.map(k => tally[k] || 0));
    const leaders = aliveIndices.filter((key) => (tally[key] || 0) === max && max > 0);

    if (leaders.length !== 1) {
      state.lastExpelled = null;
      state.lastExpelledWasTraitor = null;
      state.tieBreaker = (state.tieBreaker || 0) + 1;
      if (state.tieBreaker >= 2) {
        state.winner = 'traidor';
      }
      phase('traidor_expulsion');
      return;
    }

    state.tieBreaker = 0;
    const index = Number(leaders[0]) - 1;
    const expelled = state.players[index];
    const wasTraitor = (expelled === state.traitorId);
    state.lastExpelled = expelled;
    state.lastExpelledWasTraitor = wasTraitor;
    state.expelledPlayers.add(expelled);
    state.votes.clear();

    if (wasTraitor) {
      state.winner = 'inocentes';
    } else {
      const remainingAlive = state.players.filter(p => !state.expelledPlayers.has(p));
      if (remainingAlive.length < 3) {
        state.winner = 'traidor';
      }
    }
    phase('traidor_expulsion');
  }
  function finishExpulsion() {
    if (state.winner) {
      phase('finalizado');
    } else if (state.lastExpelled) {
      state.round++;
      const aliveCount = state.players.filter(p => !state.expelledPlayers.has(p)).length;
      phase(aliveCount === 3 ? 'muerte_subita' : 'traidor_debate');
    } else {
      repeatVote();
    }
  }
  function expire() {
    if (!state.expiresAt || now() < state.expiresAt) return;
    if (state.fase === 'lobby_votacion') phase('idle');
    else if (state.fase === 'traidor_intro') phase('traidor_debate');
    else if (state.fase === 'traidor_debate') { state.votes.clear(); phase('traidor_votacion'); }
    else if (['traidor_votacion', 'muerte_subita'].includes(state.fase)) finishVoting();
    else if (state.fase === 'traidor_expulsion') finishExpulsion();
    else if (state.fase === 'finalizado') reset();
  }
  function publicState() {
    expire();
    const alive = state.players.filter(p => !state.expelledPlayers.has(p));
    return {
      fase: state.fase,
      tiempoRestanteMs: Math.max(0, state.expiresAt - now()),
      quoromMinimo: 4,
      espectadoresAdoptados: Object.values(state.owners),
      juegoSeleccionado: state.traitorId ? 'traidor' : null,
      votos: counts(),
      votosDetalle: Object.fromEntries(state.votes),
      rondaTraidor: state.round,
      jugadoresVivos: [...alive],
      duenosVivos: alive.map(p => state.owners[p] || p),
      ultimoExpulsado: state.lastExpelled,
      ultimoExpulsadoDuenio: state.lastExpelled ? (state.owners[state.lastExpelled] || state.lastExpelled) : null,
      ultimoExpulsadoEraTraidor: state.lastExpelledWasTraitor,
      ganador: state.winner
    };
  }
  function privateState() {
    const secret = state.traitorId && state.fase !== 'idle'
      ? { avatarId: state.traitorId, twitchUser: state.owners[state.traitorId] || state.traitorId } : null;
    return { partidaActiva: state.fase !== 'idle', fase: state.fase, traidorSecreto: secret };
  }
  function lobby() {
    expire();
    state = { fase: 'idle', expiresAt: 0, players: [], owners: {}, traitorId: null,
      votes: new Map(), round: 0, lastExpelled: null, lastExpelledWasTraitor: null, winner: null,
      expelledPlayers: new Set(), tieBreaker: 0 };
    phase('lobby_votacion');
    return publicState();
  }
  function startTraitor(owners) {
    expire();
    const entries = Object.entries(owners ?? {}).filter(([id, user]) =>
      id !== 'ja' && /^[a-z]{2}$/.test(id) && typeof user === 'string' && user.length > 0);
    const uniqueUsers = new Set(entries.map(([, user]) => user.toLowerCase()));
    if (entries.length < 4 || uniqueUsers.size !== entries.length) {
      throw new Error('Se necesitan al menos 4 avatares adoptados por distintos espectadores (o usa Modo Prueba)');
    }
    state.players = entries.map(([id]) => id);
    state.owners = Object.fromEntries(entries);
    state.traitorId = state.players[randomIndex(state.players.length)];
    state.round = 1;
    state.votes.clear();
    state.lastExpelled = null;
    state.lastExpelledWasTraitor = null;
    state.winner = null;
    state.expelledPlayers = new Set();
    state.tieBreaker = 0;
    phase('traidor_debate');
    return publicState();
  }
  function forceVote() {
    expire();
    state.votes.clear();
    const aliveCount = state.players.filter(p => !state.expelledPlayers.has(p)).length;
    phase(aliveCount === 3 ? 'muerte_subita' : 'traidor_votacion');
    return publicState();
  }
  function simulateVotes() {
    if (!['traidor_votacion', 'muerte_subita'].includes(state.fase)) {
      forceVote();
    }
    const alive = state.players.filter(p => !state.expelledPlayers.has(p));
    if (alive.length >= 2) {
      const targetIdx = state.players.indexOf(alive[1]) + 1;
      const otherIdx = state.players.indexOf(alive[0]) + 1;
      alive.forEach((p, idx) => {
        const choice = (idx === 0) ? String(otherIdx) : String(targetIdx);
        state.votes.set((state.owners[p] || p).toLowerCase(), choice);
      });
    }
    finishVoting();
    return publicState();
  }
  function advance() {
    expire();
    if (state.fase === 'traidor_intro') phase('traidor_debate');
    else if (state.fase === 'traidor_debate') { state.votes.clear(); phase('traidor_votacion'); }
    else if (['traidor_votacion', 'muerte_subita'].includes(state.fase)) finishVoting();
    else if (state.fase === 'traidor_expulsion') finishExpulsion();
    else throw new Error('Esta fase no se puede avanzar directamente');
    return publicState();
  }
  function vote(user, choice) {
    expire();
    if (!['traidor_votacion', 'muerte_subita'].includes(state.fase)) throw new Error('Votacion cerrada');
    if (typeof user !== 'string' || !user.trim()) throw new Error('Votante invalido');
    if (typeof choice !== 'string' || !/^[1-9]\d*$/.test(choice) || Number(choice) > state.players.length)
      throw new Error('Opcion invalida');
    const targetPlayer = state.players[Number(choice) - 1];
    if (state.expelledPlayers.has(targetPlayer)) throw new Error('Ese jugador ya ha sido expulsado');
    state.votes.set(user.toLowerCase(), choice);
    return publicState();
  }
  function resolveExpulsion() {
    finishExpulsion();
    return publicState();
  }
  function repeatVote() {
    state.votes.clear();
    const aliveCount = state.players.filter(p => !state.expelledPlayers.has(p)).length;
    phase(aliveCount === 3 ? 'muerte_subita' : 'traidor_votacion');
    return publicState();
  }
  function reset() {
    state = { fase: 'idle', expiresAt: 0, players: [], owners: {}, traitorId: null,
      votes: new Map(), round: 0, lastExpelled: null, lastExpelledWasTraitor: null, winner: null,
      expelledPlayers: new Set(), tieBreaker: 0 };
    return publicState();
  }
  return { publicState, privateState, lobby, startTraitor, forceVote, simulateVotes, advance, vote, repeatVote, reset };

}
const gameHub = createGameHub();

let serverOwners     = {};

let seqComandosDirecto = 0;
const ringComandosDirecto = [];
let modoCamaraDirecto = 'monigote';
const cooldownComandosTwitch = new Map();
const COOLDOWN_COMANDO_MS = 2000;

// ─── Twitch IRC Bot para emisión de comandos al chat real ─────────────────
const TWITCH_CONFIG_FILE = `${DATA_DIR}/twitch-auth.json`;
let twitchConfig = {
  token: process.env.TWITCH_CHAT_TOKEN || '',
  nick: process.env.TWITCH_CHAT_NICK || 'apliarte',
  canal: process.env.TWITCH_CHANNEL || 'apliarte'
};
try {
  if (fs.existsSync(TWITCH_CONFIG_FILE)) {
    const saved = JSON.parse(fs.readFileSync(TWITCH_CONFIG_FILE, 'utf8'));
    twitchConfig = { ...twitchConfig, ...saved };
  }
} catch (_) {}
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const mainCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (mainCfg && mainCfg.twitch) {
      twitchConfig = { ...twitchConfig, ...mainCfg.twitch };
    }
  }
} catch (_) {}

function maskSecret(str) {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••••••';
  return trimmed.slice(0, 3) + '••••••••' + trimmed.slice(-3);
}

function loadAppConfig() {
  let cfg = {
    vdo: {
      room: (typeof VDO_CAM_ROOM !== 'undefined' ? VDO_CAM_ROOM : (process.env.VDO_CAM_ROOM || process.env.VDO_ROOM || 'erbolammapliarte')),
      camStreamId: (typeof VDO_CAM_STREAM !== 'undefined' ? VDO_CAM_STREAM : (process.env.VDO_CAM_STREAM || 'ja_cam')),
      password: (typeof VDO_CAM_PASS !== 'undefined' ? VDO_CAM_PASS : (process.env.VDO_CAM_PASS || ''))
    },
    twitch: {
      canal: (typeof twitchConfig !== 'undefined' ? twitchConfig.canal : 'apliarte') || 'apliarte',
      nick: (typeof twitchConfig !== 'undefined' ? twitchConfig.nick : 'apliarte') || 'apliarte',
      token: (typeof twitchConfig !== 'undefined' ? twitchConfig.token : '') || ''
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || ''
    }
  };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const disk = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (disk && typeof disk === 'object') {
        if (disk.vdo) cfg.vdo = { ...cfg.vdo, ...disk.vdo };
        if (disk.twitch) cfg.twitch = { ...cfg.twitch, ...disk.twitch };
        if (disk.openai) cfg.openai = { ...cfg.openai, ...disk.openai };
        if (disk.streaming) cfg.streaming = disk.streaming;
      }
    }
  } catch (_) {}
  return cfg;
}

function saveAppConfig(updates) {
  const current = loadAppConfig();
  if (updates && typeof updates === 'object') {
    if (updates.vdo && typeof updates.vdo === 'object') {
      if (updates.vdo.password && updates.vdo.password.includes('••••')) {
        delete updates.vdo.password;
      }
      current.vdo = { ...current.vdo, ...updates.vdo };
    }
    if (updates.twitch && typeof updates.twitch === 'object') {
      if (updates.twitch.token && updates.twitch.token.includes('••••')) {
        delete updates.twitch.token;
      }
      current.twitch = { ...current.twitch, ...updates.twitch };
      if (typeof twitchConfig !== 'undefined') {
        if (current.twitch.canal) twitchConfig.canal = current.twitch.canal;
        if (current.twitch.nick) twitchConfig.nick = current.twitch.nick;
        if (current.twitch.token) twitchConfig.token = current.twitch.token;
      }
    }
    if (updates.openai && typeof updates.openai === 'object') {
      if (updates.openai.apiKey && updates.openai.apiKey.includes('••••')) {
        delete updates.openai.apiKey;
      }
      current.openai = { ...current.openai, ...updates.openai };
    }
  }
  if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(current, null, 2), { mode: 0o600 });
  return current;
}

function getObsUrls(req, cfg) {
  const proto = (req?.headers?.['x-forwarded-proto'] || (req?.socket?.encrypted ? 'https' : 'http')).split(',')[0].trim();
  const host = (req?.headers?.['x-forwarded-host'] || req?.headers?.host || `localhost:${PORT}`).split(',')[0].trim();
  const baseUrl = `${proto}://${host}`;
  const vdo = cfg?.vdo || {};
  const room = vdo.room || 'erbolammapliarte';
  const stream = vdo.camStreamId || 'ja_cam';
  const pass = vdo.password || '';
  const passQuery = pass ? `&password=${encodeURIComponent(pass)}` : '';
  return {
    fondo: `${baseUrl}/fondo.html`,
    chat: `${baseUrl}/chat.html`,
    plano: `${baseUrl}/plano?transparente=1`, // OBS mode: no controls, avatar column, !contexto
    planoSilenciado: `${baseUrl}/plano?transparente=1&noaudio=1`,
    camara: `${baseUrl}/camara.html`,
    microObs: `${baseUrl}/micro-obs.html`,
    vdoCamPush: `https://vdo.ninja/?push=${encodeURIComponent(stream)}&room=${encodeURIComponent(room)}${passQuery}&webcam&autostart`,
    vdoCamView: `https://vdo.ninja/?view=${encodeURIComponent(stream)}&room=${encodeURIComponent(room)}${passQuery}&solo&cleanoutput&transparent&autoplay=1&cover=1&buffer=350&sync=0&videobitrate=1500&codec=h264&api&noaudio`,
    baseUrl
  };
}

let twitchSenderWs = null;
let twitchConnected = false;

async function validarTokenTwitch(token) {
  try {
    const raw = String(token || '').replace(/^oauth:/, '').trim();
    if (!raw) return { valido: false, error: 'Token vacío' };
    const res = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: 'OAuth ' + raw }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { valido: false, error: err.message || 'Token inválido o expirado' };
    }
    const data = await res.json();
    return { valido: true, login: data.login, user_id: data.user_id, scopes: data.scopes };
  } catch (e) {
    return { valido: false, error: e.message };
  }
}

function conectarTwitchSender() {
  if (!twitchConfig.token) {
    twitchConnected = false;
    return;
  }
  if (twitchSenderWs) {
    try { twitchSenderWs.close(); } catch (_) {}
  }
  try {
    const { WebSocket: WsClient } = require('ws');
    twitchSenderWs = new WsClient('wss://irc-ws.chat.twitch.tv:443');
    twitchSenderWs.on('open', () => {
      const raw = twitchConfig.token.replace(/^oauth:/, '').trim();
      const passToken = `oauth:${raw}`;
      twitchSenderWs.send(`CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership\r\n`);
      twitchSenderWs.send(`PASS ${passToken}\r\n`);
      twitchSenderWs.send(`NICK ${twitchConfig.nick}\r\n`);
      twitchSenderWs.send(`JOIN #${twitchConfig.canal}\r\n`);
      console.log(`[TwitchIRC] Negociando conexión con Twitch como ${twitchConfig.nick}...`);
    });
    twitchSenderWs.on('message', (data) => {
      const msg = data.toString('utf-8');
      console.log('[TwitchIRC] Recibido:', msg.trim());
      if (msg.startsWith('PING')) {
        twitchSenderWs.send('PONG :tmi.twitch.tv\r\n');
      }
      if (msg.includes(':tmi.twitch.tv 001') || msg.includes('JOIN')) {
        twitchConnected = true;
        console.log(`[TwitchIRC] ¡Autenticación exitosa! En línea como ${twitchConfig.nick} en #${twitchConfig.canal}`);
      } else if (msg.includes('Login authentication failed') || msg.includes('Login unsuccessful')) {
        twitchConnected = false;
        console.error('[TwitchIRC] Error: Token rechazado por Twitch (Login authentication failed)');
      }
    });
    twitchSenderWs.on('close', () => {
      twitchConnected = false;
      setTimeout(conectarTwitchSender, 10000);
    });
    twitchSenderWs.on('error', (err) => {
      console.error('[TwitchIRC] Error socket:', err.message);
      twitchConnected = false;
    });
  } catch (err) {
    console.error('[TwitchIRC] Excepción al conectar:', err);
  }
}

if (!process.env.APLIARTE_TEST_DATA_DIR && process.env.NODE_ENV !== 'test') {
  conectarTwitchSender();
}

function sanearComando(cmdStr) {
  if (!cmdStr || typeof cmdStr !== 'string') {
    return { valido: false, error: 'Comando vacío o no válido' };
  }
  let c = cmdStr.trim();
  if (!c) {
    return { valido: false, error: 'Comando vacío o no válido' };
  }
  // 1. Colapsar espacios múltiples internos
  c = c.replace(/\s+/g, ' ');
  // 2. Corregir espacios parásitos entre prefijo (! o /) y el nombre del comando
  // Ej: "! so" -> "!so", "/ announce" -> "/announce", "!  w 1" -> "!w 1", "/ goal" -> "/goal"
  c = c.replace(/^([!/])\s+([a-zA-Z0-9_]+)/, '$1$2');

  // 3. Detectar si quedaron placeholders sin resolver ([usuario], [canal], [mensaje], [agente])
  if (/\[(usuario|canal|mensaje|agente)\]/i.test(c)) {
    return {
      valido: false,
      error: `Parámetro sin rellenar en comando: "${c}" (selecciona un valor antes de enviar)`,
      comando: c
    };
  }

  return { valido: true, comando: c };
}

async function ejecutarModeracionHelix(cmdStr) {
  const m = cmdStr.trim().match(/^(\/(?:timeout|ban|unban|untimeout|shoutout|vip|unvip|raid)|!so)\s+@?([a-zA-Z0-9_]+)(?:\s+(\d+))?/i);
  if (!m) return null;
  const accion = m[1].toLowerCase();
  const targetLogin = m[2].toLowerCase();
  const duracion = accion === '/ban' ? undefined : parseInt(m[3] || '600', 10);

  const cleanToken = String(twitchConfig.token || '').replace(/^oauth:/, '').trim();
  if (!cleanToken) {
    return { ok: false, error: 'Twitch no está configurado (falta token)' };
  }

  const clientId = 'gp762nuuoqcoxypju8c569th9wz7q5';
  try {
    const checkRes = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: 'OAuth ' + cleanToken }
    });
    if (!checkRes.ok) return { ok: false, error: 'Token de Twitch inválido o expirado' };
    const authData = await checkRes.json();
    const broadcasterId = authData.user_id;

    const userRes = await fetch('https://api.twitch.tv/helix/users?login=' + encodeURIComponent(targetLogin), {
      headers: {
        'Client-Id': clientId,
        'Authorization': 'Bearer ' + cleanToken
      }
    });
    if (!userRes.ok) return { ok: false, error: 'No se pudo buscar al usuario @' + targetLogin + ' en Twitch' };
    const userData = await userRes.json();
    if (!userData.data || !userData.data.length) {
      return { ok: false, error: 'Usuario @' + targetLogin + ' no encontrado en Twitch' };
    }
    const targetUserId = userData.data[0].id;
    const targetDisplayName = userData.data[0].display_name;

    // ── SHOUTOUT (!so o /shoutout) ──
    if (accion === '/shoutout' || accion === '!so') {
      let juego = '';
      try {
        const chRes = await fetch('https://api.twitch.tv/helix/channels?broadcaster_id=' + targetUserId, {
          headers: { 'Client-Id': clientId, 'Authorization': 'Bearer ' + cleanToken }
        });
        if (chRes.ok) {
          const chData = await chRes.json();
          juego = chData?.data?.[0]?.game_name || '';
        }
      } catch (_) {}

      let helixOk = false;
      let helixMsg = '';
      try {
        const soUrl = 'https://api.twitch.tv/helix/chat/shoutouts?from_broadcaster_id=' + broadcasterId + '&to_broadcaster_id=' + targetUserId + '&moderator_id=' + broadcasterId;
        const soRes = await fetch(soUrl, {
          method: 'POST',
          headers: {
            'Client-Id': clientId,
            'Authorization': 'Bearer ' + cleanToken
          }
        });
        if (soRes.status === 204 || soRes.ok) {
          helixOk = true;
        } else {
          const errD = await soRes.json().catch(() => ({}));
          helixMsg = errD.message || ('HTTP ' + soRes.status);
        }
      } catch (e) {
        helixMsg = e.message;
      }

      const textoPromo = juego
        ? `📢 ¡Seguid a @${targetDisplayName} en https://twitch.tv/${targetLogin}! Estaba emitiendo: ${juego}. ¡Pasaos a darle amor! 🚀`
        : `📢 ¡Seguid a @${targetDisplayName} en https://twitch.tv/${targetLogin}! ¡Pasaos a darle amor! 🚀`;
      enviarATwitchChat(textoPromo);

      const msg = helixOk
        ? `📢 Shoutout enviado para @${targetDisplayName} (Banner Twitch + Chat).`
        : `📢 Shoutout enviado al chat para @${targetDisplayName} (${helixMsg || 'Chat'}).`;
      console.log('[TwitchHelix] ' + msg);
      return { ok: true, mensaje: msg };
    }

    // ── VIP / UNVIP ──
    if (accion === '/vip') {
      const vipUrl = 'https://api.twitch.tv/helix/channels/vips?broadcaster_id=' + broadcasterId + '&user_id=' + targetUserId;
      const vipRes = await fetch(vipUrl, {
        method: 'POST',
        headers: { 'Client-Id': clientId, 'Authorization': 'Bearer ' + cleanToken }
      });
      if (vipRes.ok || vipRes.status === 204) {
        enviarATwitchChat(`👑 @${targetDisplayName} es ahora VIP del canal.`);
        return { ok: true, mensaje: `👑 @${targetDisplayName} es ahora VIP en Twitch.` };
      }
      const errD = await vipRes.json().catch(() => ({}));
      return { ok: false, error: errD.message || ('Error ' + vipRes.status + ' al hacer VIP') };
    }

    if (accion === '/unvip') {
      const vipUrl = 'https://api.twitch.tv/helix/channels/vips?broadcaster_id=' + broadcasterId + '&user_id=' + targetUserId;
      const vipRes = await fetch(vipUrl, {
        method: 'DELETE',
        headers: { 'Client-Id': clientId, 'Authorization': 'Bearer ' + cleanToken }
      });
      if (vipRes.ok || vipRes.status === 204) {
        enviarATwitchChat(`👑 Se ha retirado el VIP a @${targetDisplayName}.`);
        return { ok: true, mensaje: `👑 Se ha retirado el VIP a @${targetDisplayName}.` };
      }
      const errD = await vipRes.json().catch(() => ({}));
      return { ok: false, error: errD.message || ('Error ' + vipRes.status + ' al quitar VIP') };
    }

    // ── RAID ──
    if (accion === '/raid') {
      const raidUrl = 'https://api.twitch.tv/helix/raids?from_broadcaster_id=' + broadcasterId + '&to_broadcaster_id=' + targetUserId;
      const raidRes = await fetch(raidUrl, {
        method: 'POST',
        headers: { 'Client-Id': clientId, 'Authorization': 'Bearer ' + cleanToken }
      });
      if (raidRes.ok || raidRes.status === 200) {
        enviarATwitchChat(`⚔️ ¡Iniciando Raid hacia el canal de @${targetDisplayName}! Preparaos todos 🚀 https://twitch.tv/${targetLogin}`);
        return { ok: true, mensaje: `⚔️ Raid iniciada hacia @${targetDisplayName}.` };
      }
      const errD = await raidRes.json().catch(() => ({}));
      return { ok: false, error: errD.message || ('Error ' + raidRes.status + ' al iniciar Raid') };
    }

    if (accion === '/unban' || accion === '/untimeout') {
      const unbanUrl = 'https://api.twitch.tv/helix/moderation/bans?broadcaster_id=' + broadcasterId + '&moderator_id=' + broadcasterId + '&user_id=' + targetUserId;
      const unbanRes = await fetch(unbanUrl, {
        method: 'DELETE',
        headers: {
          'Client-Id': clientId,
          'Authorization': 'Bearer ' + cleanToken
        }
      });
      if (unbanRes.ok || unbanRes.status === 204) {
        const msg = '✅ Sanción levantada para @' + targetLogin + ' en Twitch.';
        console.log('[TwitchHelix] ' + msg);
        return { ok: true, mensaje: msg };
      }
      const errData = await unbanRes.json().catch(() => ({}));
      return { ok: false, error: errData.message || ('Error ' + unbanRes.status + ' al desbanear en Twitch') };
    }

    const banBody = {
      data: {
        user_id: targetUserId,
        reason: 'Sanción aplicada desde Cockpit Directo'
      }
    };
    if (accion !== '/ban') {
      banBody.data.duration = duracion;
    }

    const banUrl = 'https://api.twitch.tv/helix/moderation/bans?broadcaster_id=' + broadcasterId + '&moderator_id=' + broadcasterId;
    const banRes = await fetch(banUrl, {
      method: 'POST',
      headers: {
        'Client-Id': clientId,
        'Authorization': 'Bearer ' + cleanToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(banBody)
    });

    if (banRes.ok) {
      const msg = accion === '/ban'
        ? '⛔ @' + targetLogin + ' ha sido baneado en Twitch.'
        : '⏳ @' + targetLogin + ' ha recibido un timeout de ' + duracion + 's en Twitch.';
      console.log('[TwitchHelix] ' + msg);
      return { ok: true, mensaje: msg };
    }

    const errData = await banRes.json().catch(() => ({}));
    if (errData.status === 401 || errData.status === 403 || String(errData.message).includes('Missing scope')) {
      return {
        ok: false,
        error: 'El token de Twitch no tiene el permiso "moderator:manage:banned_users". Genera uno nuevo con ese scope en twitchtokengenerator.com para moderar desde el panel.'
      };
    }
    return { ok: false, error: errData.message || ('Error ' + banRes.status + ' al moderar en Twitch') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function ejecutarAnuncioHelix(cmdStr) {
  const raw = String(cmdStr || '').trim();
  const resto = raw.slice('/announce'.length).trim();
  if (!resto) {
    return { ok: false, error: 'El comando /announce requiere un mensaje para el anuncio' };
  }

  let color = 'primary';
  let mensaje = resto;
  const primerEspacio = resto.indexOf(' ');
  const posiblesColores = ['blue', 'green', 'orange', 'purple', 'primary'];
  if (primerEspacio !== -1) {
    const primerToken = resto.slice(0, primerEspacio).toLowerCase();
    if (posiblesColores.includes(primerToken)) {
      color = primerToken;
      mensaje = resto.slice(primerEspacio + 1).trim();
    }
  } else if (posiblesColores.includes(resto.toLowerCase())) {
    return { ok: false, error: 'El anuncio no puede contener solo el nombre de un color' };
  }

  if (!mensaje) {
    return { ok: false, error: 'El comando /announce requiere un mensaje para el anuncio' };
  }

  if (mensaje.length > 500) {
    return {
      ok: false,
      error: `El anuncio excede el límite de 500 caracteres de Twitch (${mensaje.length} caracteres)`
    };
  }

  const cleanToken = String(twitchConfig.token || '').replace(/^oauth:/, '').trim();
  if (!cleanToken) {
    return { ok: false, error: 'Twitch no está configurado (falta token)' };
  }

  const clientId = 'gp762nuuoqcoxypju8c569th9wz7q5';
  try {
    const checkRes = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: 'OAuth ' + cleanToken }
    });
    if (!checkRes.ok) return { ok: false, error: 'Token de Twitch inválido o expirado' };
    const authData = await checkRes.json();
    const broadcasterId = authData.user_id;

    const announceUrl = `https://api.twitch.tv/helix/chat/announcements?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}`;
    const annRes = await fetch(announceUrl, {
      method: 'POST',
      headers: {
        'Client-Id': clientId,
        'Authorization': 'Bearer ' + cleanToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: mensaje, color })
    });

    if (annRes.status === 204 || annRes.ok) {
      console.log(`[TwitchHelix] Anuncio publicado en Twitch (${color}): ${mensaje.slice(0, 60)}...`);
      return { ok: true, mensaje: `📢 Anuncio publicado en Twitch (${mensaje.length} caracteres)` };
    }

    const errD = await annRes.json().catch(() => ({}));
    if (errD.status === 401 || errD.status === 403 || String(errD.message).includes('Missing scope')) {
      return {
        ok: false,
        error: 'El token de Twitch no tiene el permiso "moderator:manage:announcements". Genera uno nuevo con ese scope para publicar anuncios desde el panel.'
      };
    }
    return { ok: false, error: errD.message || (`Error ${annRes.status} al publicar anuncio en Twitch`) };
  } catch (err) {
    return { ok: false, error: 'Fallo de conexión al enviar anuncio: ' + (err.message || err) };
  }
}

function enviarATwitchChat(texto) {
  if (!texto) return false;
  if (twitchSenderWs && twitchSenderWs.readyState === 1 && twitchConnected) {
    const canal = twitchConfig.canal || 'apliarte';
    twitchSenderWs.send(`PRIVMSG #${canal} :${texto}\r\n`);
    console.log(`[TwitchIRC] Enviado a #${canal}: ${texto}`);
    return true;
  }
  return false;
}

let videoCola = [];
let videoEnAntena = null;

function getCategoriaEstado() {
  try {
    if (fs.existsSync(CATEGORIA_FILE)) {
      const d = JSON.parse(fs.readFileSync(CATEGORIA_FILE, 'utf8'));
      if (d) {
        return {
          categoria: d.categoria || 'apps',
          modo: d.modo || 'dark'
        };
      }
    }
  } catch (_) {}
  return { categoria: 'apps', modo: 'dark' };
}

function getCategoria() {
  return getCategoriaEstado().categoria;
}


const CATEGORIAS_TWITCH_GAME = {
  apps: { id: '1469308723', nombre: 'Software and Game Development' },
  arte: { id: '509660', nombre: 'Art' },
  musica: { id: '26936', nombre: 'Music' },
  charlando: { id: '509658', nombre: 'Just Chatting' },
  andando: { id: '509672', nombre: 'IRL' }
};

const CATEGORIAS_OBS_ESCENAS = {
  apps: 'PLANO-INTERACTIVO',
  arte: 'Solo_Calca',
  charlando: 'CON_CAMARA',
  andando: 'CAM',
  musica: 'PLANO-INTERACTIVO'
};

async function actualizarCategoriaTwitch(cat) {
  const game = CATEGORIAS_TWITCH_GAME[cat];
  if (!game || !twitchConfig.token) return;
  const cleanToken = String(twitchConfig.token).replace(/^oauth:/, '').trim();
  try {
    const res = await fetch('https://api.twitch.tv/helix/channels?broadcaster_id=666785367', {
      method: 'PATCH',
      headers: {
        'Client-Id': 'gp762nuuoqcoxypju8c569th9wz7q5',
        'Authorization': `Bearer ${cleanToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ game_id: game.id })
    });
    if (res.ok) {
      console.log(`[TwitchHelix] Categoría de Twitch actualizada a: ${game.nombre} (${game.id})`);
    } else {
      const err = await res.json().catch(() => ({}));
      console.error(`[TwitchHelix] Error al cambiar categoría en Twitch:`, err);
    }
  } catch (e) {
    console.error(`[TwitchHelix] Excepción al cambiar categoría en Twitch:`, e.message);
  }
}

function setCategoriaEstado({ categoria, modo }) {
  try {
    const actual = getCategoriaEstado();
    const nuevo = {
      categoria: categoria || actual.categoria,
      modo: modo || actual.modo,
      actualizado: new Date().toISOString()
    };
    fs.writeFileSync(CATEGORIA_FILE, JSON.stringify(nuevo, null, 2));
    return nuevo;
  } catch (e) {
    console.error('[categoria] Error al guardar:', e.message);
    return { categoria: categoria || 'apps', modo: modo || 'dark' };
  }
}

function setCategoria(cat) {
  setCategoriaEstado({ categoria: cat });
}

const SMS_FILE = `${DATA_DIR}/buzon-sms.json`;

function getSmsList() {
  try {
    if (fs.existsSync(SMS_FILE)) {
      return JSON.parse(fs.readFileSync(SMS_FILE, 'utf8'));
    }
  } catch (_) {}
  return [];
}

function saveSmsList(lista) {
  try {
    fs.writeFileSync(SMS_FILE, JSON.stringify(lista, null, 2), 'utf8');
  } catch (e) {
    console.error('[sms] Error al guardar:', e.message);
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.woff2': 'font/woff2',
  '.ttf': 'application/font-ttf',
  '.wasm': 'application/wasm'
};

function serveStatic(req, res, relPath) {
  const safePath = pathMod.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = pathMod.join(PUBLIC_DIR, safePath);
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = pathMod.join(filePath, 'index.html');
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = pathMod.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': ext === '.html' ? 'no-cache, must-revalidate' : 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
      return true;
    }
  } catch (err) {
    console.error('[static] Error sirviendo:', filePath, err.message);
  }
  return false;
}

// ── Capas por defecto (usadas si no existe layers.json) ──────────────────────
const passQueryCamDef = VDO_CAM_PASS ? `&password=${encodeURIComponent(VDO_CAM_PASS)}` : '';
const DEFAULT_LAYERS = [
  { id:'bg',            icon:'\u{1F310}', name:'Fondo pausa',          sub:'Pantalla estática ligera',    url:'http://localhost:7979/pause',                                                                                                                                                           visible:true,  order:0, css:'', allowCamera:false },
  { id:'tw_alerts',     icon:'\u{1F514}', name:'Alertas Twitch',       sub:'Twitch Alertbox',            url:'https://dashboard.twitch.tv/widgets/alertbox', visible:true,  order:1, css:'', allowCamera:false },
  { id:'streamelements',icon:'\u2B50',    name:'StreamElements',        sub:'Overlay personalizado',      url:'https://streamelements.com/overlay/sample-overlay-id',                                                                         visible:true,  order:2, css:'', allowCamera:false },
  { id:'kofi',          icon:'\u2615',   name:'Ko-fi Donaciones',      sub:'Alertas de donaci\u00f3n',   url:'https://ko-fi.com/streamalerts/overlay/sample-kofi-id',                                                                                                       visible:true,  order:3, css:'', allowCamera:false },
  { id:'kofi_animated', icon:'\u{1F389}', name:'Ko-fi Animado',         sub:'Oculto por defecto',          url:'https://ko-fi.com/streamalerts/overlayanimated/sample-kofi-id',                                                                                               visible:false, order:4, css:'', allowCamera:false },
  { id:'kofi_goal',     icon:'\u{1F3AF}', name:'Ko-fi Meta',            sub:'Barra de objetivo',           url:'https://ko-fi.com/streamalerts/goaloverlay/sample-kofi-id',                                                                                                   visible:true,  order:5, css:'width:320px;height:auto;top:auto;left:auto;bottom:calc(50% + 100px);right:20px;', allowCamera:false },
  { id:'soundalerts',   icon:'\u{1F50A}', name:'SoundAlerts',           sub:'Alertas de sonido',           url:'https://source.soundalerts.com/alert/sample-soundalert-id',                                                                                                            visible:true,  order:6, css:'', allowCamera:false },
  { id:'camera',        icon:'\u{1F4F7}', name:'C\u00e1mara mini',     sub:'VDO.ninja \u2014 esquina derecha', url:`https://vdo.ninja/?scene=0&room=${encodeURIComponent(VDO_CAM_ROOM)}${passQueryCamDef}&st&channels&codec=h264&fadein&cover&autoplay`,                                                                                                                             visible:true,  order:7, css:'width:320px;height:180px;top:50%;left:auto;transform:translateY(-50%);bottom:auto;right:20px;border-radius:14px;border:3px solid #e91916;box-shadow:0 8px 40px rgba(0,0,0,.85),0 0 0 3px rgba(233,25,22,.35);', allowCamera:true },
  { id:'escena_juego',  icon:'🎮',         name:'Escena Juego',    sub:'VDO.ninja — fondo cámaras sala', url:`https://vdo.ninja/?scene=0&room=${encodeURIComponent(VDO_CAM_ROOM)}${passQueryCamDef}&st&channels&codec=h264&fadein&cover&autoplay`, visible:false, order:8, css:'width:100%;height:100%;top:0;left:0;right:auto;bottom:auto;z-index:0;', allowCamera:false },
];

// ── Estado din\u00e1mico de capas ─────────────────────────────────────────────────
let layers = loadLayers();
let scenes = {};
function syncScenes() { scenes = {}; for (const l of layers) scenes[l.id] = l.visible; }
syncScenes();

function loadLayers() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(LAYERS_FILE)) return DEFAULT_LAYERS.map(l => ({ ...l }));
    const saved = JSON.parse(fs.readFileSync(LAYERS_FILE, 'utf8'));
    // Fusionar capas nuevas del DEFAULT que no existan aún en el archivo guardado
    const savedIds = new Set(saved.map(l => l.id));
    const newDefaults = DEFAULT_LAYERS.filter(l => !savedIds.has(l.id));
    if (newDefaults.length > 0) {
      const merged = [...saved, ...newDefaults];
      fs.writeFileSync(LAYERS_FILE, JSON.stringify(merged, null, 2));
      return merged;
    }
    return saved;
  } catch (_) { return DEFAULT_LAYERS.map(l => ({ ...l })); }
}

function saveLayers() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LAYERS_FILE, JSON.stringify(layers, null, 2));
  } catch (e) { console.error('[layers] Error guardando:', e.message); }
}

function getLayerById(id) { return layers.find(l => l.id === id); }

// ── WebSocket clients (overlay OBS) ─────────────────────────────────────────
const clients = new Set();

function broadcast(obj) {
  const msgType = obj && typeof obj === 'object' ? obj.type : null;
  const data = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === 1 && (!msgType || canReceive(ws.rol, msgType))) {
      if (ws.bufferedAmount && ws.bufferedAmount > 262144) continue;
      try { ws.send(data); } catch (_) {}
    }
  }
}

function setScene(id, visible) {
  if (id !== 'chat') {
    const layer = getLayerById(id);
    if (!layer) return;
    layer.visible = visible;
    saveLayers();
  }
  scenes[id] = visible;
  broadcast({ type: 'scene', scene: id, visible });
}

// ── Utilidades HTTP ──────────────────────────────────────────────────────────
// ── Listas del panel: el servidor es el dueño ────────────────────────────────
// Un guardado solo existe si llega aquí. Un fichero dañado nunca se sobrescribe:
// se responde 500 y se deja intacto para recuperarlo a mano.
const TIPOS_LISTA_PANEL = new Set(['usuario', 'canal', 'mensaje']);
const MAX_VALOR_PANEL = 500;
const MAX_FUSION_PANEL = 500;
const MAX_CUERPO_PANEL = 256 * 1024;

// Combined chat ("Todos") through the streamer's own Botrix widget. Lives on
// the server so every device shows the same chat; null means a damaged file.
const CHAT_CONFIG_DEFECTO = Object.freeze({ todos: false, botrixUrl: '' });
function urlBotrixValida(valor) {
  if (typeof valor !== 'string' || valor.length > MAX_VALOR_PANEL) return false;
  if (valor === '') return true;
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' && url.hostname === 'botrix.live';
  } catch (_) {
    return false;
  }
}
function leerConfigChat(archivo) {
  if (!fs.existsSync(archivo)) return { ...CHAT_CONFIG_DEFECTO };
  try {
    const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return null;
    return {
      todos: datos.todos === true,
      botrixUrl: urlBotrixValida(datos.botrixUrl) ? datos.botrixUrl : '',
    };
  } catch (_) {
    return null;
  }
}

function leerListaPanel(archivo) {
  if (!fs.existsSync(archivo)) return [];
  try {
    const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    return Array.isArray(datos) ? datos : null;
  } catch (_) {
    return null;
  }
}

function escribirListaPanel(archivo, lista) {
  fs.mkdirSync(pathMod.dirname(archivo), { recursive: true });
  const temporal = `${archivo}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(lista, null, 2));
  fs.renameSync(temporal, archivo);
}

function valorPanelValido(valor) {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= MAX_VALOR_PANEL;
}

function responderPanel(res, status, cuerpo) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
}

function leerCuerpoPanel(req, res, alTerminar) {
  let body = '';
  let excedido = false;
  req.on('data', c => {
    if (excedido) return;
    body += c;
    if (body.length > MAX_CUERPO_PANEL) {
      excedido = true;
      responderPanel(res, 413, { error: 'cuerpo-demasiado-grande' });
    }
  });
  req.on('end', () => {
    if (excedido) return;
    let datos;
    try {
      datos = JSON.parse(body || '{}');
    } catch (_) {
      return responderPanel(res, 400, { error: 'json-invalido' });
    }
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
      return responderPanel(res, 400, { error: 'json-invalido' });
    }
    alTerminar(datos);
  });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

function parseCookies(req) {
  const map = {};
  const h = req.headers.cookie || '';
  h.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) map[k.trim()] = v.join('=').trim();
  });
  return map;
}

function isKnownTrustedProxy(ip) {
  if (!ip) return false;
  const clean = ip.replace(/^::ffff:/, '').trim().toLowerCase();
  if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(clean)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(clean)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(clean)) return true;
  return false;
}

function getClientIp(req) {
  const remoteAddr = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '').trim();

  // Si la conexión TCP no proviene de un proxy conocido de confianza (localhost o red privada Docker),
  // se descartan por completo las cabeceras del cliente (X-Forwarded-For, X-Real-IP).
  if (!isKnownTrustedProxy(remoteAddr)) {
    return remoteAddr;
  }

  // Si proviene de un proxy conocido (ej: Nginx o tailscale serve):
  // Nginx o el proxy de confianza añade la IP de conexión al final de X-Forwarded-For.
  // Cualquier IP enviada por un atacante estará a la izquierda.
  // Por tanto, tomamos exclusivamente la última IP (la de más a la derecha).
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const parts = xff.split(',').map(s => s.trim().replace(/^::ffff:/, '')).filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }

  const xRealIp = req.headers['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp.trim()) {
    return xRealIp.replace(/^::ffff:/, '').trim();
  }

  return remoteAddr;
}

function isTailscaleOrLocal(req, env = process.env) {
  const clientIp = getClientIp(req);
  if (!clientIp) return false;

  // 1. Loopback / local
  if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost') {
    return true;
  }

  // 2. Tailscale IPv4 CGNAT (100.64.0.0/10)
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(clientIp)) {
    return true;
  }

  // 3. Tailscale IPv6 ULA (fd7a:...)
  if (clientIp.toLowerCase().startsWith('fd7a:')) {
    return true;
  }

  // 4. Operator-listed public IPs (e.g. the home OBS machine). Exact match only.
  const trusted = String(env.TRUSTED_CLIENT_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (trusted.includes(clientIp)) return true;

  // 5. Red local privada (RFC 1918) para tablets y dispositivos en la misma LAN
  if (/^192\.168\.\d+\.\d+$/.test(clientIp) || /^10\.\d+\.\d+\.\d+$/.test(clientIp)) {
    return true;
  }

  // NUNCA fiarse de la cabecera Host ni de IPs externas arbitrarias
  return false;
}

function isAuth(req) {
  if (isTailscaleOrLocal(req)) return true;
  if (!PASSWORD) return false;
  if (parseCookies(req)['tts_auth'] === PASSWORD) return true;
  const auth = req.headers['authorization'] || '';
  if (auth === `Bearer ${PASSWORD}`) return true;
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon !== -1) {
        const pass = decoded.slice(colon + 1);
        if (pass === PASSWORD) return true;
      }
    } catch (_) {}
  }
  try {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const token = parsedUrl.searchParams.get('auth') || parsedUrl.searchParams.get('token');
    if (token && token === PASSWORD) return true;
  } catch (_) {}
  return false;
}

// ── HTML: login del panel ────────────────────────────────────────────────────
function loginHtml(wrong) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel — Acceso</title>
<style>
  body{background:#0e0e10;color:#efeff1;font-family:'Segoe UI',sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100dvh;margin:0}
  .box{background:#18181b;padding:32px 28px;border-radius:16px;width:300px;max-width:90vw}
  h2{margin:0 0 20px;font-size:1.2em;color:#9147ff}
  input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #2a2a2f;
        border-radius:8px;background:#0e0e10;color:#efeff1;font-size:1em;margin-bottom:14px}
  button{width:100%;padding:12px;border:none;border-radius:8px;background:#9147ff;
         color:#fff;font-size:1em;font-weight:700;cursor:pointer}
  .err{color:#e91916;font-size:.85em;margin-bottom:10px}
</style></head><body>
<div class="box">
  <h2>🎙 TTS ApliArte</h2>
  ${wrong ? '<p class="err">Contraseña incorrecta</p>' : ''}
  <form method="POST" action="/control-login">
    <input type="password" name="pass" placeholder="Contraseña" autofocus>
    <button type="submit">Entrar</button>
  </form>
</div></body></html>`;
}

// ── HTML: panel de control ───────────────────────────────────────────────────
// Derivado del estado dinámico de capas (incluye capa especial "chat")
const LAYERS = [
  ...layers.map(l => ({ id: l.id, icon: l.icon, name: l.name, sub: l.sub })),
  { id:'chat', icon:'💬', name:'Chat TTS', sub:'Burbujas de traducción' },
];

const controlHtml = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Control — Directo</title>
<style>
  :root{--bg:#0e0e10;--card:#18181b;--border:#2a2a2f;
        --purple:#9147ff;--green:#1db954;--red:#e91916;
        --text:#efeff1;--muted:#848494}
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{background:var(--bg);color:var(--text);font-family:'Segoe UI',Arial,sans-serif;
       min-height:100dvh;display:flex;flex-direction:column}
  header{padding:16px;display:flex;align-items:center;gap:12px;
         border-bottom:1px solid var(--border)}
  header .logo{font-weight:800;font-size:1.1em;color:var(--purple)}
  .dot{width:10px;height:10px;border-radius:50%;background:var(--red);transition:background .4s}
  .dot.on{background:var(--green)}
  .btn-row{display:flex;gap:10px;padding:14px 16px}
  .btn{flex:1;padding:13px;border:none;border-radius:10px;font-size:1em;
       font-weight:700;cursor:pointer;transition:opacity .2s}
  .btn:active{opacity:.7}
  .btn.start{background:var(--green);color:#fff}
  .btn.stop{background:var(--red);color:#fff}
  .layers{flex:1;overflow-y:auto;padding:0 16px;display:flex;flex-direction:column;gap:8px}
  .row{background:var(--card);border:1px solid var(--border);border-radius:10px;
       padding:12px 14px;display:flex;align-items:center;gap:12px}
  .row .icon{font-size:1.3em}
  .row .name{flex:1;font-size:1em;font-weight:600}
  .row .sub{font-size:.75em;color:var(--muted)}
  .eye{background:none;border:none;font-size:1.5em;cursor:pointer;
       padding:4px 8px;border-radius:8px;transition:background .15s}
  .eye:active{background:rgba(255,255,255,.1)}
  .cam-wrap{margin:16px;border-radius:14px;overflow:hidden;background:#000;aspect-ratio:16/9}
  .cam-wrap iframe{width:100%;height:100%;border:none;display:block}
  .spacer{height:16px}
</style>
</head><body>
<header>
  <div class="dot" id="dot"></div>
  <div class="logo">TTS ApliArte</div>
  <div style="flex:1"></div>
  <div id="status-lbl" style="font-size:.85em;color:var(--muted)">Desconectado</div>
</header>
<div class="btn-row">
  <button class="btn start" onclick="twitchAction('connect')">▶ Empezar directo</button>
  <button class="btn stop"  onclick="twitchAction('disconnect')">■ Cerrar directo</button>
</div>
<div class="layers" id="layers"></div>
<div class="cam-wrap">
  <iframe src="https://vdo.ninja/?push&room=erbolammapliarte&hash=66c0&ad&vd&safemode&np&nocontrols"
          allow="camera;microphone;autoplay;fullscreen"></iframe>
</div>
<div class="spacer"></div>
<script>
var LAYERS = ${JSON.stringify(LAYERS)};
var state  = {};
LAYERS.forEach(function(l){ state[l.id] = ${JSON.stringify(scenes)}[l.id] !== false; });

function buildList() {
  var el = document.getElementById('layers');
  el.innerHTML = '';
  LAYERS.forEach(function(l) {
    var currentState = state[l.id] !== false;
    var div = document.createElement('div');
    div.className = 'row';
    div.innerHTML =
      '<span class="icon">'+l.icon+'</span>'+
      '<div style="flex:1"><div class="name">'+l.name+'</div>'+
        '<div class="sub">'+l.sub+'</div></div>'+
      '<button class="eye" id="eye-'+l.id+'" onclick="toggle(\\\''+l.id+'\\\')">'+
        (currentState?'👁':'🫣')+'</button>';
    el.appendChild(div);
  });
}

function toggle(id) {
  state[id] = !state[id];
  fetch('/api/scene?id='+id+'&v='+(state[id]?'1':'0'));
  document.getElementById('eye-'+id).textContent = state[id]?'👁':'🫣';
}

function twitchAction(action) {
  fetch('/api/stream/'+(action==='connect'?'start':'stop'),{credentials:'same-origin'})
    .then(function(r){return r.json()})
    .then(function(d){
      document.getElementById('dot').className='dot'+(d.streaming?' on':'');
      document.getElementById('status-lbl').textContent=d.streaming?'\ud83d\udd34 En directo':'Desconectado';
    });
}

var ws;
function connectWS() {
  var proto  = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto+'://'+location.host+'/ws');
  ws.onmessage = function(e) {
    try {
      var d = JSON.parse(e.data);
      if (d.type === 'scene') {
        state[d.scene] = d.visible;
        var eye = document.getElementById('eye-'+d.scene);
        if (eye) eye.textContent = d.visible?'👁':'🫣';
      }
      if (d.type === 'twitch_state' || d.type === 'stream_state') {
        var on = d.connected || d.streaming;
        document.getElementById('dot').className = 'dot'+(on?' on':'');
        document.getElementById('status-lbl').textContent = on?'\ud83d\udd34 En directo':'Desconectado';
      }
    } catch(x){}
  };
  ws.onclose = function(){ setTimeout(connectWS, 3000); };
}

buildList();
connectWS();
fetch('/api/stream/status',{credentials:'same-origin'})
  .then(function(r){return r.json()})
  .then(function(d){
    document.getElementById('dot').className='dot'+(d.streaming?' on':'');
    document.getElementById('status-lbl').textContent=d.streaming?'\ud83d\udd34 En directo':'Desconectado';
  }).catch(function(){});
</script>
</body></html>`;

// ── HTML: overlay 1920×1080 para OBS (generado dinámicamente) ────────────────
function buildOverlayHtml() {
  const sorted = [...layers].sort((a, b) => a.order - b.order);
  const iframes = sorted.map(l => {
    const hidden = l.visible ? '' : ' hidden';
    const allow = l.allowCamera ? '\n  allow="camera;microphone;autoplay;fullscreen"' : '';
    const style = l.css ? ` style="${l.css}"` : '';
    return `<iframe id="layer-${l.id}" class="layer${hidden}"${style}\n  src="${l.url}"${allow}></iframe>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<title>TTS ApliArte — Directo</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1920px;height:1080px;overflow:hidden;background:#000}
  .layer{position:absolute;top:0;left:0;width:1920px;height:1080px;
         border:none;transition:opacity .5s ease;pointer-events:auto}
  .layer.hidden{opacity:0;pointer-events:none}
  #chat-wrap{position:absolute;bottom:24px;left:24px;width:580px;
             display:flex;flex-direction:column;gap:8px;pointer-events:none;
             z-index:999;transition:opacity .5s ease}
  #chat-wrap.hidden{opacity:0}
  .msg{background:rgba(0,0,0,.80);border-left:4px solid #9147ff;border-radius:10px;
       padding:9px 14px;color:#fff;animation:fadeIn .3s ease;backdrop-filter:blur(6px)}
  .msg.out{animation:fadeOut .35s ease forwards}
  .user{font-weight:700;font-size:.78em;color:#bf94ff;text-transform:uppercase;
        letter-spacing:.06em;margin-bottom:3px;font-family:'Segoe UI',Arial,sans-serif}
  .text{font-size:1.05em;line-height:1.4;font-family:'Segoe UI',Arial,sans-serif}
  .original{font-size:.72em;color:rgba(255,255,255,.42);margin-top:3px;
            font-style:italic;font-family:'Segoe UI',Arial,sans-serif}
  @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeOut{from{opacity:1}to{opacity:0;transform:translateY(-8px)}}
</style>
</head><body>
${iframes}
<div id="chat-wrap"></div>
<script>
var MAX=4, DURATION=8000;
var chat=document.getElementById('chat-wrap');

function setLayer(id,visible){
  var el=id==='chat'?chat:document.getElementById('layer-'+id);
  if(!el)return;
  visible?el.classList.remove('hidden'):el.classList.add('hidden');
}

function connect(){
  var proto=location.protocol==='https:'?'wss':'ws';
  var ws=new WebSocket(proto+'://'+location.host+'/ws');
  ws.onmessage=function(e){
    try{
      var d=JSON.parse(e.data);
      if(d.type==='scene')setLayer(d.scene,d.visible);
      else if(d.type==='message')showMsg(d);
      else if(d.type==='layer_add'){
        if(!document.getElementById('layer-'+d.layer.id)){
          var ifr=document.createElement('iframe');
          ifr.id='layer-'+d.layer.id;
          ifr.className='layer'+(d.layer.visible?'':' hidden');
          ifr.src=d.layer.url;ifr.style.zIndex=100+d.layer.order*10;
          if(d.layer.css)ifr.style.cssText=d.layer.css;
          if(d.layer.allowCamera)ifr.setAttribute('allow','camera;microphone;autoplay;fullscreen');
          document.body.insertBefore(ifr,document.getElementById('chat-wrap'));
        }
      }
      else if(d.type==='layer_remove'){
        var el=document.getElementById('layer-'+d.id);
        if(el)el.parentNode.removeChild(el);
      }
      else if(d.type==='layer_reorder'){
        d.ids.forEach(function(id,i){
          var rem=document.getElementById('layer-'+id);
          if(rem)rem.style.zIndex=100+i*10;
        });
      }
    }catch(x){}
  };
  ws.onclose=function(){setTimeout(connect,3000)};
}

function showMsg(d){
  var div=document.createElement('div');
  div.className='msg';
  var showOrig=d.original&&d.original!==d.text;
  div.innerHTML='<div class="user">'+esc(d.user)+'</div>'+
    '<div class="text">'+esc(d.text)+'</div>'+
    (showOrig?'<div class="original">'+esc(d.original)+'</div>':'');
  chat.appendChild(div);
  var msgs=chat.querySelectorAll('.msg:not(.out)');
  if(msgs.length>MAX){
    msgs[0].classList.add('out');
    (function(el){setTimeout(function(){el.parentNode&&el.parentNode.removeChild(el)},350)})(msgs[0]);
  }
  setTimeout(function(){
    div.classList.add('out');
    setTimeout(function(){div.parentNode&&div.parentNode.removeChild(div)},350);
  },DURATION);
}

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

connect();
</script>
</body></html>`;
}

// ── Servidor HTTP + WS ───────────────────────────────────────────────────────
const { resolvePanelPassword, claimPanel } = require('./src/panel-claim');
PASSWORD = resolvePanelPassword({ dataDir: DATA_DIR }).password;
if (PASSWORD) process.env.PANEL_PASS = PASSWORD; // ws-auth reads the password from the environment

const HOST = process.env.HOST || '127.0.0.1';

// Private, opt-in tablet add-on. Never included in the public static webroot.
const { createPizarraPlus } = require('./src/pizarra-plus');
function isPizarraTrustedOrigin(req) {
  if (isTrustedWsOrigin(req)) return true;
  const originHeader = req && req.headers && req.headers.origin;
  if (!originHeader) return true;
  try {
    const u = new URL(originHeader);
    const h = u.hostname;
    const isLocal = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.ts.net');
    if (isLocal && (['8791', '7979', '8790', ''].includes(u.port))) return true;
  } catch (_) {}
  return false;
}
const pizarraPlus = createPizarraPlus({
  enabled: process.env.DIRECTO_PIZARRA_PLUS !== '0',
  authorize: req => isTailscaleOrLocal(req) || isAuth(req),
  trustedOrigin: isPizarraTrustedOrigin,
  root: __dirname,
});

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url    = req.url || '/';
  const path   = url.split('?')[0];
  if (path === '/pizarra-plus' || path === '/pizarra-plus/guia' || path === '/cristal-plus' || path.startsWith('/api/pizarra-plus/')) {
    return pizarraPlus.handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      if (!res.writableEnded) res.end(JSON.stringify({ error: 'private-plus-unavailable' }));
    });
  }
  if (path === '/claim' && req.method === 'GET') {
    const token = new URL(url, 'http://localhost').searchParams.get('t') || '';
    const nueva = claimPanel(DATA_DIR, token);
    res.setHeader('Cache-Control', 'no-store');
    if (!nueva) {
      res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><meta charset="utf-8"><title>Enlace no válido</title><p>Este enlace de reclamación ya se usó o ha caducado.</p>');
    }
    PASSWORD = nueva;
    process.env.PANEL_PASS = nueva;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': `tts_auth=${nueva}; Path=/; HttpOnly; SameSite=Strict`,
    });
    return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Panel reclamado</title>
<main style="font-family:system-ui,sans-serif;max-width:560px;margin:32px auto;padding:8px">
<h1>Panel reclamado</h1>
<p>Esta es la contraseña de tu panel. <strong>Guárdala ahora: no se volverá a mostrar.</strong></p>
<p><code style="font-size:1.3rem;padding:8px;border:1px solid #ccc;display:inline-block;user-select:all">${nueva}</code></p>
<p>Este navegador ya tiene acceso. <a href="/admin">Ir al panel</a></p></main>`);
  }
  if (path === '/api/panel/streaming') {
    return handleStreamingConfig(req, res, DATA_DIR, isAuth);
  }
  if (path === '/api/panel/destinos') {
    return handleCentreStatus(req, res, isAuth, { port: Number(process.env.CENTRO_PANEL_PORT || 8790) });
  }
  if (path === '/api/panel/emision/finalizar' && req.method === 'POST') {
    return handleFinalizarEmision(req, res, isAuth, { port: Number(process.env.CENTRO_PANEL_PORT || 8790) });
  }
  const params = new URL(url, 'http://localhost').searchParams;
  // GET /api/tts — proxy de audio TTS para el directo (evita bloqueo Referer de Google y CORS)
  if (path === '/api/tts' && req.method === 'GET') {
    const q = (params.get('q') || '').trim().slice(0, 160);
    const tl = (params.get('tl') || 'es').trim();
    console.log('[TTS-API] Solicitud TTS:', q, 'tl:', tl);
    if (!q) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Falta texto');
    }
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q)}`;
    fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
      .then(async (gRes) => {
        if (!gRes.ok) {
          res.writeHead(gRes.status, { 'Content-Type': 'text/plain' });
          return res.end('Error TTS');
        }
        const buffer = Buffer.from(await gRes.arrayBuffer());
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': buffer.length,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(buffer);
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(err.message);
      });
    return;
  }


  // WebSocket upgrade
  if (path === '/ws') return; // handled by WebSocket server

  // ── CRUD de capas (Flutter LayersScreen + panel web) ──────────────────────
  
  // ── Categoría / Tema del directo ──────────────────────────────────────────
  
  // Rutas del minijuego !traidor
  if (path.startsWith('/api/directo/juego')) {
    cors(res);
    const sub = path.replace(/^\/api\/directo\/juego\/?/, '');
    if (req.method === 'GET') {
      if (sub === 'privado-javier') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(gameHub.privateState()));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(gameHub.publicState()));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          let result;
          if (sub === 'lobby') result = gameHub.lobby();
          else if (sub === 'iniciar-traidor') result = gameHub.startTraitor(serverOwners);
          else if (sub === 'modo-prueba') {
            serverOwners = {
              'cl': 'Bot_Alpha',
              'co': 'Bot_Beta',
              'pi': 'Bot_Gamma',
              'ge': 'Bot_Delta'
            };
            gameHub.lobby();
            result = gameHub.startTraitor(serverOwners);
          }
          else if (sub === 'forzar-votacion') result = gameHub.forceVote();
          else if (sub === 'simular-votos') result = gameHub.simulateVotes();
          else if (sub === 'avanzar') result = gameHub.advance();
          else if (sub === 'voto') result = gameHub.vote(payload.usuario, String(payload.voto));
          else if (sub === 'repetir-votacion') result = gameHub.repeatVote();
          else if (sub === 'reiniciar') result = gameHub.reset();
          else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Ruta de juego desconocida' }));
          }
          broadcast({ type: 'juego_estado', estado: gameHub.publicState() });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  
  // Rutas de Vídeos y Lista de Espera (Cockpit y Panel Local)
  if (path.startsWith('/api/videos')) {
    cors(res);
    const MEDIOS_DIR = fs.existsSync('/app/medios') ? '/app/medios' : pathMod.join(__dirname, 'medios');
    const MEDIOS_VIDEOS = pathMod.join(MEDIOS_DIR, 'videos');
    const ARCHIVO_RESPALDO_CANONICO = pathMod.join(MEDIOS_DIR, 'respaldo.mp4');
    const DATA_DIR = fs.existsSync('/app/data') ? '/app/data' : pathMod.join(__dirname, 'data');
    const CONFIG_RESPALDO_PATH = pathMod.join(DATA_DIR, 'respaldo-config.json');

    function obtenerRespaldoActivoLocal() {
      try {
        if (fs.existsSync(CONFIG_RESPALDO_PATH)) {
          const cfg = JSON.parse(fs.readFileSync(CONFIG_RESPALDO_PATH, 'utf8'));
          if (cfg?.archivo && fs.existsSync(pathMod.join(MEDIOS_VIDEOS, cfg.archivo))) {
            return cfg.archivo;
          }
        }
      } catch (_) {}
      return 'pausa-tecnica.mp4';
    }

    if (path === '/api/videos' && req.method === 'GET') {
      let archivos = [];
      try {
        if (fs.existsSync(MEDIOS_VIDEOS)) {
          archivos = fs.readdirSync(MEDIOS_VIDEOS)
            .filter(f => !f.startsWith('.') && (f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm') || f.endsWith('.mov')))
            .map(f => {
              const stat = fs.statSync(pathMod.join(MEDIOS_VIDEOS, f));
              return { archivo: f, tamanoMb: +(stat.size / 1024 / 1024).toFixed(1) };
            });
        }
      } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        archivos,
        reproduciendo: videoEnAntena,
        cola: videoCola,
        respaldoActivo: obtenerRespaldoActivoLocal()
      }));
    }
    if (path === '/api/videos/respaldo' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        activo: obtenerRespaldoActivoLocal(),
        ruta: 'medios/respaldo.mp4'
      }));
    }
    if (path === '/api/videos/respaldo/seleccionar' && req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          const datos = JSON.parse(body || '{}');
          const archivo = datos.archivo;
          if (!archivo || typeof archivo !== 'string' || archivo.includes('..') || archivo.includes('/') || archivo.includes('\\')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'Nombre de archivo inválido' }));
          }
          const rutaOrigen = pathMod.join(MEDIOS_VIDEOS, archivo);
          if (!fs.existsSync(rutaOrigen)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'El vídeo no existe en medios/videos/' }));
          }
          fs.copyFileSync(rutaOrigen, ARCHIVO_RESPALDO_CANONICO);
          if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
          fs.writeFileSync(CONFIG_RESPALDO_PATH, JSON.stringify({ archivo, actualizadoEn: Date.now() }, null, 2), 'utf8');
          console.log(`[RespaldoOBS] Vídeo de corte OBS actualizado a: ${archivo}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, activo: archivo }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
    if (path === '/api/videos/cola' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ cola: videoCola }));
    }
    if (path === '/api/videos/cola/limpiar' && req.method === 'POST') {
      videoCola = [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (path.endsWith('/encolar') && req.method === 'POST') {
      const match = path.match(/^\/api\/videos\/([^/]+)\/encolar$/);
      if (match) {
        const archivo = decodeURIComponent(match[1]);
        videoCola.push({ archivo, agregadoEn: Date.now() });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, cola: videoCola }));
      }
    }
    if (path === '/api/videos/detener' && req.method === 'POST') {
      videoEnAntena = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, reproduciendo: null }));
    }
    if (path.match(/^\/api\/videos\/([^/]+)\/reproducir$/) && req.method === 'POST') {
      const match = path.match(/^\/api\/videos\/([^/]+)\/reproducir$/);
      const archivo = decodeURIComponent(match[1]);
      videoEnAntena = archivo;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, reproduciendo: videoEnAntena }));
    }
  }

  if (path === '/api/categoria') {
    cors(res);
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(getCategoriaEstado()));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', async () => {
        try {
          const { categoria, modo } = JSON.parse(body || '{}');
          const estado = setCategoriaEstado({ categoria, modo });
          const cat = estado.categoria;
          broadcast({ type: 'categoria', ...estado });

          actualizarCategoriaTwitch(cat);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            ...estado,
            twitchJuego: CATEGORIAS_TWITCH_GAME[cat]?.nombre
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'JSON inválido' }));
        }
      });
      return;
    }
  }

  // ── Configuración de Twitch Chat ──────────────────────────────────────────
  if (path === '/api/twitch/config') {
    cors(res);
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        configurado: Boolean(twitchConfig.token),
        nick: twitchConfig.nick,
        canal: twitchConfig.canal,
        conectado: twitchConnected
      }));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', async () => {
        try {
          const { token, nick, canal } = JSON.parse(body || '{}');
          const cleanToken = String(token || '').replace(/^oauth:/, '').trim();
          const check = await validarTokenTwitch(cleanToken);
          if (!check.valido) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              ok: false,
              error: `Token de Twitch inválido (${check.error}). Genera un token nuevo en twitchtokengenerator.com`
            }));
          }
          twitchConfig.token = cleanToken;
          twitchConfig.nick = String(nick || check.login || 'apliarte').trim().toLowerCase();
          twitchConfig.canal = String(canal || twitchConfig.nick).trim().toLowerCase();
          if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
          fs.writeFileSync(TWITCH_CONFIG_FILE, JSON.stringify(twitchConfig, null, 2));
          conectarTwitchSender();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            configurado: true,
            nick: twitchConfig.nick,
            canal: twitchConfig.canal,
            conectado: true
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  // ── Configuración Visual y Asistente OBS (/api/panel/config) ──────────────
  if (path === '/api/panel/config') {
    cors(res);
    if (!isAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'No autorizado' }));
    }
    if (req.method === 'GET') {
      const cfg = loadAppConfig();
      const obs = getObsUrls(req, cfg);
      const safeConfig = {
        vdo: {
          room: cfg.vdo.room,
          camStreamId: cfg.vdo.camStreamId,
          password: maskSecret(cfg.vdo.password),
          hasPassword: Boolean(cfg.vdo.password)
        },
        twitch: {
          canal: cfg.twitch.canal,
          nick: cfg.twitch.nick,
          token: maskSecret(cfg.twitch.token),
          hasToken: Boolean(cfg.twitch.token),
          conectado: typeof twitchConnected !== 'undefined' ? twitchConnected : false
        },
        openai: {
          apiKey: maskSecret(cfg.openai.apiKey),
          hasApiKey: Boolean(cfg.openai.apiKey)
        }
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, config: safeConfig, obs }));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const updated = saveAppConfig(parsed);
          const obs = getObsUrls(req, updated);
          const safeConfig = {
            vdo: {
              room: updated.vdo.room,
              camStreamId: updated.vdo.camStreamId,
              password: maskSecret(updated.vdo.password),
              hasPassword: Boolean(updated.vdo.password)
            },
            twitch: {
              canal: updated.twitch.canal,
              nick: updated.twitch.nick,
              token: maskSecret(updated.twitch.token),
              hasToken: Boolean(updated.twitch.token),
              conectado: typeof twitchConnected !== 'undefined' ? twitchConnected : false
            },
            openai: {
              apiKey: maskSecret(updated.openai.apiKey),
              hasApiKey: Boolean(updated.openai.apiKey)
            }
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, config: safeConfig, obs }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
  }

  // ── Configuración de Cámara VDO.Ninja para Directo (OBS y Panel Móvil) ──
  if (path === '/api/directo/camara/config' && req.method === 'GET') {
    cors(res);
    if (!isAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: false, error: 'No autorizado' }));
    }
    const passQuery = VDO_CAM_PASS ? `&password=${encodeURIComponent(VDO_CAM_PASS)}` : '';
    const viewUrl = `https://vdo.ninja/?view=${encodeURIComponent(VDO_CAM_STREAM)}&room=${encodeURIComponent(VDO_CAM_ROOM)}${passQuery}&solo&cleanoutput&transparent&autoplay=1&cover=1&buffer=350&sync=0&videobitrate=1500&codec=h264&api`;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({
      ok: true,
      room: VDO_CAM_ROOM,
      streamId: VDO_CAM_STREAM,
      password: VDO_CAM_PASS,
      viewUrl,
      modo: modoCamaraDirecto
    }));
  }

  // ── Comandos y Dueños de Avatares del directo ──────────────────────────────
  if (path === '/api/directo/comando') {
    cors(res);
    if (req.method === 'GET') {
      const desde = parseInt(params.get('desde') || '-1', 10);
      const filtrados = desde >= 0 ? ringComandosDirecto.filter(c => c.id > desde) : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        duenos: serverOwners,
        seq: seqComandosDirecto,
        modoCamara: modoCamaraDirecto,
        comandos: filtrados
      }));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', async () => {
        try {
          const cmd = JSON.parse(body || '{}');
          const modoPrevioCamara = modoCamaraDirecto;
          if (cmd.comando === 'adoptar' && cmd.agente && cmd.usuario) {
            for (const [aId, u] of Object.entries(serverOwners)) {
              if (u.toLowerCase() === cmd.usuario.toLowerCase()) delete serverOwners[aId];
            }
            serverOwners[cmd.agente] = cmd.usuario;
          } else if (cmd.comando === 'liberar') {
            const esJavier = ['ja', 'apliarte', 'erbolamm'].includes(String(cmd.usuario ?? '').toLowerCase());
            if (esJavier && (cmd.agente === 'todos' || cmd.agente === 'all')) {
              for (const aId of Object.keys(serverOwners)) {
                if (aId !== 'ja') delete serverOwners[aId];
              }
            } else if (esJavier && cmd.agente && serverOwners[cmd.agente]) {
              delete serverOwners[cmd.agente];
            } else if (esJavier && cmd.usuarioObjetivo) {
              const uObj = String(cmd.usuarioObjetivo).toLowerCase();
              for (const [aId, u] of Object.entries(serverOwners)) {
                if (u.toLowerCase() === uObj) delete serverOwners[aId];
              }
            } else if (cmd.usuario) {
              for (const [aId, u] of Object.entries(serverOwners)) {
                if (u.toLowerCase() === cmd.usuario.toLowerCase()) delete serverOwners[aId];
              }
            }
          } else if (cmd.comando && typeof cmd.comando === 'string' && cmd.comando.trim().toLowerCase().startsWith('!cam')) {
            const arg = cmd.comando.trim().toLowerCase().split(/\s+/)[1];
            if (arg === 'on' || arg === 'mostrar' || arg === 'camara') modoCamaraDirecto = 'camara';
            else if (arg === 'off' || arg === 'ocultar' || arg === 'monigote') modoCamaraDirecto = 'monigote';
          } else if (cmd.modo) {
            modoCamaraDirecto = cmd.modo === 'camara' ? 'camara' : 'monigote';
          }

          let twitchEnviado = false;
          let modResultado = null;
          let duplicadoIgnorado = false;
          if (cmd.comando && typeof cmd.comando === 'string') {
            const saneado = sanearComando(cmd.comando);
            if (!saneado.valido) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                ok: false,
                error: saneado.error,
                comando: cmd.comando
              }));
            }
            const c = saneado.comando;
            cmd.comando = c;
            const ahora = Date.now();
            const ultimoEnvio = cooldownComandosTwitch.get(c);
            if (ultimoEnvio !== undefined && (ahora - ultimoEnvio < COOLDOWN_COMANDO_MS) && !c.startsWith('/')) {
              duplicadoIgnorado = true;
              console.log(`[TwitchChat] Comando duplicado ignorado en cooldown (${ahora - ultimoEnvio}ms): ${c}`);
            } else if (c.startsWith('/timeout') || c.startsWith('/ban') || c.startsWith('/unban') || c.startsWith('/untimeout') || c.startsWith('/shoutout') || c.startsWith('!so') || c.startsWith('/vip') || c.startsWith('/unvip') || c.startsWith('/raid')) {
              cooldownComandosTwitch.set(c, ahora);
              modResultado = await ejecutarModeracionHelix(c);
              twitchEnviado = Boolean(modResultado && modResultado.ok);
            } else if (c.startsWith('/announce')) {
              modResultado = await ejecutarAnuncioHelix(c);
              twitchEnviado = Boolean(modResultado && modResultado.ok);
              if (twitchEnviado) cooldownComandosTwitch.set(c, ahora);
            } else if (!c.startsWith('!cam') && c !== 'adoptar' && c !== 'liberar') {
              // Comandos de Twitch IRC (incluye /clear, /slow, /subscribers, /goal, !cafe, !repo, etc.)
              cooldownComandosTwitch.set(c, ahora);
              twitchEnviado = enviarATwitchChat(c);
            }
            if (cooldownComandosTwitch.size > 50) {
              for (const [k, ts] of cooldownComandosTwitch.entries()) {
                if (ahora - ts > 10000) cooldownComandosTwitch.delete(k);
              }
            }
          }

          if (!duplicadoIgnorado && (!modResultado || modResultado.ok)) {
            seqComandosDirecto++;
            const ev = { id: seqComandosDirecto, cmd, timestamp: Date.now() };
            ringComandosDirecto.push(ev);
            if (ringComandosDirecto.length > 100) ringComandosDirecto.shift();

            broadcast({ type: 'directo_comando', cmd, duenos: serverOwners, seq: seqComandosDirecto, modoCamara: modoCamaraDirecto });
            if (modoCamaraDirecto !== modoPrevioCamara && (cmd.modo || (cmd.comando && typeof cmd.comando === 'string' && cmd.comando.startsWith('!cam')))) {
              broadcast({ type: 'camara_modo', modo: modoCamaraDirecto });
            }
            if (cmd.comando && cmd.comando !== 'adoptar' && cmd.comando !== 'liberar') {
              broadcast({ type: 'comando_chat', comando: cmd.comando, usuario: cmd.usuario || 'ja' });
            }
          }

          res.writeHead(modResultado && !modResultado.ok ? 400 : 200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: modResultado ? modResultado.ok : true,
            duenos: serverOwners,
            seq: seqComandosDirecto,
            modoCamara: modoCamaraDirecto,
            twitchEnviado,
            duplicadoIgnorado,
            twitchConfigurado: Boolean(twitchConfig.token),
            mensaje: duplicadoIgnorado ? 'Comando reciente ya emitido (antirreentrancia)' : (modResultado ? (modResultado.mensaje || modResultado.error) : undefined),
            error: modResultado && !modResultado.ok ? modResultado.error : undefined
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'JSON inválido' }));
        }
      });
      return;
    }
  }

  
  // ── Listas del panel (usuarios, canales, mensajes) ───────────────────────
  const PANEL_DIR = pathMod.join(DATA_DIR, 'panel');
  if (path === '/api/panel/lista') {
    cors(res);
    if (!isAuth(req)) return responderPanel(res, 401, { error: 'No autorizado' });
    if (req.method === 'GET') {
      const tipo = params.get('tipo') || 'usuario';
      if (!TIPOS_LISTA_PANEL.has(tipo)) return responderPanel(res, 400, { error: 'tipo-invalido' });
      const valores = leerListaPanel(pathMod.join(PANEL_DIR, tipo + '.json'));
      if (valores === null) return responderPanel(res, 500, { error: 'lista-danada' });
      return responderPanel(res, 200, { valores });
    }
    if (req.method === 'POST') {
      return leerCuerpoPanel(req, res, ({ tipo: t, accion, valor, valores: arr }) => {
        const tipo = t || params.get('tipo') || 'usuario';
        if (!TIPOS_LISTA_PANEL.has(tipo)) return responderPanel(res, 400, { error: 'tipo-invalido' });
        const archivo = pathMod.join(PANEL_DIR, tipo + '.json');
        const lista = leerListaPanel(archivo);
        if (lista === null) return responderPanel(res, 500, { error: 'lista-danada' });
        let nueva = lista;
        if (accion === 'agregar') {
          if (!valorPanelValido(valor)) return responderPanel(res, 400, { error: 'valor-invalido' });
          const limpio = valor.trim();
          if (!lista.includes(limpio)) nueva = [...lista, limpio];
        } else if (accion === 'quitar') {
          if (typeof valor !== 'string' || !valor) return responderPanel(res, 400, { error: 'valor-invalido' });
          nueva = lista.filter(x => x !== valor);
        } else if (accion === 'fusionar') {
          if (!Array.isArray(arr) || arr.length > MAX_FUSION_PANEL) return responderPanel(res, 400, { error: 'valores-invalidos' });
          nueva = [...lista];
          for (const bruto of arr) {
            if (!valorPanelValido(bruto)) continue;
            const limpio = bruto.trim();
            if (!nueva.includes(limpio)) nueva.push(limpio);
          }
        } else {
          return responderPanel(res, 400, { error: 'accion-invalida' });
        }
        try {
          if (nueva.length !== lista.length || nueva.some((v, i) => v !== lista[i])) escribirListaPanel(archivo, nueva);
        } catch (e) {
          return responderPanel(res, 500, { error: 'no-se-pudo-guardar' });
        }
        return responderPanel(res, 200, { ok: true, valores: nueva });
      });
    }
  }

  if (path === '/api/panel/comandos-bot') {
    cors(res);
    if (!isAuth(req)) return responderPanel(res, 401, { error: 'No autorizado' });
    const archivoCmd = pathMod.join(PANEL_DIR, 'comandos-bot.json');
    if (req.method === 'GET') {
      const comandos = leerListaPanel(archivoCmd);
      if (comandos === null) return responderPanel(res, 500, { error: 'lista-danada' });
      return responderPanel(res, 200, { comandos });
    }
    if (req.method === 'POST') {
      return leerCuerpoPanel(req, res, ({ accion, comando, descripcion, comandos: arr }) => {
        const lista = leerListaPanel(archivoCmd);
        if (lista === null) return responderPanel(res, 500, { error: 'lista-danada' });
        const nombreDe = c => (Array.isArray(c) ? c[0] : c);
        let nueva;
        if (accion === 'agregar') {
          const nombre = Array.isArray(comando) ? comando[0] : comando;
          const bruta = Array.isArray(comando) ? comando[1] : descripcion;
          if (!valorPanelValido(nombre)) return responderPanel(res, 400, { error: 'comando-invalido' });
          const cmdName = nombre.trim();
          const cmdDesc = typeof bruta === 'string' && bruta.trim() ? bruta.trim().slice(0, MAX_VALOR_PANEL) : '—';
          nueva = [...lista.filter(c => nombreDe(c) !== cmdName), [cmdName, cmdDesc]];
        } else if (accion === 'quitar') {
          const cmdName = Array.isArray(comando) ? comando[0] : comando;
          if (typeof cmdName !== 'string' || !cmdName) return responderPanel(res, 400, { error: 'comando-invalido' });
          nueva = lista.filter(c => nombreDe(c) !== cmdName);
        } else if (accion === 'vaciar' || accion === 'limpiar') {
          nueva = [];
        } else if (accion === 'fusionar') {
          if (!Array.isArray(arr) || arr.length > MAX_FUSION_PANEL) return responderPanel(res, 400, { error: 'comandos-invalidos' });
          // Solo añade lo que falta: nunca pisa la descripción ya guardada.
          nueva = [...lista];
          for (const item of arr) {
            if (!Array.isArray(item) || !valorPanelValido(item[0])) continue;
            const cmdName = item[0].trim();
            if (nueva.some(c => nombreDe(c) === cmdName)) continue;
            const cmdDesc = typeof item[1] === 'string' && item[1].trim() ? item[1].trim().slice(0, MAX_VALOR_PANEL) : '—';
            nueva.push([cmdName, cmdDesc]);
          }
        } else {
          return responderPanel(res, 400, { error: 'accion-invalida' });
        }
        try {
          escribirListaPanel(archivoCmd, nueva);
        } catch (e) {
          return responderPanel(res, 500, { error: 'no-se-pudo-guardar' });
        }
        return responderPanel(res, 200, { ok: true, comandos: nueva });
      });
    }
  }

  if (path === '/api/panel/chat-config') {
    cors(res);
    if (!isAuth(req)) return responderPanel(res, 401, { error: 'No autorizado' });
    const archivoChat = pathMod.join(PANEL_DIR, 'chat.json');
    if (req.method === 'GET') {
      const config = leerConfigChat(archivoChat);
      if (config === null) return responderPanel(res, 500, { error: 'config-danada' });
      return responderPanel(res, 200, config);
    }
    if (req.method === 'POST') {
      return leerCuerpoPanel(req, res, ({ todos, botrixUrl }) => {
        if (todos === undefined && botrixUrl === undefined) return responderPanel(res, 400, { error: 'sin-cambios' });
        if (todos !== undefined && typeof todos !== 'boolean') return responderPanel(res, 400, { error: 'todos-invalido' });
        if (botrixUrl !== undefined && !urlBotrixValida(botrixUrl)) return responderPanel(res, 400, { error: 'url-botrix-invalida' });
        const actual = leerConfigChat(archivoChat);
        if (actual === null) return responderPanel(res, 500, { error: 'config-danada' });
        const nueva = {
          todos: todos === undefined ? actual.todos : todos,
          botrixUrl: botrixUrl === undefined ? actual.botrixUrl : botrixUrl,
        };
        try {
          escribirListaPanel(archivoChat, nueva);
        } catch (_) {
          return responderPanel(res, 500, { error: 'no-se-pudo-guardar' });
        }
        return responderPanel(res, 200, { ok: true, ...nueva });
      });
    }
  }

  if (path === '/api/panel/voces') {
    cors(res);
    const archivoVoces = pathMod.join(PANEL_DIR, 'voces.json');
    if (req.method === 'GET') {
      let voces = {};
      try {
        if (fs.existsSync(archivoVoces)) voces = JSON.parse(fs.readFileSync(archivoVoces, 'utf8'));
      } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, voces }));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          const { accion, usuario, voz, voces: objVoces } = JSON.parse(body || '{}');
          let mapa = {};
          if (fs.existsSync(archivoVoces)) {
            try { mapa = JSON.parse(fs.readFileSync(archivoVoces, 'utf8')); } catch (_) {}
          }
          if (accion === 'guardar' || (usuario && voz)) {
            if (usuario && voz) mapa[usuario.toLowerCase()] = voz;
          } else if (accion === 'fusionar' && objVoces && typeof objVoces === 'object') {
            mapa = { ...mapa, ...objVoces };
          }
          if (!fs.existsSync(PANEL_DIR)) fs.mkdirSync(PANEL_DIR, { recursive: true });
          fs.writeFileSync(archivoVoces, JSON.stringify(mapa, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, voces: mapa }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  if (path === '/api/panel/usuarios-ignorados') {
    cors(res);
    if (!isAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'No autorizado' }));
    }
    const archivoIgnorados = pathMod.join(PANEL_DIR, 'usuarios-ignorados.json');
    if (req.method === 'GET') {
      let usuarios = [];
      try {
        if (fs.existsSync(archivoIgnorados)) usuarios = JSON.parse(fs.readFileSync(archivoIgnorados, 'utf8'));
      } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, usuarios }));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          const { accion, usuario, usuarios: arr } = JSON.parse(body || '{}');
          let lista = [];
          if (fs.existsSync(archivoIgnorados)) {
            try { lista = JSON.parse(fs.readFileSync(archivoIgnorados, 'utf8')); } catch (_) {}
          }
          if (accion === 'agregar' && usuario) {
            const u = usuario.toLowerCase();
            if (!lista.includes(u)) lista.push(u);
          } else if (accion === 'quitar' && usuario) {
            const u = usuario.toLowerCase();
            lista = lista.filter(x => x.toLowerCase() !== u);
          } else if (accion === 'sobrescribir' && Array.isArray(arr)) {
            lista = Array.from(new Set(arr.map(x => x.toLowerCase())));
          }
          if (!fs.existsSync(PANEL_DIR)) fs.mkdirSync(PANEL_DIR, { recursive: true });
          fs.writeFileSync(archivoIgnorados, JSON.stringify(lista, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, usuarios: lista }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }


  // ── Buzón SMS del directo ────────────────────────────────────────────────
  if (path === '/api/directo/sms') {
    cors(res);
    if (req.method === 'GET') {
      const authHeader = req.headers['authorization'] || '';
      const authParam = params.get('auth') || '';
      const authenticated = isAuth(req) || authHeader === `Bearer ${PASSWORD}` || authParam === PASSWORD;
      const list = getSmsList();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (params.get('marcador') === '1' || !authenticated) {
        return res.end(JSON.stringify({ ok: true, total: list.length, mensajes: [] }));
      }
      return res.end(JSON.stringify({ ok: true, total: list.length, mensajes: list }));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          const { usuario, texto } = JSON.parse(body);
          if (!texto || !texto.trim()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Texto vacío' }));
          }
          const lista = getSmsList();
          const nuevo = {
            id: `sms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            usuario: String(usuario || 'anónimo').trim().slice(0, 50),
            texto: String(texto).trim().slice(0, 280),
            fecha: new Date().toISOString(),
            leido: false,
          };
          lista.unshift(nuevo);
          saveSmsList(lista.slice(0, 200));
          // Privacidad estricta: nunca retransmitir el texto completo del SMS privado por WebSocket público
          broadcast({ type: 'nuevo_sms', total: lista.length });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, total: lista.length }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'JSON inválido' }));
        }
      });
      return;
    }
  }

  if (path === '/api/directo/sms/marcar-leido' && req.method === 'POST') {
    cors(res);
    const authHeader = req.headers['authorization'] || '';
    const authParam = params.get('auth') || '';
    if (!isAuth(req) && authHeader !== `Bearer ${PASSWORD}` && authParam !== PASSWORD) {
      res.writeHead(401); return res.end(JSON.stringify({ error: 'No autorizado' }));
    }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        const lista = getSmsList();
        for (const item of lista) {
          if (item.id === id) item.leido = true;
        }
        saveSmsList(lista);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'JSON inválido' }));
      }
    });
    return;
  }

  if (path === '/api/directo/sms/borrar' && req.method === 'POST') {
    cors(res);
    const authHeader = req.headers['authorization'] || '';
    const authParam = params.get('auth') || '';
    if (!isAuth(req) && authHeader !== `Bearer ${PASSWORD}` && authParam !== PASSWORD) {
      res.writeHead(401); return res.end(JSON.stringify({ error: 'No autorizado' }));
    }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body || '{}');
        let list = getSmsList();
        list = list.filter(m => m.id !== id);
        saveSmsList(list);
        broadcast({ type: 'sms_nuevo', total: list.length });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, total: list.length, mensajes: list }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (path === '/api/directo/sms/limpiar' && req.method === 'POST') {
    cors(res);
    const authHeader = req.headers['authorization'] || '';
    const authParam = params.get('auth') || '';
    if (!isAuth(req) && authHeader !== `Bearer ${PASSWORD}` && authParam !== PASSWORD) {
      res.writeHead(401); return res.end(JSON.stringify({ error: 'No autorizado' }));
    }
    saveSmsList([]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (path === '/api/layers' && req.method === 'GET') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ layers: [...layers].sort((a, b) => a.order - b.order) }));
  }

  if (path === '/api/layers/add' && req.method === 'POST') {
    if (!isAuth(req) && (req.headers['authorization'] || '') !== `Bearer ${PASSWORD}`) {
      res.writeHead(401); return res.end('No autorizado');
    }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { id, name, icon = '\uD83D\uDCCC', sub = '', url, css = '', allowCamera = false, visible = true } = JSON.parse(body);
        if (!id || !name || !url) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Faltan id, name o url' })); }
        if (getLayerById(id)) { res.writeHead(409); return res.end(JSON.stringify({ error: 'ID ya existe' })); }
        const maxOrder = layers.reduce((m, l) => Math.max(m, l.order), -1);
        const layer = { id, icon, name, sub, url, css, allowCamera, visible, order: maxOrder + 1 };
        layers.push(layer); saveLayers(); syncScenes();
        broadcast({ type: 'layer_add', layer });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, layer }));
      } catch (_) { res.writeHead(400); res.end(JSON.stringify({ error: 'JSON inv\u00e1lido' })); }
    });
    return;
  }

  if (path === '/api/layers/remove' && req.method === 'POST') {
    if (!isAuth(req) && (req.headers['authorization'] || '') !== `Bearer ${PASSWORD}`) {
      res.writeHead(401); return res.end('No autorizado');
    }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        const idx = layers.findIndex(l => l.id === id);
        if (idx === -1) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Capa no encontrada' })); }
        layers.splice(idx, 1); saveLayers(); syncScenes();
        broadcast({ type: 'layer_remove', id });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (_) { res.writeHead(400); res.end(JSON.stringify({ error: 'JSON inv\u00e1lido' })); }
    });
    return;
  }

  if (path === '/api/layers/update' && req.method === 'POST') {
    if (!isAuth(req) && (req.headers['authorization'] || '') !== `Bearer ${PASSWORD}`) {
      res.writeHead(401); return res.end('No autorizado');
    }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { id } = data; delete data.id;
        const layer = getLayerById(id);
        if (!layer) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Capa no encontrada' })); }
        Object.assign(layer, data); saveLayers(); syncScenes();
        broadcast({ type: 'layer_update', layer });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, layer }));
      } catch (_) { res.writeHead(400); res.end(JSON.stringify({ error: 'JSON inv\u00e1lido' })); }
    });
    return;
  }

  if (path === '/api/layers/reorder' && req.method === 'POST') {
    if (!isAuth(req) && (req.headers['authorization'] || '') !== `Bearer ${PASSWORD}`) {
      res.writeHead(401); return res.end('No autorizado');
    }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { ids } = JSON.parse(body);
        if (!Array.isArray(ids)) { res.writeHead(400); return res.end(JSON.stringify({ error: 'ids debe ser array' })); }
        ids.forEach((id, i) => { const l = getLayerById(id); if (l) l.order = i; });
        saveLayers(); syncScenes();
        broadcast({ type: 'layer_reorder', ids });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (_) { res.writeHead(400); res.end(JSON.stringify({ error: 'JSON inv\u00e1lido' })); }
    });
    return;
  }

  // API REST — sin autenticación (solo accesible desde red local / OBS)
  if (path === '/api/scene') {
    const id  = params.get('id') || '';
    const vis = params.get('v') === '1';
    setScene(id, vis);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, scene: id, visible: vis }));
  }

  if (path === '/api/twitch') {
    const action = params.get('action');
    broadcast({ type: 'twitch_state', connected: action === 'connect' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  const WHIP_CONTROL_URL = process.env.WHIP_CONTROL_URL || '';

  function whipRequest(action, callback) {
    if (WHIP_CONTROL_URL) {
      try {
        const u = new URL(`${WHIP_CONTROL_URL.replace(/\/+$/, '')}/${action}`);
        const isPost = action === 'start' || action === 'stop';
        const clientReq = http.request(u, { method: isPost ? 'POST' : 'GET', timeout: 4000 }, (clientRes) => {
          let data = '';
          clientRes.on('data', (chunk) => { data += chunk; });
          clientRes.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              callback(null, parsed);
            } catch (e) {
              callback(null, { ok: clientRes.statusCode >= 200 && clientRes.statusCode < 300 });
            }
          });
        });
        clientReq.on('error', (err) => callback(err, null));
        clientReq.on('timeout', () => { clientReq.destroy(); callback(new Error('timeout'), null); });
        clientReq.end();
        return;
      } catch (e) {}
    }
    // Fallback legacy (por compatibilidad con remote-72 hasta migración completa)
    if (action === 'start') {
      exec('docker start apliarte-whip', (err) => callback(err, { ok: !err, streaming: !err }));
    } else if (action === 'stop') {
      exec('docker stop -t 5 apliarte-whip', (err) => callback(err, { ok: true, streaming: false }));
    } else if (action === 'status') {
      exec('docker inspect --format="{{.State.Running}}" apliarte-whip 2>/dev/null', (err, stdout) => {
        callback(err, { streaming: !err && stdout.trim() === 'true' });
      });
    }
  }

  // API de streaming — protegido con contraseña
  if (path === '/api/stream/start') {
    if (!isAuth(req)) { res.writeHead(401); return res.end('No autorizado'); }
    whipRequest('start', (err, data) => {
      const streaming = !err && (data ? data.streaming !== false : false);
      broadcast({ type: 'stream_state', streaming });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: streaming, streaming }));
    });
    return;
  }

  if (path === '/api/stream/stop') {
    if (!isAuth(req)) { res.writeHead(401); return res.end('No autorizado'); }
    whipRequest('stop', (err) => {
      broadcast({ type: 'stream_state', streaming: false });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, streaming: false }));
    });
    return;
  }

  if (path === '/api/stream/status') {
    whipRequest('status', (err, data) => {
      const streaming = !err && !!(data && data.streaming);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ streaming }));
    });
    return;
  }

  // Panel de control — protegido con contraseña
  if (path === '/control') {
    if (!isAuth(req)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(loginHtml(false));
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(controlHtml);
  }

  if (path === '/control-login' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const pass = new URLSearchParams(body).get('pass') || '';
      if (pass === PASSWORD) {
        res.writeHead(302, {
          'Location': '/control',
          'Set-Cookie': `tts_auth=${PASSWORD}; Path=/; HttpOnly; SameSite=Strict`,
        });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(loginHtml(true));
      }
    });
    return;
  }

  // Overlay 1920×1080 para OBS (sin auth, solo accessible desde OBS local o VPN)
  if (path === '/pause') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;
  background:#0e0e10;font-family:'Segoe UI',Arial,sans-serif;
  display:flex;flex-direction:column;align-items:center;justify-content:center}
.logo{font-size:5em;font-weight:900;letter-spacing:.04em;
  background:linear-gradient(135deg,#e91916 0%,#ff4444 50%,#e91916 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  text-shadow:0 0 60px rgba(233,25,22,.25);margin-bottom:24px}
.pause{font-size:1.8em;font-weight:700;color:#848494;
  letter-spacing:.3em;text-transform:uppercase}
.dot{width:12px;height:12px;border-radius:50%;background:#e91916;
  margin-top:40px;animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}
</style></head><body>
<div class="logo">ApliArte</div>
<div class="pause">Emisión en pausa</div>
<div class="dot"></div>
</body></html>`);
  }

  // Servir archivos estáticos de public/ (index.html, plano.html, office-3d.js, css, etc.)
  if (path === '/' && String(req.headers.host || '').split(':')[0].toLowerCase() === 'directo.apliarte.com') {
    if (serveStatic(req, res, '/landing.html')) return;
  }
  if (path === '/' || path === '/index.html') {
    if (serveStatic(req, res, '/plano.html')) return;
  }

  if (path === '/admin' || path === '/admin.html' || path === '/directo') {
    if (!isAuth(req)) {
      res.writeHead(401, {
        'Content-Type': 'text/html; charset=utf-8',
        'WWW-Authenticate': 'Basic realm="ApliArte Directo - Acceso Restringido"',
      });
      return res.end(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>401 No Autorizado</title><style>body{background:#0e0e10;color:#efeff1;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}div{text-align:center;padding:24px;border:1px solid #2a2a2f;border-radius:12px;background:#18181b}h2{color:#ef4444;margin-top:0}</style></head><body><div><h2>🔒 Acceso Restringido</h2><p>Se requiere autenticación para acceder al panel de administración.</p></div></body></html>`);
    }
    if (PASSWORD) {
      res.setHeader('Set-Cookie', `tts_auth=${PASSWORD}; Path=/; HttpOnly; SameSite=Strict`);
    }
    if (path === '/directo' && fs.existsSync(pathMod.join(PUBLIC_DIR, 'directo.html'))) {
      if (serveStatic(req, res, '/directo.html')) return;
    }
    if (serveStatic(req, res, '/admin.html')) return;
  }

  if (path === '/plano' || path === '/plano.html' || path === '/overlay') {
    if (serveStatic(req, res, '/plano.html')) return;
  }

  if (path === '/camara' || path === '/camara.html') {
    if (serveStatic(req, res, '/camara.html')) return;
  }

  if (path === '/cristal' || path === '/cristal.html') {
    if (serveStatic(req, res, '/cristal.html')) return;
  }

  if (path === '/pizarra' || path === '/pizarra.html') {
    if (serveStatic(req, res, '/pizarra.html')) return;
  }

  if (path === '/sms' || path === '/sms.html') {
    if (serveStatic(req, res, '/sms.html')) return;
  }

  if (path === '/landing' || path === '/landing.html') {
    if (serveStatic(req, res, '/landing.html')) return;
  }

  if (path === '/demo' || path === '/demo.html') {
    if (serveStatic(req, res, '/demo.html')) return;
  }

  if (path === '/docs' || path === '/docs/' || path === '/docs/index.html') {
    if (serveStatic(req, res, '/docs/index.html')) return;
  }

  if (path === '/guia' || path === '/guia.html' || path === '/guia-directo' || path === '/guia-directo.html') {
    if (serveStatic(req, res, '/guia-directo.html')) return;
  }

  if (path === '/empezar' || path === '/empezar.html') {
    if (serveStatic(req, res, '/empezar.html')) return;
  }

  
  if (path.startsWith('/medios/')) {
    const rel = path.replace(/^\/medios\//, '');
  const safePath = pathMod.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
    const filePath = pathMod.join('/app/medios', safePath);
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = pathMod.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': fs.statSync(filePath).size,
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*'
        });
        return fs.createReadStream(filePath).pipe(res);
      }
    } catch (_) {}
  }

  if (serveStatic(req, res, path)) return;

  // Fallback antiguo si alguien lo pide explícitamente:
  if (path === '/overlay-old') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(buildOverlayHtml());
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

// WebSocket — overlay OBS y reenvío de voz/control
let activeMicSender = null;
let activeCamSender = null;
const wss = new WebSocketServer({ noServer: true });
wss.on('connection', (ws, request) => {
  // T2: handshake con auth + asignacion de rol
  const token = parseWsAuth(request) || parseWsPanelCookie(request);
  const isLocal = isTailscaleOrLocal(request);
  const rol = decideWsRole('ws', token, isLocal, process.env, isTrustedWsOrigin(request));
  if (rol === null) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  ws.rol = rol;

  clients.add(ws);
  for (const [scene, visible] of Object.entries(scenes)) {
    ws.send(JSON.stringify({ type: 'scene', scene, visible }));
  }
  ws.on('message', message => {
    const text = typeof message === 'string' ? message : message.toString('utf-8');

    // Parsear UNA vez al inicio. msgType viene del campo top-level "type",
    // NUNCA de substrings del texto crudo. Esto cierra el bypass donde
    // un mensaje con top-level "sms_nuevo" y un objeto anidado con
    // type:"micro_start" activaba el early branch de micro_start y
    // broadcasteaba el texto crudo sin canSend ni canReceive.
    let parsed = null;
    let msgType = null;
    try {
      const p = JSON.parse(text);
      if (p && typeof p === 'object' && typeof p.type === 'string' && p.type.length > 0) {
        parsed = p;
        msgType = p.type;
      }
    } catch (_) {}

    // Mensajes sin type top-level valido o no parseables: descartar.
    if (msgType === null) {
      return;
    }

    // Sender-authorization: ANTES de cualquier branch especial, state
    // change o broadcast. Si el emisor no tiene rol suficiente, drop.
    if (!canSend(ws.rol, msgType)) {
      console.warn('[ws-auth] Drop msg type=' + msgType + ' from rol=' + ws.rol);
      return;
    }

    // UI events blocklist (sin cambios)
    if (msgType === 'tab' || msgType === 'tab_change' || msgType === 'cambiar_pestana' ||
        msgType === 'pestana' || msgType === 'view' || msgType === 'vista' ||
        msgType === 'drilldown' || msgType === 'drill_down' || msgType === 'ui_state' ||
        msgType === 'navegacion' || msgType === 'scroll' || msgType === 'seleccion' ||
        msgType === 'click' || msgType === 'focus') {
      return;
    }

    // Whitelist de tipos retransmisibles
    const TIPOS_RETRANS_PERMITIDOS = new Set([
      'voz_pcm',
      'micro_start', 'micro_stop', 'micro_desactivado',
      'camara_start', 'camara_stop', 'camara_desactivada', 'camara_modo',
      'comando_chat', 'directo_comando',
      'scene', 'layer_add', 'layer_remove', 'layer_update', 'layer_reorder',
      'stream_state', 'twitch_state',
      'sms_nuevo', 'nuevo_sms',
      'juego_estado', 'categoria',
      'pizarra_draw', 'pizarra_clear', 'pizarra_undo', 'pizarra_init', 'pizarra_solicitar_estado',
      'ping', 'pong'
    ]);

    if (!TIPOS_RETRANS_PERMITIDOS.has(msgType)) {
      return;
    }

    // Dispatch por parsed.type top-level, NO por substring del texto crudo.
    switch (msgType) {
      case 'micro_start': {
        if (activeMicSender && activeMicSender !== ws && activeMicSender.readyState === 1) {
          try {
            activeMicSender.send(JSON.stringify({
              type: 'micro_desactivado',
              motivo: 'micro activo en otro dispositivo'
            }));
          } catch (_) {}
        }
        activeMicSender = ws;
        for (const client of clients) {
          if (client !== ws && client.readyState === 1 && canReceive(client.rol, msgType)) {
            client.send(text);
          }
        }
        return;
      }
      case 'micro_stop': {
        if (activeMicSender === ws) {
          activeMicSender = null;
        }
        for (const client of clients) {
          if (client !== ws && client.readyState === 1 && canReceive(client.rol, msgType)) {
            client.send(text);
          }
        }
        return;
      }
      case 'camara_start': {
        if (activeCamSender && activeCamSender !== ws && activeCamSender.readyState === 1) {
          try {
            activeCamSender.send(JSON.stringify({
              type: 'camara_desactivada',
              motivo: 'cámara activa en otro dispositivo'
            }));
          } catch (_) {}
        }
        activeCamSender = ws;
        if (modoCamaraDirecto !== 'camara') {
          modoCamaraDirecto = 'camara';
          broadcast({ type: 'camara_modo', modo: 'camara' });
        }
        return;
      }
      case 'camara_stop': {
        if (activeCamSender === ws) {
          activeCamSender = null;
        }
        if (modoCamaraDirecto !== 'monigote') {
          modoCamaraDirecto = 'monigote';
          broadcast({ type: 'camara_modo', modo: 'monigote' });
        }
        return;
      }
      case 'camara_modo': {
        if (parsed && parsed.modo) {
          const nuevoModo = parsed.modo === 'camara' ? 'camara' : 'monigote';
          if (nuevoModo !== modoCamaraDirecto) {
            modoCamaraDirecto = nuevoModo;
            if (modoCamaraDirecto === 'monigote' && activeCamSender && activeCamSender !== ws) {
              try {
                activeCamSender.send(JSON.stringify({
                  type: 'camara_desactivada',
                  motivo: 'modo monigote activado'
                }));
              } catch (_) {}
              activeCamSender = null;
            }
            broadcast({ type: 'camara_modo', modo: modoCamaraDirecto });
          }
        }
        return;
      }
      case 'voz_pcm': {
        if (!activeMicSender) {
          activeMicSender = ws;
        } else if (activeMicSender !== ws) {
          try {
            ws.send(JSON.stringify({
              type: 'micro_desactivado',
              motivo: 'micro activo en otro dispositivo'
            }));
          } catch (_) {}
          return;
        }
        for (const client of clients) {
          if (client !== ws && client.readyState === 1 && canReceive(client.rol, msgType)) {
            if (client.bufferedAmount && client.bufferedAmount > 262144) continue;
            client.send(text);
          }
        }
        return;
      }
      default: {
        for (const client of clients) {
          if (client !== ws && client.readyState === 1 && canReceive(client.rol, msgType)) {
            if (client.bufferedAmount && client.bufferedAmount > 262144) continue;
            client.send(text);
          }
        }
      }
    }
  });

  const releaseSender = () => {
    clients.delete(ws);
    if (activeMicSender === ws) activeMicSender = null;
    if (activeCamSender === ws) {
      activeCamSender = null;
      modoCamaraDirecto = 'monigote';
      broadcast({ type: 'camara_modo', modo: 'monigote' });
    }
  };
  ws.on('close', releaseSender);
  ws.on('error', releaseSender);

});

server.on('upgrade', (request, socket, head) => {
  if (pizarraPlus.upgrade(request, socket, head)) return;
  const pathname = request.url.split('?')[0];

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.on('close', () => { pizarraPlus.close().catch(() => {}); });

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`TTS Overlay server escuchando en puerto ${PORT}`);
    console.log(`  Overlay OBS → http://TU_IP:${PORT}/`);
    console.log(`  Panel móvil → http://TU_IP:${PORT}/control`);
  });
}

module.exports = {
  server,
  isKnownTrustedProxy,
  getClientIp,
  isTailscaleOrLocal,
  isAuth,
  sanearComando,
  resolveDataDir,
  loadAppConfig,
  saveAppConfig,
  maskSecret,
  getObsUrls,
  broadcast,
  clients,
};
