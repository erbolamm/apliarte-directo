/**
 * Cliente mínimo de la API de YouTube (Live Streaming) para dejar una emisión esperando.
 *
 * YouTube solo sale en directo con seguridad si ya hay una emisión ("broadcast") esperando en el
 * stream al que llega el vídeo. `prepararEmisionYoutube` deja una pública, con auto-inicio y
 * auto-fin, vinculada al stream cuya clave es la que usa el centro.
 *
 * Regla de oro: esto es una ayuda, no una dependencia. La función principal nunca lanza ni
 * rechaza; ante cualquier fallo devuelve `{ ok: false, motivo, detalle }` y quien llama sigue
 * como si este módulo no existiera. `detalle` se puede escribir en un registro: nunca lleva
 * tokens, el secreto del cliente, la clave de emisión ni texto libre devuelto por Google.
 *
 * Toda la red pasa por `fetchFn` (por defecto el `fetch` global), así las pruebas no tocan Google.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const URL_AUTORIZACION = 'https://accounts.google.com/o/oauth2/v2/auth';
const URL_API = 'https://www.googleapis.com/youtube/v3';

/** Alcance que la documentación admite para crear y vincular emisiones (insert y bind). */
export const ALCANCE_YOUTUBE = 'https://www.googleapis.com/auth/youtube';
export const TITULO_POR_DEFECTO = 'Directo ApliArte';

/** Códigos estables: quien llama decide con ellos, no con el texto de `detalle`. */
export const MOTIVOS = Object.freeze({
  SIN_CREDENCIALES: 'sin_credenciales',
  SIN_CLAVE: 'sin_clave',
  AUTORIZACION_REVOCADA: 'autorizacion_revocada', // invalid_grant: hay que volver a conectar
  NO_AUTORIZADO: 'no_autorizado',
  CUOTA_AGOTADA: 'cuota_agotada',
  DIRECTO_NO_HABILITADO: 'directo_no_habilitado',
  STREAM_NO_ENCONTRADO: 'stream_no_encontrado',
  TIEMPO_AGOTADO: 'tiempo_agotado',
  ERROR_RED: 'error_red',
  ERROR_GOOGLE: 'error_google',
  RESPUESTA_INESPERADA: 'respuesta_inesperada',
});

const RAZONES_CUOTA = new Set(['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded', 'userRequestsExceedRateLimit']);
const RAZONES_SIN_DIRECTO = new Set(['liveStreamingNotEnabled', 'livePermissionBlocked']);
const RAZONES_SIN_PERMISO = new Set(['forbidden', 'insufficientPermissions', 'insufficientLivePermissions']);

const TIEMPO_MAXIMO_MS = 10_000;
const TIEMPO_LIMPIEZA_MS = 3_000; // plazo propio para borrar una emisión que quedó sin vincular
const PLAZO_TOPE_MS = 60_000;     // ningún plazo pasa de aquí, por grande que sea el valor recibido
const MARGEN_TOKEN_MS = 60_000;   // el token se renueva un minuto antes de caducar
const MARGEN_INICIO_MS = 60_000;  // YouTube exige una hora de inicio futura y cercana
const MAX_PAGINAS = 5;            // 250 streams: tope para que una paginación rara no dé vueltas
const MAX_TITULO = 100;           // límite documentado de snippet.title

class FalloYoutube extends Error {
  constructor(motivo, detalle) {
    super(detalle);
    this.motivo = motivo;
  }
}

/** Solo deja pasar identificadores cortos (razones de error de Google, códigos de red). */
const etiqueta = (valor) => (typeof valor === 'string' && /^[A-Za-z0-9_.-]{1,60}$/.test(valor) ? valor : '');
const entreParentesis = (valor) => (etiqueta(valor) ? ` (${etiqueta(valor)})` : '');

/**
 * Una petición. Traduce los fallos de transporte a motivos y nunca copia el mensaje original,
 * que puede llevar la URL o el cuerpo. El cuerpo que no sea JSON llega como null.
 */
