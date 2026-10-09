/**
 * Paso previo al reenvío a YouTube: pedir que haya una emisión esperando (ver youtube-api.js).
 *
 * El centro espera a `preparar()` antes de lanzar el reenvío a YouTube, y nada más. Por eso esta
 * pieza tiene una sola obligación por encima de las demás: contestar siempre y a tiempo. Nunca
 * lanza ni rechaza, y tiene su propio plazo aunque una dependencia no conteste jamás. Si algo
 * falla, el centro reenvía a YouTube igual que antes de existir este paso.
 *
 * Lo que sale de aquí (el resultado y las líneas del registro) se puede enseñar en el panel:
 * no lleva la clave de emisión, credenciales ni identificadores.
 */

import { MOTIVOS, acotarPlazo } from './youtube-api.js';

const PLAZO_MS = 8_000;
const PARTE_DEL_CLIENTE = 0.75; // el cliente vence antes: deja margen para que recoja lo que creó
const FALLO_INTERNO = 'fallo_interno';
const PRIVACIDADES = { public: 'pública', private: 'privada', unlisted: 'oculta' };

/** Qué pasó, dicho para quien lleva el directo. La línea completa añade que el directo sigue. */
const FRASES = Object.freeze({
  [MOTIVOS.SIN_CLAVE]: 'no hay clave de emisión de YouTube guardada',
  [MOTIVOS.AUTORIZACION_REVOCADA]: 'el permiso de YouTube ha caducado o se ha retirado y hay que volver a conectar YouTube',
  [MOTIVOS.NO_AUTORIZADO]: 'YouTube no acepta el permiso guardado y hay que volver a conectar YouTube',
  [MOTIVOS.CUOTA_AGOTADA]: 'se ha agotado el cupo diario de peticiones a YouTube',
  [MOTIVOS.DIRECTO_NO_HABILITADO]: 'el canal de YouTube no tiene activada la emisión en directo',
  [MOTIVOS.STREAM_NO_ENCONTRADO]: 'la clave de emisión guardada no es de ninguna emisión del canal de YouTube conectado',
  [MOTIVOS.TIEMPO_AGOTADO]: 'YouTube no respondió a tiempo',
  [MOTIVOS.ERROR_RED]: 'no se pudo contactar con YouTube',
  [MOTIVOS.ERROR_GOOGLE]: 'YouTube devolvió un error',
  [MOTIVOS.RESPUESTA_INESPERADA]: 'YouTube respondió algo que no se esperaba',
  [FALLO_INTERNO]: 'falló la preparación dentro del propio centro',
});

/** `YOUTUBE_API=off` apaga este paso entero, igual que `OBS_BRIDGE=off` apaga el bridge. */
export function youtubeApiHabilitada(env = process.env) {
  return String(env?.YOUTUBE_API || '').trim().toLowerCase() !== 'off';
}

/**
 * ¿Este destino de la configuración es YouTube? Manda el servidor de ingesta de su `url`; el
 * nombre "youtube" solo decide cuando no hay dirección que mirar. Así un destino llamado
 * "youtube" que apunta a otro sitio (una prueba local) no toca la cuenta de YouTube.
 */
export function esDestinoYoutube(destino) {
  if (!destino || typeof destino !== 'object') return false;
  let servidor = '';
  try { servidor = new URL(String(destino.url || '')).hostname.toLowerCase(); } catch (_) {}
  if (servidor) return servidor === 'youtube.com' || servidor.endsWith('.youtube.com');
  return destino.nombre === 'youtube';
}

/** El detalle técnico del cliente, solo si es texto corriente y con los secretos conocidos tachados. */
function detalleSeguro(detalle, secretos) {
  if (typeof detalle !== 'string' || !/^[\p{L}\p{N} .,()_-]{1,120}$/u.test(detalle)) return '';
  let texto = detalle;
  for (const secreto of secretos) {
    if (typeof secreto === 'string' && secreto.trim().length >= 4) texto = texto.split(secreto.trim()).join('***');
  }
  return texto;
}

/**
 * @param {object} dependencias
 * @param {() => object|null} dependencias.leerCredenciales   credenciales guardadas, o null
 * @param {Function} dependencias.prepararEmisionYoutube      la de youtube-api.js
 * @param {(linea: string) => void} dependencias.anotar       registro del centro
 * @param {() => number} [dependencias.ahora]
 * @param {boolean|(() => boolean)} [dependencias.habilitado] false: el paso está apagado
 * @param {string} [dependencias.causaApagado]                por qué está apagado, para el registro
 * @param {number} [dependencias.tiempoMaximoMs]              plazo total de `preparar`
 */
