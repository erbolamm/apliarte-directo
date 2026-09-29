/**
 * Filtro de palabras prohibidas (lista negra) para el TTS del directo.
 *
 * Punto único para que `tts-twitch.html` y `tts-multiplataforma.html`
 * silencien o censuren los mensajes que contengan palabras de una lista
 * negra gestionada por el usuario.
 *
 * Coincidencia robusta:
 *  - Insensible a mayúsculas y minúsculas.
 *  - Ignora tildes y diacríticos (NFD + strip combining marks).
 *  - Acepta leetspeak básico (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s).
 *  - Límite de palabra: una prohibida NO coincide dentro de otra más larga
 *    (p. ej. "mala" no matchea dentro de "amalgama" ni de "malote").
 *
 * Modos:
 *  - 'silenciar': el mensaje no se lee. `apto = false`.
 *  - 'censurar': la palabra prohibida se reemplaza por un carácter fijo
 *    (por defecto `***`), preservando el resto del mensaje.
 *
 * Compatible con navegador y Node 21.7+ (sin dependencias).
 */

export const MODOS = Object.freeze({
 SILENCIAR: "silenciar",
 CENSURAR: "censurar",
});

export const REEMPLAZO_POR_DEFECTO = "***";

// ─── Normalización ─────────────────────────────────────────────────────────

/**
 * Normaliza un texto para hacerlo comparable: NFD + sin diacríticos + minúsculas.
 * Mantiene la longitud de cada carácter (no quita letras, solo acentos).
 */
export function normalizarParaMatching(texto) {
 return String(texto ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();
}

/**
 * Aplica leetspeak básico. Cada sustitución es 1-carácter-por-1-carácter
 * para preservar longitudes (necesario para mapear offsets al original).
 */
export function desleetear(texto) {
 return String(texto ?? "")
  .replace(/0/g, "o")
  .replace(/1/g, "i")
  .replace(/3/g, "e")
  .replace(/4/g, "a")
  .replace(/5/g, "s")
  .replace(/7/g, "t")
  .replace(/@/g, "a")
  .replace(/\$/g, "s");
}

/** Combina normalización + leetspeak: el resultado es lo que se compara. */
export function textoParaMatching(texto) {
 return desleetear(normalizarParaMatching(texto));
}

/**
 * Construye un regex global con límite de "no alfanumérico" alrededor de
 * la palabra prohibida (normalizada + desleetada). Devuelve `null` si la
 * prohibida queda vacía tras normalizar.
 */
export function patronParaPalabra(palabra) {
 const p = textoParaMatching(String(palabra ?? "").trim());
 if (!p) return null;
 const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
 return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "gi");
}

// ─── API principal ─────────────────────────────────────────────────────────

/**
 * Filtra un mensaje contra una lista negra.
 *
 * @param {string} texto           mensaje original (puede tener mayúsculas,
 *                                 tildes, leetspeak, puntuación, etc.)
 * @param {string[]} listaNegra    palabras prohibidas. Vacías o con solo
 *                                 espacios se ignoran.
 * @param {object} [opciones]
 * @param {'silenciar'|'censurar'} [opciones.modo='censurar']
 * @param {string} [opciones.reemplazo='***']
 *
 * @returns {{apto: boolean, texto: string, hallazgos: string[]}}
 *   - `apto=false` → el mensaje NO debe leerse (modo silenciar con match).
 *   - `texto`      → mensaje final (original si no hay match o modo silenciar;
 *                    censurado si hay match y modo censurar).
 *   - `hallazgos`  → lista de prohibidas detectadas (en la forma en que
 *                    estaban en la lista, sin normalizar).
 */
export function filtrarMensaje(texto, listaNegra = [], opciones = {}) {
 const modo =
  opciones.modo === MODOS.SILENCIAR ? MODOS.SILENCIAR : MODOS.CENSURAR;
 const reemplazo = opciones.reemplazo ?? REEMPLAZO_POR_DEFECTO;
 const original = String(texto ?? "");
 const matching = textoParaMatching(original);
 const lista = Array.isArray(listaNegra) ? listaNegra : [];

 if (lista.length === 0 || original === "") {
  return { apto: true, texto: original, hallazgos: [] };
 }

 // Recolectamos todas las coincidencias sobre la versión "matching" del texto,
 // guardando sus rangos [inicio, fin). Como la normalización+leet preserva
 // la longitud 1-a-1, esos rangos sirven directamente sobre el original.
 const matches = [];
 const hallazgosSet = new Set();
 for (const prohibida of lista) {
  const p = String(prohibida ?? "").trim();
  if (!p) continue;
  const patron = patronParaPalabra(p);
  if (!patron) continue;
  let m;
  while ((m = patron.exec(matching)) !== null) {
   const grupo = m[1] || "";
   const inicio = m.index + grupo.length;
   const fin = inicio + textoParaMatching(p).length;
   matches.push({ inicio, fin });
   hallazgosSet.add(p);
  }
 }

 if (matches.length === 0) {
  return { apto: true, texto: original, hallazgos: [] };
 }

 if (modo === MODOS.SILENCIAR) {
  return { apto: false, texto: original, hallazgos: [...hallazgosSet] };
 }

 // Censurar: ordenamos matches de derecha a izquierda para no invalidar offsets.
 matches.sort((a, b) => b.inicio - a.inicio || b.fin - a.fin);
 let censurado = original;
 for (const { inicio, fin } of matches) {
  censurado = censurado.slice(0, inicio) + reemplazo + censurado.slice(fin);
 }
 return { apto: true, texto: censurado, hallazgos: [...hallazgosSet] };
}

// ─── Utilidades para la UI ─────────────────────────────────────────────────

/**
 * Parsea el contenido de un textarea (una palabra por línea) en una lista.
 * - Ignora líneas vacías y con solo espacios.
 * - Ignora líneas que empiezan por `#` (comentarios).
 * - Aplica trim por línea.
 */
export function parsearLista(texto) {
 const out = [];
 for (const linea of String(texto ?? "").split(/\r?\n/)) {
  const t = linea.trim();
  if (!t || t.startsWith("#")) continue;
  out.push(t);
 }
 return out;
}

/** Serializa una lista al formato del textarea (una por línea). */
export function serializarLista(lista) {
 return (Array.isArray(lista) ? lista : []).join("\n");
}

// ─── Acceso de solo-lectura para tests ──────────────────────────────────────

export const __test__ = {
 MODOS,
 normalizarParaMatching,
 desleetear,
 textoParaMatching,
 patronParaPalabra,
 parsearLista,
 serializarLista,
};

export const FILTRO_PALABRAS_VERSION = "0.1.0";
