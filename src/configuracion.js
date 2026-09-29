/**
 * Validación de la configuración del centro de restream.
 *
 * Regla innegociable: las claves de emisión NO viven aquí. Cada destino declara el NOMBRE de la
 * variable de entorno que la contiene (`variableClave`), y el valor se lee en el momento de
 * lanzar el proceso. Así ni la configuración ni el panel ni los registros llegan a verlo.
 */

const PREFIJO_RTMP = /^rtmps?:\/\//i;

/** Oculta la clave de emisión de una URL RTMP para que sea segura de mostrar y registrar. */
export function enmascararUrl(url) {
  if (!url) return '';
  const partes = String(url).split('/');
  // rtmp://host/app  → 4 partes: ['rtmp:', '', 'host', 'app']. Sin clave que ocultar.
  if (partes.length <= 4) return String(url);
  return [...partes.slice(0, -1), '***'].join('/');
}

/**
 * @param {object} bruta            configuración leída del archivo
 * @param {object} entorno          normalmente `process.env`
 * @returns {{ok: boolean, errores: string[], avisos: string[], configuracion: object}}
 */
export function validarConfiguracion(bruta, entorno = {}, hasStoredKey = () => false) {
  const errores = [];
  const avisos = [];

  const destinosBrutos = Array.isArray(bruta?.destinos) ? bruta.destinos : [];
  if (destinosBrutos.length === 0) {
    errores.push('No hay ningún destino declarado en «destinos».');
  }

  const vistos = new Set();
  const destinos = destinosBrutos.map((d, i) => {
    const donde = `destino #${i + 1}`;

    if (!d?.nombre) {
      errores.push(`${donde}: falta el «nombre».`);
    } else if (vistos.has(d.nombre)) {
      errores.push(`${donde}: el nombre «${d.nombre}» está repetido.`);
    } else {
      vistos.add(d.nombre);
    }

    if (!d?.url) {
      errores.push(`${donde}: falta la «url».`);
    } else if (!PREFIJO_RTMP.test(d.url)) {
      errores.push(`${donde}: la url debe empezar por rtmp:// o rtmps://, y es «${d.url}».`);
    }

    // Un destino sin «variableClave» emite sin clave (destinos locales o de prueba): está listo.
    // Si la declara, solo está listo cuando esa variable existe de verdad en el entorno.
    // No distinguirlo dejaba «no listo» a un destino perfectamente emisible (visto el 2026-09-11).
    const listo = d?.variableClave ? Boolean(hasStoredKey(d) || entorno[d.variableClave]) : true;
    if (d?.variableClave && !listo) {
      avisos.push(
        `El destino «${d.nombre ?? donde}» aún no tiene clave: pégala en el panel, «⚙️ Config & OBS» → «🔑 Credenciales & Red» (o define la variable de entorno ${d.variableClave}).`,
      );
    }
    if (!d?.variableClave) {
      avisos.push(`El destino «${d.nombre ?? donde}» no declara «variableClave»: se emitirá sin clave.`);
    }

    return {
      nombre: d?.nombre,
      url: d?.url,
      variableClave: d?.variableClave ?? null,
      listo,
    };
  });

  const respaldo = bruta?.respaldo ?? null;

  return {
    ok: errores.length === 0,
    errores,
    avisos,
    configuracion: {
      destinos,
      respaldo,
      puertoRtmp: Number(bruta?.puertoRtmp ?? 1935),
      puertoPanel: Number(bruta?.puertoPanel ?? 8790),
      rutaEntrada: bruta?.rutaEntrada ?? 'live',
    },
  };
}
