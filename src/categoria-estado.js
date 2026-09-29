/**
 * Lectura/escritura de la categoría activa, persistida en un JSON pequeño.
 *
 * Separado de `server.js` para poder probarlo sin tocar el sistema de
 * archivos: analizarCategoriaGuardada es puro.
 */

import { esCategoriaValida } from './categorias.js';

/** @param {string|null} texto contenido crudo del archivo, o null si no existe */
export function analizarCategoriaGuardada(texto) {
  if (!texto) return null;
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    return null;
  }
  const categoria = datos?.categoria;
  return esCategoriaValida(categoria) ? categoria : null;
}
