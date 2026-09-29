import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../public/landing.html', import.meta.url), 'utf8');
const mirror = readFileSync(new URL('../vps-overlay/public/landing.html', import.meta.url), 'utf8');

const required = [
  'Instálalo en 3 pasos', 'Qué verás la primera vez', 'Conéctalo a OBS',
  'Problemas frecuentes', 'Avanzado: en tu VPS', 'https://nodejs.org',
  'https://github.com/erbolamm/apliarte-directo/archive/refs/heads/main.zip',
  'git clone https://github.com/erbolamm/apliarte-directo.git',
  'Iniciar directo.command', 'Iniciar directo.bat', 'npm run directo',
  'clic derecho', 'Abrir', 'una sola vez', 'guárdala',
  'http://127.0.0.1:7979/plano?transparente=1',
  'http://127.0.0.1:7979/fondo.html', 'http://127.0.0.1:7979/admin',
  '1920 × 1080', 'Servicio personalizado', 'rtmp://127.0.0.1:1935/live',
  'Credenciales', 'https://ffmpeg.org/download.html',
  'brew install ffmpeg', 'winget install ffmpeg',
  'https://hostinger.es?REFERRALCODE=APLIARTE', 'RELEASE_COMMIT_SHA',
];

test('installation facts and headings are present', () => {
  for (const fact of required) assert.ok(page.includes(fact), `Missing: ${fact}`);
  assert.match(page, /Descargar ZIP/);
  assert.match(page, /cierras? esta ventana/i);
  assert.match(page, /puerto.*(?:ocupado|uso)/i);
  assert.match(page, /Olvidaste la contraseña del panel\?[\s\S]*data\/panel-auth\.json/i);
  assert.match(page, /enlace.*no se muestra/i);
  assert.match(page, /sin ffmpeg.*(?:capa|panel)/i);
});

test('landing copies are identical, static and default to light', () => {
  assert.equal(page, mirror);
  assert.match(page, /<html lang="es" data-theme="light">/);
  assert.match(page, /id="theme-toggle"/);
  assert.doesNotMatch(page, /\bfetch\s*\(|\bWebSocket\s*\(|\bXMLHttpRequest\b|method=["']POST["']/i);
  assert.doesNotMatch(page, /\btitle=/i);
});

test('every shown setup URL or command has an accessible copy button', () => {
  const copyValues = [
    'http://127.0.0.1:7979/plano?transparente=1',
    'http://127.0.0.1:7979/fondo.html',
    'http://127.0.0.1:7979/admin',
    'rtmp://127.0.0.1:1935/live',
    'git clone https://github.com/erbolamm/apliarte-directo.git',
    'npm run directo', 'brew install ffmpeg', 'winget install ffmpeg',
  ];
  for (const value of copyValues) {
    assert.ok(page.includes(`data-copy="${value}"`), `No copy button: ${value}`);
  }
  assert.match(page, /aria-label="Copiar [^"]+"/);
  assert.match(page, /data-tip="Copiado"/);
  assert.match(page, /setTimeout\([\s\S]*?, 3000\)/);
});
