/**
 * Adaptador de los eventos de node-media-server.
 *
 * La v4 emite UN solo argumento, la sesión, con `streamPath`. La v3 emitía `(id, streamPath)`.
 * Tomar la firma antigua deja la ruta en `undefined` y tumba el proceso en cuanto OBS publica:
 * ocurrió al probar en vivo el 2026-09-11. Estas dos funciones absorben esa diferencia.
 */

/** Devuelve la ruta del flujo venga como sesión (v4) o como cadena suelta (v3). */
export function rutaDeSesion(sesion) {
  if (!sesion) return '';
  if (typeof sesion === 'string') return sesion;
  return sesion.streamPath ?? '';
}

/** Último segmento de la ruta: `/live/obs` → `obs`. Nunca devuelve `undefined`. */
export function nombreDeFlujo(ruta) {
  if (!ruta) return '';
  const partes = String(ruta).split('/').filter(Boolean);
  return partes.at(-1) ?? '';
}
