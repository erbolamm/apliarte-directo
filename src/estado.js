/**
 * Máquina de estados del centro de restream.
 *
 * No lanza ni mata procesos: solo registra lo que ocurre y DECIDE qué habría que hacer. El que
 * ejecuta es `procesos.js`. Separarlo permite probar toda la lógica sin abrir un solo FFmpeg.
 */

import { enmascararUrl } from './configuracion.js';

export const ESTADOS = Object.freeze({
  DETENIDO: 'detenido',
  RECIBIENDO: 'recibiendo',
  REENVIANDO: 'reenviando',
  FALLBACK: 'fallback',
  MANUAL: 'manual',
  ERROR: 'error',
});

export class CentroEstado {
  constructor({ destinos = [], tieneRespaldo = false, ahora = () => Date.now() } = {}) {
    this.estado = ESTADOS.DETENIDO;
    this.tieneRespaldo = tieneRespaldo;
    this.ahora = ahora;
    this.inicioEmision = null;
    // Independiente de `estado`: en modo manual, `estado` es MANUAL pero OBS puede
    // seguir publicando por debajo. Hace falta saberlo para decidir a qué volver
    // cuando se para la reproducción manual.
    this.obsActivo = false;
    this.archivoManual = null;
    // Destinos que esperan un paso previo (YouTube prepara su emisión) antes de recibir el relay
    // de la publicación actual: nombre → ficha de esa espera. Ver `relayEnPreparacion`.
    this.preparando = new Map();

    this.destinos = new Map(
      destinos.map((d) => [d.nombre, { ...d, pid: null, modo: null, error: null }]),
    );
  }

  obsPublica() {
    this.obsActivo = true;
    this.preparando.clear(); // las esperas de la publicación anterior ya no valen
    if (this.estado === ESTADOS.MANUAL) return; // no interrumpir la reproducción manual
    this.estado = ESTADOS.RECIBIENDO;
    this.inicioEmision = this.ahora();
  }

  obsDejaDePublicar() {
    this.obsActivo = false;
    this.preparando.clear(); // sin publicación no hay relay que esperar
    if (this.estado === ESTADOS.MANUAL) return; // no interrumpir la reproducción manual
    this.estado = this.tieneRespaldo ? ESTADOS.FALLBACK : ESTADOS.DETENIDO;
    if (!this.tieneRespaldo) this.inicioEmision = null;
  }

  finalizarEmision() {
    this.obsActivo = false;
    this.estado = ESTADOS.DETENIDO;
    this.inicioEmision = null;
    this.archivoManual = null;
    this.preparando.clear();
    for (const d of this.destinos.values()) {
      d.pid = null;
      d.modo = null;
      d.error = null;
      d.ultimoModo = 'respaldo';
    }
  }

  /** Arranca la reproducción manual de un vídeo elegido a mano, sustituyendo lo que hubiera. */
  activarManual(archivo) {
    // El vídeo manual sustituye a los relays; el que aún no había salido ya no debe salir.
    this.preparando.clear();
    this.estado = ESTADOS.MANUAL;
    this.archivoManual = archivo;
  }

  /** Suelta el modo manual. No decide el siguiente estado: eso lo hace quien llama, según `obsActivo`. */
  desactivarManual() {
    this.archivoManual = null;
  }

  /**
   * Sale de MANUAL hacia el estado que toque, según si OBS ha seguido activo por debajo
   * mientras tanto. Es lo que usa el servidor para "parar la reproducción manual": no hay
   * que adivinar el siguiente estado desde fuera, esto ya sabe la regla.
   */
  salirDeManual() {
    this.archivoManual = null;
    if (this.obsActivo) {
      this.estado = ESTADOS.RECIBIENDO;
      this.inicioEmision = this.ahora();
    } else {
      this.estado = this.tieneRespaldo ? ESTADOS.FALLBACK : ESTADOS.DETENIDO;
      this.inicioEmision = null;
    }
  }

  /**
   * El relay de `nombre` va a salir en cuanto termine un paso previo. Hasta entonces el destino
   * no tiene proceso, pero el centro lo cuenta como un relay a punto de arrancar: la caída de
   * otro destino no es «han caído todos» y, si OBS corta, este también recibe el respaldo.
   *
   * Devuelve la ficha de esta espera. La espera deja de valer sola con todo lo que habría parado
   * un relay lanzado al empezar la publicación: otra publicación, el corte de OBS, el cierre de
   * la emisión, un vídeo manual o la parada a mano del destino. Quien espera pregunta con
   * `preparacionVigente` antes de lanzar, y una ficha vieja nunca toca una espera más nueva.
   */
  relayEnPreparacion(nombre) {
    if (!this.destinos.has(nombre)) throw new Error(`Destino desconocido: «${nombre}».`);
    const ficha = Symbol(nombre);
    this.preparando.set(nombre, ficha);
    return ficha;
  }

  /** ¿Sigue tocando lanzar el relay que esperaba con esta ficha? */
  preparacionVigente(nombre, ficha) {
    return ficha !== undefined && this.preparando.get(nombre) === ficha;
  }

