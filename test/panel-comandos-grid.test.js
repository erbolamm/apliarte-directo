import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const publicAdminUrl = new URL('../public/admin.html', import.meta.url);
const vpsAdminUrl = new URL('../vps-overlay/public/admin.html', import.meta.url);

const publicAdminHtml = readFileSync(publicAdminUrl, 'utf8');
const vpsAdminHtml = readFileSync(vpsAdminUrl, 'utf8');

test('public/admin.html y vps-overlay/public/admin.html estan 100% sincronizados', () => {
  assert.equal(publicAdminHtml, vpsAdminHtml, 'Ambas copias de admin.html deben ser identicas');
});

test('admin.html implementa la botonera de comandos en grid de 4 columnas', () => {
  assert.match(publicAdminHtml, /class="cmd-grid-4"\s+id="comandos-grid-container"/);
  assert.match(publicAdminHtml, /\.cmd-grid-4\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(4,\s*1fr\);/);
});

test('admin.html contiene los 3 botones fijos de gestion (+ Canal, + Usuario, + Mensaje)', () => {
  assert.match(publicAdminHtml, /id="btn-grid-add-canal"/);
  assert.match(publicAdminHtml, /id="btn-grid-add-usuario"/);
  assert.match(publicAdminHtml, /id="btn-grid-add-mensaje"/);
  assert.match(publicAdminHtml, /\+ Canal/);
  assert.match(publicAdminHtml, /\+ Usuario/);
  assert.match(publicAdminHtml, /\+ Mensaje/);
});

test('admin.html contiene la subvista drill-down con boton de retroceso y contenedor dinamico', () => {
  assert.match(publicAdminHtml, /id="comandos-view-drilldown"/);
  assert.match(publicAdminHtml, /id="btn-drilldown-back"/);
  assert.match(publicAdminHtml, /id="drilldown-title"/);
  assert.match(publicAdminHtml, /id="drilldown-subtitle"/);
  assert.match(publicAdminHtml, /id="drilldown-body"/);
});

test('admin.html define renderComandosGrid, abrirDrillDown y cerrarDrillDown', () => {
  assert.match(publicAdminHtml, /function renderComandosGrid\(\)/);
  assert.match(publicAdminHtml, /function abrirDrillDown\(opts\)/);
  assert.match(publicAdminHtml, /function cerrarDrillDown\(\)/);
});

test('admin.html nombra Emision con icono de antena en la barra de navegacion inferior', () => {
  assert.match(publicAdminHtml, /data-tab="tab-directo"[\s\S]*?<span class="nav-icon">📡<\/span>[\s\S]*?<span class="nav-label">Emisión<\/span>/);
});

// A1 (2026-09-30): the server owns the lists. Presets are only added through the
// explicit button; the browser neither reads nor writes these lists. Behaviour is
// covered in test/panel-persistencia-servidor.test.js.
test('admin.html conserva los presets, pero solo se anaden con el boton explicito', () => {
  assert.match(publicAdminHtml, /const PRESETS_USUARIOS = \[/);
  assert.match(publicAdminHtml, /const PRESETS_CANALES = \[/);
  assert.match(publicAdminHtml, /const PRESETS_MENSAJES = \[/);
  assert.match(publicAdminHtml, /id="btn-cargar-predeterminados"[^>]*aria-label="[^"]+"[^>]*data-tip="[^"]+"/);
  assert.match(publicAdminHtml, /id="listas-estado"[^>]*role="status"/);
  assert.doesNotMatch(publicAdminHtml, /function obtenerListaConFallback\(/);
  assert.doesNotMatch(publicAdminHtml, /guardarListaLocal\(/);
  assert.match(publicAdminHtml, /renderChips\(\);\s*renderComandosGrid\(\);\s*\/\/\s*── Polling/);
});

test('admin.html implementa disposicion Wrap y envio directo a 1 toque para parametros', () => {
  assert.match(publicAdminHtml, /\.drilldown-wrap\s*\{\s*display:\s*flex;\s*flex-wrap:\s*wrap;/);
  assert.match(publicAdminHtml, /\.drilldown-chip-btn\s*\{/);
  assert.match(publicAdminHtml, /USUARIOS GUARDADOS \(1 TOQUE ENVÍA\):/);
  assert.match(publicAdminHtml, /CANALES GUARDADOS \(1 TOQUE ENVÍA\):/);
  assert.doesNotMatch(publicAdminHtml, /id="drilldown-confirm-box"/);
});

test('admin.html ofrece pestana de comandos clasicos como referencia permanente en modal de configuracion', () => {
  assert.match(publicAdminHtml, /id="tab-btn-clasico"/);
  assert.match(publicAdminHtml, /id="seccion-clasico-content"/);
  assert.match(publicAdminHtml, /id="comandos-accordion-list"/);
});

