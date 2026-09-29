import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const serverUrl = existsSync(new URL('../server.js', import.meta.url))
  ? new URL('../server.js', import.meta.url)
  : new URL('../vps-overlay/server.js', import.meta.url);
const adminUrl = existsSync(new URL('../public/admin.html', import.meta.url))
  ? new URL('../public/admin.html', import.meta.url)
  : new URL('../vps-overlay/public/admin.html', import.meta.url);

const vpsServerJs = readFileSync(serverUrl, 'utf8');
const vpsAdminHtml = readFileSync(adminUrl, 'utf8');

// ── 1. Parser y validador de /announce (idéntico al implementado en server.js) ──
function validarYParsearAnuncio(cmdStr) {
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

  return { ok: true, mensaje, color };
}

test('Parser /announce: acepta anuncios normales con color primary por defecto', () => {
  const r = validarYParsearAnuncio('/announce ¡Bienvenidos al directo de ErBolamm!');
  assert.equal(r.ok, true);
  assert.equal(r.mensaje, '¡Bienvenidos al directo de ErBolamm!');
  assert.equal(r.color, 'primary');
});

test('Parser /announce: reconoce colores oficiales de Twitch (blue, green, orange, purple)', () => {
  const rBlue = validarYParsearAnuncio('/announce blue ¡Recordad seguir el canal en redes!');
  assert.equal(rBlue.ok, true);
  assert.equal(rBlue.color, 'blue');
  assert.equal(rBlue.mensaje, '¡Recordad seguir el canal en redes!');

  const rPurple = validarYParsearAnuncio('/announce purple Sorteo activo en 5 minutos');
  assert.equal(rPurple.ok, true);
  assert.equal(rPurple.color, 'purple');
  assert.equal(rPurple.mensaje, 'Sorteo activo en 5 minutos');
});

test('Límite estricto de 500 caracteres de Twitch: no trunca en silencio y avisa con longitud exacta', () => {
  // Exactamente 500 caracteres es válido
  const msg500 = 'a'.repeat(500);
  const r500 = validarYParsearAnuncio('/announce ' + msg500);
  assert.equal(r500.ok, true);
  assert.equal(r500.mensaje.length, 500);

  // 501 caracteres debe rechazarse explícitamente sin truncar
  const msg501 = 'a'.repeat(501);
  const r501 = validarYParsearAnuncio('/announce ' + msg501);
  assert.equal(r501.ok, false);
  assert.match(r501.error, /excede el límite de 500 caracteres de Twitch/);
  assert.match(r501.error, /501 caracteres/);

  // Mensaje de 650 caracteres (ej. texto largo de desplegable)
  const msg650 = 'b'.repeat(650);
  const r650 = validarYParsearAnuncio('/announce orange ' + msg650);
  assert.equal(r650.ok, false);
  assert.match(r650.error, /650 caracteres/);
});

test('Parser /announce: rechaza comandos vacíos o solo color', () => {
  const rVacio = validarYParsearAnuncio('/announce');
  assert.equal(rVacio.ok, false);
  assert.match(rVacio.error, /requiere un mensaje/);

  const rSoloColor = validarYParsearAnuncio('/announce blue');
  assert.equal(rSoloColor.ok, false);
  assert.match(rSoloColor.error, /solo el nombre de un color/);
});

// ── 2. Integración en server.js ──
test('server.js enruta /announce a ejecutarAnuncioHelix y no lo descarta en silencio', () => {
  assert.match(vpsServerJs, /async function ejecutarAnuncioHelix\(cmdStr\)/);
  assert.match(vpsServerJs, /https:\/\/api\.twitch\.tv\/helix\/chat\/announcements/);
  assert.match(vpsServerJs, /else if \(c\.startsWith\('\/announce'\)\)/);
  assert.match(vpsServerJs, /modResultado = await ejecutarAnuncioHelix\(c\)/);
  assert.match(vpsServerJs, /twitchEnviado = Boolean\(modResultado && modResultado\.ok\)/);
});

test('server.js no inserta en el ring de comandos ni retransmite comandos fallidos', () => {
  assert.match(vpsServerJs, /if \(!duplicadoIgnorado && \(!modResultado \|\| modResultado\.ok\)\)/);
});

// ── 3. Contrato en admin.html ──
test('admin.html muestra aviso explícito cuando twitchEnviado es false', () => {
  assert.match(vpsAdminHtml, /data\.twitchEnviado === false/);
  assert.match(vpsAdminHtml, /showToast\('⚠️ No enviado a Twitch: ' \+/);
});

test('admin.html incluye /announce [mensaje] en los comandos predeterminados del bot', () => {
  assert.match(vpsAdminHtml, /\['\/announce \[mensaje\]', 'Publica un anuncio destacado/);
});
