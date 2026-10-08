import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const estudioPath = path.join(__dirname, '..', 'public', 'estudio.html');
const planoPath = path.join(__dirname, '..', 'public', 'plano.html');
const vpsPlanoPath = path.join(__dirname, '..', 'vps-overlay', 'public', 'plano.html');
const camaraPath = path.join(__dirname, '..', 'public', 'camara.html');
const vpsCamaraPath = path.join(__dirname, '..', 'vps-overlay', 'public', 'camara.html');
const serverPath = path.join(__dirname, '..', 'server.js');
const vpsServerPath = path.join(__dirname, '..', 'vps-overlay', 'server.js');
const wsAuthPath = path.join(__dirname, '..', 'src', 'ws-auth.js');
const vpsWsAuthPath = path.join(__dirname, '..', 'vps-overlay', 'src', 'ws-auth.js');

test('Estudio: SMS button and sheet exist in toolbar and markup', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');

  // Toolbar contains SMS button
  assert.match(content, /id="btn-sms-view"/, 'El botón de SMS debe existir en la barra de herramientas');
  assert.match(content, /aria-label="Mensajes SMS"/, 'El botón de SMS debe tener aria-label accesible');

  // SMS Sheet markup exists
  assert.match(content, /<aside class="sheet" id="sms-sheet"/, 'El aside #sms-sheet debe existir');
  assert.match(content, /id="btn-sms-sheet-refresh"/, 'El botón de actualizar debe existir en el sheet de SMS');
  assert.match(content, /id="sms-sheet-list"/, 'El contenedor de lista #sms-sheet-list debe existir');

  // Included in SHEETS array for exclusive opening
  assert.match(content, /\['sms-sheet',\s*'btn-sms-view'\]/, 'El sheet de SMS debe estar registrado en el array SHEETS');

  // Handlers and rendering functions
  assert.match(content, /function refreshSmsSheet\(\)/, 'Debe existir refreshSmsSheet()');
  assert.match(content, /function renderSmsCards\(/, 'Debe existir renderSmsCards() para renderizar tarjetas SMS');
});

test('Estudio: OBS snapshot button exists in toolbar and triggers setObsPreview', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');

  // Toolbar contains OBS snapshot button next to drawing tools
  assert.match(content, /id="btn-obs-snapshot"/, 'El botón de captura fija de OBS debe existir en la toolbar');
  assert.match(content, /aria-label="Captura fija de OBS en la pizarra"/, 'Debe tener etiqueta aria accesible');

  // Initialization in initBoard
  assert.match(content, /snapBtn\.addEventListener\('click'/, 'El botón de captura OBS debe tener listener de click');
  assert.match(content, /setObsPreview\(!obsPreview\.active\)/, 'Debe alternar setObsPreview');

  // Synced state in setObsPreview
  assert.match(content, /snapButton\.setAttribute\('aria-pressed',\s*String\(visible\)\)/, 'Debe sincronizar aria-pressed en setObsPreview');
});

test('Estudio: Favorite commands with no placeholders send directly without dialog', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');

  // Direct send implementation
  assert.match(content, /async function sendCommandDirect\(command\)/, 'Debe existir sendCommandDirect()');
  assert.match(content, /if \(placeholdersOf\(name\)\.length === 0\) \{\s*sendCommandDirect\(name\);\s*\} else \{\s*startCommand\(name, desc\);\s*\}/,
    'Los favoritos sin parámetros deben ejecutarse directamente con sendCommandDirect');
});

