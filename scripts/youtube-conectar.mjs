#!/usr/bin/env node
// Conexión única del centro con YouTube. Se ejecuta una vez (y de nuevo si el permiso caduca):
//
//   node scripts/youtube-conectar.mjs <archivo JSON del cliente descargado de Google Cloud>
//
// Abre la página de permiso de Google, espera la respuesta en esta misma máquina (127.0.0.1) y
// guarda las credenciales en DATA_DIR/youtube-oauth.json. Nunca muestra un secreto en pantalla:
// la pantalla puede estar saliendo en directo.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comandoAbrir } from './lanzador.mjs';
import { canjearCodigo, estadoCoincide, generarEstado, generarPkce, urlAutorizacion, validarRetorno } from '../src/youtube-api.js';
import { guardarCredenciales, leerClienteOAuth } from '../src/youtube-credenciales.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAZO_MS = 5 * 60_000;
const ESPERA_PAGINA_MS = 2_000; // margen para que la página final llegue al navegador antes de cerrar

/** Abre el navegador. Devuelve false si no se pudo lanzar, para enseñar entonces la dirección. */
function abrirNavegador(url) {
  return new Promise((hecho) => {
    try {
      const [cmd, args] = comandoAbrir(process.platform, url);
      const proceso = spawn(cmd, args, { stdio: 'ignore', detached: true });
      proceso.once('error', () => hecho(false)).once('spawn', () => hecho(true)).unref();
    } catch (_) {
      hecho(false);
    }
  });
}

const pagina = (titulo, texto) => `<!doctype html><html lang="es"><meta charset="utf-8"><title>${titulo}</title>`
  + `<body style="font-family:sans-serif;max-width:32em;margin:4em auto;text-align:center"><h1>${titulo}</h1><p>${texto}</p></body></html>`;

function responder(res, estado, html) {
  return new Promise((hecho) => {
    try {
      // Si el navegador ya cortó, o corta a mitad, no hay nada más que esperar.
      if (res.destroyed || !res.socket || res.socket.destroyed) return hecho();
      res.once('close', hecho);
      res.writeHead(estado, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' });
      res.end(html, hecho);
    } catch (_) {
      hecho(); // el navegador ya no está: no hay a quién responder
    }
  });
}

/**
 * Hace toda la conexión. Rechaza con un mensaje pensado para la persona, sin secretos.
 * `fetchFn`, `abrir` y `decir` se pueden sustituir en las pruebas.
 */
export async function conectarYoutube({ rutaCliente, dataDir, fetchFn = globalThis.fetch, abrir = abrirNavegador,
  decir = console.log, plazoMs = PLAZO_MS }) {
  let texto;
  try { texto = readFileSync(rutaCliente, 'utf8'); } catch (_) {
    throw new Error('No se puede leer el archivo indicado. Comprueba la ruta y vuelve a intentarlo.');
  }
  const { clientId, clientSecret } = leerClienteOAuth(texto);
  const state = generarEstado();
  const pkce = generarPkce();

  const servidor = http.createServer();
  await new Promise((listo, fallo) => servidor.once('error', fallo).listen(0, '127.0.0.1', listo));
  const redirectUri = `http://127.0.0.1:${servidor.address().port}`;
  let temporizador;
  let paginaFinal = Promise.resolve();
  try {
    const terminado = new Promise((hecho, fallo) => {
      temporizador = setTimeout(() => fallo(new Error('Se acabó el tiempo de espera sin recibir el permiso. Vuelve a ejecutar la conexión.')), plazoMs);
      let atendido = false;
      servidor.on('request', async (req, res) => {
        const url = new URL(req.url, redirectUri);
        // El navegador también pide el icono de la página; solo cuenta la primera respuesta real.
        if (url.pathname !== '/' || atendido) return void responder(res, 404, pagina('No encontrado', ''));
        // Una visita sin el `state` de esta petición no viene de Google: se rechaza y se sigue esperando.
        if (!estadoCoincide(url.searchParams, state)) {
          return void responder(res, 400, pagina('Petición no válida', 'Esta dirección no corresponde a la conexión en curso.'));
        }
        atendido = true;
        try {
          const code = validarRetorno(url.searchParams, state);
          const refreshToken = await canjearCodigo({ clientId, clientSecret, code, codeVerifier: pkce.verifier, redirectUri,
            fetchFn, signal: AbortSignal.timeout(30_000) });
          guardarCredenciales(dataDir, { clientId, clientSecret, refreshToken });
          // Guardado es conectado: el resultado no depende de que la página llegue al navegador.
          hecho();
          paginaFinal = responder(res, 200, pagina('YouTube conectado', 'Ya puedes cerrar esta pestaña y volver al programa.'));
        } catch (error) {
          fallo(error);
          paginaFinal = responder(res, 400, pagina('No se pudo conectar', 'Vuelve al programa para ver qué ha pasado.'));
        }
      });
    });
    terminado.catch(() => {}); // se atiende más abajo; que no quede suelto mientras se abre el navegador
    const url = urlAutorizacion({ clientId, redirectUri, state, codeChallenge: pkce.challenge });
    decir('Se va a abrir tu navegador para dar permiso al centro en tu canal de YouTube.');
    let abierto;
    try { abierto = (await abrir(url)) !== false; } catch (_) { abierto = false; }
    if (!abierto) {
      // La dirección solo se enseña si hace falta: la pantalla puede estar saliendo en directo.
      decir('No se ha podido abrir el navegador, por eso se muestra aquí la dirección. Cópiala en el navegador de este mismo ordenador:');
      decir(url);
    }
    await terminado;
    decir('YouTube conectado. El permiso ha quedado guardado en este ordenador.');
  } finally {
    clearTimeout(temporizador);
    // Se da un momento a la página final; si el navegador ya se fue, no se espera más.
    let espera;
    await Promise.race([
      Promise.resolve(paginaFinal).catch(() => {}),
      new Promise((hecho) => { espera = setTimeout(hecho, ESPERA_PAGINA_MS); }),
    ]);
    clearTimeout(espera);
    servidor.close();
    servidor.closeAllConnections();
  }
}

// Solo al ejecutarlo directamente: importarlo (pruebas) no abre nada ni escucha en ningún puerto.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rutaCliente = process.argv[2];
  if (!rutaCliente) {
    console.error('Falta el archivo de Google Cloud.\nUso: node scripts/youtube-conectar.mjs <archivo JSON del cliente>');
    process.exit(1);
  }
  // Misma carpeta de datos que usa el centro (src/server.js).
  const dataDir = process.env.DATA_DIR || join(RAIZ, 'data');
  conectarYoutube({ rutaCliente, dataDir }).then(() => process.exit(0), (error) => {
    console.error(`No se pudo conectar YouTube: ${error.message}`);
    process.exit(1);
  });
}
