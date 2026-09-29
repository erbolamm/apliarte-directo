import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const publicAdminUrl = new URL('../public/admin.html', import.meta.url);
const vpsAdminUrl = new URL('../vps-overlay/public/admin.html', import.meta.url);
const serverUrl = new URL('../server.js', import.meta.url);
const vpsServerUrl = new URL('../vps-overlay/server.js', import.meta.url);

const publicAdminHtml = readFileSync(publicAdminUrl, 'utf8');
const vpsAdminHtml = readFileSync(vpsAdminUrl, 'utf8');
const serverJs = readFileSync(serverUrl, 'utf8');
const vpsServerJs = readFileSync(vpsServerUrl, 'utf8');

test('public/admin.html y vps-overlay/public/admin.html permanecen 100% sincronizados', () => {
  assert.equal(publicAdminHtml, vpsAdminHtml, 'Ambas copias de admin.html deben ser identicas');
});

test('admin.html desacopla la navegacion visual usando sessionStorage exclusivo por cliente/pestana', () => {
  assert.match(
    publicAdminHtml,
    /sessionStorage\.setItem\(['"]directo_admin_active_tab_v1['"],\s*targetId\)/,
    'Debe guardar la pestana activa exclusivamente en sessionStorage del navegador'
  );
  assert.match(
    publicAdminHtml,
    /sessionStorage\.getItem\(['"]directo_admin_active_tab_v1['"]\)/,
    'Debe restaurar la pestana activa desde sessionStorage al iniciar'
  );
});

test('admin.html ignora mensajes de navegacion y UI en adminWs.onmessage', () => {
  assert.match(
    publicAdminHtml,
    /data\.type\s*===\s*['"]tab['"]\s*\|\|\s*data\.type\s*===\s*['"]tab_change['"]/,
    'adminWs.onmessage debe filtrar y descartar eventos de pestanas remotos'
  );
  assert.match(
    publicAdminHtml,
    /data\.type\s*===\s*['"]drilldown['"]\s*\|\|\s*data\.type\s*===\s*['"]drill_down['"]/,
    'adminWs.onmessage debe filtrar y descartar eventos de drilldown remotos'
  );
});

test('server.js y vps-overlay/server.js descartan mensajes de navegacion y UI', () => {
  for (const [name, code] of [
    ['server.js', serverJs],
    ['vps-overlay/server.js', vpsServerJs]
  ]) {
    assert.match(
      code,
      /msgType === 'tab' \|\|\s*msgType === 'tab_change' \|\|\s*msgType === 'cambiar_pestana'/,
      `${name} debe interceptar y descartar eventos de pestanas`
    );
    assert.match(
      code,
      /msgType === 'drilldown' \|\|\s*msgType === 'drill_down'/,
      `${name} debe descartar eventos de drill-down`
    );
    assert.match(
      code,
      /msgType === 'ui_state' \|\|\s*msgType === 'navegacion'/,
      `${name} debe descartar eventos de ui_state y navegacion`
    );
  }
});

test('server.js y vps-overlay/server.js restringen retransmisiones a TIPOS_RETRANS_PERMITIDOS', () => {
  for (const [name, code] of [
    ['server.js', serverJs],
    ['vps-overlay/server.js', vpsServerJs]
  ]) {
    assert.match(
      code,
      /const TIPOS_RETRANS_PERMITIDOS = new Set\(\[/,
      `${name} debe definir la lista blanca TIPOS_RETRANS_PERMITIDOS`
    );
    assert.match(
      code,
      /if \(!TIPOS_RETRANS_PERMITIDOS\.has\(msgType\)\) \{\s*return;\s*\}/,
      `${name} debe descartar cualquier mensaje que no este en la lista blanca`
    );
    assert.match(code, /'voz_pcm'/);
    assert.match(code, /'micro_start'/);
    assert.match(code, /'camara_start'/);
    assert.match(code, /'comando_chat'/);
    assert.match(code, /'directo_comando'/);
  }
});
