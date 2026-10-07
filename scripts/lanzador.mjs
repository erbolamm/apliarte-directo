// Pure helpers for the one-click launcher (scripts/directo.mjs). No side effects here.

export const CLAIM_LINE = /\[primer-arranque\] Enlace de reclamación: (\/claim\?t=[A-Za-z0-9_-]+)/;

/** Returns the claim path printed by the server, or null. */
export function extraerEnlaceReclamacion(linea) {
  const m = CLAIM_LINE.exec(String(linea || ''));
  return m ? m[1] : null;
}

/** The claim link works like a password and the screen may be live: never print it. */
export function lineaSegura(linea) {
  return CLAIM_LINE.test(String(linea || ''))
    ? '🔑 Primera vez: abriendo tu navegador para crear la contraseña del panel (el enlace no se muestra aquí).'
    : linea;
}

/** Command that opens a URL in the default browser on each operating system. */
export function comandoAbrir(plataforma, url) {
  if (plataforma === 'darwin') return ['open', [url]];
  if (plataforma === 'win32') return ['cmd', ['/c', 'start', '', url]];
  return ['xdg-open', [url]];
}

import os from 'node:os';

export function versionNodeValida(version = process.version) {
  const mayor = Number(String(version).replace(/^v/, '').split('.')[0]);
  return Number.isInteger(mayor) && mayor >= 20;
}

/** Detects the primary local LAN IPv4 address (e.g. 192.168.1.35) for tablet access. */
export function obtenerIpLocal() {
  try {
    const interfaces = os.networkInterfaces();
    for (const nombre of Object.keys(interfaces)) {
      for (const red of interfaces[nombre] || []) {
        if (red.family === 'IPv4' && !red.internal) {
          return red.address;
        }
      }
    }
  } catch (_) {}
  return '127.0.0.1';
}

/** Plain-language summary shown once everything is running. */
export function resumenOBS(puerto, { centro }) {
  const base = `http://127.0.0.1:${puerto}`;
  const ipLocal = obtenerIpLocal();
  const lineas = [
    '',
    '✅ ApliArte Directo está funcionando. No cierres esta ventana mientras emites.',
    '',
    '📱 Pizarra táctil (Tablet o Móvil en la misma red Wi-Fi):',
    `   http://${ipLocal}:${puerto}/pizarra-plus`,
    '',
    'En OBS, añade dos «Fuentes de navegador» de 1920 × 1080:',
    `  • Capa (avatares y rótulos):  ${base}/plano?transparente=1`,
    `  • Cámara (conmutador monigote): ${base}/camara.html`,
    `  • Fondo animado:              ${base}/fondo.html`,
    '',
    `Panel de control (ordenador):   ${base}/admin`,
  ];
  if (centro) {
    lineas.push(
      '',
      'Para emitir a Twitch y YouTube a la vez, en OBS → Ajustes → Emisión:',
      '  • Servicio: Personalizado',
      '  • Servidor: rtmp://127.0.0.1:1935/live',
      '  • Clave de retransmisión: cualquier palabra, por ejemplo «directo»',
      '  Tus claves reales de Twitch y YouTube se pegan en el panel: «⚙️ Config & OBS» → «🔑 Credenciales & Red».',
    );
  } else {
    lineas.push(
      '',
      '⚠️ No se ha encontrado ffmpeg, así que la emisión a Twitch y YouTube a la vez está apagada.',
      '   Instálalo y vuelve a abrir el lanzador:',
      '   • Mac: https://ffmpeg.org/download.html (o «brew install ffmpeg» si usas Homebrew)',
      '   • Windows: https://ffmpeg.org/download.html (o «winget install ffmpeg»)',
    );
  }
  lineas.push('', 'Para apagarlo todo: cierra esta ventana o pulsa Ctrl+C.', '');
  return lineas.join('\n');
}

