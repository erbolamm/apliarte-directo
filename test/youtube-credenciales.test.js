// Almacén de credenciales de YouTube: DATA_DIR/youtube-oauth.json, solo legible por el dueño.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARCHIVO_CREDENCIALES, guardarCredenciales, leerClienteOAuth, leerCredenciales, tieneCredenciales,
} from '../src/youtube-credenciales.js';

const SECRETOS = { clientId: 'id-123.apps.googleusercontent.com', clientSecret: 'SECRETO-CLIENTE', refreshToken: 'SECRETO-REFRESCO' };

function carpetaTemporal(t) {
  const dir = mkdtempSync(join(tmpdir(), 'yt-cred-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('guarda las credenciales con permisos 0600 y las vuelve a leer', (t) => {
  const dir = join(carpetaTemporal(t), 'aun-no-existe');
  guardarCredenciales(dir, SECRETOS);
  assert.deepEqual(leerCredenciales(dir), SECRETOS);
  assert.equal(tieneCredenciales(dir), true);
  if (process.platform !== 'win32') {
    assert.equal(statSync(join(dir, ARCHIVO_CREDENCIALES)).mode & 0o777, 0o600);
  }
  assert.deepEqual(readdirSync(dir), [ARCHIVO_CREDENCIALES], 'no deja archivos temporales');
});

test('guardar encima de un archivo abierto a todos lo deja en 0600', { skip: process.platform === 'win32' }, (t) => {
  const dir = carpetaTemporal(t);
  writeFileSync(join(dir, ARCHIVO_CREDENCIALES), '{}', { mode: 0o644 });
  guardarCredenciales(dir, SECRETOS);
  assert.equal(statSync(join(dir, ARCHIVO_CREDENCIALES)).mode & 0o777, 0o600);
});

test('el archivo temporal también acaba en .json, para que lo cubra la regla data/*.json de .gitignore', (t) => {
  const dir = carpetaTemporal(t);
  const escritos = [];
  const original = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (ruta, ...resto) => {
    escritos.push({ ruta: String(ruta), opciones: resto[1] });
    return original(ruta, ...resto);
  });
  guardarCredenciales(dir, SECRETOS);
  assert.equal(escritos.length, 1);
  assert.notEqual(escritos[0].ruta, join(dir, ARCHIVO_CREDENCIALES), 'se escribe primero en un temporal');
  assert.match(escritos[0].ruta, /\.json$/);
  assert.equal(escritos[0].opciones.mode, 0o600, 'nace ya con permisos 0600');
  assert.equal(escritos[0].opciones.flag, 'wx');

  // Si el cambio de nombre falla, el temporal no se queda en la carpeta.
  t.mock.method(fs, 'renameSync', () => { throw new Error('disco lleno'); });
  assert.throws(() => guardarCredenciales(dir, SECRETOS), /disco lleno/);
  assert.deepEqual(readdirSync(dir), [ARCHIVO_CREDENCIALES]);
});

test('sin archivo, con archivo roto o incompleto: no configurado, sin lanzar', (t) => {
  const dir = carpetaTemporal(t);
  assert.equal(leerCredenciales(dir), null);
  assert.equal(tieneCredenciales(dir), false);

  const casos = ['{ esto no es json', '[]', 'null', '"texto"',
    JSON.stringify({ clientId: 'a', clientSecret: 'b' }),
    JSON.stringify({ clientId: 'a', clientSecret: 'b', refreshToken: '   ' }),
    JSON.stringify({ clientId: 'a', clientSecret: 'b', refreshToken: 42 })];
  for (const contenido of casos) {
    writeFileSync(join(dir, ARCHIVO_CREDENCIALES), contenido);
    assert.equal(leerCredenciales(dir), null, contenido);
    assert.equal(tieneCredenciales(dir), false, contenido);
  }

  // Ilegible: en el sitio del archivo hay una carpeta.
  const otra = carpetaTemporal(t);
  mkdirSync(join(otra, ARCHIVO_CREDENCIALES));
  assert.equal(leerCredenciales(otra), null);
  assert.equal(leerCredenciales(undefined), null);
});

test('guardar rechaza datos incompletos sin escribir ni mostrar secretos', (t) => {
  const dir = carpetaTemporal(t);
  for (const malo of [null, {}, { ...SECRETOS, refreshToken: '' }, { ...SECRETOS, clientSecret: 7 }]) {
    assert.throws(() => guardarCredenciales(dir, malo), (error) => {
      assert.doesNotMatch(error.message, /SECRETO/);
      return true;
    });
  }
  assert.deepEqual(readdirSync(dir), []);
});

test('lee el JSON de cliente de Google Cloud de tipo "Aplicación de escritorio" (installed)', () => {
  const cuerpo = { client_id: ' id-123 ', client_secret: 'SECRETO-CLIENTE', redirect_uris: ['http://localhost'] };
  assert.deepEqual(leerClienteOAuth(JSON.stringify({ installed: cuerpo })), { clientId: 'id-123', clientSecret: 'SECRETO-CLIENTE' });
});

test('rechaza el cliente de tipo web: el retorno a un puerto libre de este equipo no funciona con él', () => {
  const cuerpo = { client_id: 'id-123', client_secret: 'SECRETO-CLIENTE', redirect_uris: ['https://ejemplo.test/retorno'] };
  assert.throws(() => leerClienteOAuth(JSON.stringify({ web: cuerpo })), (error) => {
    assert.match(error.message, /Aplicación de escritorio/);
    assert.match(error.message, /web/i);
    assert.doesNotMatch(error.message, /SECRETO|id-123/);
    return true;
  });
});

test('rechaza cualquier otro JSON con un error claro y sin secretos', () => {
  const malos = ['no es json SECRETO-CLIENTE', '[]', '{}', 'null',
    JSON.stringify({ type: 'service_account', private_key: 'SECRETO-CLIENTE' }),
    JSON.stringify({ installed: { client_id: 'id-123' } }),
    JSON.stringify({ installed: { client_id: '', client_secret: 'SECRETO-CLIENTE' } }),
    JSON.stringify({ client_id: 'id-123', client_secret: 'SECRETO-CLIENTE' })];
  for (const texto of malos) {
    assert.throws(() => leerClienteOAuth(texto), (error) => {
      assert.match(error.message, /Google Cloud/);
      assert.doesNotMatch(error.message, /SECRETO/);
      return true;
    }, texto.replace(/SECRETO-CLIENTE/g, '…'));
  }
});