export function crearPreparadorYoutube({ leerCredenciales, prepararEmisionYoutube, anotar, ahora = Date.now,
  habilitado = true, causaApagado = 'YOUTUBE_API=off', tiempoMaximoMs = PLAZO_MS } = {}) {
  const plazo = acotarPlazo(tiempoMaximoMs, PLAZO_MS);
  // La causa la da quien monta el centro; si no es texto corriente, no se copia al registro.
  const causa = typeof causaApagado === 'string' && /^[\p{L}\p{N} =_-]{1,60}$/u.test(causaApagado) ? ` (${causaApagado})` : '';
  let ultimo = null;
  let enCurso = null;
  let avisoDado = null; // "apagado" y "sin conectar" se dicen una vez, no en cada arranque

  const decir = (linea) => {
    try { anotar(linea); } catch (_) {}
  };
  const momento = () => {
    try { return new Date(ahora()).toISOString(); } catch (_) { return new Date().toISOString(); }
  };
  const guardar = (estado, resto = {}) => {
    ultimo = { estado, motivo: null, cuando: momento(), reutilizada: false, privacidad: null, autoStop: null, ...resto };
    return { ...ultimo };
  };
  const decirUnaVez = (estado, linea) => {
    if (avisoDado !== estado) decir(linea);
    avisoDado = estado;
  };

  /** Lo que puede tardar: leer las credenciales y hablar con YouTube. No anota ni guarda nada. */
  async function consultar(claveEmision) {
    const activo = typeof habilitado === 'function' ? habilitado() : habilitado;
    if (activo === false) return { tipo: 'desactivada' };
    const credenciales = await leerCredenciales();
    if (!credenciales || typeof credenciales !== 'object') return { tipo: 'sin_credenciales' };
    const respuesta = await prepararEmisionYoutube({
      claveEmision,
      credenciales,
      tiempoMaximoMs: Math.max(1, Math.floor(plazo * PARTE_DEL_CLIENTE)),
    });
    return { tipo: 'respuesta', respuesta, secretos: [claveEmision, ...Object.values(credenciales)] };
  }

  function fallo(motivo, detalle = '') {
    avisoDado = null;
    decir(`AVISO YouTube: ${FRASES[motivo]}; el directo sigue como siempre.${detalle ? ` [${detalle}]` : ''}`);
    return guardar('fallo', { motivo });
  }

  function interpretar(consulta) {
    if (consulta.tipo === 'desactivada') {
      decirUnaVez('desactivada', `YouTube: la preparación automática de la emisión está apagada${causa}; el directo sale como siempre.`);
      return guardar('desactivada');
    }
    const respuesta = consulta.respuesta;
    if (consulta.tipo === 'sin_credenciales' || (respuesta?.ok === false && respuesta.motivo === MOTIVOS.SIN_CREDENCIALES)) {
      decirUnaVez('no_configurada', 'YouTube: el inicio automático no está conectado; el directo sale como siempre.');
      return guardar('no_configurada', { motivo: MOTIVOS.SIN_CREDENCIALES });
    }
    if (!respuesta || typeof respuesta !== 'object' || typeof respuesta.ok !== 'boolean') return fallo(MOTIVOS.RESPUESTA_INESPERADA);
    if (!respuesta.ok) {
      const motivo = Object.hasOwn(FRASES, respuesta.motivo) ? respuesta.motivo : MOTIVOS.RESPUESTA_INESPERADA;
      return fallo(motivo, detalleSeguro(respuesta.detalle, consulta.secretos));
    }

    avisoDado = null;
    const reutilizada = respuesta.reutilizada === true;
    const privacidad = Object.hasOwn(PRIVACIDADES, respuesta.privacidad) ? respuesta.privacidad : 'desconocida';
    const autoStop = respuesta.autoStop === true;
    decir(reutilizada
      ? 'YouTube: ya había una emisión esperando y se reutiliza; saldrá en directo sola al recibir la señal.'
      : 'YouTube: emisión pública preparada; saldrá en directo sola al recibir la señal.');
    if (privacidad === 'desconocida') {
      decir('AVISO YouTube: no se ha podido saber si la emisión de YouTube es pública; compruébalo en YouTube Studio.');
    } else if (privacidad !== 'public') {
      decir(`AVISO YouTube: la emisión de YouTube no es pública (${PRIVACIDADES[privacidad]}); cámbiala en YouTube Studio si quieres que se vea.`);
    }
    if (!autoStop) {
      decir('AVISO YouTube: esa emisión no tiene el fin automático; al terminar habrá que cerrarla en YouTube Studio.');
    }
    return guardar('preparada', { reutilizada, privacidad, autoStop });
  }

  async function intento(claveEmision) {
    let temporizador;
    try {
      const vencido = new Promise((hecho) => {
        temporizador = setTimeout(() => hecho(null), plazo);
      });
      // `consultar` es async: si una dependencia lanza en el acto, aquí llega como rechazo.
      const consulta = consultar(claveEmision);
      consulta.catch(() => {}); // si gana el plazo, su fallo tardío no queda sin atender
      const resultado = await Promise.race([consulta, vencido]);
      return resultado ? interpretar(resultado) : fallo(MOTIVOS.TIEMPO_AGOTADO);
    } catch (_) {
      // El error no se copia al registro: podría llevar cualquier cosa.
      return fallo(FALLO_INTERNO);
    } finally {
      clearTimeout(temporizador);
    }
  }

  return {
    /**
     * Deja la emisión preparada, o no, y lo cuenta. Nunca lanza ni rechaza, y contesta como muy
     * tarde al vencer el plazo. Las llamadas que coinciden comparten una sola preparación, para no
     * crear dos emisiones.
     */
    preparar(claveEmision) {
      if (enCurso) return enCurso;
      const promesa = intento(claveEmision)
        .catch(() => guardar('fallo', { motivo: FALLO_INTERNO }))
        .finally(() => {
          if (enCurso === promesa) enCurso = null;
        });
      enCurso = promesa;
      return promesa;
    },
    /** Resultado del último intento (copia), o null si aún no hubo ninguno. */
    ultimo: () => (ultimo ? { ...ultimo } : null),
  };
}