async function pedir(ctx, operacion, url, opciones) {
  // Vencido el plazo no sale ninguna petición más, aunque un `fetch` anterior ignorase la cancelación.
  if (ctx.signal?.aborted) throw new FalloYoutube(MOTIVOS.TIEMPO_AGOTADO, `tiempo agotado en ${operacion}`);
  let respuesta;
  try {
    respuesta = await ctx.fetchFn(url, { ...opciones, signal: ctx.signal });
  } catch (error) {
    if (ctx.signal?.aborted) throw new FalloYoutube(MOTIVOS.TIEMPO_AGOTADO, `tiempo agotado en ${operacion}`);
    throw new FalloYoutube(MOTIVOS.ERROR_RED, `fallo de red en ${operacion}${entreParentesis(error?.cause?.code)}`);
  }
  if (!respuesta || typeof respuesta.status !== 'number') {
    throw new FalloYoutube(MOTIVOS.RESPUESTA_INESPERADA, `respuesta no válida en ${operacion}`);
  }
  let cuerpo = null;
  try { cuerpo = await respuesta.json(); } catch (_) {}
  return { status: respuesta.status, cuerpo: cuerpo && typeof cuerpo === 'object' ? cuerpo : null };
}

const correcta = (status) => status >= 200 && status < 300;

/**
 * Plazo en milisegundos listo para `setTimeout`: entero entre 1 y un minuto. Un valor que no sea
 * un número finito y positivo se cambia por `porDefecto` (con un plazo enorme Node avisa y lo
 * deja en 1 ms, que vencería al instante).
 */
export function acotarPlazo(valor, porDefecto) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return porDefecto;
  return Math.min(Math.max(Math.ceil(valor), 1), PLAZO_TOPE_MS);
}

/** Petición al servidor de tokens de Google (renovar el acceso o canjear el código). */
async function pedirToken(ctx, operacion, campos) {
  const { status, cuerpo } = await pedir(ctx, operacion, URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(campos).toString(),
  });
  if (!correcta(status)) {
    const detalle = `HTTP ${status}${entreParentesis(cuerpo?.error)} en ${operacion}`;
    if (cuerpo?.error === 'invalid_grant') throw new FalloYoutube(MOTIVOS.AUTORIZACION_REVOCADA, detalle);
    throw new FalloYoutube([400, 401, 403].includes(status) ? MOTIVOS.NO_AUTORIZADO : MOTIVOS.ERROR_GOOGLE, detalle);
  }
  if (!cuerpo) throw new FalloYoutube(MOTIVOS.RESPUESTA_INESPERADA, `respuesta no válida en ${operacion}`);
  return cuerpo;
}

// Tokens de acceso en memoria, por credenciales. Duran una hora; no se guardan en disco.
const tokens = new Map();
const claveDeCache = (credenciales) => `${credenciales.clientId}\n${credenciales.refreshToken}`;

/** Vacía la caché de tokens (pruebas, o tras cambiar las credenciales). */
export function olvidarTokens() {
  tokens.clear();
}

async function tokenDeAcceso(ctx) {
  const clave = claveDeCache(ctx.credenciales);
  const guardado = tokens.get(clave);
  if (guardado && ctx.ahora() < guardado.caducaEn) return guardado.token;
  const cuerpo = await pedirToken(ctx, 'renovar el acceso', {
    grant_type: 'refresh_token',
    client_id: ctx.credenciales.clientId,
    client_secret: ctx.credenciales.clientSecret,
    refresh_token: ctx.credenciales.refreshToken,
  });
  if (typeof cuerpo.access_token !== 'string' || !cuerpo.access_token) {
    throw new FalloYoutube(MOTIVOS.RESPUESTA_INESPERADA, 'Google no devolvió un token de acceso');
  }
  const duracionMs = (Number(cuerpo.expires_in) || 0) * 1000;
  tokens.set(clave, { token: cuerpo.access_token, caducaEn: ctx.ahora() + duracionMs - MARGEN_TOKEN_MS });
  return cuerpo.access_token;
}

/** Una llamada a la API de datos. Cada una cuesta 1 unidad de cuota y se cuenta en `ctx.llamadas`. */
async function llamarApi(ctx, operacion, metodo, ruta, parametros, cuerpoJson) {
  ctx.llamadas += 1;
  const opciones = { method: metodo, headers: { Authorization: `Bearer ${ctx.token}` } };
  if (cuerpoJson) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpoJson);
  }
  const { status, cuerpo } = await pedir(ctx, operacion, `${URL_API}/${ruta}?${new URLSearchParams(parametros)}`, opciones);
  if (correcta(status)) {
    if (!cuerpo) throw new FalloYoutube(MOTIVOS.RESPUESTA_INESPERADA, `respuesta no válida en ${operacion}`);
    return cuerpo;
  }
  const razon = etiqueta(cuerpo?.error?.errors?.[0]?.reason);
  const detalle = `HTTP ${status}${entreParentesis(razon)} en ${operacion}`;
  let motivo = MOTIVOS.ERROR_GOOGLE;
  if (status === 429 || RAZONES_CUOTA.has(razon)) motivo = MOTIVOS.CUOTA_AGOTADA;
  else if (RAZONES_SIN_DIRECTO.has(razon)) motivo = MOTIVOS.DIRECTO_NO_HABILITADO;
  else if (status === 401 || RAZONES_SIN_PERMISO.has(razon)) motivo = MOTIVOS.NO_AUTORIZADO;
  // Un token rechazado no se vuelve a usar: la siguiente preparación pide otro.
  if (status === 401) tokens.delete(claveDeCache(ctx.credenciales));
  throw new FalloYoutube(motivo, detalle);
}

