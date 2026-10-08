// src/cola-animaciones.js
// Cola única para animaciones de la oficina (!fiesta, !conga, !bronca).
// Garantiza que nunca se solapen dos animaciones y da prioridad a la bienvenida.

const MAX_COLA_ANIMACIONES = 5;

const DURACIONES_MS = {
  fiesta: 15_000,
  bronca: 15_000,
  conga: 40_000, // 10s countdown + 30s baile
};

class ColaAnimaciones {
  constructor(opciones = {}) {
    this.maxCola = opciones.maxCola || MAX_COLA_ANIMACIONES;
    this.duraciones = { ...DURACIONES_MS, ...(opciones.duraciones || {}) };
    this.activa = null;
    this.cola = [];
    this.onIniciar = opciones.onIniciar || (() => {});
    this.onTerminar = opciones.onTerminar || (() => {});
    this.onCortar = opciones.onCortar || (() => {});
  }

  estaOcupada() {
    return this.activa !== null;
  }

  getLongitudCola() {
    return this.cola.length;
  }

  getAnimacionActiva() {
    return this.activa ? { ...this.activa } : null;
  }

  encolar(animacion, ahora = Date.now()) {
    if (!animacion || !animacion.tipo) return false;
    const tipo = animacion.tipo.toLowerCase().replace(/^!/, '');
    if (!['fiesta', 'conga', 'bronca'].includes(tipo)) return false;

    const item = {
      tipo,
      usuario: animacion.usuario || 'ja',
      esBienvenida: Boolean(animacion.esBienvenida),
      duracion: animacion.duracion || this.duraciones[tipo] || 15_000,
      texto: animacion.texto || '',
    };

    // Caso especial: Bienvenida de nuevo usuario (prioridad)
    if (item.esBienvenida) {
      // Decisión de Javier: Si ya hay una fiesta de bienvenida en marcha, no la corta (deja que termine)
      if (this.activa && this.activa.esBienvenida) {
        return false;
      }
      // Si hay otra animación activa (manual: bronca, conga, fiesta), la corta y vacía la cola
      if (this.activa) {
        const cortada = { ...this.activa };
        this.activa = null;
        this.cola = [];
        this.onCortar(cortada);
      } else {
        this.cola = [];
      }
      this._iniciar(item, ahora);
      return true;
    }

    // Si no hay nada activo, arranca inmediatamente
    if (!this.activa) {
      this._iniciar(item, ahora);
      return true;
    }

    // Si ya hay algo activo, encolar si hay espacio en la cola
    if (this.cola.length >= this.maxCola) {
      console.warn(`[ColaAnimaciones] Cola llena (${this.maxCola}), descartando ${item.tipo}`);
      return false;
    }

    this.cola.push(item);
    return true;
  }

  _iniciar(item, ahora) {
    this.activa = {
      ...item,
      iniciadaEn: ahora,
      terminaEn: ahora + item.duracion,
    };
    this.onIniciar(this.activa);
  }

  revisar(ahora = Date.now()) {
    if (!this.activa) return;
    if (ahora >= this.activa.terminaEn) {
      const terminada = { ...this.activa };
      this.activa = null;
      this.onTerminar(terminada);

      // Si hay elementos en la cola, iniciar el siguiente
      if (this.cola.length > 0) {
        const siguiente = this.cola.shift();
        this._iniciar(siguiente, ahora);
      }
    }
  }

  cortar(ahora = Date.now()) {
    if (!this.activa) return;
    const cortada = { ...this.activa };
    this.activa = null;
    this.onCortar(cortada);
    if (this.cola.length > 0) {
      const siguiente = this.cola.shift();
      this._iniciar(siguiente, ahora);
    }
  }

  vaciar() {
    this.cola = [];
    if (this.activa) {
      const cortada = { ...this.activa };
      this.activa = null;
      this.onCortar(cortada);
    }
  }
}

module.exports = {
  ColaAnimaciones,
  MAX_COLA_ANIMACIONES,
  DURACIONES_MS,
};
