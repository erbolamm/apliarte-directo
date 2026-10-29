// Módulo canónico del juego "Hundir la Flota" (!flota) para el tablero 12x8
export const AUTORIZADORES_STREAM = new Set(["ja", "apliarte", "erbolamm"]);
export const COLUMNAS_TABLERO = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
export const BARCOS_CONFIG_DEFAULT = [4, 3, 2, 2, 1]; // Tamaños de barco estándar

/**
 * Determina si un usuario puede iniciar una partida de juego (!flota, !trofeo, etc.).
 * Permitido a Javier (broadcaster/apliarte/erbolamm) y suscriptores de Twitch (badge subscriber).
 */
export function puedeIniciarJuego(usuario, { badges = null } = {}) {
  const u = String(usuario ?? "").trim().toLowerCase();
  if (AUTORIZADORES_STREAM.has(u)) return true;
  if (badges) {
    const bStr = String(badges);
    if (bStr.includes("broadcaster")) return true;
    if (bStr.includes("subscriber")) return true;
  }
  return false;
}

/**
 * Mensaje pedagógico si un usuario sin suscripción intenta iniciar un juego.
 */
export function mensajeExplicativoNoSub(usuario, comando = "!flota") {
  return `@${usuario} Para poder iniciar ${comando} en el directo necesitas estar suscrito al canal de Twitch (twitch.tv/apliarte). ¡Suscríbete y podrás invocar cualquier minijuego!`;
}

/**
 * Mensaje educado avisando de que ya existe un juego activo.
 */
export function mensajeJuegoEnCurso(comando = "!flota", juegoActual = "una partida") {
  return `Ya hay ${juegoActual} en curso. ¡Terminemos esta ronda antes de iniciar ${comando}!`;
}

/**
 * Convierte notación como "c3" en { col: 2, row: 2 } (0-indexed).
 */
export function parsearCasilla(casillaStr) {
  const m = String(casillaStr ?? "").trim().toLowerCase().match(/^([a-l])([1-8])$/);
  if (!m) return null;
  const col = COLUMNAS_TABLERO.indexOf(m[1]);
  const row = parseInt(m[2], 10) - 1;
  return { col, row };
}

/**
 * Crea una nueva partida de Hundir la Flota sobre la cuadrícula 12x8.
 */
export function crearPartidaFlota(opciones = {}) {
  const filas = 8;
  const columnas = 12;
  let barcos = opciones.barcos;

  if (!barcos) {
    barcos = [
      { id: "acorazado", casillas: [{ col: 1, row: 2 }, { col: 2, row: 2 }, { col: 3, row: 2 }, { col: 4, row: 2 }] },
      { id: "crucero", casillas: [{ col: 6, row: 4 }, { col: 6, row: 5 }, { col: 6, row: 6 }] },
      { id: "destructor1", casillas: [{ col: 8, row: 1 }, { col: 9, row: 1 }] },
      { id: "destructor2", casillas: [{ col: 2, row: 6 }, { col: 3, row: 6 }] },
      { id: "submarino", casillas: [{ col: 10, row: 3 }] }
    ];
  }

  return {
    activa: true,
    filas,
    columnas,
    barcos: barcos.map((b) => ({
      id: b.id,
      casillas: b.casillas.map((c) => ({ ...c })),
      impactos: new Set()
    })),
    disparos: new Map(), // "col,row" -> { usuario, resultado }
    marcador: {} // usuario -> puntos
  };
}

/**
 * Procesa un disparo en el tablero (!a1 .. !l8).
 * Retorna { resultado: "agua"|"golpe"|"hundido"|"repetido", puntos: number, barcoId: string|null }
 */
export function dispararFlota(partida, usuario, casillaStr) {
  if (!partida || !partida.activa) return { resultado: "inactiva", puntos: 0 };
  const pos = parsearCasilla(casillaStr);
  if (!pos) return { resultado: "invalida", puntos: 0 };

  const clave = `${pos.col},${pos.row}`;
  if (partida.disparos.has(clave)) {
    return { resultado: "repetido", puntos: 0, casilla: casillaStr };
  }

  const u = String(usuario ?? "anon");
  partida.marcador[u] = partida.marcador[u] ?? 0;

  // Buscar si alguna nave ocupa esa posición
  for (const barco of partida.barcos) {
    const indice = barco.casillas.findIndex((c) => c.col === pos.col && c.row === pos.row);
    if (indice !== -1) {
      barco.impactos.add(indice);
      const estaHundido = barco.impactos.size === barco.casillas.length;
      const puntos = estaHundido ? 2 : 1;
      const resultado = estaHundido ? "hundido" : "golpe";

      partida.disparos.set(clave, { usuario: u, resultado, barcoId: barco.id });
      partida.marcador[u] += puntos;

      // Comprobar si toda la flota está hundida
      const todosHundidos = partida.barcos.every((b) => b.impactos.size === b.casillas.length);
      if (todosHundidos) {
        partida.activa = false;
      }

      return {
        resultado,
        puntos,
        barcoId: barco.id,
        casilla: casillaStr,
        todosHundidos
      };
    }
  }

  // Si no impactó en ningún barco -> Agua
  partida.disparos.set(clave, { usuario: u, resultado: "agua" });
  return { resultado: "agua", puntos: 0, casilla: casillaStr };
}
