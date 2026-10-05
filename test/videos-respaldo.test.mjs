import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const raiz = path.resolve(__dirname, '..');
const mediosVideos = path.join(raiz, 'medios', 'videos');
const archivoRespaldo = path.join(raiz, 'medios', 'respaldo.mp4');

test('Videos de corte: directorio medios/videos existe y contiene videos validos', () => {
  assert.ok(fs.existsSync(mediosVideos), 'medios/videos/ debe existir');
  const archivos = fs.readdirSync(mediosVideos).filter((f) => f.endsWith('.mp4'));
  assert.ok(archivos.length >= 3, 'Debe haber al menos 3 videos disponibles');
  assert.ok(archivos.includes('pausa-tecnica.mp4'), 'Debe incluir pausa-tecnica.mp4');
  assert.ok(archivos.includes('intro-pianista.mp4'), 'Debe incluir intro-pianista.mp4');
});

test('Videos de corte: medios/respaldo.mp4 existe como archivo canonico', () => {
  assert.ok(fs.existsSync(archivoRespaldo), 'medios/respaldo.mp4 debe existir');
  const stat = fs.statSync(archivoRespaldo);
  assert.ok(stat.size > 10000, 'medios/respaldo.mp4 debe tener contenido valido');
});

test('Videos de corte: server.js expone endpoints de respaldo y ruta no hardcodeada a docker', () => {
  const serverCode = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
  assert.match(serverCode, /\/api\/videos\/respaldo/, 'server.js debe soportar /api/videos/respaldo');
  assert.match(serverCode, /\/api\/videos\/respaldo\/seleccionar/, 'server.js debe soportar seleccionar respaldo');
  assert.match(serverCode, /respaldoActivo/, 'server.js debe devolver respaldoActivo');
  assert.doesNotMatch(serverCode, /const MEDIOS_VIDEOS = '\/app\/medios\/videos';/, 'MEDIOS_VIDEOS no debe estar hardcodeado solo a docker');
});

test('Videos de corte: src/server.js resuelve dinamicamente el respaldo para OBS', () => {
  const srcServerCode = fs.readFileSync(path.join(raiz, 'src', 'server.js'), 'utf8');
  assert.match(srcServerCode, /obtenerRespaldoActivo\(\)/, 'src/server.js debe llamar a obtenerRespaldoActivo()');
  assert.match(srcServerCode, /resolverArchivoRespaldo\(\)/, 'src/server.js debe resolver archivo de respaldo');
  assert.match(srcServerCode, /\/api\/videos\/respaldo\/seleccionar/, 'src/server.js debe exponer endpoint seleccionar');
});

test('Videos de corte: public/admin.html incluye selector y banner de corte OBS', () => {
  const adminHtml = fs.readFileSync(path.join(raiz, 'public', 'admin.html'), 'utf8');
  assert.match(adminHtml, /id="admin-video-respaldo-box"/, 'Debe incluir caja de video de respaldo');
  assert.match(adminHtml, /id="badge-video-respaldo-activo"/, 'Debe incluir badge con video activo');
  assert.match(adminHtml, /btn-admin-respaldo/, 'Debe incluir boton para fijar corte');
  assert.match(adminHtml, /\/api\/videos\/respaldo\/seleccionar/, 'Debe llamar al endpoint de seleccionar respaldo');
});
