// Cliente de la API de YouTube: todo el tráfico pasa por un `fetch` falso; nunca se llama a Google.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ALCANCE_YOUTUBE, MOTIVOS, TITULO_POR_DEFECTO, acotarPlazo, canjearCodigo, generarEstado, generarPkce,
  olvidarTokens, prepararEmisionYoutube, urlAutorizacion, validarRetorno,
} from '../src/youtube-api.js';

const CLAVE = 'clave-SECRETA-de-emision-abcd';
const CREDENCIALES = { clientId: 'id-123.apps.googleusercontent.com', clientSecret: 'SECRETO-CLIENTE', refreshToken: 'SECRETO-REFRESCO' };
const TOKEN = 'SECRETO-TOKEN-ACCESO';
const CENTINELAS = [CLAVE, CREDENCIALES.clientSecret, CREDENCIALES.refreshToken, TOKEN, 'SECRETO'];

const stream = (id, clave) => ({ id, cdn: { ingestionInfo: { streamName: clave } } });
const emision = (id, { streamId = 'stream-1', autoStart = true, autoStop = true, estado = 'ready', titulo = 'Título', descripcion = '', inicio, privacidad = 'public' } = {}) => ({
  id,
  snippet: { title: titulo, description: descripcion, scheduledStartTime: inicio, actualStartTime: inicio },
  contentDetails: { boundStreamId: streamId, enableAutoStart: autoStart, enableAutoStop: autoStop },
  status: { lifeCycleStatus: estado, privacyStatus: privacidad },
});
const errorGoogle = (status, reason) => ({ status, body: { error: { code: status, message: `mensaje con ${CLAVE}`, errors: [{ reason, domain: 'youtube' }] } } });

/**
 * Google de mentira. Cada ruta se puede sustituir con `{ status, body }` o con una función.
 * Por defecto: token válido, un stream con la clave, ninguna emisión, y crear + vincular funcionan.
 */
function googleFalso(rutas = {}) {
  const base = {
    token: { status: 200, body: { access_token: TOKEN, expires_in: 3600, token_type: 'Bearer' } },
    streams: { status: 200, body: { items: [stream('stream-1', CLAVE)] } },
    active: { status: 200, body: { items: [] } },
    upcoming: { status: 200, body: { items: [] } },
    completed: { status: 200, body: { items: [] } },
    insert: { status: 200, body: { id: 'emision-nueva', status: { privacyStatus: 'public' } } },
    bind: { status: 200, body: { id: 'emision-nueva', contentDetails: { boundStreamId: 'stream-1' } } },
    delete: { status: 204 },
    ...rutas,
  };
  const llamadas = [];
  const fetchFn = async (url, opciones = {}) => {
    const u = new URL(url);
    const metodo = opciones.method || 'GET';
    let ruta;
    if (u.host === 'oauth2.googleapis.com' && u.pathname === '/token') ruta = 'token';
    else if (u.host !== 'www.googleapis.com') throw new Error(`host inesperado ${u.host}`);
    else if (u.pathname === '/youtube/v3/liveStreams') ruta = 'streams';
    else if (u.pathname === '/youtube/v3/liveBroadcasts/bind') ruta = 'bind';
    else if (u.pathname === '/youtube/v3/liveBroadcasts') ruta = { POST: 'insert', DELETE: 'delete' }[metodo] || u.searchParams.get('broadcastStatus');
    const llamada = { ruta, url: String(url), u, metodo, opciones, cuerpo: opciones.body };
    llamadas.push(llamada);
    const respuesta = typeof base[ruta] === 'function' ? await base[ruta](llamada) : base[ruta];
    if (!respuesta) throw new Error(`ruta sin respuesta: ${ruta}`);
    if (respuesta.status === 204) return new Response(null, { status: 204 });
    return new Response(typeof respuesta.body === 'string' ? respuesta.body : JSON.stringify(respuesta.body), { status: respuesta.status });
  };
  return { fetchFn, llamadas, rutas: () => llamadas.map((l) => l.ruta), de: (ruta) => llamadas.filter((l) => l.ruta === ruta) };
}

const preparar = (google, extra = {}) =>
  prepararEmisionYoutube({ claveEmision: CLAVE, credenciales: CREDENCIALES, fetchFn: google.fetchFn, ...extra });

