/**
 * Reintento de un relay que cae a mitad del directo.
 *
 * Si un FFmpeg de reenvío muere mientras OBS sigue publicando (corte de red hacia la plataforma,
 * reinicio de su ingesta…), hay que volver a lanzarlo: si no, esa plataforma se queda sin señal
 * hasta que se reinicie OBS. Visto en vivo el 2026-09-19.
 *
 * Aquí solo se decide CUÁNTO esperar y SI procede; quien lanza el proceso es `server.js`.
 */

/**
 * La primera espera supera la gracia de corte (3 s): si OBS se ha cortado, el aviso de fin de
 * publicación llega antes y el reintento se descarta, en lugar de lanzar un relay sin entrada.
 */
export const ESPERAS_REINTENTO_MS = Object.freeze([4000, 8000, 15000, 30000]);

/** Un relay que aguanta esto seguido se da por sano: la siguiente caída vuelve a la primera espera. */
export const ESTABLE_MS = 60000;

export class ReintentosRelay {
  constructor({ ahora = () => Date.now(), esperas = ESPERAS_REINTENTO_MS, estableMs = ESTABLE_MS } = {}) {
    this.ahora = ahora;
    this.esperas = esperas;
    this.estableMs = estableMs;
    this.fallos = new Map();
    this.inicios = new Map();
  }

  /** Anota que el relay de `nombre` acaba de arrancar. */
  arrancado(nombre) {
    this.inicios.set(nombre, this.ahora());
  }

  /** Espera antes del siguiente intento para `nombre`, y cuenta el fallo. */
  siguienteEspera(nombre) {
    const inicio = this.inicios.get(nombre);
    if (inicio !== undefined && this.ahora() - inicio >= this.estableMs) this.fallos.delete(nombre);
    this.inicios.delete(nombre);

    const n = this.fallos.get(nombre) ?? 0;
    this.fallos.set(nombre, n + 1);
    return this.esperas[Math.min(n, this.esperas.length - 1)];
  }

  /** Nueva sesión de OBS: las cuentas anteriores ya no dicen nada. */
  olvidarTodo() {
    this.fallos.clear();
    this.inicios.clear();
  }
}

/**
 * ¿Procede relanzar el relay al terminar la espera?
 * @param {object}  s
 * @param {boolean} s.obsActivo    OBS sigue publicando
 * @param {boolean} s.manual       hay un vídeo manual en antena
 * @param {boolean} s.mismaSesion  la entrada no ha cambiado desde la caída
 * @param {boolean} s.cerrando     el servidor se está cerrando
 * @param {boolean} s.yaActivo     el destino ya tiene un proceso (lo relanzó otra vía)
 */
export function puedeReintentar({ obsActivo, manual, mismaSesion, cerrando, yaActivo }) {
  return obsActivo && !manual && mismaSesion && !cerrando && !yaActivo;
}
