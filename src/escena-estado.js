/**
 * Lectura/escritura de la escena activa, persistida en un JSON pequeño.
 *
 * Mismo patrón que categoria-estado.js, separado de server.js para poder
 * probarlo sin tocar el sistema de archivos: analizarEscenaGuardada es pura.
 */

import { esEscenaValida } from './escenas.js';

/** @param {string|null} texto contenido crudo del archivo, o null si no existe */
export function analizarEscenaGuardada(texto) {
  if (!texto) return null;
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    return null;
  }
  const escena = datos?.escena;
  return esEscenaValida(escena) ? escena : null;
}
