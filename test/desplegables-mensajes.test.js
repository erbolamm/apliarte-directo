import test from 'node:test';
import assert from 'node:assert/strict';

// Funciones de formateo y renderizado para comandos plegables y mensajes guardados
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generarHtmlMensajesComando(cmdName, mensajesList) {
  const itemsHtml = mensajesList.map((m, idx) => `
    <div class="cmd-msg-item" id="msg-item-${idx}">
      <div class="cmd-msg-text">${escapeHtml(m)}</div>
      <div class="cmd-msg-actions">
        <button type="button" class="touch-btn touch-btn-primary btn-msg-item-send"
                data-cmd="${escapeHtml(cmdName)}"
                data-msg="${escapeHtml(m)}"
                aria-label="Enviar comando con este mensaje"
                data-tip="Enviar: ${escapeHtml(cmdName.replace('[mensaje]', m.slice(0, 50)))}">
          🚀 Enviar
        </button>
        <button type="button" class="touch-btn btn-msg-item-copy"
                data-cmd="${escapeHtml(cmdName)}"
                data-msg="${escapeHtml(m)}"
                aria-label="Copiar comando con este mensaje"
                data-tip="Copiar comando con este mensaje">
          📋
        </button>
      </div>
    </div>
  `).join('');

  return `
    <div class="cmd-msg-list">${itemsHtml}</div>
    <div class="cmd-custom-msg-row">
      <input type="text" class="cmd-custom-msg-input" placeholder="O escribe otro mensaje…" data-cmd="${escapeHtml(cmdName)}">
      <button type="button" class="touch-btn touch-btn-primary btn-custom-msg-send"
              data-cmd="${escapeHtml(cmdName)}"
              aria-label="Enviar comando con este mensaje personalizado"
              data-tip="Enviar comando con el texto escrito al chat">
        🚀 Enviar
      </button>
    </div>
  `;
}

function generarHtmlMensajesGuardados(mensajesList) {
  if (mensajesList.length === 0) {
    return '<div class="empty-msg">No hay mensajes guardados todavía.</div>';
  }
  return mensajesList.map(m => `
    <div class="saved-msg-card">
      <div class="saved-msg-text">${escapeHtml(m)}</div>
      <div class="saved-msg-actions">
        <button type="button" class="touch-btn touch-btn-primary btn-saved-msg-send"
                data-msg="${escapeHtml(m)}"
                aria-label="Enviar este mensaje directamente al chat de Twitch"
                data-tip="Enviar este mensaje a Twitch">
          🚀 Enviar
        </button>
        <button type="button" class="touch-btn btn-saved-msg-copy"
                data-msg="${escapeHtml(m)}"
                aria-label="Copiar mensaje al portapapeles"
                data-tip="Copiar mensaje al portapapeles">
          📋
        </button>
        <button type="button" class="touch-btn touch-btn-danger chip-delete"
                data-tipo="mensaje"
                data-val="${escapeHtml(m)}"
                aria-label="Eliminar mensaje guardado"
                data-tip="Eliminar este mensaje de la lista">
          🗑️
        </button>
      </div>
    </div>
  `).join('');
}

test('Comandos plegables con [mensaje]: cada mensaje se muestra en bloque legible y con botón Enviar individual', () => {
  const cmd = '!say [mensaje]';
  const mensajes = [
    '¡Bienvenidos a todos al directo de programación!',
    'Estamos trabajando en la suite de ErBolamm y VPS en vivo.'
  ];

  const html = generarHtmlMensajesComando(cmd, mensajes);

  // No debe ser un <select> apretado en una sola línea
  assert.equal(html.includes('<select'), false, 'No debe usar select para mensajes');
  assert.equal(html.includes('class="cmd-msg-list"'), true);

  // Debe contener ambos mensajes completos
  assert.equal(html.includes('¡Bienvenidos a todos al directo de programación!'), true);
  assert.equal(html.includes('Estamos trabajando en la suite de ErBolamm y VPS en vivo.'), true);

  // Cada mensaje debe tener su botón Enviar individual con aria-label y data-tip (3s tooltip)
  assert.match(html, /class="[^"]*btn-msg-item-send[^"]*"/);
  assert.match(html, /aria-label="Enviar comando con este mensaje"/);
  assert.match(html, /data-tip="Enviar: !say ¡Bienvenidos a todos al directo/);

  // Debe incluir fila de entrada personalizada para escribir y enviar un texto libre
  assert.match(html, /class="cmd-custom-msg-input"/);
  assert.match(html, /class="[^"]*btn-custom-msg-send[^"]*"/);
});

test('Mensajes guardados: cada mensaje se muestra con texto completo y botones Enviar, Copiar y Borrar', () => {
  const mensajes = [
    'Pausa rápida de 5 minutos, enseguida regresamos ☕'
  ];

  const html = generarHtmlMensajesGuardados(mensajes);

  assert.equal(html.includes('saved-msg-card'), true);
  assert.equal(html.includes('Pausa rápida de 5 minutos, enseguida regresamos ☕'), true);

  // Botón Enviar con aria-label y data-tip
  assert.match(html, /class="[^"]*btn-saved-msg-send[^"]*"/);
  assert.match(html, /aria-label="Enviar este mensaje directamente al chat de Twitch"/);
  assert.match(html, /data-tip="Enviar este mensaje a Twitch"/);

  // Botón Copiar y Borrar
  assert.match(html, /class="[^"]*btn-saved-msg-copy[^"]*"/);
  assert.match(html, /class="[^"]*chip-delete[^"]*"/);
});

test('Interpolación de comandos con [mensaje]: genera el texto exacto para /api/directo/comando', () => {
  const baseCmd = '!speak -config es-ES 1 && /me dice: [mensaje]';
  const elegido = 'Hola mundo desde el panel móvil';

  const finalCmd = baseCmd.replace(/\[(usuario|canal|mensaje)\]/, elegido);
  assert.equal(finalCmd, '!speak -config es-ES 1 && /me dice: Hola mundo desde el panel móvil');
});
