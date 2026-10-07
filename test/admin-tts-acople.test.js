import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const publicAdminPath = new URL('../public/admin.html', import.meta.url);
const vpsAdminPath = new URL('../vps-overlay/public/admin.html', import.meta.url);
const ttsTwitchPath = new URL('../public/tts-twitch.html', import.meta.url);
const ttsMultiPath = new URL('../public/tts-multiplataforma.html', import.meta.url);

test('tts-twitch.html y tts-multiplataforma.html existen intactos como referencia', () => {
  assert.equal(existsSync(ttsTwitchPath), true, 'tts-twitch.html debe existir');
  assert.equal(existsSync(ttsMultiPath), true, 'tts-multiplataforma.html debe existir');
});

test('public/admin.html y vps-overlay/public/admin.html permanecen 100% identicos byte a byte', () => {
  const publicAdmin = readFileSync(publicAdminPath, 'utf8');
  const vpsAdmin = readFileSync(vpsAdminPath, 'utf8');
  assert.equal(publicAdmin, vpsAdmin, 'Ambas copias de admin.html deben ser identicas');
});

test('admin.html implementa el motor TTS robusto en segundo plano con cola secuencial', () => {
  const html = readFileSync(publicAdminPath, 'utf8');
  
  // Elementos UI de control y feedback
  assert.match(html, /id="tts-canal"/, 'Debe incluir input para configurar canal');
  assert.match(html, /id="tts-voz"/, 'Debe incluir selector de voz');
  assert.match(html, /id="badge-tts-bg"/, 'Debe incluir badge para estado del apoyo en segundo plano');
  assert.match(html, /id="tts-opt-sonido"/, 'Debe incluir opcion de sonido de aviso');
  assert.match(html, /id="tts-opt-comandos"/, 'Debe incluir opcion para omitir comandos');
  assert.match(html, /id="tts-opt-emojis"/, 'Debe incluir opcion para omitir emojis');
  assert.match(html, /id="tts-opt-enlaces"/, 'Debe incluir opcion para no leer URLs');
  assert.match(html, /id="tts-registro"/, 'Debe incluir feed de registro visual de voz');
  assert.match(html, /id="audio-aviso-tts"[^>]*src="\/sonidos\/aviso-mensaje\.mp3"/, 'Debe incluir elemento de audio para campanada');

  // Logica interna del motor TTS acoplado
  assert.match(html, /function crearTtsBackground\(/, 'Debe implementar crearTtsBackground');
  assert.match(html, /const colaTts = \[\];/, 'Debe gestionar cola secuencial');
  assert.match(html, /function encolarTts\(/, 'Debe encolar mensajes');
  assert.match(html, /function procesarColaTts\(/, 'Debe procesar cola secuencialmente');
  assert.match(html, /function asignarVozAutomatica\(/, 'Debe asignar voces deterministas por usuario');
  assert.match(html, /function hashUsuario\(/, 'Debe calcular hash determinista');
  assert.match(html, /function limpiarParaVoz\(/, 'Debe sanitizar emojis y URLs');
  assert.match(html, /function parsearIrc\(/, 'Debe parsear tags y comandos IRC de Twitch');
  assert.match(html, /CAP REQ :twitch\.tv\/tags twitch\.tv\/commands/, 'Debe solicitar tags de Twitch para display-name');
  assert.match(html, /speechSynthesis\.speak\(new SpeechSynthesisUtterance\(''\)\)/, 'Debe desbloquear sintesis de voz al hacer clic');
});
