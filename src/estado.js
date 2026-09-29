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

    this.destinos = new Map(
      destinos.map((d) => [d.nombre, { ...d, pid: null, modo: null, error: null }]),
    );
  }

  obsPublica() {
    this.obsActivo = true;
    if (this.estado === ESTADOS.MANUAL) return; // no interrumpir la reproducción manual
    this.estado = ESTADOS.RECIBIENDO;
    this.inicioEmision = this.ahora();
  }

  obsDejaDePublicar() {
    this.obsActivo = false;
    if (this.estado === ESTADOS.MANUAL) return; // no interrumpir la reproducción manual
    this.estado = this.tieneRespaldo ? ESTADOS.FALLBACK : ESTADOS.DETENIDO;
    if (!this.tieneRespaldo) this.inicioEmision = null;
  }

  /** Arranca la reproducción manual de un vídeo elegido a mano, sustituyendo lo que hubiera. */
  activarManual(archivo) {
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

  /** Un destino caído no tumba a los demás; solo si caen todos el centro pasa a error. */
  procesoFallo(nombre, motivo) {
    const d = this.destinos.get(nombre);
    if (!d) throw new Error(`Destino desconocido: «${nombre}».`);
    d.error = motivo;
    d.pid = null;
    d.ultimoModo = d.modo;
    d.modo = null;

    if (this.destinosActivos().length === 0 && [...this.destinos.values()].some((x) => x.error)) {
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
   */
  decidirTrasCorte() {
    const activos = this.destinosActivos();
    return {
      matar: activos.map((d) => d.pid),
      arrancarRespaldoEn: this.tieneRespaldo ? activos.map((d) => d.nombre) : [],
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
   */
  debePasarARespaldo() {
    if (!this.tieneRespaldo) return false;
    if (this.destinosActivos().length > 0) return false;
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