/** Ni el resultado ni las URL llevan secretos; el token solo viaja en su cabecera. */
function sinSecretos(resultado, google) {
  const texto = JSON.stringify(resultado);
  for (const c of CENTINELAS) assert.ok(!texto.includes(c), `el resultado contiene un secreto: ${texto.split(c).join('…')}`);
  for (const l of google?.llamadas || []) {
    for (const c of CENTINELAS) assert.ok(!l.url.includes(c), `una URL de ${l.ruta} lleva un secreto`);
  }
}

// El módulo no escribe nada por su cuenta: cualquier línea en consola es un fallo.
const lineas = [];
const originales = {};
test.beforeEach(() => {
  olvidarTokens();
  lineas.length = 0;
  for (const nivel of ['log', 'info', 'warn', 'error']) {
    originales[nivel] = console[nivel];
    console[nivel] = (...args) => lineas.push(args.map(String).join(' '));
  }
});
test.afterEach(() => {
  Object.assign(console, originales);
  assert.deepEqual(lineas, [], 'el módulo no debe escribir en consola');
});

test('sin emisión en espera: crea una pública con auto-inicio y auto-fin y la vincula al stream', async () => {
  const google = googleFalso();
  const ahora = Date.parse('2026-10-09T10:00:00Z');
  const r = await preparar(google, { ahora: () => ahora });

  assert.equal(r.ok, true);
  assert.equal(r.emisionId, 'emision-nueva');
  assert.equal(r.reutilizada, false);
  assert.equal(r.autoStop, true);
  assert.equal(r.privacidad, 'public');
  assert.equal(google.de('delete').length, 0);
  assert.equal(r.titulo, TITULO_POR_DEFECTO);
  assert.equal(r.llamadas, 6);
  assert.deepEqual(google.rutas().slice(0, 2), ['token', 'streams']);
  assert.deepEqual(google.rutas().slice(2, 5).sort(), ['active', 'completed', 'upcoming']);
  assert.deepEqual(google.rutas().slice(5), ['insert', 'bind']);

  const [insert] = google.de('insert');
  assert.deepEqual(insert.u.searchParams.get('part').split(',').sort(), ['contentDetails', 'snippet', 'status']);
  assert.equal(insert.opciones.headers['Content-Type'], 'application/json');
  const cuerpo = JSON.parse(insert.cuerpo);
  assert.equal(cuerpo.snippet.title, 'Directo ApliArte');
  assert.equal(cuerpo.status.privacyStatus, 'public');
  assert.equal(cuerpo.status.selfDeclaredMadeForKids, false);
  assert.equal(cuerpo.contentDetails.enableAutoStart, true);
  assert.equal(cuerpo.contentDetails.enableAutoStop, true);
  // Sin fase de prueba: con el monitor activo YouTube exige pasar antes por "testing".
  assert.equal(cuerpo.contentDetails.monitorStream.enableMonitorStream, false);
  // La documentación pide una hora de inicio futura y cercana.
  const inicio = Date.parse(cuerpo.snippet.scheduledStartTime);
  assert.ok(inicio > ahora && inicio - ahora <= 5 * 60_000, cuerpo.snippet.scheduledStartTime);

  const [bind] = google.de('bind');
  assert.equal(bind.metodo, 'POST');
  assert.equal(bind.u.searchParams.get('id'), 'emision-nueva');
  assert.equal(bind.u.searchParams.get('streamId'), 'stream-1');
  assert.ok(bind.u.searchParams.get('part'));
  assert.equal(bind.cuerpo, undefined, 'bind no lleva cuerpo');

  for (const l of google.llamadas.filter((x) => x.ruta !== 'token')) {
    assert.equal(l.opciones.headers.Authorization, `Bearer ${TOKEN}`, l.ruta);
    assert.ok(l.opciones.signal instanceof AbortSignal, l.ruta);
  }
  sinSecretos(r, google);
});

