/**
 * Acorta la ventana de gracia de node-media-server.
 *
 * La v4 espera `PUBLISH_GRACE_MS` (30 s) antes de emitir `donePublish`, para que un cliente que
 * se cae pueda reconectar sin perder su registro. En un directo eso son 30 segundos de negro
 * antes de que entre el respaldo, así que aquí se baja a unos pocos segundos.
 *
 * Toca una propiedad interna de la librería. Si una versión futura la mueve, esto NO debe tumbar
 * el centro: devuelve `false`, se anota el aviso y se sigue con el comportamiento por defecto.
 */

export const GRACIA_POR_DEFECTO_MS = 3000;

export function ajustarGracia(contexto, rutaFlujo, ms = GRACIA_POR_DEFECTO_MS) {
  try {
    const emision = contexto?.broadcasts?.get?.(rutaFlujo);
    if (!emision || typeof emision.publishGraceMs !== 'number') return false;
    emision.publishGraceMs = ms;
    return true;
  } catch {
    return false;
  }
}
