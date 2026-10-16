import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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

function sliceBetween(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  assert.notEqual(start, -1, `No se encuentra "${startMarker}"`);
  const end = content.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `No se encuentra "${endMarker}" tras "${startMarker}"`);
  return content.slice(start, end);
}
const boardPropsMarkup = (content) => sliceBetween(content, '<aside class="board-props" id="board-props"', '</aside>');

test('Estudio: Unificación de Mensajería (Chat en vivo y Buzón SMS) en botón y vista conmutada', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');

  // 1. Botón unificado de mensajería en la barra inferior (reemplazando botones redundantes)
  assert.match(content, /id="btn-mensajeria-view"/, 'El botón unificado de mensajería debe existir en la barra de herramientas');
  assert.match(content, /aria-label="Mensajería \(Chat y SMS\)"/, 'El botón de mensajería debe tener aria-label accesible');
  assert.doesNotMatch(content, /id="btn-chat-view"/, 'btn-chat-view independiente ya no debe existir en la barra');
  assert.doesNotMatch(content, /id="btn-sms-view"/, 'btn-sms-view independiente ya no debe existir en la barra');

  // 2. Selector de pestañas interno en la vista modal de mensajería
  assert.match(content, /id="btn-msg-tab-chat"/, 'Debe existir la pestaña [💬 Chat en Vivo]');
  assert.match(content, /id="btn-msg-tab-sms"/, 'Debe existir la pestaña [📱 Buzón SMS]');
  assert.match(content, /id="btn-msg-tab-contexto"/, 'Debe existir la pestaña [📌 Contexto]');
  assert.match(content, /function selectMensajeriaTab\(/, 'Debe existir selectMensajeriaTab()');

  // 3. Contenedores de chat y sms en la misma vista
  assert.match(content, /id="chat-live-feed"/, 'El contenedor de chat en vivo debe existir');
  assert.match(content, /id="sms-sheet-list"/, 'El contenedor de lista #sms-sheet-list debe existir');
  assert.match(content, /id="btn-sms-sheet-refresh"/, 'El botón de actualizar debe existir en la sección SMS');

  // 4. Ingesta combinada de chat (Twitch y YouTube)
  assert.match(content, /msg\.plataforma === 'youtube'\s*\?\s*'🔴'\s*:\s*'🟣'/, 'El feed debe mostrar distintivo para YouTube y Twitch');

  // 5. Handlers y renderizado
  assert.match(content, /function refreshSmsSheet\(\)/, 'Debe existir refreshSmsSheet()');
  assert.match(content, /function renderSmsCards\(/, 'Debe existir renderSmsCards() para renderizar tarjetas SMS');
});

test('Estudio: OBS snapshot button lives in the floating board panel and triggers setObsPreview', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');

  // The snapshot button moved from the bottom toolbar to the floating board panel
  assert.doesNotMatch(content, /id="btn-obs-snapshot"/, 'El botón de captura OBS ya no debe existir en la toolbar');
  assert.match(boardPropsMarkup(content), /id="btn-sheet-obs-snapshot"[^>]*aria-pressed="false"/,
    'El botón de captura OBS debe existir en el panel flotante de la pizarra');

  // Initialization in initBoard
  assert.match(content, /const snapBtn = \$\('btn-sheet-obs-snapshot'\)/, 'initBoard debe usar el botón del panel flotante');
  assert.match(content, /snapBtn\.addEventListener\('click'/, 'El botón de captura OBS debe tener listener de click');
  assert.match(content, /setObsPreview\(!obsPreview\.active\)/, 'Debe alternar setObsPreview');

  // Synced state in setObsPreview
  assert.match(content, /const snapButton = \$\('btn-sheet-obs-snapshot'\)/, 'setObsPreview debe sincronizar el botón del panel flotante');
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

test('Estudio: Excalidraw-style floating board UI, toolbar dynamism (rest macro-deck vs active fitted) and layers panel', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');
  const toolbar = sliceBetween(content, '<footer class="toolbar" id="studio-toolbar">', '</footer>');
  const topbar = sliceBetween(content, '<div class="board-topbar" id="board-topbar"', '<aside class="board-props"');
  const props = boardPropsMarkup(content);

  // 1a. La botonera inferior solo conserva el pincel para la pizarra
  assert.match(toolbar, /id="btn-draw-menu"[^>]*aria-pressed="false"/, 'btn-draw-menu debe seguir en la toolbar como conmutador');
  ['btn-obs-snapshot', 'btn-undo', 'btn-redo', 'btn-clear'].forEach((id) => {
    assert.doesNotMatch(content, new RegExp(`id="${id}"`), `${id} debe desaparecer de la toolbar inferior`);
    assert.doesNotMatch(content, new RegExp(`\\$\\('${id}'\\)`), `El código no debe buscar ya ${id}`);
  });
  assert.match(toolbar, /id="btn-draw-menu"[^>]*><\/button>\s*<button[^>]*id="btn-device-camera"/,
    'Tras el pincel no deben quedar botones ni separadores de dibujo');
  ['btn-device-camera', 'btn-tablet-mic', 'btn-tts', 'btn-mensajeria-view', 'btn-commands-view', 'btn-obs-menu', 'btn-pantalla-negra', 'btn-settings-view'].forEach((id) => {
    assert.match(toolbar, new RegExp(`id="${id}"`), `${id} debe mantenerse en la toolbar`);
  });

  // 1b. Ya no hay hoja modal de herramientas: el pincel conmuta la pizarra
  assert.doesNotMatch(content, /id="tools-sheet"/, 'tools-sheet no debe existir como hoja modal');
  assert.doesNotMatch(content, /'tools-sheet'/, 'tools-sheet no debe registrarse en SHEETS ni abrirse');
  assert.match(content, /drawButton\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*closeSheets\(\);\s*setBoardActive\(!board\.active\);/,
    'btn-draw-menu debe alternar la pizarra entre activa y reposo');
  assert.match(content, /drawButton\.classList\.toggle\('active',\s*board\.active\)/, 'Debe sincronizar la clase active del pincel');
  assert.match(content, /drawButton\.setAttribute\('aria-pressed',\s*String\(board\.active\)\)/, 'Debe sincronizar aria-pressed del pincel');
  assert.doesNotMatch(sliceBetween(content, "canvas.addEventListener('pointerdown'", '});'), /closeSheets\(\)/,
    'Dibujar sobre el lienzo no debe cerrar paneles');

  // 1c. Barra cenital flotante de herramientas
  assert.match(topbar, /id="tools-group"/, 'La barra cenital debe contener tools-group');
  assert.match(topbar, /id="shape-fill"/, 'La barra cenital debe incluir el control de relleno');
  assert.match(topbar, /id="shape-dash"/, 'La barra cenital debe incluir el control de línea discontinua');
  assert.match(content, /\.board-topbar,\s*\.board-props\s*\{[^}]*display:\s*none;[^}]*position:\s*fixed;[^}]*z-index:\s*19;/,
    'Los paneles flotantes deben estar ocultos por defecto, fijos y bajo las hojas');
  assert.match(content, /\.board-topbar\s*\{[^}]*top:\s*12px;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/,
    'La barra cenital debe flotar centrada arriba');
  assert.match(content, /#view-studio\.board-is-active\s+\.board-topbar\s*\{\s*display:\s*flex;/, 'La barra cenital solo se ve con la pizarra activa');
  ['select', 'pen', 'highlighter', 'line', 'arrow', 'arrow2', 'rect', 'ellipse', 'diamond', 'star', 'cloud', 'bubble', 'text', 'eraser'].forEach((tool) => {
    assert.match(content, new RegExp(`\\["${tool}",`), `BOARD_TOOLS debe incluir ${tool}`);
  });

  // 1d. Panel lateral flotante de estilos y acciones
  assert.match(content, /\.board-props\s*\{[^}]*left:\s*12px;[^}]*top:\s*72px;[^}]*max-width:\s*280px;[^}]*max-height:\s*calc\(100vh - 160px\);[^}]*overflow-y:\s*auto;/,
    'El panel lateral debe flotar a la izquierda con tamaño acotado');
  assert.match(content, /#view-studio\.board-is-active\s+\.board-props\s*\{\s*display:\s*grid;/, 'El panel lateral solo se ve con la pizarra activa');
  ['palette-group', 'custom-color', 'stroke-presets', 'size-range', 'allow-touch', 'btn-sheet-undo', 'btn-sheet-redo',
    'btn-sheet-obs-snapshot', 'obs-interval', 'btn-sheet-clear', 'btn-deactivate-board'].forEach((id) => {
    assert.match(props, new RegExp(`id="${id}"`), `El panel lateral debe incluir ${id}`);
  });
  assert.match(content, /\$\('btn-sheet-undo'\)\.addEventListener\('click',\s*undoStroke\)/, 'Deshacer debe funcionar desde el panel flotante');
  assert.match(content, /\$\('btn-sheet-redo'\)\.addEventListener\('click',\s*redoStroke\)/, 'Rehacer debe funcionar desde el panel flotante');
  assert.match(content, /const clearButton = \$\('btn-sheet-clear'\)/, 'Limpiar debe funcionar desde el panel flotante');
  assert.match(content, /\$\('btn-deactivate-board'\)\.addEventListener\('click',\s*\(\)\s*=>\s*setBoardActive\(false\)\)/,
    'Poner en reposo debe desactivar la pizarra');

  // 2. Unificación y eliminación del botón independiente btn-toggle-board
  assert.doesNotMatch(content, /id="btn-toggle-board"/, 'btn-toggle-board debe desaparecer de la barra de herramientas');

  // 3. Dinamismo de toolbar según estado de pizarra (reposo vs activa)
  assert.match(content, /#view-studio\.board-at-rest\s+\.toolbar/, 'Debe existir regla CSS para toolbar en reposo');
  assert.match(content, /#view-studio\.board-at-rest\s+\.toolbar\s+\.icon-btn\s*\{[^}]*68px/, 'Los botones en reposo deben ser macro-deck grandes (68px)');
  assert.match(content, /#view-studio\.board-is-active\s+\.toolbar/, 'Debe existir regla CSS para toolbar cuando la pizarra está activa');
  assert.match(content, /#view-studio\.board-is-active\s+\.toolbar\s*\{[^}]*width:\s*100%/, 'La toolbar activa debe ocupar el 100% estilo fitted');
  assert.match(content, /studioView\.classList\.toggle\('board-is-active',\s*board\.active\)/, 'setBoardActive debe conmutar board-is-active');
  assert.match(content, /studioView\.classList\.toggle\('board-at-rest',\s*!board\.active\)/, 'setBoardActive debe conmutar board-at-rest');
  // 3.1. En reposo con hoja abierta: toolbar acoplada inferior para no tapar el contenido
  assert.match(content, /#view-studio\.board-at-rest:has\(\.sheet:not\(\[hidden\]\)\)\s+\.toolbar/,
    'Debe existir regla para acoplar toolbar abajo en reposo si hay una hoja abierta');
  assert.match(content, /#view-studio\.board-at-rest\.has-sheet-open\s+\.toolbar/,
    'Debe existir selector has-sheet-open de respaldo');
  assert.match(content, /\$\('view-studio'\)\?\.classList\.add\('has-sheet-open'\)/,
    'openSheet debe activar has-sheet-open');
  assert.match(content, /\$\('view-studio'\)\?\.classList\.remove\('has-sheet-open'\)/,
    'closeSheets debe retirar has-sheet-open');

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

test('Estudio: Botones de alta rápida en Ajustes > Comandos (+ Usuario, + Mensaje, + Canal, + Comando)', () => {
  const content = fs.readFileSync('public/estudio.html', 'utf8');

  // 1. Barra de acciones rápidas superior en settingsRenderers.commands
  assert.match(content, /commands-quick-bar/, 'Debe existir la barra de acciones rápidas commands-quick-bar');

  // 2. Botones de alta inmediata conectados a openItem
  assert.match(content, /settingsButton\(quickBar,\s*'\+\s*Añadir Usuario',\s*\(\)\s*=>\s*openItem\('usuario'\)\)/, 'Debe existir botón + Añadir Usuario');
  assert.match(content, /settingsButton\(quickBar,\s*'\+\s*Añadir Mensaje',\s*\(\)\s*=>\s*openItem\('mensaje'\)\)/, 'Debe existir botón + Añadir Mensaje');
  assert.match(content, /settingsButton\(quickBar,\s*'\+\s*Añadir Canal',\s*\(\)\s*=>\s*openItem\('canal'\)\)/, 'Debe existir botón + Añadir Canal');
  assert.match(content, /settingsButton\(quickBar,\s*'\+\s*Añadir Comando',\s*\(\)\s*=>\s*openItem\('comando'\)\)/, 'Debe existir botón + Añadir Comando');
});

test('Estudio: Rediseño cabecera de chat, popup stream flotante manejable, corrección Twitch web y retiro de Botrix', () => {
  const content = fs.readFileSync('public/estudio.html', 'utf8');

  // 1. Iconificación de botones de cabecera de chat (stream flotante, Twitch web, recarga)
  assert.match(content, /id="btn-toggle-stream"[^>]*title="Ver stream flotante"[^>]*aria-label="Ver stream flotante"/, 'btn-toggle-stream debe tener título y aria-label accesible');
  assert.match(content, /id="btn-chat-feed-toggle"[^>]*title="Alternar entre lista interactiva y chat web de Twitch"/, 'btn-chat-feed-toggle debe tener título');
  assert.match(content, /id="btn-reload-chat"[^>]*title="Recargar chat"[^>]*aria-label="Recargar chat"/, 'btn-reload-chat debe tener título y aria-label');
  assert.match(content, /icon\('streamTv'\)/, 'btn-toggle-stream debe renderizarse con icono streamTv');
  assert.match(content, /icon\('chatWeb'\)/, 'btn-chat-feed-toggle debe renderizarse con icono chatWeb');
  assert.match(content, /icon\('refresh'\)/, 'btn-reload-chat debe renderizarse con icono refresh');

  // 2. Retiro completo de Botrix («Todos»)
  assert.doesNotMatch(content, /id="btn-chat-todos"/, 'btn-chat-todos debe haberse retirado de la cabecera');
  assert.doesNotMatch(content, /id="botrix-config"/, 'botrix-config debe haberse retirado');
  assert.doesNotMatch(content, /function toggleAllChats\(/, 'toggleAllChats debe haberse retirado');
  assert.doesNotMatch(content, /function saveBotrix\(/, 'saveBotrix debe haberse retirado');

  // 3. Popup flotante manejable (draggable) para el stream
  assert.match(content, /class="floating-stream-popup" id="stream-player-box"/, 'stream-player-box debe ser popup flotante');
  assert.match(content, /id="stream-player-drag-handle"/, 'Debe incluir handle para arrastrar');
  assert.match(content, /id="btn-stream-popup-close"/, 'Debe incluir botón para cerrar el popup flotante');
  assert.match(content, /function initFloatingStreamDrag\(\)/, 'initFloatingStreamDrag debe existir');

  // 4. Adaptación y corrección 100% de Twitch web iframe
  assert.match(content, /#chat-view-section #chat-frame\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/, 'chat-frame debe ocupar el 100% de ancho y alto');
});

test('Estudio: Unificar OBS en botón único con pestañas superiores (Escenas y Fuentes)', () => {
  const content = fs.readFileSync('public/estudio.html', 'utf8');

  // 1. Botón unificado en la toolbar sin duplicidades ni saturación
  assert.match(content, /id="btn-obs-menu"[^>]*aria-label="Abre OBS \(escenas y fuentes\)"[^>]*data-tip="Abre el control de OBS \(escenas, audio y fuentes\)\."/,
    'btn-obs-menu debe unificar escenas, audio y fuentes en la toolbar');
  assert.doesNotMatch(content, /id="btn-sources-view"/,
    'No debe existir un botón separado btn-sources-view en la toolbar para no saturarla');

  // 2. Panel unificado obs-sheet con pestañas superiores
  assert.match(content, /<aside class="sheet" id="obs-sheet" aria-label="Controles OBS" hidden>/,
    'Debe existir el panel obs-sheet unificado');
  assert.match(content, /id="btn-obs-tab-scenes"/, 'Debe existir la pestaña de Escenas');
  assert.match(content, /id="btn-obs-tab-sources"/, 'Debe existir la pestaña de Fuentes');
  assert.match(content, /id="btn-sources-refresh"[^>]*aria-label="Recargar fuentes de OBS"/,
    'Debe existir btn-sources-refresh para refrescar fuentes al instante');
  assert.match(content, /id="sources-filter"/, 'Debe incluir buscador en tiempo real de fuentes');
  assert.match(content, /class="sources-grid" id="sources-grid"/, 'Debe incluir grid para fuentes');

  // 3. Vistas internas conmutadas por pestañas y limpieza de controles heredados
  assert.match(content, /id="obs-scenes-view"/, 'Debe existir la sección de escenas');
  assert.match(content, /id="obs-sources-view"/, 'Debe existir la sección de fuentes');
  const obsSheetMatch = content.match(/<aside class="sheet" id="obs-sheet"[^>]*>([\s\S]*?)<\/aside>/);
  assert.ok(obsSheetMatch, 'obs-sheet debe existir');
  assert.doesNotMatch(obsSheetMatch[1], /<select id="obs-input"/, 'obs-input heredado debe estar retirado');
  assert.doesNotMatch(obsSheetMatch[1], /id="btn-obs-mute"/, 'btn-obs-mute heredado debe estar retirado');
  assert.doesNotMatch(obsSheetMatch[1], /id="btn-obs-preview"/, 'btn-obs-preview debe estar retirado de la pestaña de escenas');
  assert.doesNotMatch(obsSheetMatch[1], /id="obs-interval"/, 'obs-interval debe estar retirado de la pestaña de escenas');
  assert.match(content, /function selectObsTab/, 'Debe existir la función selectObsTab');
  assert.match(content, /function openObs/, 'Debe existir la función openObs');

  // 4. Lógica de carga global y soporte conmutable visual/audio
  assert.match(content, /async function loadAllSources\(\)/, 'Debe existir loadAllSources()');
  assert.match(content, /sources\?all=1/, 'loadAllSources() debe consultar todas las fuentes');
  assert.match(content, /icon\(on \? 'volume' : 'volumeX'\)/, 'Fuentes de audio deben usar conmutador táctil de volumen/mute');
  assert.match(content, /icon\(on \? 'eye' : 'eyeOff'\)/, 'Fuentes visuales deben usar conmutador táctil de ojo');

  // 5. Deduplicación de fuentes por nombre y soporte multi-escena
  assert.match(content, /seen\.has\(source\.name\)/, 'renderSources debe deduplicar fuentes por nombre para que no se repitan');
  assert.match(content, /source\.instances\.forEach/, 'Al conmutar una fuente deduplicada debe sincronizar todas sus instancias');
});

test('Estudio: Rediseño de la paleta de colores, presets de grosor e integración de captura de OBS en panel de dibujo', () => {
  const content = fs.readFileSync('public/estudio.html', 'utf8');

  // 1. Integración de captura de OBS en el panel flotante de la pizarra
  assert.match(content, /id="btn-sheet-obs-snapshot"[^>]*title="Capturar OBS para dibujar encima"/,
    'Debe existir el botón de captura OBS dentro del panel flotante');
  assert.match(content, /<select id="obs-interval"/,
    'El selector de refresco de captura obs-interval debe estar integrado en el panel flotante');

  // 2. Presets rápidos de grosor de trazo
  assert.match(content, /<div class="stroke-presets" id="stroke-presets">/,
    'Debe existir el contenedor stroke-presets para selección rápida de 1 toque');
  assert.match(content, /data-size="3"/, 'Debe incluir preset fino de 3px');
  assert.match(content, /data-size="6"/, 'Debe incluir preset normal de 6px');
  assert.match(content, /data-size="12"/, 'Debe incluir preset grueso de 12px');
  assert.match(content, /data-size="24"/, 'Debe incluir preset marcador de 24px');
  assert.match(content, /function selectSize\(size\)/,
    'Debe existir la función selectSize para sincronizar presets y slider');

  // 3. Paleta de colores optimizada para streaming
  assert.match(content, /\["#005fa9",\s*"Azul ApliArte"\]/, 'Debe preservar el azul oficial de ApliArte');
  assert.match(content, /\["#ffffff",\s*"Blanco puro"\]/, 'Debe incluir blanco puro');
  assert.match(content, /\["#38bdf8",\s*"Azul cielo"\]/, 'Debe incluir azul cielo vibrante');
  assert.match(content, /\["#10b981",\s*"Verde esmeralda"\]/, 'Debe incluir verde esmeralda de alta visibilidad');
  assert.match(content, /\["#facc15",\s*"Amarillo sol"\]/, 'Debe incluir amarillo sol');

  // 4. Estilos visuales de swatch y feedback táctil
  assert.match(content, /\.color-swatch\s*\{[^}]*border-radius:\s*50%/,
    'Las muestras de color deben ser circulares con diseño moderno');
  assert.match(content, /\.color-swatch\.active\s*\{/,
    'Las muestras activas deben tener indicador visual prominente de selección');
});

test('Estudio: Creación y arrastre ergonómico de texto sin bloqueos de dibujo ni desincronización', () => {
  const content = fs.readFileSync('public/estudio.html', 'utf8');

  // 1. commitText desacopla los puntos from y to (evita doble incremento de velocidad al arrastrar)
  assert.match(content, /from:\s*\{\s*x:\s*board\.textPoint\.x,\s*y:\s*board\.textPoint\.y\s*\}/,
    'commitText debe desacoplar from para no compartir referencia con to');
  assert.match(content, /to:\s*\{\s*x:\s*board\.textPoint\.x,\s*y:\s*board\.textPoint\.y\s*\}/,
    'commitText debe desacoplar to para no compartir referencia con from');
  assert.match(content, /selectTool\('pen'\);[\s\S]*board\.selectedStrokeId\s*=\s*item\.strokeId;/,
    'commitText debe conmutar a pen y auto-seleccionar la capa creada para permitir arrastre o dibujo inmediato');

  // 2. getLayerBounds calcula el tamaño real del texto para que la caja envolvente abarque toda la cadena
  assert.match(content, /item\.shape\s*===\s*'text'[\s\S]*textWidthNormX[\s\S]*charCount/,
    'getLayerBounds debe calcular el ancho del texto según su número de caracteres');

  // 3. pointerdown permite arrastre directo de la capa seleccionada y deselección suave al pintar fuera
  assert.match(content, /if\s*\(board\.selectedStrokeId\)\s*\{[\s\S]*hitsLayer\(selLayer\)[\s\S]*board\.draggingLayer\s*=\s*true;/,
    'pointerdown debe permitir arrastrar directamente la capa seleccionada sin exigir cambiar a herramienta select');

  // 4. pointermove limita el desplazamiento según los bordes globales de la capa para no deformarla
  assert.match(content, /bounds\.minX\s*\+\s*dx\s*<\s*0[\s\S]*bounds\.maxX\s*\+\s*dx\s*>\s*1/,
    'pointermove debe acotar dx y dy según los límites globales de la capa para evitar deformaciones');

  // 5. selectSize modifica el tamaño de la capa seleccionada (texto, formas, trazos) y sincroniza
  assert.match(content, /if\s*\(board\.selectedStrokeId\)\s*\{[\s\S]*item\.strokeId\s*===\s*board\.selectedStrokeId[\s\S]*item\.size\s*=\s*board\.size/,
    'selectSize debe actualizar item.size en la capa seleccionada');

  // 6. reflectSelectedLayerProps sincroniza color y tamaño en la UI al seleccionar una capa
  assert.match(content, /function reflectSelectedLayerProps\(\)[\s\S]*board\.color\s*=\s*item\.color[\s\S]*board\.size\s*=/,
    'reflectSelectedLayerProps debe reflejar color y tamaño de la capa en los controles');
});

test('Estudio: Pausar polling de captura OBS cuando la pizarra entra en reposo y reanudar al activar', async () => {
  const content = fs.readFileSync(estudioPath, 'utf8');

  // 1. Verificación estática del código fuente
  assert.match(content, /if\s*\(!board\.active\)\s*\{[\s\S]*clearTimeout\(obsPreview\.timer\);[\s\S]*obsPreview\.timer\s*=\s*0;/,
    'setBoardActive(!board.active) debe limpiar y resetear obsPreview.timer');
  assert.match(content, /if\s*\(typeof obsPreview !== 'undefined'\s*&&\s*obsPreview\.active\)\s*\{\s*captureObs\(\);\s*\}/,
    'setBoardActive(true) debe reanudar la captura llamando a captureObs() si obsPreview.active es true');
  assert.match(content, /function scheduleObsCapture\(\)[\s\S]*typeof board !== 'undefined' \? board\.active : true[\s\S]*setTimeout\(captureObs,\s*interval\)/,
    'scheduleObsCapture debe comprobar que la pizarra esté activa antes de programar setTimeout');
  assert.match(content, /async function captureObs\(\)[\s\S]*typeof board !== 'undefined' && !board\.active[\s\S]*return;/,
    'captureObs debe retornar inmediatamente si la pizarra está en reposo');

  // 2. Verificación de ejecución funcional de las funciones extraídas
  const schedMatch = content.match(/function scheduleObsCapture\(\) \{[\s\S]*?\n    \}/);
  const capMatch = content.match(/async function captureObs\(\) \{[\s\S]*?\n    \}/);
  const setBoardMatch = content.match(/function setBoardActive\(active\) \{[\s\S]*?\n      \}/);
  assert.ok(schedMatch, 'scheduleObsCapture debe estar definida');
  assert.ok(capMatch, 'captureObs debe estar definida');
  assert.ok(setBoardMatch, 'setBoardActive debe estar definida');

  let obsRequestCalls = 0;
  let timerIdCounter = 0;
  const activeTimers = new Set();
  const ctx = {
    clearTimeout: (id) => { activeTimers.delete(id); },
    setTimeout: (fn, delay) => {
      const id = ++timerIdCounter;
      activeTimers.add(id);
      return id;
    },
    board: { active: true, ws: true, connected: true, connect: () => {} },
    obsPreview: { active: true, busy: false, timer: 0 },
    document: { hidden: false },
    $: (id) => {
      if (id === 'obs-interval') return { value: '2000' };
      if (id === 'obs-preview-bg') return { src: '', hidden: false, removeAttribute: () => {} };
      return { hidden: false, classList: { toggle: () => {} }, setAttribute: () => {} };
    },
    container: { hidden: false },
    drawButton: { classList: { toggle: () => {} }, setAttribute: () => {} },
    closeSheets: () => {},
    closeTextEntry: () => {},
    drawSelectionOverlay: () => {},
    updateLayersList: () => {},
    resizeBoard: () => {},
    reportObs: () => {},
    obsRequest: async () => {
      obsRequestCalls++;
      return { image: 'data:image/jpeg;base64,mock' };
    }
  };
  vm.createContext(ctx);
  vm.runInContext(schedMatch[0], ctx);
  vm.runInContext(capMatch[0], ctx);
  vm.runInContext(setBoardMatch[0], ctx);

  // A. Con pizarra activa y captura activa: realiza captura y arma timer
  await vm.runInContext('captureObs()', ctx);
  assert.equal(obsRequestCalls, 1, 'Debe llamar obsRequest una vez al estar activa');
  assert.ok(ctx.obsPreview.timer > 0, 'Debe armar obsPreview.timer tras captura activa');

  // B. Poner pizarra en reposo: debe cancelar el timer
  vm.runInContext('setBoardActive(false)', ctx);
  assert.equal(ctx.board.active, false, 'board.active debe ser false');
  assert.equal(ctx.obsPreview.timer, 0, 'obsPreview.timer debe resetearse a 0 en reposo');

  // C. scheduleObsCapture y captureObs invocadas en reposo NO deben hacer nada
  vm.runInContext('scheduleObsCapture()', ctx);
  assert.equal(ctx.obsPreview.timer, 0, 'scheduleObsCapture no debe armar timer en reposo');
  await vm.runInContext('captureObs()', ctx);
  assert.equal(obsRequestCalls, 1, 'captureObs en reposo no debe realizar peticiones');

  // D. Reactivar pizarra: debe reanudar la captura llamando captureObs()
  vm.runInContext('setBoardActive(true)', ctx);
  assert.equal(ctx.board.active, true, 'board.active debe ser true');
  await new Promise(r => setTimeout(r, 10)); // dar un tick a la promesa de captureObs()
  assert.equal(obsRequestCalls, 2, 'Al reactivar debe reanudar petición de captura');
  assert.ok(ctx.obsPreview.timer > 0, 'Al reactivar debe rearmar temporizador de refresco');

  // E. Poner en reposo de nuevo
  vm.runInContext('setBoardActive(false)', ctx);
  assert.equal(ctx.obsPreview.timer, 0, 'Debe limpiar timer al volver a entrar en reposo');

  // F. Si obsPreview.active es false, reactivar pizarra no debe lanzar capturas
  ctx.obsPreview.active = false;
  vm.runInContext('setBoardActive(true)', ctx);
  await new Promise(r => setTimeout(r, 10));
  assert.equal(obsRequestCalls, 2, 'No debe llamar captureObs si obsPreview.active es false');
});

test('Estudio: Contexto del directo integrado como 3ª pestaña en la vista modal de Mensajería', async () => {
  const content = fs.readFileSync(estudioPath, 'utf8');
  const toolbar = sliceBetween(content, '<footer class="toolbar" id="studio-toolbar">', '</footer>');

  // 1. NO debe existir un botón extra en la toolbar inferior
  assert.doesNotMatch(toolbar, /id="btn-contexto-view"/, 'btn-contexto-view no debe existir en la barra inferior');
  assert.match(toolbar, /id="btn-mensajeria-view"[^>]*><\/button>\s*<button[^>]*id="btn-commands-view"/,
    'La toolbar debe mantener el orden contiguo btn-mensajeria-view seguido de btn-commands-view');

  // 2. Pestaña de Contexto en .mensajeria-tabs dentro de #chat-sheet
  const chatSheet = sliceBetween(content, '<aside class="sheet chat-sheet" id="chat-sheet"', '</aside>');
  assert.match(chatSheet, /id="btn-msg-tab-contexto"/, 'Debe existir la pestaña [📌 Contexto]');
  assert.match(chatSheet, /id="contexto-head-controls"/, 'Deben existir los controles de cabecera de contexto');
  assert.match(chatSheet, /id="btn-contexto-sheet-refresh"/, 'Debe existir el botón de refresco en la cabecera');

  // 3. Contenedor de sección de contexto #contexto-view-section en #chat-body-container
  assert.match(chatSheet, /id="chat-body-container"[\s\S]*id="contexto-view-section"/,
    'contexto-view-section debe ubicarse dentro de #chat-body-container');
  assert.match(chatSheet, /id="contexto-actual-texto"/, 'Debe mostrar el texto del contexto actual');
  assert.match(chatSheet, /id="btn-contexto-quitar"/, 'Debe incluir botón para quitar contexto');
  assert.match(chatSheet, /id="contexto-input"/, 'Debe incluir input para redactar el tema');
  assert.match(chatSheet, /id="btn-contexto-fijar"/, 'Debe incluir botón para fijar contexto');
  assert.match(chatSheet, /id="contextos-rapidos-grid"/, 'Debe incluir contenedor de temas rápidos');
  assert.match(chatSheet, /!contexto/, 'Debe incluir nota de ayuda con el comando de chat');

  // 4. Conexión WebSocket reactive para contexto_estado
  assert.match(content, /data\.type\s*===\s*'contexto_estado'/, 'El listener de WebSocket debe procesar contexto_estado');
  assert.match(content, /updateContextoDisplay\(data\.texto/, 'WebSocket debe llamar a updateContextoDisplay');

  // 5. Verificación funcional de selectMensajeriaTab('contexto') y funciones asociadas
  const selectTabMatch = content.match(/function selectMensajeriaTab\(tab = 'chat'\) \{[\s\S]*?\n    \}/);
  const updateMatch = content.match(/function updateContextoDisplay\(texto\) \{[\s\S]*?\n    \}/);
  const refreshMatch = content.match(/async function refreshContexto\(\) \{[\s\S]*?\n    \}/);
  const setMatch = content.match(/async function setContextoDirecto\(texto\) \{[\s\S]*?\n    \}/);
  const openContextoMatch = content.match(/function openContexto\(\) \{[\s\S]*?\n    \}/);
  const initMatch = content.match(/function initContexto\(\) \{[\s\S]*?\n    \}/);
  const presetsMatch = content.match(/const CONTEXTOS_PREDETERMINADOS = \[[\s\S]*?\];/);

  assert.ok(selectTabMatch, 'selectMensajeriaTab debe estar definida');
  assert.ok(updateMatch, 'updateContextoDisplay debe estar definida');
  assert.ok(refreshMatch, 'refreshContexto debe estar definida');
  assert.ok(setMatch, 'setContextoDirecto debe estar definida');
  assert.ok(openContextoMatch, 'openContexto debe estar definida');
  assert.ok(initMatch, 'initContexto debe estar definida');
  assert.ok(presetsMatch, 'CONTEXTOS_PREDETERMINADOS debe estar definida');

  const btnChatEl = { classList: { toggle: (cls, on) => { btnChatEl.active = on; } }, setAttribute: () => {}, active: true };
  const btnSmsEl = { classList: { toggle: (cls, on) => { btnSmsEl.active = on; } }, setAttribute: () => {}, active: false };
  const btnContextoEl = { classList: { toggle: (cls, on) => { btnContextoEl.active = on; } }, setAttribute: () => {}, active: false };

  const chatControlsEl = { hidden: false };
  const smsControlsEl = { hidden: true };
  const contextoControlsEl = { hidden: true };

  const chatSectionEl = { style: { display: 'flex' } };
  const smsSectionEl = { style: { display: 'none' } };
  const contextoSectionEl = { style: { display: 'none' } };

  const labelEl = { textContent: 'Sin tema activo', style: { color: '' } };
  const btnQuitarEl = { style: { display: 'none' }, addEventListener: () => {} };
  const inputEl = { value: '', addEventListener: () => {} };
  const btnFijarEl = { addEventListener: () => {} };
  const gridChildren = [];
  const gridEl = {
    replaceChildren: () => { gridChildren.length = 0; },
    appendChild: (child) => { gridChildren.push(child); }
  };

  const domElements = {
    'btn-msg-tab-chat': btnChatEl,
    'btn-msg-tab-sms': btnSmsEl,
    'btn-msg-tab-contexto': btnContextoEl,
    'chat-head-controls': chatControlsEl,
    'sms-head-controls': smsControlsEl,
    'contexto-head-controls': contextoControlsEl,
    'chat-view-section': chatSectionEl,
    'sms-view-section': smsSectionEl,
    'contexto-view-section': contextoSectionEl,
    'contexto-actual-texto': labelEl,
    'btn-contexto-quitar': btnQuitarEl,
    'contexto-input': inputEl,
    'btn-contexto-fijar': btnFijarEl,
    'contextos-rapidos-grid': gridEl,
  };

  let lastFetchUrl = '';
  let lastFetchOptions = null;
  let fakeFetchResponse = { ok: true, json: async () => ({ ok: true, contexto: 'Tema mock' }) };
  const openChatCalls = [];
  let toastMessage = '';

  const ctx = {
    $: (id) => domElements[id] || null,
    document: {
      createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        type: '',
        className: '',
        style: { cssText: '' },
        textContent: '',
        addEventListener: () => {}
      })
    },
    fetch: async (url, options) => {
      lastFetchUrl = url;
      lastFetchOptions = options;
      return fakeFetchResponse;
    },
    openChat: (tab) => {
      openChatCalls.push(tab);
    },
    sms: { loaded: true },
    refreshSmsSheet: () => {},
    showToast: (msg) => { toastMessage = msg; }
  };

  vm.createContext(ctx);
  vm.runInContext(presetsMatch[0], ctx);
  vm.runInContext(updateMatch[0], ctx);
  vm.runInContext(refreshMatch[0], ctx);
  vm.runInContext(setMatch[0], ctx);
  vm.runInContext(openContextoMatch[0], ctx);
  vm.runInContext(initMatch[0], ctx);
  vm.runInContext(selectTabMatch[0], ctx);

  // A. selectMensajeriaTab('contexto') activa controles y sección de contexto
  vm.runInContext("selectMensajeriaTab('contexto')", ctx);
  assert.equal(btnContextoEl.active, true, 'Pestaña contexto debe estar activa');
  assert.equal(btnChatEl.active, false, 'Pestaña chat debe estar inactiva');
  assert.equal(btnSmsEl.active, false, 'Pestaña sms debe estar inactiva');
  assert.equal(contextoControlsEl.hidden, false, 'Controles cabecera contexto visibles');
  assert.equal(chatControlsEl.hidden, true, 'Controles cabecera chat ocultos');
  assert.equal(smsControlsEl.hidden, true, 'Controles cabecera sms ocultos');
  assert.equal(contextoSectionEl.style.display, 'flex', 'Sección contexto debe mostrarse con display flex');
  assert.equal(chatSectionEl.style.display, 'none', 'Sección chat debe ocultarse');
  assert.equal(smsSectionEl.style.display, 'none', 'Sección sms debe ocultarse');

  // B. openContexto delega en openChat('contexto')
  vm.runInContext('openContexto()', ctx);
  assert.ok(openChatCalls.includes('contexto'), 'openContexto debe invocar openChat con tab contexto');

  // C. Actualizar display con texto y vaciado
  vm.runInContext("updateContextoDisplay('Programando en vivo')", ctx);
  assert.equal(labelEl.textContent, 'Programando en vivo');
  assert.equal(btnQuitarEl.style.display, 'inline-block');

  vm.runInContext("updateContextoDisplay('')", ctx);
  assert.equal(labelEl.textContent, 'Sin tema activo');
  assert.equal(btnQuitarEl.style.display, 'none');

  // D. setContextoDirecto fija tema y setContextoDirecto('') lo vacía
  inputEl.value = 'Tema probado';
  fakeFetchResponse = { ok: true, json: async () => ({ ok: true, contexto: 'Tema probado' }) };
  await vm.runInContext("setContextoDirecto('Tema probado')", ctx);
  assert.equal(lastFetchUrl, '/api/directo/contexto');
  assert.equal(lastFetchOptions.method, 'POST');
  assert.deepEqual(JSON.parse(lastFetchOptions.body), { contexto: 'Tema probado' });
  assert.equal(labelEl.textContent, 'Tema probado');
  assert.ok(toastMessage.includes('Tema fijado'));

  fakeFetchResponse = { ok: true, json: async () => ({ ok: true, contexto: '' }) };
  await vm.runInContext("setContextoDirecto('')", ctx);
  assert.equal(labelEl.textContent, 'Sin tema activo');
  assert.equal(btnQuitarEl.style.display, 'none');
  assert.ok(toastMessage.includes('Tema quitado'));

  // E. initContexto genera los 4 botones rápidos predeterminados
  vm.runInContext('initContexto()', ctx);
  assert.equal(gridChildren.length, 4, 'Debe haber 4 botones de presets');
  assert.equal(gridChildren[0].textContent, 'Charlando con la comunidad');
});

test('Estudio: Rediseño compacto de pizarra para tablet, botones en icono y modo inmersivo zen', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');

  // 1. Botones de acción rápida compactos (solo iconos)
  assert.match(content, /id="btn-sheet-undo"[^>]*>↩<\/button>/, 'Deshacer debe mostrar solo el icono ↩');
  assert.match(content, /id="btn-sheet-redo"[^>]*>↪<\/button>/, 'Rehacer debe mostrar solo el icono ↪');
  assert.match(content, /id="btn-sheet-obs-snapshot"[^>]*>📷<\/button>/, 'Captura OBS debe mostrar solo la cámara 📷');
  assert.match(content, /id="btn-sheet-clear"[^>]*>🗑<\/button>/, 'Limpiar lienzo debe mostrar solo la papelera 🗑');

  // 2. Presets de grosor de trazo compactos (solo emojis en una fila)
  assert.match(content, /data-size="3"[^>]*>✏️<\/button>/, 'Preset fino debe ser solo ✏️');
  assert.match(content, /data-size="6"[^>]*>🖊️<\/button>/, 'Preset normal debe ser solo 🖊️');
  assert.match(content, /data-size="12"[^>]*>🖌️<\/button>/, 'Preset grueso debe ser solo 🖌️');
  assert.match(content, /data-size="24"[^>]*>🖍️<\/button>/, 'Preset marcador debe ser solo 🖍️');

  // 3. Botón y modo inmersivo de dibujo (Zen)
  assert.match(content, /id="btn-toggle-board-tools"/, 'Debe existir el botón btn-toggle-board-tools en el stage');
  assert.match(content, /function toggleBoardZen/, 'Debe existir la función toggleBoardZen');
  assert.match(content, /#view-studio\.board-is-active\.board-zen/, 'Debe existir la regla CSS para el modo board-zen');
  assert.match(content, /\.btn-board-zen/, 'Debe existir el estilo para el botón btn-board-zen');
});

test('Estudio: Selector de cámara robusto, normalización VDO.Ninja y recarga limpia', () => {
  const content = fs.readFileSync(estudioPath, 'utf8');

  // 1. Normalización idéntica a normalizeDeviceLabel de VDO.Ninja
  assert.match(content, /function normalizeVdoDeviceParam\(label\)/,
    'Debe existir la función normalizeVdoDeviceParam');
  assert.match(content, /String\(label\)\.replace\(\/\[\\W\]\+\/g,\s*'_'\)\.toLowerCase\(\)/,
    'normalizeVdoDeviceParam debe usar la misma expresión regular que VDO.Ninja');

  // Evaluar en contexto vm que normaliza correctamente nombres con caracteres especiales
  const ctx = vm.createContext({});
  vm.runInContext(`
    function normalizeVdoDeviceParam(label) {
      if (!label) return '';
      return String(label).replace(/[\\W]+/g, '_').toLowerCase();
    }
  `, ctx);
  const norm = vm.runInContext('normalizeVdoDeviceParam', ctx);
  assert.equal(norm('FaceTime HD Camera (Built-in)'), 'facetime_hd_camera_built_in_');
  assert.equal(norm('Iriun Webcam'), 'iriun_webcam');
  assert.equal(norm('OBS Virtual Camera'), 'obs_virtual_camera');
  assert.equal(norm('Logitech Brio 4K (046d:085e)'), 'logitech_brio_4k_046d_085e_');

  // 2. cameraPushUrl aplica la normalización a &videodevice
  assert.match(content, /&videodevice=\$\{encodeURIComponent\(normalizeVdoDeviceParam\(deviceLabel\)\)\}/,
    'cameraPushUrl debe usar normalizeVdoDeviceParam para construir &videodevice');

  // 3. Fallback de sondeo y evento devicechange en devicePicker
  assert.match(content, /probe\s*=\s*await navigator\.mediaDevices\.getUserMedia\(\{\s*audio:\s*true\s*\}\)/,
    'devicePicker debe tener fallback a audio si la cámara está bloqueada en uso exclusivo');
  assert.match(content, /navigator\.mediaDevices\.addEventListener\('devicechange'/,
    'devicePicker debe escuchar devicechange para refrescar cámaras conectadas');

  // 4. Recarga limpia con about:blank para liberar el sensor de hardware
  assert.match(content, /iframe\.src\s*=\s*'about:blank';[\s\S]*setTimeout\(\(\)\s*=>\s*\{[\s\S]*iframe\.src\s*=\s*cameraPushUrl\(\)\.url;/,
    'reloadCameraIfActive debe descargar el iframe en about:blank antes de recargar');
});