test('pide el token con el refresh token y lo guarda en memoria hasta poco antes de caducar', async () => {
  const google = googleFalso({ upcoming: { status: 200, body: { items: [emision('espera-1')] } } });
  let reloj = 0;
  const ahora = () => reloj;

  assert.equal((await preparar(google, { ahora })).ok, true);
  const [peticion] = google.de('token');
  assert.equal(peticion.url, 'https://oauth2.googleapis.com/token');
  assert.equal(peticion.metodo, 'POST');
  assert.equal(peticion.opciones.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(peticion.cuerpo)), {
    grant_type: 'refresh_token',
    client_id: CREDENCIALES.clientId,
    client_secret: CREDENCIALES.clientSecret,
    refresh_token: CREDENCIALES.refreshToken,
  });

  reloj = 3000 * 1000;
  assert.equal((await preparar(google, { ahora })).ok, true);
  assert.equal(google.de('token').length, 1, 'token aún válido: no se vuelve a pedir');

  reloj = 3590 * 1000; // a 10 s de caducar: se renueva
  assert.equal((await preparar(google, { ahora })).ok, true);
  assert.equal(google.de('token').length, 2);

  // Otras credenciales no aprovechan el token de las anteriores.
  await preparar(google, { ahora, credenciales: { ...CREDENCIALES, refreshToken: 'otro-refresco' } });
  assert.equal(google.de('token').length, 3);
});

test('refresh token revocado o caducado (invalid_grant)', async () => {
  const google = googleFalso({ token: { status: 400, body: { error: 'invalid_grant', error_description: `Token ${CREDENCIALES.refreshToken} has been expired or revoked.` } } });
  const r = await preparar(google);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVOS.AUTORIZACION_REVOCADA);
  assert.match(r.detalle, /invalid_grant/);
  assert.deepEqual(google.rutas(), ['token']);
  sinSecretos(r, google);
});

test('otros fallos del token no se confunden con una autorización revocada', async () => {
  const cliente = await preparar(googleFalso({ token: { status: 401, body: { error: 'invalid_client' } } }));
  assert.equal(cliente.motivo, MOTIVOS.NO_AUTORIZADO);
  const sinToken = await preparar(googleFalso({ token: { status: 200, body: { expires_in: 3600 } } }));
  assert.equal(sinToken.motivo, MOTIVOS.RESPUESTA_INESPERADA);
  const caido = await preparar(googleFalso({ token: { status: 503, body: 'Service Unavailable' } }));
  assert.equal(caido.motivo, MOTIVOS.ERROR_GOOGLE);
});

test('cuota agotada o límite de peticiones: mismo motivo estable', async () => {
  const casos = [[403, 'quotaExceeded'], [403, 'dailyLimitExceeded'], [403, 'rateLimitExceeded'],
    [403, 'userRateLimitExceeded'], [403, 'userRequestsExceedRateLimit'], [429, 'loQueSea']];
  for (const [status, reason] of casos) {
    olvidarTokens();
    const google = googleFalso({ streams: errorGoogle(status, reason) });
    const r = await preparar(google);
    assert.equal(r.ok, false, reason);
    assert.equal(r.motivo, MOTIVOS.CUOTA_AGOTADA, reason);
    assert.match(r.detalle, new RegExp(`HTTP ${status}`));
    sinSecretos(r, google);
  }
  // También al crear la emisión, después de varias llamadas correctas.
  olvidarTokens();
  const alCrear = await preparar(googleFalso({ insert: errorGoogle(403, 'quotaExceeded') }));
  assert.equal(alCrear.motivo, MOTIVOS.CUOTA_AGOTADA);
  assert.match(alCrear.detalle, /liveBroadcasts\.insert/);
});

test('canal sin emisión en directo habilitada', async () => {
  for (const reason of ['liveStreamingNotEnabled', 'livePermissionBlocked']) {
    olvidarTokens();
    const google = googleFalso({ streams: errorGoogle(403, reason) });
    const r = await preparar(google);
    assert.equal(r.motivo, MOTIVOS.DIRECTO_NO_HABILITADO, reason);
    sinSecretos(r, google);
  }
});

test('401 y otros 403 son "no autorizado" y obligan a pedir un token nuevo', async () => {
  const google = googleFalso({ streams: errorGoogle(401, 'authError') });
  assert.equal((await preparar(google)).motivo, MOTIVOS.NO_AUTORIZADO);
  await preparar(google);
  assert.equal(google.de('token').length, 2, 'el token rechazado no se reutiliza');

  olvidarTokens();
  const prohibido = await preparar(googleFalso({ streams: errorGoogle(403, 'insufficientLivePermissions') }));
  assert.equal(prohibido.motivo, MOTIVOS.NO_AUTORIZADO);
  assert.match(prohibido.detalle, /insufficientLivePermissions/);
});