/**
 * Busca el stream del canal cuya clave es `clave`. La comparación se hace aquí: la clave no
 * viaja en ninguna petición ni sale de esta función.
 */
async function buscarStream(ctx, clave) {
  let pageToken;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const parametros = { part: 'id,cdn', mine: 'true', maxResults: '50' };
    if (pageToken) parametros.pageToken = pageToken;
    const cuerpo = await llamarApi(ctx, 'liveStreams.list', 'GET', 'liveStreams', parametros);
    const encontrado = (Array.isArray(cuerpo.items) ? cuerpo.items : [])
      .find((s) => s?.cdn?.ingestionInfo?.streamName === clave && typeof s.id === 'string');
    if (encontrado) return encontrado.id;
    pageToken = cuerpo.nextPageToken;
    if (!pageToken) break;
  }
  throw new FalloYoutube(MOTIVOS.STREAM_NO_ENCONTRADO, 'ningún stream del canal usa la clave de emisión guardada');
}

async function listarEmisiones(ctx, estado, maximo) {
  const cuerpo = await llamarApi(ctx, `liveBroadcasts.list (${estado})`, 'GET', 'liveBroadcasts',
    { part: 'id,snippet,contentDetails,status', broadcastStatus: estado, broadcastType: 'event', maxResults: String(maximo) });
  return Array.isArray(cuerpo.items) ? cuerpo.items.filter((e) => e && typeof e.id === 'string') : [];
}

const resultadoReutilizada = (ctx, emision) => ({
  ok: true,
  emisionId: emision.id,
  reutilizada: true,
  autoStop: emision.contentDetails?.enableAutoStop === true,
  estado: etiqueta(emision.status?.lifeCycleStatus) || 'desconocido',
  privacidad: etiqueta(emision.status?.privacyStatus) || 'desconocida',
  titulo: String(emision.snippet?.title || ''),
  llamadas: ctx.llamadas,
});

/** Título y descripción de la emisión terminada más reciente; el orden de la lista no está documentado. */
function textosDeLaUltima(terminadas) {
  const momento = (e) => Date.parse(e.snippet?.actualStartTime || e.snippet?.scheduledStartTime || '') || 0;
  let ultima = null;
  for (const e of terminadas || []) if (!ultima || momento(e) > momento(ultima)) ultima = e;
  const titulo = typeof ultima?.snippet?.title === 'string' ? ultima.snippet.title.trim().slice(0, MAX_TITULO) : '';
  if (!titulo) return { title: TITULO_POR_DEFECTO };
  const descripcion = typeof ultima.snippet.description === 'string' ? ultima.snippet.description : '';
  return descripcion ? { title: titulo, description: descripcion } : { title: titulo };
}

