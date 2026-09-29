// tema-overlay.js — extractor común de estilos para overlays de OBS.
//
// Funciones exportadas:
//
//   cargarTema(id)
//     Carga el JSON de categoría desde ./<aliasExterno>.json usando fetch.
//     Devuelve el objeto TemaOverlay listo para pasar a aplicarTema().
//
//   cargarTemaEmbebido(tema)
//     Variante sin red: el caller inyecta el objeto JSON ya parseado.
//     Útil para demos offline (file://) o tests.
//
//   aplicarTema(tokens)
//     Escribe las CSS variables del tema en :root y refresca data-estilo
//     en los elementos .tema-marco presentes.
//
//   tokensDerivados(tokens)
//     Devuelve un objeto plano con los tokens CSS normalizados que se
//     aplican al documento. Útil para tests y para inspección.
//
// Diseño:
//
//   - El módulo no toca nada del DOM hasta que se llama a aplicarTema().
//     Esto permite importarlo desde tests de Node sin ventana.
//   - Si aplicarTema() recibe un tema desconocido (sin paleta), lanza
//     Error para que el caller lo registre en vez de fallar silencioso.
//   - Compatible con navegador moderno (ES2022) y con Node 21+ (mínimo
//     declarado en directo/package.json).

/** @typedef {{fondo:string, primario:string, secundario:string, borde:string, texto:string, acento:string}} PaletaOverlay */
/** @typedef {{principal:string, mono:string}} FuentesOverlay */
/** @typedef {{estilo:'solido'|'cristal'|'cristal-color', radio:string, grosorBorde:string, sombra:string}} MarcoOverlay */
/** @typedef {{titulo:string, subtitulo:string, duracionSeg:number}} IntroOverlay */
/** @typedef {{pausa:string, comenzamos:string, alertaSeguidor:string}} TextosOverlay */
/**
 * @typedef {Object} TemaOverlay
 * @property {string} id
 * @property {string} aliasExterno
 * @property {string} nombre
 * @property {string} [descripcion]
 * @property {PaletaOverlay} paleta
 * @property {FuentesOverlay} fuentes
 * @property {MarcoOverlay} marco
 * @property {IntroOverlay} intro
 * @property {TextosOverlay} textos
 */

/** Rutas candidatas para cargarTema(). El primer directorio es el del propio
 * overlay; el segundo es el demo; el tercero cae al servidor de la oficina. */
const RUTAS_TEMA = [
  (alias) => `../${alias}.json`,
  (alias) => `./${alias}.json`,
  (alias) => `./directo/temas/${alias}.json`,
  (alias) => `/directo/temas/${alias}.json`,
];

export const TOKENS_CSS = Object.freeze([
  '--color-primary',
  '--color-secondary',
  '--color-dark',
  '--color-border',
  '--color-text',
  '--color-accent',
  '--font-primary',
  '--font-mono',
  '--marco-estilo',
  '--marco-radio',
  '--marco-grosor',
  '--marco-sombra',
]);

const MAPA_PALETA_A_CSS = Object.freeze({
  primario: '--color-primary',
  secundario: '--color-secondary',
  oscuro: '--color-dark',
  fondo: '--color-dark',
  borde: '--color-border',
  texto: '--color-text',
  acento: '--color-accent',
});

/** Convierte un TemaOverlay en el objeto plano de tokens CSS que se aplican. */
export function tokensDerivados(tema) {
  if (!tema || typeof tema !== 'object') {
    throw new Error('aplicarTema: se esperaba un objeto de tema.');
  }
  if (!tema.paleta) {
    throw new Error('aplicarTema: el tema no incluye paleta.');
  }
  const tokens = {};
  for (const [clave, valor] of Object.entries(tema.paleta)) {
    const cssVar = MAPA_PALETA_A_CSS[clave];
    if (!cssVar) continue;
    tokens[cssVar] = valor;
  }
  if (tema.fuentes) {
    if (tema.fuentes.principal) tokens['--font-primary'] = tema.fuentes.principal;
    if (tema.fuentes.mono) tokens['--font-mono'] = tema.fuentes.mono;
  }
  if (tema.marco) {
    tokens['--marco-estilo'] = tema.marco.estilo || 'solido';
    tokens['--marco-radio'] = tema.marco.radio || '10px';
    tokens['--marco-grosor'] = tema.marco.grosorBorde || '2px';
    tokens['--marco-sombra'] = tema.marco.sombra || 'none';
  }
  return tokens;
}

/** Aplica el tema al documento. Escribe las CSS vars en :root y refresca
 *  data-estilo en .tema-marco. No toca nada si recibe null. */
export function aplicarTema(tema) {
  const tokens = tokensDerivados(tema);
  // En navegador: document.documentElement.style.setProperty
  // En Node (tests): aceptamos un root mockeado vía globalThis.__temaRoot,
  // donde __temaRoot.style ya es la CSSStyleDeclaration.
  const rootStyle =
    typeof document !== 'undefined'
      ? document.documentElement.style
      : (globalThis.__temaRoot && globalThis.__temaRoot.style) || null;
  if (rootStyle && typeof rootStyle.setProperty === 'function') {
    for (const [prop, valor] of Object.entries(tokens)) {
      rootStyle.setProperty(prop, valor);
    }
  }
  if (typeof document !== 'undefined') {
    for (const el of document.querySelectorAll('.tema-marco')) {
      if (tema.marco?.estilo) el.setAttribute('data-estilo', tema.marco.estilo);
    }
  }
  return tokens;
}

/** Carga el JSON desde las rutas candidatas. Devuelve el primer éxito. */
export async function cargarTema(id) {
  if (typeof id !== 'string' || !id) {
    throw new Error(`cargarTema: id no válido: ${JSON.stringify(id)}.`);
  }
  const alias = normalizarAlias(id);
  let ultimoError = null;
  for (const ruta of RUTAS_TEMA.map((fab) => fab(alias))) {
    try {
      const res = await fetch(ruta, { cache: 'no-store' });
      if (!res.ok) {
        ultimoError = new Error(`HTTP ${res.status} en ${ruta}`);
        continue;
      }
      const datos = await res.json();
      // Si el JSON declara un aliasExterno distinto al id pedido, no pasa.
      // Esto evita que `cargarTema('musica')` cargue por error
      // `desarrollo-de-software.json`.
      if (datos.id && datos.id !== id && datos.aliasExterno && datos.aliasExterno !== alias) {
        ultimoError = new Error(`JSON en ${ruta} no corresponde al id "${id}" (declaró "${datos.id}").`);
        continue;
      }
      return datos;
    } catch (err) {
      ultimoError = err;
    }
  }
  throw new Error(`No se pudo cargar el tema "${id}": ${ultimoError?.message ?? 'sin red'}.`);
}

/** Versión sin red: el caller inyecta el JSON ya parseado. */
export function cargarTemaEmbebido(tema) {
  if (!tema || typeof tema !== 'object') {
    throw new Error('cargarTemaEmbebido: se esperaba un objeto de tema.');
  }
  return tema;
}

/** Normaliza el id al aliasExterno. Hoy son idénticos, pero el contrato
 *  permite que un id interno (apps) tenga aliasExterno "desarrollo-de-software". */
export function normalizarAlias(id) {
  if (id === 'apps') return 'desarrollo-de-software';
  return id;
}

/** Lista los alias de archivo disponibles. */
export const ALIASES_DISPONIBLES = Object.freeze([
  'musica',
  'arte',
  'desarrollo-de-software',
]);