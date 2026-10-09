// Preparación de la emisión de YouTube vista desde el centro: todo son dependencias de prueba,
// no hay red ni servidores. Lo que se comprueba es que, pase lo que pase, el centro puede seguir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTIVOS } from '../src/youtube-api.js';
import { crearPreparadorYoutube, esDestinoYoutube, youtubeApiHabilitada } from '../src/youtube-emision.js';

const CLAVE = 'clave-SECRETA-de-emision-abcd';
const CREDENCIALES = { clientId: 'id-123.apps.googleusercontent.com', clientSecret: 'SECRETO-CLIENTE', refreshToken: 'SECRETO-REFRESCO' };
const CENTINELAS = [CLAVE, CREDENCIALES.clientSecret, CREDENCIALES.refreshToken, CREDENCIALES.clientId, 'SECRETO', 'emision-id-1'];
const CREADA = { ok: true, emisionId: 'emision-id-1', reutilizada: false, autoStop: true, estado: 'ready', privacidad: 'public', titulo: 'Título SECRETO', llamadas: 6 };
const CAMPOS = ['autoStop', 'cuando', 'estado', 'motivo', 'privacidad', 'reutilizada'];
const AHORA = Date.parse('2026-10-09T10:00:00Z');

function montar(cambios = {}) {
  const lineas = [];
  const llamadas = [];
  const preparador = crearPreparadorYoutube({
    leerCredenciales: () => CREDENCIALES,
    prepararEmisionYoutube: async (opciones) => { llamadas.push(opciones); return CREADA; },
    anotar: (linea) => lineas.push(String(linea)),
    ahora: () => AHORA,
    ...cambios,
  });
  return { preparador, lineas, llamadas };
}

function sinSecretos(valor) {
  const texto = JSON.stringify(valor);
  for (const c of CENTINELAS) assert.ok(!texto.includes(c), `aparece un secreto: ${texto.split(c).join('…')}`);
}

const pausa = (ms) => new Promise((hecho) => setTimeout(hecho, ms));

test('emisión creada: una línea clara, resultado "preparada" y la clave solo viaja al cliente', async () => {
  const { preparador, lineas, llamadas } = montar({ tiempoMaximoMs: 8000 });
  assert.equal(preparador.ultimo(), null, 'antes del primer intento no hay resultado');

  const r = await preparador.preparar(CLAVE);
  assert.deepEqual(r, { estado: 'preparada', motivo: null, cuando: '2026-10-09T10:00:00.000Z', reutilizada: false, privacidad: 'public', autoStop: true });
  assert.deepEqual(preparador.ultimo(), r);
  assert.notEqual(preparador.ultimo(), preparador.ultimo(), 'se entrega una copia');

  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].claveEmision, CLAVE);
  assert.deepEqual(llamadas[0].credenciales, CREDENCIALES);
  assert.ok(llamadas[0].tiempoMaximoMs > 0 && llamadas[0].tiempoMaximoMs < 8000, 'el cliente vence antes que el plazo del centro');

  assert.equal(lineas.length, 1);
  assert.match(lineas[0], /^YouTube: emisión pública preparada/);
  sinSecretos(lineas);
  sinSecretos(r);
});

test('emisión reutilizada: lo dice, y avisa si no es pública o no tiene fin automático', async () => {
  const reutilizada = { ...CREADA, reutilizada: true };
  const casos = [
    [{}, [/se reutiliza/]],
    [{ privacidad: 'private' }, [/se reutiliza/, /AVISO YouTube: .*no es pública \(privada\)/]],
    [{ privacidad: 'unlisted' }, [/se reutiliza/, /AVISO YouTube: .*no es pública \(oculta\)/]],
    [{ autoStop: false }, [/se reutiliza/, /AVISO YouTube: .*fin automático/]],
    [{ privacidad: 'private', autoStop: false }, [/se reutiliza/, /no es pública/, /fin automático/]],
    [{ privacidad: `rara ${CLAVE}` }, [/se reutiliza/, /no se ha podido saber si .* es pública/]],
  ];
  for (const [cambios, esperadas] of casos) {
    const { preparador, lineas } = montar({ prepararEmisionYoutube: async () => ({ ...reutilizada, ...cambios }) });
    const r = await preparador.preparar(CLAVE);
    assert.equal(r.estado, 'preparada');
    assert.equal(r.reutilizada, true);
    assert.equal(lineas.length, esperadas.length, lineas.join(' | '));
    esperadas.forEach((patron, i) => assert.match(lineas[i], patron));
    sinSecretos(lineas);
    sinSecretos(r);
  }
  const { preparador } = montar({ prepararEmisionYoutube: async () => ({ ...reutilizada, privacidad: 'private', autoStop: false }) });
  assert.deepEqual(await preparador.preparar(CLAVE),
    { estado: 'preparada', motivo: null, cuando: '2026-10-09T10:00:00.000Z', reutilizada: true, privacidad: 'private', autoStop: false });
});

