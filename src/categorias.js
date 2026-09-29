/**
 * Categorías de actividad del directo y su paleta.
 *
 * Cada actividad (dibujar, música, programar) recolorea los overlays de OBS
 * a su marca correspondiente. Los colores están tomados de una fuente real,
 * no inventados:
 *
 * - `arte` (Calca): color carne #f5cba7 y marrón oscuro #3e2723, fondo #1a0f0b (Javier, 2026-09-19).
 * - `musica`: rosa fuerte #ff1493 y rosa #e91e63, fondo #260519 (Javier, 2026-09-19).
 * - `apps` (ApliArte): azul claro #5ecef5 y azul oscuro #00467b, del Kit de Marca ApliArte
 *   (Javier, 2026-09-19).
 *
 * `primario` es el tono vivo o claro y `secundario` el oscuro; `oscuro` es el fondo.
 * - `andando` (modo paseo motivador): verde claro #00e676 y verde intenso #00c853, fondo
 *   #0a3d1c (Javier, 2026-09-19).
 */

export const CATEGORIAS = Object.freeze({
  arte: Object.freeze({ primario: '#f5cba7', secundario: '#3e2723', oscuro: '#1a0f0b' }),
  musica: Object.freeze({ primario: '#ff1493', secundario: '#e91e63', oscuro: '#260519' }),
  apps: Object.freeze({ primario: '#5ecef5', secundario: '#00467b', oscuro: '#030a16' }),
  andando: Object.freeze({ primario: '#00e676', secundario: '#00c853', oscuro: '#0a3d1c' }),
  charlando: Object.freeze({ primario: '#e8955e', secundario: '#b46734', oscuro: '#1c1208' }),
});

export const CATEGORIA_POR_DEFECTO = 'apps';

export function esCategoriaValida(nombre) {
  return typeof nombre === 'string' && Object.prototype.hasOwnProperty.call(CATEGORIAS, nombre);
}

export function paletaDe(nombre) {
  if (!esCategoriaValida(nombre)) {
    throw new Error(`Categoría desconocida: «${nombre}».`);
  }
  return CATEGORIAS[nombre];
}
