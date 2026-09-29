/**
 * Único lugar que lanza y mata procesos.
 *
 * Regla de seguridad: solo se mata lo que se ha lanzado desde aquí. Los PID se guardan en este
 * mapa al nacer; nunca se buscan por nombre ni se deducen del sistema. Así es imposible tumbar
 * un proceso ajeno por error.
 */

import { spawn } from 'node:child_process';
import { argumentosRelay, argumentosRespaldo } from './ffmpeg.js';
import { enmascararUrl } from './configuracion.js';

export class GestorProcesos {
  constructor({ registrar = () => {}, lanzar = spawn, plazoTermMs = 750, plazoKillMs = 750,
    claveDeDestino = (destino, entorno) => destino.variableClave ? entorno[destino.variableClave] : null } = {}) {
    this.propios = new Map(); // nombre de destino → ChildProcess
    this.registrar = registrar;
    this.lanzar = lanzar;
    this.plazoTermMs = plazoTermMs;
    this.plazoKillMs = plazoKillMs;
    this.paradas = new Map();
    this.intencionados = new WeakSet();
    this.versiones = new Map();
    this.claveDeDestino = claveDeDestino;
  }

  /**
   * Compone la URL final. Devuelve también la clave en crudo, solo para que `#lanzar` pueda
   * ocultarla de cualquier registro; no se guarda en ningún sitio más allá de esta llamada.
   */
  #urlCompleta(destino, entorno) {
    const clave = this.claveDeDestino(destino, entorno);
    return { salida: clave ? `${destino.url}/${clave}` : destino.url, clave };
  }

  arrancarRelay({ destino, entrada, entorno, alSalir }) {
    const { salida, clave } = this.#urlCompleta(destino, entorno);
    return this.#lanzar(destino.nombre, argumentosRelay({ entrada, salida }), salida, clave, alSalir);
  }

  arrancarRespaldo({ destino, archivo, entorno, duracion = null, alSalir }) {
    const { salida, clave } = this.#urlCompleta(destino, entorno);
    return this.#lanzar(destino.nombre, argumentosRespaldo({ archivo, salida, duracion }), salida, clave, alSalir);
  }

  /**
   * Oculta la clave en cualquier texto, no solo en la URL compuesta.
   *
   * `enmascararUrl` adivina por la forma de la URL y falla si el destino no tiene un segmento de
   * "app" antes de la clave (pasó con Kick: la URL quedaba en el mismo número de partes que una
   * URL sin clave). Aquí no se adivina: se busca la clave real, tal cual, dentro del texto — así
   * funciona igual de bien en la línea de arranque que en un error crudo de FFmpeg, que también
   * puede imprimir la URL completa.
   */
  #ocultar(texto, clave) {
    return clave ? texto.split(clave).join('***') : texto;
  }

  async #lanzar(nombre, argumentos, salida, clave, alSalir) {
    const version = (this.versiones.get(nombre) ?? 0) + 1;
    this.versiones.set(nombre, version);
    await this.detener(nombre, false); // no lanzar hasta confirmar exit/close
    if (this.versiones.get(nombre) !== version) return null;

    const hijo = this.lanzar('ffmpeg', argumentos, { stdio: ['ignore', 'ignore', 'pipe'] });
    this.propios.set(nombre, hijo);
    this.registrar(`[${nombre}] ffmpeg arrancado (pid ${hijo.pid}) → ${this.#ocultar(enmascararUrl(salida), clave)}`);

    let ultimoError = '';
    hijo.stderr.on('data', (b) => {
      ultimoError = this.#ocultar(String(b).trim().slice(0, 300), clave);
      this.registrar(`[${nombre}] ${ultimoError}`);
    });

    hijo.on('exit', (codigo, senal) => {
      if (this.propios.get(nombre) === hijo) this.propios.delete(nombre);
      const motivo = senal
        ? `terminado por señal ${senal}`
        : `ffmpeg salió con código ${codigo}${ultimoError ? `: ${ultimoError}` : ''}`;
      this.registrar(`[${nombre}] ${motivo}`);
      if (!this.intencionados.has(hijo)) alSalir?.(motivo, codigo);
    });

    hijo.on('error', (e) => {
      // Un error al enviar una señal no demuestra muerte. Solo un fallo de spawn
      // sin PID permite retirarlo sin exit/close.
      if (hijo.pid === undefined && this.propios.get(nombre) === hijo) this.propios.delete(nombre);
      const mensaje = this.#ocultar(e.message, clave);
      this.registrar(`[${nombre}] no se pudo arrancar ffmpeg: ${mensaje}`);
      if (!this.intencionados.has(hijo)) alSalir?.(`no se pudo arrancar ffmpeg: ${mensaje}`, -1);
    });

    return hijo.pid;
  }

  detener(nombre, cancelarPendientes = true) {
    if (cancelarPendientes) this.versiones.set(nombre, (this.versiones.get(nombre) ?? 0) + 1);
    if (this.paradas.has(nombre)) return this.paradas.get(nombre);
    const hijo = this.propios.get(nombre);
    if (!hijo) return Promise.resolve(false);
    this.intencionados.add(hijo);
    const parada = new Promise((resolve, reject) => {
      let term, kill, finalizado = false;
      const terminar = (error) => {
        if (finalizado) return;
        finalizado = true;
        clearTimeout(term); clearTimeout(kill);
        hijo.removeListener('exit', salio); hijo.removeListener('close', salio);
        if (error) reject(error);
        else {
          if (this.propios.get(nombre) === hijo) this.propios.delete(nombre);
          resolve(true);
        }
      };
      const salio = () => terminar();
      hijo.once('exit', salio); hijo.once('close', salio);
      if (hijo.exitCode !== null || hijo.signalCode !== null) { terminar(); return; }
      term = setTimeout(() => {
        try { hijo.kill('SIGKILL'); } catch (error) { terminar(error); return; }
        if (finalizado) return;
        kill = setTimeout(() => terminar(new Error(`[${nombre}] FFmpeg no confirmó su salida; no se arranca otro publicador.`)), this.plazoKillMs);
      }, this.plazoTermMs);
      try { hijo.kill('SIGTERM'); } catch (error) { terminar(error); }
    });
    this.paradas.set(nombre, parada);
    parada.finally(() => { if (this.paradas.get(nombre) === parada) this.paradas.delete(nombre); }).catch(() => {});
    return parada;
  }

  detenerTodos() {
    const nombres = new Set([...this.propios.keys(), ...this.versiones.keys()]);
    return Promise.all([...nombres].map(nombre => this.detener(nombre)));
  }
}
