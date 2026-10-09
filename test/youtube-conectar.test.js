// Conexión única con YouTube: Google es un `fetch` falso y el navegador, una función de prueba.
// Lo único real es la escucha temporal en 127.0.0.1, a la que la propia prueba hace la visita.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conectarYoutube } from '../scripts/youtube-conectar.mjs';
import { ARCHIVO_CREDENCIALES, leerCredenciales } from '../src/youtube-credenciales.js';

const CLIENTE = { clientId: 'id-123.apps.googleusercontent.com', clientSecret: 'SECRETO-CLIENTE' };
const REFRESCO = 'SECRETO-REFRESCO';

function preparar(t, { cliente = { installed: { client_id: CLIENTE.clientId, client_secret: CLIENTE.clientSecret } } } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'yt-conectar-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const rutaCliente = join(dir, 'client_secret.json');
  writeFileSync(rutaCliente, JSON.stringify(cliente));
  const dataDir = join(dir, 'data');
  const dicho = [];
  const canjes = [];
  const fetchFn = async (url, opciones) => {
    canjes.push({ url: String(url), cuerpo: new URLSearchParams(opciones.body) });
    return new Response(JSON.stringify({ access_token: 'SECRETO-ACCESO', refresh_token: REFRESCO, expires_in: 3600 }), { status: 200 });
  };
  return { rutaCliente, dataDir, dicho, canjes, fetchFn, decir: (linea) => dicho.push(String(linea)) };
}

/** Hace de navegador: visita la dirección de retorno como lo haría Google tras el permiso. */
const visitar = (urlAutorizacion, cambios = {}) => {
  const auth = new URL(urlAutorizacion);
  const retorno = new URL(auth.searchParams.get('redirect_uri'));
  retorno.searchParams.set('code', 'codigo-1');
  retorno.searchParams.set('state', auth.searchParams.get('state'));
  for (const [k, v] of Object.entries(cambios)) v === null ? retorno.searchParams.delete(k) : retorno.searchParams.set(k, v);
  return { auth, retorno, respuesta: fetch(retorno).then(async (r) => ({ status: r.status, html: await r.text() })) };
};

async function esperarA(condicion, plazoMs = 2000) {
  const limite = Date.now() + plazoMs;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error('la condición esperada no llegó a tiempo');
    await new Promise((hecho) => setTimeout(hecho, 5));
  }
}

