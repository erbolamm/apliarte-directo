/**
 * Cierre de la emisión cuando Javier pulsa «Detener transmisión» en OBS.
 *
 * El aviso RTMP de que OBS dejó de publicar no distingue una parada a propósito de un corte:
 * los dos llegan igual. OBS sí lo sabe y lo cuenta por su WebSocket (evento `StreamStateChanged`).
 * Aquí solo se DECIDE; el que ejecuta es `server.js`. Así se prueba sin abrir OBS ni FFmpeg.
 */

import { ESTADOS } from './estado.js';

const PARADAS_DELIBERADAS = new Set([
  'OBS_WEBSOCKET_OUTPUT_STOPPING',
  'OBS_WEBSOCKET_OUTPUT_STOPPED',
]);

/**
 * ¿El evento `StreamStateChanged` de OBS es una parada a propósito?
 *
 * Reconectar (`RECONNECTING`, `RECONNECTED`) es un corte de red, no una parada: ahí debe seguir
 * actuando el respaldo. Ante datos ausentes o raros se responde que no, para no cortar un directo
 * por un mensaje mal formado.
 */
export function esParadaDeliberada(datosEvento) {
  const estadoSalida = datosEvento?.outputState;
  return typeof estadoSalida === 'string' && PARADAS_DELIBERADAS.has(estadoSalida);
}

/**
 * ¿Hay algo en antena que el aviso de OBS deba cerrar?
 *
 * OBS avisa dos veces seguidas (`STOPPING` y `STOPPED`) y también cuando emitía a otro sitio que
 * no es este centro. Sin esta comprobación el segundo aviso volvería a cerrar y a escribir en el
 * registro. Un vídeo manual sin OBS publicando no lo arrancó OBS: no se toca.
 */
export function hayEmisionQueCerrar({ obsActivo = false, estado = ESTADOS.DETENIDO, relevoEnMarcha = false } = {}) {
  return Boolean(obsActivo) || Boolean(relevoEnMarcha) || estado === ESTADOS.FALLBACK;
}