test('sin credenciales: "no configurada", sin llamar al cliente y sin repetir el aviso en cada arranque', async () => {
  for (const credenciales of [null, undefined, false, '']) {
    const { preparador, lineas, llamadas } = montar({ leerCredenciales: () => credenciales });
    for (let i = 0; i < 3; i += 1) {
      const r = await preparador.preparar(CLAVE);
      assert.equal(r.estado, 'no_configurada');
      assert.equal(r.motivo, MOTIVOS.SIN_CREDENCIALES);
    }
    assert.equal(llamadas.length, 0);
    assert.equal(lineas.length, 1, 'una sola línea discreta');
    assert.match(lineas[0], /no está conectado/);
  }
  // El cliente también puede decir que faltan (archivo incompleto): mismo resultado.
  const { preparador, lineas } = montar({ prepararEmisionYoutube: async () => ({ ok: false, motivo: MOTIVOS.SIN_CREDENCIALES, detalle: 'x' }) });
  assert.equal((await preparador.preparar(CLAVE)).estado, 'no_configurada');
  await preparador.preparar(CLAVE);
  assert.equal(lineas.length, 1);
});

test('YOUTUBE_API=off apaga el paso entero', async () => {
  for (const valor of ['off', 'OFF', ' Off ']) assert.equal(youtubeApiHabilitada({ YOUTUBE_API: valor }), false, valor);
  for (const valor of [undefined, '', 'on', '1', 'false', 'no']) assert.equal(youtubeApiHabilitada({ YOUTUBE_API: valor }), true, String(valor));
  assert.equal(youtubeApiHabilitada({}), true);

  for (const habilitado of [false, () => false]) {
    let leidas = 0;
    const { preparador, lineas, llamadas } = montar({ habilitado, leerCredenciales: () => { leidas += 1; return CREDENCIALES; } });
    const r = await preparador.preparar(CLAVE);
    assert.deepEqual(r, { estado: 'desactivada', motivo: null, cuando: '2026-10-09T10:00:00.000Z', reutilizada: false, privacidad: null, autoStop: null });
    await preparador.preparar(CLAVE);
    assert.equal(leidas, 0, 'ni siquiera se leen las credenciales');
    assert.equal(llamadas.length, 0);
    assert.equal(lineas.length, 1);
    assert.match(lineas[0], /YOUTUBE_API=off/);
  }
});

test('apagado por otra causa: la línea dice esa causa y no culpa a YOUTUBE_API', async () => {
  const { preparador, lineas } = montar({ habilitado: false, causaApagado: 'entorno de pruebas' });
  assert.equal((await preparador.preparar(CLAVE)).estado, 'desactivada');
  assert.equal(lineas.length, 1);
  assert.match(lineas[0], /está apagada \(entorno de pruebas\)/);
  assert.doesNotMatch(lineas[0], /YOUTUBE_API/);

  // Una causa que no sea texto corriente no se copia al registro.
  for (const causaApagado of ['', null, 42, `rtmp://x/${CLAVE}`, 'a\nb', 'x'.repeat(61)]) {
    const otro = montar({ habilitado: false, causaApagado });
    await otro.preparador.preparar(CLAVE);
    assert.match(otro.lineas[0], /está apagada; el directo sale como siempre\.$/, String(causaApagado));
    sinSecretos(otro.lineas);
  }
});