  /** Fin de la espera: el relay ya arrancó o el intento de arrancarlo terminó. */
  preparacionTerminada(nombre, ficha) {
    if (!this.preparacionVigente(nombre, ficha)) return false;
    this.preparando.delete(nombre);
    return true;
  }

  /**
   * La publicación se cortó antes de que el relay llegase a salir. El destino queda como un relay
   * cortado (`ultimoModo`), que es lo que mira el paso a respaldo para incluirlo.
   */
  preparacionCortada(nombre, ficha) {
    if (!this.preparacionTerminada(nombre, ficha)) return false;
    this.destinos.get(nombre).ultimoModo = 'relay';
    return true;
  }

  /** Parada a mano del destino mientras esperaba. Dice si había algo que cancelar. */
  cancelarPreparacion(nombre) {
    return this.preparando.delete(nombre);
  }

  /** Cierre de la emisión o apagado del centro: no queda ningún relay por salir. */
  cancelarPreparaciones() {
    this.preparando.clear();
  }

  destinosEnPreparacion() {
    return [...this.preparando.keys()];
  }

  relayArrancado(nombre, pid) {
    this.#registrar(nombre, pid, 'relay');
    this.estado = ESTADOS.REENVIANDO;
  }

  respaldoArrancado(nombre, pid) {
    this.#registrar(nombre, pid, 'respaldo');
    this.estado = ESTADOS.FALLBACK;
  }

  /** Igual que respaldoArrancado, pero para un vídeo elegido a mano: no toca `estado`. */
  manualArrancado(nombre, pid) {
    this.#registrar(nombre, pid, 'manual');
  }

  #registrar(nombre, pid, modo) {
    const d = this.destinos.get(nombre);
    if (!d) throw new Error(`Destino desconocido: «${nombre}».`);
    d.pid = pid;
    d.modo = modo;
    d.error = null;
  }

  /**
   * Un destino caído no tumba a los demás; solo si caen todos el centro pasa a error. Un destino
   * en preparación cuenta como que sigue en pie.
   */
  procesoFallo(nombre, motivo) {
    const d = this.destinos.get(nombre);
    if (!d) throw new Error(`Destino desconocido: «${nombre}».`);
    d.error = motivo;
    d.pid = null;
    d.ultimoModo = d.modo;
    d.modo = null;

    if (this.destinosActivos().length === 0 && this.preparando.size === 0
      && [...this.destinos.values()].some((x) => x.error)) {
      this.estado = ESTADOS.ERROR;
    }
  }

  destinosActivos() {
    return [...this.destinos.values()]
      .filter((d) => d.pid !== null)
      .map((d) => ({ nombre: d.nombre, pid: d.pid, modo: d.modo }));
  }

  /**
   * Qué hacer cuando OBS corta.
   *
   * `matar` contiene ÚNICAMENTE los PID que este centro registró al arrancarlos. Nunca se deduce
   * un PID de otra fuente: así no hay forma de matar un proceso ajeno del sistema.
   *
   * El respaldo va también a los destinos en preparación: su relay estaba a punto de salir.
   */
  decidirTrasCorte() {
    const activos = this.destinosActivos();
    const conRelay = new Set([...activos.map((d) => d.nombre), ...this.preparando.keys()]);
    return {
      matar: activos.map((d) => d.pid),
      arrancarRespaldoEn: this.tieneRespaldo ? [...conRelay] : [],
    };
  }

  /**
   * ¿Hay que arrancar el respaldo ya?
   *
   * node-media-server v4 tarda 30 s en avisar de que OBS cortó (`PUBLISH_GRACE_MS`), pensado para
   * que un cliente pueda reconectar. En un directo eso son 30 s de negro. La muerte del relay
   * llega enseguida, así que sirve de aviso rápido.
   *
   * No se relanza si lo que murió era ya el respaldo: eso sería un bucle infinito.
   *
   * Con un destino en preparación tampoco: su relay está a punto de salir, así que la caída de
   * otro destino es un fallo suyo (se reintenta) y no la señal de que OBS haya cortado.
   */
  debePasarARespaldo() {
    if (!this.tieneRespaldo) return false;
    if (this.destinosActivos().length > 0) return false;
    if (this.preparando.size > 0) return false;
    const caidos = [...this.destinos.values()].filter((d) => d.error);
    if (caidos.length === 0) return false;
    return caidos.every((d) => d.ultimoModo !== 'respaldo');
  }

  segundosEmitiendo() {
    if (!this.inicioEmision) return 0;
    return Math.floor((this.ahora() - this.inicioEmision) / 1000);
  }

  /** Vista segura para el panel: las URL van enmascaradas. */
  instantanea() {
    return {
      estado: this.estado,
      segundosEmitiendo: this.segundosEmitiendo(),
      tieneRespaldo: this.tieneRespaldo,
      obsActivo: this.obsActivo,
      archivoManual: this.archivoManual,
      destinos: [...this.destinos.values()].map((d) => ({
        nombre: d.nombre,
        url: enmascararUrl(d.url),
        listo: d.listo ?? false,
        pid: d.pid,
        modo: d.modo,
        error: d.error,
      })),
    };
  }
}