async function secuencia(ctx, clave) {
  ctx.token = await tokenDeAcceso(ctx);
  const streamId = await buscarStream(ctx, clave);

  // Tres listas a la vez para no sumar esperas. La de terminadas solo sirve para copiar el
  // título: si falla se usa el título por defecto, salvo que el fallo sea el plazo agotado.
  const [activas, enEspera, terminadas] = await Promise.all([
    listarEmisiones(ctx, 'active', 50),
    listarEmisiones(ctx, 'upcoming', 50),
    listarEmisiones(ctx, 'completed', 5).catch((error) => {
      if (error?.motivo === MOTIVOS.TIEMPO_AGOTADO) throw error;
      return null;
    }),
  ]);
  const deEsteStream = (e) => e.contentDetails?.boundStreamId === streamId;
  // Ya en directo en este stream (OBS reconecta tras un corte): crear otra la dejaría huérfana.
  const activa = activas.find(deEsteStream);
  if (activa) return resultadoReutilizada(ctx, activa);
  const esperando = enEspera.find((e) => deEsteStream(e) && e.contentDetails?.enableAutoStart === true);
  if (esperando) return resultadoReutilizada(ctx, esperando);

  const textos = textosDeLaUltima(terminadas);
  const creada = await llamarApi(ctx, 'liveBroadcasts.insert', 'POST', 'liveBroadcasts', { part: 'snippet,status,contentDetails' }, {
    snippet: { ...textos, scheduledStartTime: new Date(ctx.ahora() + MARGEN_INICIO_MS).toISOString() },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    contentDetails: {
      enableAutoStart: true,
      enableAutoStop: true,
      // Sin monitor no hay fase de prueba: con ella el auto-inicio no se puede activar al crear.
      monitorStream: { enableMonitorStream: false },
    },
  });
  if (typeof creada.id !== 'string' || !creada.id) {
    throw new FalloYoutube(MOTIVOS.RESPUESTA_INESPERADA, 'YouTube no devolvió el identificador de la emisión creada');
  }
  // Mientras no esté vinculada es una emisión suelta: si algo falla desde aquí, se borra.
  ctx.emisionSinVincular = creada.id;
  await llamarApi(ctx, 'liveBroadcasts.bind', 'POST', 'liveBroadcasts/bind', { id: creada.id, part: 'id,contentDetails', streamId });
  ctx.emisionSinVincular = null;
  return {
    ok: true,
    emisionId: creada.id,
    reutilizada: false,
    autoStop: true,
    estado: 'ready',
    // Lo que confirma YouTube; si no lo dice, lo que se pidió.
    privacidad: etiqueta(creada.status?.privacyStatus) || 'public',
    titulo: textos.title,
    llamadas: ctx.llamadas,
  };
}

/**
 * Borra la emisión creada que no se llegó a vincular, para no dejarla suelta en el canal.
 * Es un intento: tiene su propio plazo (el general puede estar ya vencido) y nunca lanza.
 */
async function borrarEmisionSuelta(ctx, plazoMs) {
  const control = new AbortController();
  let temporizador;
  try {
    const vencido = new Promise((hecho) => {
      temporizador = setTimeout(() => { control.abort(); hecho(); }, plazoMs);
    });
    const borrado = pedir({ ...ctx, signal: control.signal }, 'liveBroadcasts.delete',
      `${URL_API}/liveBroadcasts?${new URLSearchParams({ id: ctx.emisionSinVincular })}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${ctx.token}` } });
    borrado.catch(() => {});
    await Promise.race([borrado, vencido]);
  } catch (_) {
    // Si no se pudo borrar, la emisión se queda en el canal sin emitir nada.
  } finally {
    clearTimeout(temporizador);
  }
}

const textoNoVacio = (valor) => (typeof valor === 'string' ? valor.trim() : '');

/**
 * Deja una emisión pública esperando en el stream de `claveEmision`, o reutiliza la que ya haya.
 * Nunca lanza ni rechaza. Todo el trabajo queda bajo `tiempoMaximoMs`: al vencer se cancelan las
 * peticiones en curso y se responde aunque un `fetch` no haga caso de la cancelación. Si el fallo
 * llega con la emisión ya creada pero sin vincular, antes de responder se intenta borrarla, con
 * `tiempoLimpiezaMs` como plazo aparte.
 *
 * @param {object} opciones
 * @param {string} opciones.claveEmision       clave de emisión de YouTube guardada en el centro
 * @param {{clientId: string, clientSecret: string, refreshToken: string}|null} opciones.credenciales
 * @param {typeof fetch} [opciones.fetchFn]
 * @param {() => number} [opciones.ahora]      reloj en milisegundos
 * @param {number} [opciones.tiempoMaximoMs]
 * @param {number} [opciones.tiempoLimpiezaMs]
 * @returns {Promise<{ok: true, emisionId: string, reutilizada: boolean, autoStop: boolean, estado: string, privacidad: string, titulo: string, llamadas: number}
 *   | {ok: false, motivo: string, detalle: string}>}
 */