test('conecta: abre la autorización, recibe el retorno, guarda y no enseña secretos', async (t) => {
  const p = preparar(t);
  let visita;
  await conectarYoutube({ ...p, abrir: (url) => { visita = visitar(url); } });

  assert.equal(visita.auth.origin, 'https://accounts.google.com');
  assert.match(visita.retorno.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(visita.auth.searchParams.get('client_id'), CLIENTE.clientId);
  assert.equal(visita.auth.searchParams.get('code_challenge_method'), 'S256');

  const pagina = await visita.respuesta;
  assert.equal(pagina.status, 200);
  assert.match(pagina.html, /cerrar esta pestaña/);

  assert.equal(p.canjes.length, 1);
  assert.equal(p.canjes[0].cuerpo.get('code'), 'codigo-1');
  assert.equal(p.canjes[0].cuerpo.get('redirect_uri'), visita.retorno.origin);
  assert.ok(p.canjes[0].cuerpo.get('code_verifier'));
  assert.deepEqual(leerCredenciales(p.dataDir), { ...CLIENTE, refreshToken: REFRESCO });

  const salida = p.dicho.join('\n');
  assert.doesNotMatch(salida, /https?:\/\//, 'la dirección de permiso no se enseña si el navegador se abre');
  assert.match(salida, /YouTube conectado/);
  assert.doesNotMatch(salida, /SECRETO/);
  await assert.rejects(fetch(visita.retorno), 'la escucha temporal queda cerrada');
});

test('si el navegador no se abre, enseña la dirección y explica por qué', async (t) => {
  for (const abrir of [() => false, async () => false, () => { throw new Error('sin navegador'); }]) {
    const p = preparar(t);
    const conexion = conectarYoutube({ ...p, abrir });
    await esperarA(() => p.dicho.some((linea) => linea.startsWith('https://accounts.google.com/')));
    const salida = p.dicho.join('\n');
    assert.match(salida, /No se ha podido abrir el navegador/);
    assert.doesNotMatch(salida, /SECRETO/);
    assert.equal((await visitar(p.dicho.find((linea) => linea.startsWith('https://'))).respuesta).status, 200);
    await conexion;
    assert.deepEqual(leerCredenciales(p.dataDir), { ...CLIENTE, refreshToken: REFRESCO });
  }
});

test('un retorno con otro "state" o sin él recibe un 400 y no corta la conexión en curso', async (t) => {
  const p = preparar(t);
  let url;
  const conexion = conectarYoutube({ ...p, abrir: (u) => { url = u; } });
  await esperarA(() => url);
  for (const cambios of [{ state: 'falsificado' }, { state: null }, { state: 'falsificado', error: 'access_denied' }]) {
    const ajena = await visitar(url, cambios).respuesta;
    assert.equal(ajena.status, 400);
    assert.doesNotMatch(ajena.html, /falsificado|codigo-1/, 'la respuesta es un texto fijo');
  }
  assert.equal(p.canjes.length, 0);
  assert.equal(existsSync(join(p.dataDir, ARCHIVO_CREDENCIALES)), false);

  // La visita buena, la de Google, sigue siendo atendida después.
  assert.equal((await visitar(url).respuesta).status, 200);
  await conexion;
  assert.equal(p.canjes.length, 1);
  assert.deepEqual(leerCredenciales(p.dataDir), { ...CLIENTE, refreshToken: REFRESCO });
});

test('si solo llegan retornos ajenos, acaba por tiempo y no guarda nada', async (t) => {
  const p = preparar(t);
  await assert.rejects(conectarYoutube({ ...p, plazoMs: 300, abrir: (url) => { visitar(url, { state: 'falsificado' }).respuesta.catch(() => {}); } }), /tiempo/);
  assert.equal(p.canjes.length, 0);
  assert.equal(existsSync(join(p.dataDir, ARCHIVO_CREDENCIALES)), false);
});

test('una vez guardado el permiso es un éxito, aunque el navegador corte antes de recibir la página', async (t) => {
  const p = preparar(t);
  let peticion;
  const fetchFn = async (...args) => {
    const respuesta = await p.fetchFn(...args);
    peticion.destroy(); // el navegador se va justo antes de que haya respuesta
    await new Promise((hecho) => setTimeout(hecho, 30));
    return respuesta;
  };
  const antes = Date.now();
  await conectarYoutube({ ...p, fetchFn, plazoMs: 1500, abrir: (url) => {
    const auth = new URL(url);
    const retorno = new URL(auth.searchParams.get('redirect_uri'));
    retorno.searchParams.set('code', 'codigo-1');
    retorno.searchParams.set('state', auth.searchParams.get('state'));
    peticion = http.get(retorno).on('error', () => {});
  } });
  assert.ok(Date.now() - antes < 1200, 'no espera al plazo');
  assert.deepEqual(leerCredenciales(p.dataDir), { ...CLIENTE, refreshToken: REFRESCO });
  assert.match(p.dicho.join('\n'), /YouTube conectado/);
});

test('si la persona no da permiso, lo dice claro', async (t) => {
  const p = preparar(t);
  await assert.rejects(conectarYoutube({ ...p, abrir: (url) => { visitar(url, { code: null, error: 'access_denied' }); } }), /permiso/);
  assert.equal(p.canjes.length, 0);
});

test('se rinde con un mensaje claro si nadie termina el permiso a tiempo', async (t) => {
  const p = preparar(t);
  await assert.rejects(conectarYoutube({ ...p, abrir: () => {}, plazoMs: 40 }), /tiempo/);
  assert.equal(existsSync(join(p.dataDir, ARCHIVO_CREDENCIALES)), false);
});

test('un archivo que no es el de Google Cloud se rechaza antes de abrir nada', async (t) => {
  const p = preparar(t, { cliente: { type: 'service_account', private_key: 'SECRETO-CLIENTE' } });
  let abierto = false;
  await assert.rejects(conectarYoutube({ ...p, abrir: () => { abierto = true; } }), (error) => {
    assert.match(error.message, /Google Cloud/);
    assert.doesNotMatch(error.message, /SECRETO/);
    return true;
  });
  await assert.rejects(conectarYoutube({ ...p, rutaCliente: join(p.dataDir, 'no-existe.json'), abrir: () => { abierto = true; } }), /No se puede leer/);
  assert.equal(abierto, false);
});
