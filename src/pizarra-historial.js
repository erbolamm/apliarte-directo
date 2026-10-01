// Drawing history on disk, so a centre restart does not wipe the board.
// The centre keeps the history in memory and asks this module to save it;
// writes are debounced and atomic, and a damaged file is moved aside.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const MAX_TEXT = 120;

const punto = (p) =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

export function segmentoValido(seg) {
  if (!seg || typeof seg !== "object" || seg.type !== "pizarra_draw") return false;
  if (!punto(seg.from) || !punto(seg.to)) return false;
  if (seg.strokeId !== undefined && (typeof seg.strokeId !== "string" || seg.strokeId.length > 100)) return false;
  if (seg.size !== undefined && !(Number.isFinite(seg.size) && seg.size > 0 && seg.size <= 100)) return false;
  if (seg.color !== undefined && (typeof seg.color !== "string" || seg.color.length > 32)) return false;
  if (seg.text !== undefined && (typeof seg.text !== "string" || seg.text.length > MAX_TEXT)) return false;
  return true;
}

export function cargarHistorial(archivo, max) {
  if (!existsSync(archivo)) return [];
  let datos;
  try {
    datos = JSON.parse(readFileSync(archivo, "utf8"));
    if (!Array.isArray(datos)) throw new Error("no es una lista");
  } catch {
    // Keep the damaged copy for manual recovery and start with a clean board.
    try {
      renameSync(archivo, `${archivo}.danado-${Date.now()}`);
    } catch {
      /* if it cannot be moved, it is still never overwritten until a new save */
    }
    return [];
  }
  const validos = datos.filter(segmentoValido);
  return validos.length > max ? validos.slice(validos.length - max) : validos;
}

function escribirAtomico(archivo, historial) {
  mkdirSync(dirname(archivo), { recursive: true });
  const temporal = `${archivo}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporal, JSON.stringify(historial));
  renameSync(temporal, archivo);
}

export function crearGuardador(
  archivo,
  { retrasoMs = 1000, programar = setTimeout, cancelar = clearTimeout, alFallar = () => {} } = {},
) {
  let pendiente = null;
  let ultimo = null;
  const escribir = () => {
    pendiente = null;
    if (!ultimo) return;
    try {
      escribirAtomico(archivo, ultimo);
    } catch (error) {
      alFallar(error);
    }
  };
  return {
    programar(historial) {
      ultimo = historial;
      if (pendiente === null) pendiente = programar(escribir, retrasoMs);
    },
    ahora() {
      if (pendiente !== null) cancelar(pendiente);
      escribir();
    },
  };
}
