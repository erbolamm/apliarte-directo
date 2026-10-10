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

test('Estudio: sheets are full screen with toolbar prioritized and Alerats mapped to Alertas', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');

  // Sheets are full-screen over the stage
  assert.match(content, /\.sheet\s*\{[^}]*width:\s*100vw;/, 'Las pestañas .sheet deben ocupar el ancho completo');
  assert.match(content, /\.sheet\s*\{[^}]*left:\s*0;/, 'Las pestañas .sheet deben alinearse a la izquierda');

  // Toolbar has higher z-index to allow switching between sheets
  assert.match(content, /\.toolbar\s*\{[^}]*z-index:\s*25;/, 'La barra de herramientas debe tener z-index prioritario');

  // Alerats is mapped to Alertas in scene button rendering
  assert.match(content, /scene === 'Alerats' \? 'Alertas' : scene/, 'La escena Alerats debe mostrarse como Alertas');

  // Settings is a full-screen sheet integrated in SHEETS with bottom toolbar button
  assert.match(content, /id="settings-sheet"/, 'Ajustes debe ser un panel sheet con id settings-sheet');
  assert.match(content, /\['settings-sheet',\s*'btn-settings-view'\]/, 'Ajustes debe estar registrado en SHEETS para alternar con la botonera');
  assert.match(content, /id="btn-settings-view"/, 'El botón de ajustes debe tener id btn-settings-view en la botonera');
});

test('Estudio: tools sheet, toolbar dynamism (rest macro-deck vs active fitted) and layers panel', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');

  // 1. Herramientas de dibujo en hoja a pantalla completa (tools-sheet)
  assert.match(content, /<aside class="sheet tools-sheet" id="tools-sheet"/, 'tools-sheet debe existir como un sheet a pantalla completa');
  assert.match(content, /\['tools-sheet',\s*'btn-draw-menu'\]/, 'tools-sheet debe estar registrado en el array SHEETS');
  assert.match(content, /id="btn-deactivate-board"/, 'Debe incluir botón para poner pizarra en reposo');
  assert.match(content, /id="btn-sheet-undo"/, 'Debe incluir botón deshacer en tools-sheet');
  assert.match(content, /id="btn-sheet-redo"/, 'Debe incluir botón rehacer en tools-sheet');
  assert.match(content, /id="btn-sheet-obs-snapshot"/, 'Debe incluir botón captura OBS en tools-sheet');
  assert.match(content, /id="btn-sheet-clear"/, 'Debe incluir botón limpiar en tools-sheet');

  // 2. Unificación y eliminación del botón independiente btn-toggle-board
  assert.doesNotMatch(content, /id="btn-toggle-board"/, 'btn-toggle-board debe desaparecer de la barra de herramientas');

  // 3. Dinamismo de toolbar según estado de pizarra (reposo vs activa)
  assert.match(content, /#view-studio\.board-at-rest\s+\.toolbar/, 'Debe existir regla CSS para toolbar en reposo');
  assert.match(content, /#view-studio\.board-at-rest\s+\.toolbar\s+\.icon-btn\s*\{[^}]*68px/, 'Los botones en reposo deben ser macro-deck grandes (68px)');
  assert.match(content, /#view-studio\.board-is-active\s+\.toolbar/, 'Debe existir regla CSS para toolbar cuando la pizarra está activa');
  assert.match(content, /#view-studio\.board-is-active\s+\.toolbar\s*\{[^}]*width:\s*100%/, 'La toolbar activa debe ocupar el 100% estilo fitted');
  assert.match(content, /studioView\.classList\.toggle\('board-is-active',\s*board\.active\)/, 'setBoardActive debe conmutar board-is-active');
  assert.match(content, /studioView\.classList\.toggle\('board-at-rest',\s*!board\.active\)/, 'setBoardActive debe conmutar board-at-rest');

  // 4. Capas móviles estilo Excalidraw en lateral derecho
  assert.match(content, /<aside class="layers-panel" id="layers-panel"/, 'El panel de capas #layers-panel debe existir');
  assert.match(content, /id="btn-toggle-layers"/, 'Debe existir botón de pestaña #btn-toggle-layers');
  assert.match(content, /id="layers-count-badge"/, 'Debe existir badge de conteo de capas');
  assert.match(content, /id="layers-list"/, 'Debe existir lista de capas #layers-list');
  assert.match(content, /id="layers-actions-bar"/, 'Debe existir barra de acciones de capas');
  assert.match(content, /id="btn-layer-up"/, 'Debe existir botón subir capa');
  assert.match(content, /id="btn-layer-down"/, 'Debe existir botón bajar capa');
  assert.match(content, /id="btn-layer-delete"/, 'Debe existir botón eliminar capa');
  assert.match(content, /function getLayers\(\)/, 'Debe existir función getLayers()');
  assert.match(content, /function updateLayersList\(\)/, 'Debe existir función updateLayersList()');
  assert.match(content, /board\.draggingLayer/, 'Debe soportar arrastre y movimiento de capa sobre el lienzo');
});

test('Estudio: Pestaña de usuarios activos y moderación con Time Out y Ban en Ajustes', () => {
  const content = fs.readFileSync('public/estudio.html', 'utf8');

  // 1. Registro en pestañas de ajustes
  assert.match(content, /id:\s*'users',\s*label:\s*'Usuarios y Moderación'/, 'SETTINGS_TABS debe incluir users');

  // 2. Estado usersModeration y agregación reactiva
  assert.match(content, /const usersModeration =/, 'usersModeration debe estar definido');
  assert.match(content, /function getConsolidatedUsers\(\)/, 'getConsolidatedUsers debe estar definida');
  assert.match(content, /async function loadActiveUsers\(\)/, 'loadActiveUsers debe estar definida');

  // 3. Acciones de moderación: Time Out, Ban/Desban, Liberar Avatar
  assert.match(content, /async function applyUserTimeout\(username,\s*seconds/, 'applyUserTimeout debe existir');
  assert.match(content, /async function toggleUserBan\(username\)/, 'toggleUserBan debe existir');
  assert.match(content, /async function freeUserAvatar\(username\)/, 'freeUserAvatar debe existir');

  // 4. Renderer de la pestaña users y botones táctiles
  assert.match(content, /settingsRenderers\.users\s*=\s*\(panel\)\s*=>/, 'settingsRenderers.users debe existir');
  assert.match(content, /'⏱️ Time Out'/, 'Debe existir botón táctil de Time Out');
  assert.match(content, /isBanned\s*\?\s*'✅ Desban'\s*:\s*'🚫 Ban'/, 'Debe existir botón conmutable de Ban/Desban');
  assert.match(content, /'Lib\. Avatar'/, 'Debe existir botón de liberar avatar para usuarios con avatar');

  // 5. Moderación manual rápida y buscador en vivo
  assert.match(content, /@usuario para moderar manual…/, 'Debe incluir campo de moderación manual');
  assert.match(content, /Buscar usuario o avatar…/, 'Debe incluir buscador de usuarios en vivo');

  // 6. Actualización reactiva por websocket (avatares_estado, chat_mensaje, sms_nuevo)
  assert.match(content, /if\s*\(typeof tabOpen === 'function' && tabOpen\('users'\)\)\s*selectSettingsTab\('users'\)/, 'Socket debe refrescar pestaña users cuando está abierta');
});



