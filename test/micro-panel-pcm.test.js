import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const adminUrl = existsSync(new URL('../public/admin.html', import.meta.url))
  ? new URL('../public/admin.html', import.meta.url)
  : new URL('../vps-overlay/public/admin.html', import.meta.url);
const adminHtml = readFileSync(adminUrl, 'utf8');

const vpsAdminHtml = existsSync(new URL('../vps-overlay/public/admin.html', import.meta.url))
  ? readFileSync(new URL('../vps-overlay/public/admin.html', import.meta.url), 'utf8')
  : adminHtml;

const planoHtml = existsSync(new URL('../public/plano.html', import.meta.url))
  ? readFileSync(new URL('../public/plano.html', import.meta.url), 'utf8')
  : '';

const serverUrl = existsSync(new URL('../server.js', import.meta.url))
  ? new URL('../server.js', import.meta.url)
  : new URL('../vps-overlay/server.js', import.meta.url);
const serverJs = readFileSync(serverUrl, 'utf8');

test('admin.html transmite voz_pcm directamente por WebSocket con ScriptProcessor y vúmetro unificado', () => {
  for (const [name, content] of [['public/admin.html', adminHtml]]) {
    assert.match(content, /createScriptProcessor\(4096,\s*1,\s*1\)/, `${name} debe usar ScriptProcessor para capturar audio local`);
    assert.match(content, /type:\s*['"]voz_pcm['"]/, `${name} debe enviar paquetes voz_pcm por WebSocket`);
    assert.match(content, /maxAmp\s*<\s*0\.001/, `${name} debe descartar silencio digital para ahorrar red`);
    assert.match(content, /createGain\(\)/, `${name} debe crear muteGain para evitar eco por altavoz`);
    assert.doesNotMatch(content, /pushMicUrl/, `${name} no debe usar VDO.Ninja en iframe oculto para el micrófono`);
  }
});

test('server.js retransmite micro_start y micro_stop a OBS y gestiona emisor único', () => {
  // Despues del refactor de sender-authz, la deteccion de tipo se hace
  // por parsed.type top-level (case en switch), NO por substring del
  // texto crudo. Verificamos que el switch dispatch existe.
  assert.match(serverJs, /case 'micro_start':/, 'server.js debe despachar micro_start por parsed.type');
  assert.match(serverJs, /case 'micro_stop':/, 'server.js debe despachar micro_stop por parsed.type');
  assert.match(serverJs, /client !== ws && client\.readyState === 1/, 'server.js debe emitir micro_start/micro_stop a los demás clientes');
});

test('plano.html reproduce voz_pcm con ganancia potente y anima boca según RMS real', () => {
  assert.match(planoHtml, /function reproducirAudioVozPCM/);
  assert.match(planoHtml, /obsVoiceGainNode\.gain\.value\s*=\s*2\.4/);
  assert.match(planoHtml, /rms\s*>=\s*0\.02/);
  assert.doesNotMatch(planoHtml, /animarBocaJa\(300\)/, 'plano.html no debe forzar 300s de boca continua en micro_start');
});
