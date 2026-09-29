import { navigate } from "./geometry";
import type { AgentId } from "./agents";

export type Pt = { x: number; y: number };

export type ZoneId = "lounge" | "orch" | "work" | "deliv";

export type Pose =
  | "idle"
  | "walk"
  | "work"
  | "sleep"
  | "read"
  | "game"
  | "watch"
  | "sit"
  | "present"
  | "deliver"
  | "coffee";

export type Slot = {
  x: number;
  y: number;
  pose: Pose;
  flip?: boolean;
};

/** Lienzo del plano. Proporción tomada de la segunda referencia (personajes
 * y mobiliario pequeños respecto a las salas): las salas son generosas y los
 * personajes se dibujan a media escala (ver `CHAR_SCALE` en FloorPlan.tsx). */
export const VIEW = { w: 1280, h: 860 };

/** Rectángulos interiores de cada sala. */
export const ROOMS: Record<ZoneId, { x: number; y: number; w: number; h: number; name: string; sub: string }> = {
  lounge: { x: 24, y: 24, w: 572, h: 390, name: "Sala de descanso", sub: "sin tarea activa" },
  orch: { x: 660, y: 24, w: 596, h: 390, name: "Sala de reuniones", sub: "seguimiento del equipo" },
  work: { x: 24, y: 498, w: 572, h: 338, name: "Sala de trabajo", sub: "una mesa por agente" },
  deliv: { x: 660, y: 498, w: 596, h: 338, name: "Zona de entregas", sub: "bandeja de salida" },
};

/** Pasillo horizontal único: todas las salas dan a él, así que cualquier
 * ruta entre dos salas pasa siempre por un punto de unión central. */
export const CORRIDOR = { x: 24, y: 414, w: 1232, h: 84 };
export const JUNCTION: Pt = { x: 628, y: 456 };

type Door = { at: Pt; x: number; span: number; wall: "b" | "t" };

