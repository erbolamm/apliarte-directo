/**
 * Credenciales de la API de YouTube (cliente OAuth + refresh token).
 *
 * Viven en DATA_DIR/youtube-oauth.json con permisos 0600, igual que las claves de emisión en
 * config.json. Nada de este módulo escribe en registros ni mete un secreto en un mensaje de error.
 */

import fs from 'node:fs';
import path from 'node:path';

export const ARCHIVO_CREDENCIALES = 'youtube-oauth.json';
const CAMPOS = ['clientId', 'clientSecret', 'refreshToken'];

/** Devuelve los tres valores recortados, o null si falta alguno o no es texto. */
function completas(valor) {
  if (!valor || typeof valor !== 'object') return null;
  const limpio = {};
  for (const campo of CAMPOS) {
    if (typeof valor[campo] !== 'string' || !valor[campo].trim()) return null;
    limpio[campo] = valor[campo].trim();
  }
  return limpio;
}

/**
 * Lee las credenciales guardadas. Nunca lanza: sin archivo, ilegible, roto o incompleto
 * devuelve null, que para quien llama significa "YouTube no está conectado".
 */
export function leerCredenciales(dataDir) {
  try {
    return completas(JSON.parse(fs.readFileSync(path.join(dataDir, ARCHIVO_CREDENCIALES), 'utf8')));
  } catch (_) {
    return null;
  }
}

export function tieneCredenciales(dataDir) {
  return leerCredenciales(dataDir) !== null;
}

/**
 * Guarda las credenciales: archivo temporal 0600 y cambio de nombre, para no dejarlo a medias.
 * El temporal también acaba en `.json`: así lo cubre la regla `data/*.json` de `.gitignore`.
 */
export function guardarCredenciales(dataDir, credenciales) {
  const limpio = completas(credenciales);
  if (!limpio) throw new Error('Credenciales de YouTube incompletas');
  fs.mkdirSync(dataDir, { recursive: true });
  const destino = path.join(dataDir, ARCHIVO_CREDENCIALES);
  const temporal = path.join(dataDir, `youtube-oauth.${process.pid}.${Date.now()}.tmp.json`);
  try {
    fs.writeFileSync(temporal, JSON.stringify(limpio, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporal, destino);
  } catch (error) {
    try { fs.unlinkSync(temporal); } catch (_) {}
    throw error;
  }
}

/**
 * Interpreta el JSON de cliente OAuth que se descarga de Google Cloud. Solo vale el de tipo
 * "Aplicación de escritorio", que trae un objeto `installed`: la conexión vuelve a un puerto libre
 * de este equipo, y eso un cliente de tipo web (objeto `web`) no lo admite.
 */
export function leerClienteOAuth(texto) {
  const invalido = () => new Error('Este archivo no es el de cliente OAuth que se descarga de Google Cloud '
    + '(debe ser de tipo "Aplicación de escritorio" y contener client_id y client_secret).');
  let datos;
  try { datos = JSON.parse(texto); } catch (_) { throw invalido(); }
  if (datos?.web && !datos.installed) {
    throw new Error('Este archivo es de un cliente OAuth de tipo "Aplicación web" y con él la conexión no funciona. '
      + 'Crea en Google Cloud un cliente de tipo "Aplicación de escritorio" y descarga su archivo.');
  }
  const cliente = datos?.installed;
  const clientId = typeof cliente?.client_id === 'string' ? cliente.client_id.trim() : '';
  const clientSecret = typeof cliente?.client_secret === 'string' ? cliente.client_secret.trim() : '';
  if (!clientId || !clientSecret) throw invalido();
  return { clientId, clientSecret };
}