export async function prepararEmisionYoutube(opciones) {
  const secretos = [];
  let temporizador;
  let ctx;
  let plazoLimpieza = TIEMPO_LIMPIEZA_MS;
  try {
    const { claveEmision, credenciales, fetchFn = globalThis.fetch, ahora = Date.now, tiempoMaximoMs, tiempoLimpiezaMs } = opciones || {};
    plazoLimpieza = acotarPlazo(tiempoLimpiezaMs, TIEMPO_LIMPIEZA_MS);
    const limpias = {
      clientId: textoNoVacio(credenciales?.clientId),
      clientSecret: textoNoVacio(credenciales?.clientSecret),
      refreshToken: textoNoVacio(credenciales?.refreshToken),
    };
    if (!limpias.clientId || !limpias.clientSecret || !limpias.refreshToken) {
      return { ok: false, motivo: MOTIVOS.SIN_CREDENCIALES, detalle: 'YouTube no está conectado (faltan las credenciales)' };
    }
    const clave = textoNoVacio(claveEmision);
    if (!clave) return { ok: false, motivo: MOTIVOS.SIN_CLAVE, detalle: 'no hay clave de emisión de YouTube guardada' };
    secretos.push(clave, limpias.clientSecret, limpias.refreshToken);

    const control = new AbortController();
    const plazo = acotarPlazo(tiempoMaximoMs, TIEMPO_MAXIMO_MS);
    const vencido = new Promise((_, rechazar) => {
      temporizador = setTimeout(() => {
        control.abort();
        rechazar(new FalloYoutube(MOTIVOS.TIEMPO_AGOTADO, `YouTube no respondió en ${plazo} ms`));
      }, plazo);
    });
    ctx = { fetchFn, ahora, credenciales: limpias, signal: control.signal, token: null, llamadas: 0, emisionSinVincular: null };
    const trabajo = secuencia(ctx, clave);
    trabajo.catch(() => {}); // si gana el plazo, el fallo tardío del trabajo no queda sin atender
    return await Promise.race([trabajo, vencido]);
  } catch (error) {
    const conocido = error instanceof FalloYoutube;
    const motivo = conocido ? error.motivo : MOTIVOS.RESPUESTA_INESPERADA;
    let detalle = conocido ? error.message : `fallo inesperado al preparar la emisión${entreParentesis(error?.name)}`;
    // Red de seguridad: aunque ningún detalle se compone con secretos, se tachan si aparecieran.
    for (const secreto of [...secretos, ctx?.token].filter(Boolean)) detalle = detalle.split(secreto).join('***');
    clearTimeout(temporizador);
    if (ctx?.emisionSinVincular) await borrarEmisionSuelta(ctx, plazoLimpieza);
    return { ok: false, motivo, detalle };
  } finally {
    clearTimeout(temporizador);
  }
}

// ── Conexión única (scripts/youtube-conectar.mjs) ───────────────────────────────────────────────

/** Par PKCE: el verificador se queda aquí; a Google solo viaja su huella SHA-256. */
export function generarPkce() {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function generarEstado() {
  return randomBytes(24).toString('base64url');
}

/** Dirección de permiso de Google para una app instalada con retorno a 127.0.0.1. */
export function urlAutorizacion({ clientId, redirectUri, state, codeChallenge }) {
  return `${URL_AUTORIZACION}?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ALCANCE_YOUTUBE,
    access_type: 'offline',
    prompt: 'consent', // así Google entrega siempre un refresh token, también al reconectar
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })}`;
}

/** Dice si el retorno trae el mismo `state` que se envió: solo entonces viene de esta petición. */
export function estadoCoincide(parametros, estadoEsperado) {
  const recibido = Buffer.from(String(parametros.get('state') || ''));
  const esperado = Buffer.from(String(estadoEsperado || ''));
  return esperado.length > 0 && recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/** Comprueba el retorno de Google y devuelve el código. Lanza con un mensaje para la persona. */
export function validarRetorno(parametros, estadoEsperado) {
  if (!estadoCoincide(parametros, estadoEsperado)) {
    throw new Error('La respuesta no coincide con esta petición de permiso. Vuelve a empezar.');
  }
  if (parametros.get('error')) throw new Error('No se dio el permiso en la página de Google. Vuelve a empezar y pulsa "Permitir".');
  const codigo = parametros.get('code');
  if (!codigo) throw new Error('La respuesta de Google llegó sin el código de permiso. Vuelve a empezar.');
  return codigo;
}

/** Canjea el código de permiso por el refresh token. Los errores no llevan secretos. */
export async function canjearCodigo({ clientId, clientSecret, code, codeVerifier, redirectUri, fetchFn = globalThis.fetch, signal }) {
  const cuerpo = await pedirToken({ fetchFn, signal }, 'canjear el código de permiso', {
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });
  if (typeof cuerpo.refresh_token !== 'string' || !cuerpo.refresh_token) {
    throw new Error('Google no devolvió un permiso permanente. Vuelve a empezar.');
  }
  return cuerpo.refresh_token;
}