export const DOORS: Record<ZoneId, Door> = {
  lounge: { at: { x: 310, y: 414 }, x: 310, span: 92, wall: "b" },
  orch: { at: { x: 950, y: 414 }, x: 950, span: 92, wall: "b" },
  work: { at: { x: 310, y: 498 }, x: 310, span: 92, wall: "t" },
  deliv: { at: { x: 950, y: 498 }, x: 950, span: 92, wall: "t" },
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Construye el camino a pie entre dos salas, siempre a través del pasillo. */
export function buildPath(from: ZoneId, start: Pt, to: ZoneId, end: Pt): Pt[] {
  void from; void to;
  return navigate(start, end);
}

export function pathLength(pts: Pt[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

export function pointAt(path: Pt[], travelled: number): { p: Pt; dir: number; done: boolean } {
  let rest = travelled;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const d = dist(a, b);
    if (rest <= d || i === path.length - 1) {
      const t = d === 0 ? 1 : Math.min(1, rest / d);
      return {
        p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        dir: b.x < a.x ? -1 : b.x > a.x ? 1 : 0,
        done: i === path.length - 1 && rest >= d,
      };
    }
    rest -= d;
  }
  return { p: path[path.length - 1], dir: 1, done: true };
}

/* ------------------------------------------------------------------ */
/* Puestos dentro de cada sala                                         */
/* ------------------------------------------------------------------ */

/** Sala de descanso — variedad de actividades, nunca una fila de espera. */
export const LOUNGE_SLOTS: Slot[] = [
  { x: 120, y: 176, pose: "read" },
  { x: 190, y: 178, pose: "sleep" },
  { x: 320, y: 168, pose: "watch", flip: true },
  { x: 290, y: 300, pose: "game" },
  { x: 96, y: 320, pose: "coffee" },
  { x: 480, y: 210, pose: "idle", flip: true },
  { x: 220, y: 340, pose: "idle" },
  { x: 420, y: 320, pose: "sit", flip: true },
  { x: 170, y: 250, pose: "sit" },
  { x: 480, y: 120, pose: "idle" },
];

/** Puesto de mando del orquestador seleccionado en el estado local. */
export const COMMAND_SEAT: Pt = { x: 806, y: 130 };
/** Silla de reunión donde se sienta quien esté recibiendo el encargo. */
export const MEETING_SEAT: Pt = { x: 806, y: 240 };
/** Despacho propio de Javier (dueño): separado del puesto de mando. */
export const OWNER_DESK: Pt = { x: 1152, y: 340 };

/** Sala de trabajo — una mesa por cada rol que ejecuta el ciclo. */
export const WORK_SLOTS: Record<AgentId, Pt> = {
  co: { x: 118, y: 610 },
  cl: { x: 288, y: 610 },
  ge: { x: 458, y: 610 },
  gr: { x: 118, y: 735 },
  op: { x: 288, y: 735 },
  ex: { x: 458, y: 735 },
  // pi, ja y om no ocupan mesa de trabajo fija: no entran en el ciclo genérico.
  pi: { x: -1, y: -1 },
  ja: { x: -1, y: -1 },
  om: { x: -1, y: -1 },
  be: { x: 288, y: 735 },
};

/** Zona de entregas — bandeja de salida, una posición por rol rotativo. */
export const DELIV_SLOTS: Record<AgentId, Pt> = {
  co: { x: 736, y: 612 },
  cl: { x: 862, y: 612 },
  ge: { x: 988, y: 612 },
  gr: { x: 736, y: 750 },
  op: { x: 862, y: 750 },
  ex: { x: 988, y: 750 },
  pi: { x: -1, y: -1 },
  ja: { x: -1, y: -1 },
  om: { x: -1, y: -1 },
  be: { x: 862, y: 750 },
};

/** Puestos de trabajo `tra-N` en la Zona de Entregas para workers ejecutando en worktrees de Herdr.
 *  Los cubos de bandeja se reemplazan por mesas activas cuando hay lease activo en el Vigía. */
export const WORKER_SLOTS: Pt[] = [
  { x: 736, y: 580 }, // tra-1
  { x: 862, y: 580 }, // tra-2
  { x: 988, y: 580 }, // tra-3
  { x: 736, y: 720 }, // tra-4
  { x: 862, y: 720 }, // tra-5
  { x: 988, y: 720 }, // tra-6
];

/** Posiciones de planificación dinámica en la Sala de Trabajo para agentes del pool equipo-1.
 *  Rotadas y libres (sin mesa fija), para reflejar discusión y diseño conceptual. */
export const EQUIPO1_SLOTS: Pt[] = [
  { x: 118, y: 580 }, // planning-1
  { x: 230, y: 565 }, // planning-2
  { x: 342, y: 575 }, // planning-3
  { x: 458, y: 580 }, // planning-4
  { x: 170, y: 700 }, // planning-5
  { x: 290, y: 690 }, // planning-6
  { x: 410, y: 705 }, // planning-7
];

/** Waypoints de patrulla del Vigía (`pi`): recorre las cuatro zonas
 *  disparado por eventos de auditoría del orquestador. */
export const VIGIA_PATROL: Pt[] = [
  { x: 806, y: 130 },  // orch – puesto de mando
  { x: 310, y: 600 },  // work – sala de trabajo
  { x: 170, y: 200 },  // lounge – sala de descanso
  { x: 862, y: 650 },  // deliv – zona de entregas
  { x: 1152, y: 340 }, // orch – despacho de Javier
];

export const ZONE_ORDER: ZoneId[] = ["lounge", "orch", "work", "deliv"];

export const ZONE_META: Record<ZoneId, { step: number; tone: string }> = {
  lounge: { step: 1, tone: "#5ecef5" },
  orch: { step: 2, tone: "#e8955e" },
  work: { step: 3, tone: "#005fa9" },
  deliv: { step: 4, tone: "#b46734" },
};

/** Silla de visita del despacho de Javier, sin invadir la mesa. */
export const VISITOR_SEAT: Pt = {x:1152,y:210};

/** Puestos de espera para varias fichas abiertas a la vez: cada agente con
 * ficha abierta ocupa uno, por orden de llegada, sin invadir mobiliario ni
 * paredes (verificado contra `geometry.ts` al definirlos). */
export const WAITING_SLOTS: Pt[] = [
 {x:900,y:60},
 {x:900,y:120},
 {x:900,y:180},
 {x:900,y:240},
 {x:900,y:300},
 {x:900,y:360},
];