test('encuentra el stream en una página posterior comparando la clave en local', async () => {
  const google = googleFalso({
    streams: ({ u }) => u.searchParams.get('pageToken') === 'pag-2'
      ? { status: 200, body: { items: [stream('stream-bueno', CLAVE)] } }
      : { status: 200, body: { nextPageToken: 'pag-2', items: [stream('otro', 'otra-clave'), { id: 'sin-cdn' }] } },
    upcoming: { status: 200, body: { items: [emision('espera-1', { streamId: 'stream-bueno' })] } },
  });
  const r = await preparar(google);
  assert.equal(r.ok, true);
  assert.equal(r.emisionId, 'espera-1');
  const paginas = google.de('streams');
  assert.equal(paginas.length, 2);
  assert.equal(paginas[0].u.searchParams.get('mine'), 'true');
  assert.ok(paginas[0].u.searchParams.get('part').split(',').includes('cdn'));
  assert.equal(paginas[0].u.searchParams.get('maxResults'), '50');
  sinSecretos(r, google);
});

test('stream de esa clave no encontrado: no se crea nada', async () => {
  const google = googleFalso({ streams: { status: 200, body: { items: [stream('otro', 'otra-clave')] } } });
  const r = await preparar(google);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVOS.STREAM_NO_ENCONTRADO);
  assert.deepEqual(google.rutas(), ['token', 'streams']);
  sinSecretos(r, google);

  // Una paginación que no termina nunca tampoco deja la preparación dando vueltas.
  olvidarTokens();
  const infinito = googleFalso({ streams: { status: 200, body: { nextPageToken: 'otra', items: [] } } });
  assert.equal((await preparar(infinito)).motivo, MOTIVOS.STREAM_NO_ENCONTRADO);
  assert.ok(infinito.de('streams').length <= 10);
});

test('reutiliza la emisión en espera vinculada a ese stream y con auto-inicio', async () => {
  const google = googleFalso({
    upcoming: { status: 200, body: { items: [
      emision('de-otro-stream', { streamId: 'stream-9' }),
      emision('sin-auto-inicio', { autoStart: false }),
      emision('la-buena', { autoStop: false, titulo: 'Mi directo' }),
    ] } },
  });
  const r = await preparar(google);
  assert.deepEqual(r, { ok: true, emisionId: 'la-buena', reutilizada: true, autoStop: false, estado: 'ready', privacidad: 'public', titulo: 'Mi directo', llamadas: 4 });
  assert.equal(google.de('insert').length, 0);
  assert.equal(google.de('bind').length, 0);
  const [lista] = google.de('upcoming');
  assert.equal(lista.u.searchParams.has('mine'), false, 'broadcastStatus y mine son excluyentes');
  for (const parte of ['id', 'snippet', 'contentDetails', 'status']) {
    assert.ok(lista.u.searchParams.get('part').split(',').includes(parte), parte);
  }
});

test('dice la privacidad de la emisión, también si la reutilizada no es pública', async () => {
  for (const [privacidad, esperada] of [['private', 'private'], ['unlisted', 'unlisted'], [`rara ${CLAVE}`, 'desconocida'], [undefined, 'desconocida']]) {
    olvidarTokens();
    const lista = { status: 200, body: { items: [emision('espera-1')] } };
    lista.body.items[0].status.privacyStatus = privacidad;
    const google = googleFalso({ upcoming: lista });
    const r = await preparar(google);
    assert.equal(r.ok, true);
    assert.equal(r.reutilizada, true);
    assert.equal(r.privacidad, esperada);
    sinSecretos(r, google);
  }
  // Al crear, vale lo que confirme YouTube; si no lo dice, lo que se pidió.
  olvidarTokens();
  const sinConfirmar = await preparar(googleFalso({ insert: { status: 200, body: { id: 'emision-nueva' } } }));
  assert.equal(sinConfirmar.privacidad, 'public');
  olvidarTokens();
  const cambiada = await preparar(googleFalso({ insert: { status: 200, body: { id: 'emision-nueva', status: { privacyStatus: 'private' } } } }));
  assert.equal(cambiada.privacidad, 'private');
});

