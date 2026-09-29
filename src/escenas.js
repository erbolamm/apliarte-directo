/**
 * Escenas (fase del directo) y su paleta por categoría de actividad.
 *
 * Eje ortogonal a `categorias.js` (decisión de Javier, 2026-09-16): la paleta final que ve un
 * overlay depende de la escena activa (esta) cruzada con la categoría activa (categorias.js).
 * Los datos vienen de `directo/config/escenas.json`, que es la fuente editable — no se duplican
 * valores aquí.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');

const datos = JSON.parse(readFileSync(join(RAIZ, 'config', 'escenas.json'), 'utf8'));

export const ESCENAS = Object.freeze(datos.escenas);
export const CATEGORIAS_DE_ESCENA = Object.freeze(datos.categorias_validas);
export const ESCENA_POR_DEFECTO = 'inicio';

export function esEscenaValida(nombre) {
  return typeof nombre === 'string' && Object.prototype.hasOwnProperty.call(ESCENAS, nombre);
}

/**
 * Paleta de una escena para una categoría dada (`arte`, `musica`, `apps`, `andando`).
 * Devuelve el objeto con `primario`, `secundario` y `oscuro`.
 */
export function paletaDeEscena(escena, categoria) {
  if (!esEscenaValida(escena)) {
    throw new Error(`Escena desconocida: «${escena}».`);
  }
  const porCategoria = ESCENAS[escena].por_categoria;
  if (!Object.prototype.hasOwnProperty.call(porCategoria, categoria)) {
    throw new Error(`Categoría desconocida para la escena «${escena}»: «${categoria}».`);
  }
  return porCategoria[categoria];
}
