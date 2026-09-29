/**
 * Relevo entre el reenvío y el respaldo.
 *
 * Al cortar OBS hay que matar los relays y arrancar el respaldo. Si se hace en el mismo instante,
 * el destino remoto todavía tiene registrado al publicador anterior y rechaza el nuevo con
 * «already has a publisher»: el respaldo no llega a emitir y el directo se queda en negro.
 * Comprobado en vivo el 2026-09-11 contra un servidor RTMP real.
 *
 * Por eso se deja un margen corto entre las dos cosas. Corto de verdad: cada segundo de más es
 * un segundo de negro en antena.
 */

export const PAUSA_RELEVO_MS = 1500;

/**
 * @param {object}   opciones
 * @param {Function} opciones.matar     detiene los procesos actuales
 * @param {Function} [opciones.arrancar] arranca el respaldo; si falta, no hay pausa
 * @param {Function} [opciones.esperar] programador, inyectable para poder probarlo
 * @param {number}   [opciones.pausaMs]
 */
export async function planificarRelevo({ matar, arrancar, esperar, pausaMs = PAUSA_RELEVO_MS }) {
  await matar();
  if (!arrancar) return { pausaMs, relevado: false };

  const programar = esperar ?? ((fn) => setTimeout(fn, pausaMs));
  await new Promise((resolve, reject) => programar(() => {
    Promise.resolve().then(arrancar).then(resolve, reject);
  }));
  return { pausaMs, relevado: true };
}