test('si el stream ya tiene una emisión en directo (OBS reconecta), no crea otra', async () => {
  const google = googleFalso({ active: { status: 200, body: { items: [emision('en-directo', { estado: 'live' })] } } });
  const r = await preparar(google);
  assert.equal(r.ok, true);
  assert.equal(r.emisionId, 'en-directo');
  assert.equal(r.reutilizada, true);
  assert.equal(r.estado, 'live');
  assert.equal(google.de('insert').length, 0);
});

test('las emisiones en espera que no sirven no impiden crear una nueva', async () => {
  const google = googleFalso({ upcoming: { status: 200, body: { items: [emision('otra', { streamId: 'stream-9' }), emision('manual', { autoStart: false })] } } });
  const r = await preparar(google);
  assert.equal(r.ok, true);
  assert.equal(r.reutilizada, false);
  assert.equal(google.de('bind')[0].u.searchParams.get('streamId'), 'stream-1');
});

test('copia título y descripción de la emisión más reciente, recortando el título a 100', async () => {
  const largo = 'T'.repeat(130);
  const google = googleFalso({ completed: { status: 200, body: { items: [
    emision('vieja', { titulo: 'Viejo', descripcion: 'vieja', inicio: '2026-10-01T10:00:00Z' }),
    emision('reciente', { titulo: largo, descripcion: 'Descripción de ayer', inicio: '2026-10-08T10:00:00Z' }),
  ] } } });
  const r = await preparar(google);
  const cuerpo = JSON.parse(google.de('insert')[0].cuerpo);
  assert.equal(cuerpo.snippet.title, 'T'.repeat(100));
  assert.equal(cuerpo.snippet.description, 'Descripción de ayer');
  assert.equal(r.titulo, 'T'.repeat(100));
  assert.equal(google.de('completed').length, 1, 'una sola llamada para el título');
});

test('si no se puede saber el título anterior, usa "Directo ApliArte" y sigue', async () => {
  for (const completed of [errorGoogle(500, 'backendError'), { status: 200, body: 'esto no es JSON' },
    { status: 200, body: { items: [emision('sin-titulo', { titulo: '   ' })] } }]) {
    olvidarTokens();
    const google = googleFalso({ completed });
    const r = await preparar(google);
    assert.equal(r.ok, true);
    const cuerpo = JSON.parse(google.de('insert')[0].cuerpo);
    assert.equal(cuerpo.snippet.title, 'Directo ApliArte');
    assert.equal('description' in cuerpo.snippet, false);
  }
});

test('si falla la vinculación se informa, con la razón de Google y sin secretos', async () => {
  const google = googleFalso({ bind: errorGoogle(403, 'liveBroadcastBindingNotAllowed') });
  const r = await preparar(google);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVOS.ERROR_GOOGLE);
  assert.match(r.detalle, /liveBroadcasts\.bind/);
  assert.match(r.detalle, /liveBroadcastBindingNotAllowed/);
  sinSecretos(r, google);

  olvidarTokens();
  const servidor = await preparar(googleFalso({ insert: errorGoogle(503, 'backendError') }));
  assert.equal(servidor.motivo, MOTIVOS.ERROR_GOOGLE);
});