test('Estudio: TTS state is broadcast over panel websocket', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');

  // In refreshTtsButton
  assert.match(content, /panelSend\(\{\s*type:\s*'tts_estado',\s*activo:\s*Boolean\(tts\s*&&\s*tts\.active\)\s*\}\)/,
    'refreshTtsButton debe emitir tts_estado');

  // In connectPanelSocket onopen
  assert.match(content, /socket\.onopen\s*=\s*\(\)\s*=>\s*\{\s*panelSend\(\{\s*type:\s*'tts_estado'/,
    'connectPanelSocket onopen debe sincronizar tts_estado');
});

test('Estudio: Community and support links exist in settings', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');

  assert.match(content, /https:\/\/ko-fi\.com\/C0C11TWR1K/, 'Debe enlazar a Ko-fi');
  assert.match(content, /https:\/\/github\.com\/sponsors\/erbolamm/, 'Debe enlazar a GitHub Sponsors');
  assert.match(content, /Compartir directo/, 'Debe incluir opción de compartir directo');
});

test('Plano (local y VPS): Audio in transparent layer only plays when explicitly active', () => {
  for (const [name, filePath] of [['Local', planoPath], ['VPS', vpsPlanoPath]]) {
    const content = fs.readFileSync(filePath, 'utf8');

    // TTS gate in transparent mode
    assert.match(content, /if \(!ttsActivoEnOverlay && initialTransparent\) \{/,
      `[${name}] En modo transparente el audio TTS debe descartarse si ttsActivoEnOverlay es falso`);

    // Microphone gate in voice reproduction
    assert.match(content, /function reproducirAudioVozPCM\(base64Pcm, sampleRate\) \{\s*if \(!microActivoEnOverlay\) return;/,
      `[${name}] El audio de voz PCM debe silenciarse si microActivoEnOverlay es falso`);

    // WebSocket handling of tts_estado, micro_start, micro_stop
    assert.match(content, /data\.type === 'tts_estado'/, `[${name}] Debe escuchar el evento tts_estado`);
    assert.match(content, /data\.type === 'micro_start'/, `[${name}] Debe escuchar micro_start`);
    assert.match(content, /data\.type === 'micro_stop' \|\| data\.type === 'micro_desactivado'/, `[${name}] Debe escuchar micro_stop`);
  }
});

test('Cámara (local y VPS): Camera stream has no audio and is muted at all levels', () => {
  // Server config viewUrl has &mute=1&noaudio=1
  for (const [name, filePath] of [['Server Local', serverPath], ['Server VPS', vpsServerPath]]) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.match(content, /viewUrl\s*=[\s\S]*&mute=1&noaudio=1/,
      `[${name}] viewUrl en /api/directo/camara/config debe incluir &mute=1&noaudio=1`);
  }

  // Plano overlay in transparent mode disables camera iframe to prevent duplicate stream & audio leak
  for (const [name, filePath] of [['Plano Local', planoPath], ['Plano VPS', vpsPlanoPath]]) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.match(content, /if \(initialTransparent\) \{[\s\S]*cameraIframe\.removeAttribute\('src'\);[\s\S]*cameraIframe\.style\.display = 'none';[\s\S]*return;[\s\S]*\}/,
      `[${name}] initCameraOverlay debe desactivar camera-iframe en initialTransparent`);
    assert.ok(!content.includes('allow="autoplay; camera; microphone"'),
      `[${name}] camera-iframe no debe tener permiso de microphone`);
  }

  // Camara overlay forces &mute=1&noaudio=1 and postMessage mute
  for (const [name, filePath] of [['Camara Local', camaraPath], ['Camara VPS', vpsCamaraPath]]) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.match(content, /&mute=1&noaudio=1/, `[${name}] camara.html debe incluir &mute=1&noaudio=1`);
    assert.match(content, /postMessage\(\{\s*action:\s*'mute'\s*\}, '\*'\)/,
      `[${name}] camara.html debe enviar postMessage mute al iframe`);
  }
});

test('WS Auth (local y VPS): tts_estado is in PUBLIC_EVENTS', () => {
  for (const [name, filePath] of [['Local', wsAuthPath], ['VPS', vpsWsAuthPath]]) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.match(content, /'tts_estado'/, `[${name}] tts_estado debe estar registrado en PUBLIC_EVENTS`);
  }
});

test('WS Auth (local y VPS): saludo_chat is in PUBLIC_EVENTS', () => {
  for (const [name, filePath] of [['Local', wsAuthPath], ['VPS', vpsWsAuthPath]]) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.match(content, /'saludo_chat'/, `[${name}] saludo_chat debe estar registrado en PUBLIC_EVENTS`);
  }
});

test('Estudio: Bienvenida button is removed from chat sheet and stays always active', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');
  assert.doesNotMatch(content, /id="btn-chat-bienvenida"/, 'El botón de bienvenida no debe existir en el encabezado del chat');
  assert.doesNotMatch(content, /function toggleBienvenida\(\)/, 'No debe existir toggleBienvenida()');
});

test('Cámara (local y VPS): Speech bubble for chat greetings exists and never uses innerHTML', () => {
  for (const [name, filePath] of [['Camara Local', camaraPath], ['Camara VPS', vpsCamaraPath]]) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.match(content, /id="ja-bocadillo-saludo"/, `[${name}] Debe contener el elemento #ja-bocadillo-saludo`);
    assert.match(content, /id="ja-bocadillo-texto"/, `[${name}] Debe contener el elemento #ja-bocadillo-texto`);
    assert.match(content, /data\.type === 'saludo_chat'/, `[${name}] Debe escuchar el evento saludo_chat`);
    assert.match(content, /elTexto\.textContent\s*=\s*texto/, `[${name}] Debe asignar texto con textContent exclusivamente`);
    assert.doesNotMatch(content, /elTexto\.innerHTML/, `[${name}] Nunca debe usar innerHTML para el texto del saludo`);
  }
});