test('cada motivo de fallo deja una línea para el dueño, sin secretos, y dice que el directo sigue', async () => {
  const vistas = new Set();
  for (const motivo of Object.values(MOTIVOS)) {
    if (motivo === MOTIVOS.SIN_CREDENCIALES) continue; // tiene su propia prueba
    const detalle = `HTTP 403 (quotaExceeded) en liveStreams.list ${CLAVE} ${CREDENCIALES.refreshToken}`;
    const { preparador, lineas } = montar({ prepararEmisionYoutube: async () => ({ ok: false, motivo, detalle }) });
    const r = await preparador.preparar(CLAVE);
    assert.deepEqual(r, { estado: 'fallo', motivo, cuando: '2026-10-09T10:00:00.000Z', reutilizada: false, privacidad: null, autoStop: null });
    assert.equal(lineas.length, 1, motivo);
    assert.match(lineas[0], /^AVISO YouTube: /, motivo);
    assert.match(lineas[0], /el directo sigue como siempre/, motivo);
    sinSecretos(lineas);
    sinSecretos(r);
    vistas.add(lineas[0]);
  }
  assert.equal(vistas.size, Object.values(MOTIVOS).length - 1, 'cada motivo tiene su propia frase');

  const frase = async (motivo, detalle = 'x') => {
    const { preparador, lineas } = montar({ prepararEmisionYoutube: async () => ({ ok: false, motivo, detalle }) });
    await preparador.preparar(CLAVE);
    return lineas[0];
  };
  assert.match(await frase(MOTIVOS.CUOTA_AGOTADA), /cupo diario/);
  assert.match(await frase(MOTIVOS.AUTORIZACION_REVOCADA), /hay que volver a conectar YouTube/);
  assert.match(await frase(MOTIVOS.NO_AUTORIZADO), /hay que volver a conectar YouTube/);
  assert.match(await frase(MOTIVOS.TIEMPO_AGOTADO), /no respondió a tiempo/);
  // El detalle técnico del cliente se añade solo si es texto corriente.
  assert.match(await frase(MOTIVOS.ERROR_GOOGLE, 'HTTP 403 (liveBroadcastBindingNotAllowed) en liveBroadcasts.bind'),
    /\[HTTP 403 \(liveBroadcastBindingNotAllowed\) en liveBroadcasts\.bind\]$/);
  assert.doesNotMatch(await frase(MOTIVOS.ERROR_GOOGLE, 'https://ejemplo.test/?token=abc'), /ejemplo|token/);
  assert.doesNotMatch(await frase(MOTIVOS.ERROR_GOOGLE, { raro: true }), /\[/);
});

test('nunca lanza ni rechaza: dependencias que lanzan, rechazan o devuelven cualquier cosa', async () => {
  const explota = () => { throw new Error(`explota ${CLAVE}`); };
  const rechaza = async () => { throw new Error(`rechaza ${CREDENCIALES.clientSecret}`); };
  const basura = [undefined, null, 42, 'texto', [], {}, { ok: 'sí' }, { ok: false }, { ok: false, motivo: `inventado ${CLAVE}`, detalle: 7 },
    { ok: true }, { ok: true, reutilizada: 'quizá', privacidad: { a: 1 }, autoStop: 'sí', emisionId: CLAVE }];
  const montajes = [
    { leerCredenciales: explota },
    { leerCredenciales: rechaza },
    { leerCredenciales: () => 'texto' },
    { leerCredenciales: () => 42 },
    { leerCredenciales: 'no es una función' },
    { prepararEmisionYoutube: explota },
    { prepararEmisionYoutube: rechaza },
    { prepararEmisionYoutube: 'no es una función' },
    ...basura.map((valor) => ({ prepararEmisionYoutube: async () => valor })),
    ...basura.map((valor) => ({ prepararEmisionYoutube: () => valor })),
    { anotar: explota },
    { anotar: explota, prepararEmisionYoutube: rechaza },
    { anotar: 'no es una función' },
    { ahora: explota },
    { ahora: () => NaN },
    { habilitado: explota },
    { tiempoMaximoMs: -1 },
    { tiempoMaximoMs: Infinity },
    { tiempoMaximoMs: 'mucho' },
  ];
  const estados = new Set(['preparada', 'no_configurada', 'desactivada', 'fallo']);
  for (const [i, cambios] of montajes.entries()) {
    const { preparador, lineas } = montar(cambios);
    for (const clave of [CLAVE, undefined, null, 42]) {
      let promesa;
      assert.doesNotThrow(() => { promesa = preparador.preparar(clave); }, `montaje ${i}`);
      assert.ok(promesa instanceof Promise, `montaje ${i}`);
      const r = await promesa;
      assert.ok(estados.has(r.estado), `montaje ${i}: ${r.estado}`);
      assert.deepEqual(Object.keys(r).sort(), CAMPOS, `montaje ${i}`);
      assert.equal(typeof r.cuando, 'string', `montaje ${i}`);
      assert.ok(!Number.isNaN(Date.parse(r.cuando)), `montaje ${i}`);
      assert.ok(r.motivo === null || /^[a-z_]{1,40}$/.test(r.motivo), `montaje ${i}: ${r.motivo}`);
      assert.ok([null, 'public', 'private', 'unlisted', 'desconocida'].includes(r.privacidad), `montaje ${i}`);
      assert.ok([null, true, false].includes(r.autoStop), `montaje ${i}`);
      assert.equal(typeof r.reutilizada, 'boolean', `montaje ${i}`);
      sinSecretos(r);
      sinSecretos(preparador.ultimo());
    }
    sinSecretos(lineas);
  }
  assert.doesNotThrow(() => crearPreparadorYoutube());
  assert.equal((await crearPreparadorYoutube().preparar(CLAVE)).estado, 'fallo');
});

test('una dependencia que no contesta nunca no retiene a YouTube más allá del plazo', async () => {
  const colgado = () => new Promise(() => {});
  for (const cambios of [{ prepararEmisionYoutube: colgado }, { leerCredenciales: colgado }]) {
    const { preparador, lineas } = montar({ ...cambios, tiempoMaximoMs: 60 });
    const antes = Date.now();
    const r = await preparador.preparar(CLAVE);
    const tardo = Date.now() - antes;
    assert.ok(tardo >= 50 && tardo < 1000, `tardó ${tardo} ms`);
    assert.equal(r.estado, 'fallo');
    assert.equal(r.motivo, MOTIVOS.TIEMPO_AGOTADO);
    assert.equal(lineas.length, 1);
    assert.match(lineas[0], /no respondió a tiempo/);
    assert.match(lineas[0], /el directo sigue como siempre/);
  }
});

test('una respuesta que llega después del plazo ya no cambia el resultado ni escribe nada', async () => {
  let soltar;
  const { preparador, lineas } = montar({ tiempoMaximoMs: 30, prepararEmisionYoutube: () => new Promise((hecho) => { soltar = hecho; }) });
  const r = await preparador.preparar(CLAVE);
  assert.equal(r.motivo, MOTIVOS.TIEMPO_AGOTADO);
  soltar(CREADA);
  await pausa(10);
  assert.equal(preparador.ultimo().estado, 'fallo');
  assert.equal(lineas.length, 1);
});

test('las llamadas simultáneas comparten una sola preparación; la siguiente empieza otra', async () => {
  let soltar;
  const { preparador, lineas, llamadas } = montar({
    prepararEmisionYoutube: (opciones) => { llamadas.push(opciones); return new Promise((hecho) => { soltar = hecho; }); },
  });
  const primera = preparador.preparar(CLAVE);
  const segunda = preparador.preparar(CLAVE);
  const tercera = preparador.preparar('otra-clave');
  await pausa(5);
  assert.equal(llamadas.length, 1, 'no se crean dos emisiones');
  soltar(CREADA);
  const resultados = await Promise.all([primera, segunda, tercera]);
  assert.deepEqual(resultados[1], resultados[0]);
  assert.deepEqual(resultados[2], resultados[0]);
  assert.equal(lineas.length, 1);

  const cuarta = preparador.preparar(CLAVE);
  await pausa(5);
  assert.equal(llamadas.length, 2);
  soltar({ ...CREADA, reutilizada: true });
  assert.equal((await cuarta).reutilizada, true);
});

test('reconoce el destino de YouTube por el servidor de ingesta, y por el nombre si no hay dirección', () => {
  const si = [
    { nombre: 'youtube', url: 'rtmp://a.rtmp.youtube.com/live2', variableClave: 'CLAVE_YOUTUBE' },
    { nombre: 'canal-2', url: 'rtmps://b.rtmps.youtube.com:443/live2' },
    { nombre: 'x', url: 'RTMP://A.RTMP.YOUTUBE.COM/live2' },
    { nombre: 'x', url: 'rtmp://youtube.com/live2' },
    { nombre: 'youtube' },
    { nombre: 'youtube', url: '' },
    { nombre: 'youtube', url: 'esto no es una dirección' },
  ];
  const no = [
    { nombre: 'twitch', url: 'rtmp://live.twitch.tv/app', variableClave: 'CLAVE_TWITCH' },
    // Con ese nombre pero apuntando a otro sitio (una prueba local): no se toca la cuenta de YouTube.
    { nombre: 'youtube', url: 'rtmp://127.0.0.1:1936/pruebas' },
    { nombre: 'x', url: 'rtmp://youtube.com.ejemplo.test/live2' },
    { nombre: 'x', url: 'rtmp://noyoutube.com/live2' },
    { nombre: 'YouTube' },
    { nombre: 'x' },
    {}, null, undefined, 'youtube', 42,
  ];
  for (const destino of si) assert.equal(esDestinoYoutube(destino), true, JSON.stringify(destino));
  for (const destino of no) assert.equal(esDestinoYoutube(destino), false, JSON.stringify(destino));
});
