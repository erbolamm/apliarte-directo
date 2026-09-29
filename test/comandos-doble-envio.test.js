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

test('admin.html previene doble envío con comandoEnVuelo y cooldown de cliente', () => {
  assert.match(vpsAdminHtml, /let comandoEnVuelo = false;/);
  assert.match(vpsAdminHtml, /COOLDOWN_CLIENTE_MS = 1500;/);
  assert.match(vpsAdminHtml, /if \(comandoEnVuelo \|\| \(cmd === ultimoComandoEnviado\.texto/);
});

test('admin.html deshabilita temporalmente el botón btn-quick-send para prevenir rebote físico', () => {
  assert.match(vpsAdminHtml, /document\.querySelectorAll\('\.btn-quick-send'\)\.forEach/);
  assert.match(vpsAdminHtml, /btn\.disabled = true;/);
  assert.match(vpsAdminHtml, /btn\.style\.opacity = '0\.6';/);
});

test('admin.html deshabilita temporalmente el botón btn-acc-send para prevenir rebote físico', () => {
  assert.match(vpsAdminHtml, /container\.querySelectorAll\('\.btn-acc-send'\)\.forEach/);
  assert.match(vpsAdminHtml, /btn\.disabled = true;/);
});

test('server.js define cooldown de antirreentrancia para comandos de Twitch', () => {
  assert.match(vpsServerJs, /const cooldownComandosTwitch = new Map\(\);/);
  assert.match(vpsServerJs, /const COOLDOWN_COMANDO_MS = 2000;/);
  assert.match(vpsServerJs, /duplicadoIgnorado = true;/);
  assert.match(vpsServerJs, /cooldownComandosTwitch\.set\(c, ahora\);/);
});

test('la deduplicación del servidor ignora ráfagas repetidas en menos de COOLDOWN_COMANDO_MS', () => {
  const cooldownMap = new Map();
  const COOLDOWN_MS = 2000;
  let sentToTwitchCount = 0;

  function procesarComandoMock(comando, clockNow) {
    const c = String(comando || '').trim();
    const ultimoEnvio = cooldownMap.get(c);
    if (ultimoEnvio !== undefined && (clockNow - ultimoEnvio < COOLDOWN_MS) && !c.startsWith('/')) {
      return { ok: true, duplicadoIgnorado: true, twitchEnviado: false };
    }
    cooldownMap.set(c, clockNow);
    sentToTwitchCount++;
    return { ok: true, duplicadoIgnorado: false, twitchEnviado: true };
  }

  // 1. Primer envío a t=1000 ms
  const r1 = procesarComandoMock('¡Bienvenidos al directo!', 1000);
  assert.equal(r1.duplicadoIgnorado, false);
  assert.equal(r1.twitchEnviado, true);
  assert.equal(sentToTwitchCount, 1);

  // 2. Doble pulsación rápida (rebote táctil a t=1075 ms, +75 ms)
  const r2 = procesarComandoMock('¡Bienvenidos al directo!', 1075);
  assert.equal(r2.duplicadoIgnorado, true);
  assert.equal(r2.twitchEnviado, false);
  assert.equal(sentToTwitchCount, 1, 'no debe enviarse a Twitch en ráfaga rápida');

  // 3. Otro comando diferente a t=1100 ms pasa sin problema
  const r3 = procesarComandoMock('!repo', 1100);
  assert.equal(r3.duplicadoIgnorado, false);
  assert.equal(r3.twitchEnviado, true);
  assert.equal(sentToTwitchCount, 2);

  // 4. Tras vencer el cooldown (t=3100 ms, >2000 ms después) se vuelve a permitir
  const r4 = procesarComandoMock('¡Bienvenidos al directo!', 3100);
  assert.equal(r4.duplicadoIgnorado, false);
  assert.equal(r4.twitchEnviado, true);
  assert.equal(sentToTwitchCount, 3);
});