test('si falla la vinculación, borra la emisión recién creada para no dejarla suelta', async () => {
  const google = googleFalso({ bind: errorGoogle(403, 'liveBroadcastBindingNotAllowed') });
  const r = await preparar(google);
  assert.equal(r.ok, false);
  assert.match(r.detalle, /liveBroadcasts\.bind/);
  const [borrado] = google.de('delete');
  assert.ok(borrado, 'se pide el borrado');
  assert.equal(google.de('delete').length, 1);
  assert.equal(borrado.u.origin + borrado.u.pathname, 'https://www.googleapis.com/youtube/v3/liveBroadcasts');
  assert.deepEqual(Object.fromEntries(borrado.u.searchParams), { id: 'emision-nueva' });
  assert.equal(borrado.opciones.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(borrado.cuerpo, undefined);
  assert.equal(borrado.opciones.signal.aborted, false, 'el borrado lleva su propio plazo');
  sinSecretos(r, google);

  // Si lo que falla es crear, no hay nada que borrar.
  olvidarTokens();
  const sinCrear = googleFalso({ insert: errorGoogle(503, 'backendError') });
  await preparar(sinCrear);
  assert.equal(sinCrear.de('delete').length, 0);
});

test('que el borrado falle, lance o se cuelgue no cambia el resultado ni hace rechazar', async () => {
  const bind = errorGoogle(403, 'liveBroadcastBindingNotAllowed');
  const borrados = [
    errorGoogle(403, 'liveBroadcastDeletionNotAllowed'),
    errorGoogle(404, 'liveBroadcastNotFound'),
    { status: 500, body: `<html>${CLAVE}</html>` },
    () => { throw new Error(`explota ${TOKEN}`); },
    () => new Promise(() => {}),
  ];
  for (const [i, borrar] of borrados.entries()) {
    olvidarTokens();
    const google = googleFalso({ bind, delete: borrar });
    const antes = Date.now();
    const r = await preparar(google, { tiempoLimpiezaMs: 40 });
    assert.equal(r.ok, false, `caso ${i}`);
    assert.equal(r.motivo, MOTIVOS.ERROR_GOOGLE, `caso ${i}`);
    assert.match(r.detalle, /liveBroadcasts\.bind/, `caso ${i}`);
    assert.equal(google.de('delete').length, 1, `caso ${i}`);
    assert.ok(Date.now() - antes < 2000, `caso ${i}`);
    sinSecretos(r, google);
  }
});

test('si el plazo vence con la emisión ya creada y sin vincular, también se borra', async () => {
  const google = googleFalso({ bind: () => new Promise(() => {}) });
  const r = await preparar(google, { tiempoMaximoMs: 40 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVOS.TIEMPO_AGOTADO);
  const [borrado] = google.de('delete');
  assert.ok(borrado, 'se pide el borrado');
  assert.equal(borrado.u.searchParams.get('id'), 'emision-nueva');
  assert.equal(borrado.opciones.signal.aborted, false, 'no reutiliza la señal ya cancelada');

  // Si vence antes de crear nada, no se borra nada.
  olvidarTokens();
  const antes = googleFalso({ upcoming: () => new Promise(() => {}) });
  assert.equal((await preparar(antes, { tiempoMaximoMs: 40 })).motivo, MOTIVOS.TIEMPO_AGOTADO);
  assert.equal(antes.de('delete').length, 0);
});

test('el plazo se acota: ni vence al instante ni provoca avisos de Node con valores absurdos', async () => {
  assert.equal(acotarPlazo(undefined, 10_000), 10_000);
  for (const malo of [NaN, Infinity, -Infinity, 0, -5, 'mucho', null, {}]) assert.equal(acotarPlazo(malo, 10_000), 10_000, String(malo));
  assert.equal(acotarPlazo(40, 10_000), 40);
  assert.equal(acotarPlazo(0.2, 10_000), 1);
  for (const enorme of [60_001, 2 ** 31 - 1, 2 ** 31, Number.MAX_SAFE_INTEGER]) {
    assert.ok(acotarPlazo(enorme, 10_000) <= 60_000, String(enorme));
  }

  const avisos = [];
  const alAvisar = (aviso) => avisos.push(aviso.name);
  process.on('warning', alAvisar);
  try {
    for (const tiempoMaximoMs of [2 ** 31, Number.MAX_SAFE_INTEGER, Infinity, -1, 0, NaN]) {
      olvidarTokens();
      // Google tarda un poco: un plazo mal acotado (1 ms) vencería antes.
      const lento = googleFalso({ streams: async () => { await new Promise((h) => setTimeout(h, 20)); return { status: 200, body: { items: [stream('stream-1', CLAVE)] } }; } });
      const r = await preparar(lento, { tiempoMaximoMs, tiempoLimpiezaMs: tiempoMaximoMs });
      assert.equal(r.ok, true, String(tiempoMaximoMs));
    }
    await new Promise((hecho) => setImmediate(hecho));
  } finally {
    process.off('warning', alAvisar);
  }
  assert.deepEqual(avisos, []);
});

test('respuestas que no se entienden: motivo "respuesta inesperada"', async () => {
  for (const rutas of [{ streams: { status: 200, body: '<html>proxy</html>' } }, { streams: { status: 200, body: 'null' } },
    { insert: { status: 200, body: { kind: 'sin id' } } }]) {
    olvidarTokens();
    const google = googleFalso(rutas);
    const r = await preparar(google);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, MOTIVOS.RESPUESTA_INESPERADA, JSON.stringify(rutas));
    sinSecretos(r, google);
  }
});

test('tiempo agotado: una petición colgada no sobrevive al plazo', async () => {
  let senal;
  const colgado = (_url, opciones) => { senal = opciones.signal; return new Promise(() => {}); };
  const antes = Date.now();
  const r = await prepararEmisionYoutube({ claveEmision: CLAVE, credenciales: CREDENCIALES, fetchFn: colgado, tiempoMaximoMs: 40 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVOS.TIEMPO_AGOTADO);
  assert.ok(Date.now() - antes < 2000);
  assert.equal(senal.aborted, true, 'la petición recibe la señal de cancelación');
  sinSecretos(r);

  // Igual si se cuelga a mitad de la secuencia y el fetch respeta la señal.
  olvidarTokens();
  const google = googleFalso({ upcoming: ({ opciones }) => new Promise((_, rechazar) => {
    opciones.signal.addEventListener('abort', () => rechazar(opciones.signal.reason));
  }) });
  assert.equal((await preparar(google, { tiempoMaximoMs: 40 })).motivo, MOTIVOS.TIEMPO_AGOTADO);
});

test('error de red: motivo propio y nada del mensaje original en el detalle', async () => {
  const fetchFn = async (url, opciones) => {
    throw Object.assign(new TypeError(`fetch failed ${url} ${opciones.body} ${CLAVE}`), { cause: { code: 'ENOTFOUND' } });
  };
  const r = await prepararEmisionYoutube({ claveEmision: CLAVE, credenciales: CREDENCIALES, fetchFn });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVOS.ERROR_RED);
  assert.match(r.detalle, /ENOTFOUND/);
  sinSecretos(r);
});

test('sin credenciales o sin clave: responde sin tocar la red', async () => {
  const google = googleFalso();
  for (const credenciales of [null, undefined, {}, { ...CREDENCIALES, refreshToken: '' }, 'texto']) {
    const r = await preparar(google, { credenciales });
    assert.equal(r.motivo, MOTIVOS.SIN_CREDENCIALES);
  }
  for (const claveEmision of [null, '', '   ', 42]) {
    const r = await preparar(google, { claveEmision });
    assert.equal(r.motivo, MOTIVOS.SIN_CLAVE);
  }
  assert.deepEqual(google.llamadas, []);
});

test('nunca rechaza ni lanza, pase lo que pase', async () => {
  const lanzaAlInstante = () => { throw new Error(`explota ${CLAVE} ${TOKEN}`); };
  const respuestaRara = async () => ({ ok: true, status: 200, json: async () => { throw new Error(`json roto ${CREDENCIALES.clientSecret}`); } });
  const intentos = [
    () => prepararEmisionYoutube(),
    () => prepararEmisionYoutube(null),
    () => prepararEmisionYoutube({ claveEmision: CLAVE, credenciales: CREDENCIALES, fetchFn: lanzaAlInstante }),
    () => prepararEmisionYoutube({ claveEmision: CLAVE, credenciales: CREDENCIALES, fetchFn: respuestaRara }),
    () => prepararEmisionYoutube({ claveEmision: CLAVE, credenciales: CREDENCIALES, fetchFn: async () => undefined }),
    () => prepararEmisionYoutube({ claveEmision: CLAVE, credenciales: CREDENCIALES, fetchFn: 'no es una función' }),
    () => prepararEmisionYoutube({ claveEmision: CLAVE, credenciales: CREDENCIALES, fetchFn: googleFalso().fetchFn, ahora: () => { throw new Error('reloj roto'); } }),
    () => prepararEmisionYoutube({ claveEmision: CLAVE, credenciales: CREDENCIALES, fetchFn: googleFalso().fetchFn, tiempoMaximoMs: 'mucho' }),
  ];
  const conocidos = new Set(Object.values(MOTIVOS));
  for (const [i, intento] of intentos.entries()) {
    olvidarTokens();
    let promesa;
    assert.doesNotThrow(() => { promesa = intento(); }, `intento ${i}`);
    const r = await promesa;
    assert.equal(typeof r.ok, 'boolean', `intento ${i}`);
    if (!r.ok) {
      assert.ok(conocidos.has(r.motivo), `intento ${i}: motivo ${r.motivo}`);
      assert.equal(typeof r.detalle, 'string');
    }
    sinSecretos(r);
  }
});

test('la URL de autorización lleva lo necesario y nunca el secreto del cliente', () => {
  const url = new URL(urlAutorizacion({ clientId: CREDENCIALES.clientId, redirectUri: 'http://127.0.0.1:51234', state: 'estado-1', codeChallenge: 'reto-1' }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    client_id: CREDENCIALES.clientId,
    redirect_uri: 'http://127.0.0.1:51234',
    response_type: 'code',
    scope: ALCANCE_YOUTUBE,
    access_type: 'offline',
    prompt: 'consent',
    state: 'estado-1',
    code_challenge: 'reto-1',
    code_challenge_method: 'S256',
  });
  assert.equal(ALCANCE_YOUTUBE, 'https://www.googleapis.com/auth/youtube');
  assert.ok(!url.href.includes('SECRETO'));
});

test('PKCE con S256 y estado aleatorio', () => {
  const { verifier, challenge } = generarPkce();
  assert.match(verifier, /^[A-Za-z0-9._~-]{43,128}$/);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
  assert.notEqual(generarPkce().verifier, verifier);
  assert.match(generarEstado(), /^[A-Za-z0-9_-]{32,}$/);
  assert.notEqual(generarEstado(), generarEstado());
});

test('el retorno solo vale con el mismo estado', () => {
  assert.equal(validarRetorno(new URLSearchParams('code=codigo-1&state=estado-1'), 'estado-1'), 'codigo-1');
  assert.throws(() => validarRetorno(new URLSearchParams('code=codigo-1&state=otro'), 'estado-1'), /no coincide/);
  assert.throws(() => validarRetorno(new URLSearchParams('code=codigo-1'), 'estado-1'), /no coincide/);
  assert.throws(() => validarRetorno(new URLSearchParams('state=estado-1'), 'estado-1'), /código/);
  assert.throws(() => validarRetorno(new URLSearchParams('error=access_denied&state=estado-1'), 'estado-1'), /permiso/);
  assert.throws(() => validarRetorno(new URLSearchParams('code=c&state='), ''), /no coincide/);
});

test('canjea el código por el refresh token', async () => {
  const google = googleFalso({ token: { status: 200, body: { access_token: TOKEN, refresh_token: 'SECRETO-REFRESCO', expires_in: 3600 } } });
  const datos = { clientId: CREDENCIALES.clientId, clientSecret: CREDENCIALES.clientSecret, code: 'codigo-1', codeVerifier: 'verificador-1', redirectUri: 'http://127.0.0.1:51234', fetchFn: google.fetchFn };
  assert.equal(await canjearCodigo(datos), 'SECRETO-REFRESCO');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(google.de('token')[0].cuerpo)), {
    grant_type: 'authorization_code',
    code: 'codigo-1',
    client_id: CREDENCIALES.clientId,
    client_secret: CREDENCIALES.clientSecret,
    code_verifier: 'verificador-1',
    redirect_uri: 'http://127.0.0.1:51234',
  });

  const sinRefresco = googleFalso();
  await assert.rejects(canjearCodigo({ ...datos, fetchFn: sinRefresco.fetchFn }), (error) => {
    assert.match(error.message, /permiso permanente/);
    assert.ok(!error.message.includes('SECRETO'));
    return true;
  });
  const rechazado = googleFalso({ token: { status: 400, body: { error: 'invalid_grant', error_description: 'SECRETO' } } });
  await assert.rejects(canjearCodigo({ ...datos, fetchFn: rechazado.fetchFn }), (error) => {
    assert.match(error.message, /invalid_grant/);
    assert.ok(!error.message.includes('SECRETO'));
    return true;
  });
});
