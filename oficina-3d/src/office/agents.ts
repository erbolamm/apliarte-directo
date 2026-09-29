// Los 8 personajes de la oficina. Colores e identidad ya decididos por Javier
// en la tarea de este borrador — no se cambian aquí.
//
// `co`, `cl`, `ge`, `gr`, `op` y `ex` son los seis roles que "circulan" por el
// recorrido completo (descanso -> orquestador -> trabajo -> entregas).
// `pi` (Gentleman) es el orquestador vigente / Vigía itinerante: patrulla entre
// orch, work, lounge y deliv según los eventos de auditoría del orquestador.
// `ja` (Javier) es el dueño humano: tiene su propio despacho, separado del
// puesto de mando, y no entra en el ciclo de trabajo salvo que decida asumir
// la orquestación.

export type AgentId = "co" | "cl" | "pi" | "ja" | "ge" | "gr" | "op" | "om" | "ex" | "be";

/** Los roles que ejecutan el ciclo completo de tareas. */
export const ROTATING_IDS: AgentId[] = ["co", "cl", "ge", "gr", "op", "ex", "be"];

/* ------------------------------------------------------------------ */
/* Modelo de datos de agentes vivos — feed desde /api/oficina/agentes-vivos */
/* ------------------------------------------------------------------ */

/** Estado del Vigía itinerante. */
export type VigiaStatus = "patrolling" | "auditing" | "notifying" | "resting";

/** Un agente activo en Herdr con su workspace asignado. */
export type LiveAgent = {
  /** Role id corto (co, cl, ge, gr, op, ex, be, pi, om). */
  role: AgentId;
  /** Workspace label en Herdr (ej. "orquestador", "equipo-1", "equipo-2"). */
  workspace: string;
  /** Estado del agente en Herdr (working, idle, waiting_for_input...). */
  herdrStatus: string;
  /** ID de panel en Herdr. */
  paneId: string;
};

/** Lease activo del Vigía: un worker picando código en un worktree. */
export type WorkerLease = {
  /** ID de la mesa tra-N (1-based). */
  slot: number;
  /** Role del worker ejecutor. */
  role: AgentId;
  /** Nombre de la tarjeta que está ejecutando. */
  taskCard: string;
  /** Path del worktree en el que está trabajando. */
  worktree: string;
};

/** Snapshot consolidado que llega desde /api/oficina/agentes-vivos. */
export type LiveSnapshot = {
  /** Marca de validez: false si el endpoint no responde o hay error. */
  valid: boolean;
  /** Agentes activos en terminales Herdr. */
  agents: LiveAgent[];
  /** Agente actual con el rol de orquestador. */
  orchestrator: AgentId | null;
  /** Workers con lease activo en el Vigía (picando código en worktrees). */
  workerLeases: WorkerLease[];
  /** Estado actual del Vigía itinerante. */
  vigiaStatus: VigiaStatus;
};

/** Normaliza la respuesta cruda de /api/oficina/agentes-vivos. */
export function normalizeLiveSnapshot(raw: unknown): LiveSnapshot {
  const p = raw as Record<string, unknown> | null;
  const empty: LiveSnapshot = {
    valid: false,
    agents: [],
    orchestrator: null,
    workerLeases: [],
    vigiaStatus: "resting",
  };
  if (!p || typeof p !== "object") return empty;
  if (p.valid !== true) return { ...empty, valid: false };

  const knownRoles = new Set<string>(["co", "cl", "pi", "ja", "ge", "gr", "op", "om", "ex", "be"]);

  const rawAgents = Array.isArray(p.agents) ? p.agents : [];
  const agents: LiveAgent[] = rawAgents
    .filter((a): a is Record<string, unknown> => a && typeof a === "object" && knownRoles.has(a.role as string))
    .map((a) => ({
      role: a.role as AgentId,
      workspace: String(a.workspace || ""),
      herdrStatus: String(a.herdrStatus || "unknown"),
      paneId: String(a.paneId || ""),
    }));

  const orch = typeof p.orchestrator === "string" && knownRoles.has(p.orchestrator)
    ? (p.orchestrator as AgentId)
    : null;

  const rawLeases = Array.isArray(p.workerLeases) ? p.workerLeases : [];
  const workerLeases: WorkerLease[] = rawLeases
    .filter((l): l is Record<string, unknown> => l && typeof l === "object")
    .map((l, i) => ({
      slot: typeof l.slot === "number" ? l.slot : i + 1,
      role: (knownRoles.has(l.role as string) ? l.role : "be") as AgentId,
      taskCard: String(l.taskCard || ""),
      worktree: String(l.worktree || ""),
    }));

  const rawVigia = p.vigiaStatus as string;
  const vigiaStatus: VigiaStatus =
    rawVigia === "patrolling" || rawVigia === "auditing" || rawVigia === "notifying"
      ? rawVigia
      : "resting";

  return { valid: true, agents, orchestrator: orch, workerLeases, vigiaStatus };
}

export type AgentDef = {
  id: AgentId;
  name: string;
  role: string;
  vendor: string;
  color: string; // color base
  dark: string; // sombra (piernas, pliegues)
  light: string; // brillos
  shell: string; // piel / carcasa de la cabeza
  hint: string; // el "guiño" visual al proveedor
  defaultSkill: string;
  skillTitle: string;
  personality: string;
  example: string;
};

export const AGENTS: AgentDef[] = [
  {
    id: "co",
    name: "Codex",
    role: "Arquitectura y Contratos",
    vendor: "OpenAI",
    color: "#10a37f",
    dark: "#0b7a5e",
    light: "#57c9ac",
    shell: "#fdf6ea",
    hint: "Sudadera verde y chapa de nudo hexagonal",
    defaultSkill: "sdd-design",
    skillTitle: "Diseño de contratos, APIs y modelos",
    personality: "Estructurado, riguroso y metódico. Diseña los contratos y tests antes del código.",
    example: "Define esquemas JSON, interfaces TypeScript o modelos Dart sin ambigüedades.",
  },
  {
    id: "cl",
    name: "Claude",
    role: "Redacción y Contenido",
    vendor: "Anthropic",
    color: "#d97757",
    dark: "#b1543a",
    light: "#f0a88c",
    shell: "#fdf3e7",
    hint: "Jersey terracota y broche de destellos radiales",
    defaultSkill: "contenido-multiformato",
    skillTitle: "Copy-pack, landings y notas de versión",
    personality: "Empático, analítico y claro. Domina la comunicación técnica y de marca.",
    example: "Redacta el copy-pack multilingüe de una app o la landing en HTML5/CSS.",
  },
  {
    id: "pi",
    name: "Gentleman",
    role: "Auditoría y Feedback",
    vendor: "identidad propia",
    color: "#ff4e83",
    dark: "#cc2f60",
    light: "#ff90b2",
    shell: "#fff2f5",
    hint: "Bombín, monóculo y pajarita rosa",
    defaultSkill: "feedback-a-plan",
    skillTitle: "Revisión de calidad y verificación",
    personality: "Meticuloso, educado y exigente. Busca fallos y verifica pruebas reales.",
    example: "Compara el resultado contra la especificación y emite un veredicto justificado.",
  },
  {
    id: "ja",
    name: "Javier",
    role: "Dueño · Dirección y Revisión",
    vendor: "ApliArte (humano)",
    color: "#005fa9",
    dark: "#00427a",
    light: "#4a94cf",
    shell: "#f3c79c",
    hint: "El único humano: barba, taza y tarjeta de acceso",
    defaultSkill: "none",
    skillTitle: "Criterio humano y decisiones de negocio",
    personality: "Pragmático y visionario. Prioriza simplicidad frente a sobreingeniería.",
    example: "Aprueba o rechaza cambios, decide la publicación y marca el rumbo del producto.",
  },
  {
    id: "ge",
    name: "agy",
    role: "Diagnóstico y Sombreros",
    vendor: "Google",
    color: "#4285f4",
    dark: "#2b62c4",
    light: "#8ab4f8",
    shell: "#f4f8ff",
    hint: "Antena de chispa y botones en cuatro colores",
    defaultSkill: "six-hats",
    skillTitle: "Diagnóstico de alcance con Seis Sombreros",
    personality: "Polifacético, rápido y versátil. Examina problemas desde 6 ángulos distintos.",
    example: "Separa hechos, riesgos y alternativas antes de tocar un sistema complejo.",
  },
  {
    id: "gr",
    name: "Grok",
    role: "Benchmarking y Análisis",
    vendor: "xAI",
    color: "#4b5563",
    dark: "#2f3540",
    light: "#7b8696",
    shell: "#e8eaee",
    hint: "Cazadora oscura, visor y aspas cruzadas",
    defaultSkill: "benchmark-competitivo",
    skillTitle: "Investigación externa y comparativas",
    personality: "Curioso, directo y sin filtros. Contrasta datos de la competencia y el mercado.",
    example: "Compara características, precios y posicionamiento frente a otras apps.",
  },
  {
    id: "op",
    name: "opencode",
    role: "Auditoría Web y Rendimiento",
    vendor: "identidad propia",
    color: "#9aa4b2",
    dark: "#6d7683",
    light: "#c3cbd6",
    shell: "#2b3440",
    hint: "Cabeza-terminal con cursor y gorra al revés",
    defaultSkill: "auditoria-web",
    skillTitle: "Auditoría técnica, SEO y scripts",
    personality: "Práctico, enfocado en código directo y scripts automatizados de bajo nivel.",
    example: "Analiza enlaces rotos, tiempos de carga, semántica HTML y dependencias.",
  },
  {
    id: "om",
    name: "omp",
    role: "Automatización local",
    vendor: "identidad propia",
    color: "#64748b",
    dark: "#475569",
    light: "#94a3b8",
    shell: "#e2e8f0",
    hint: "Terminal compacta y marcador de procesos",
    defaultSkill: "auditoria-web",
    skillTitle: "Automatización y terminal local",
    personality: "Práctico, trazable y orientado a herramientas locales.",
    example: "Ejecuta comprobaciones locales reproducibles sin reclamar trabajo ajeno.",
  },
  {
    id: "ex",
    name: "Agente externo",
    role: "Identidad y Campañas",
    vendor: "genérico",
    color: "#a6a6a6",
    dark: "#7d7d7d",
    light: "#cfcfcf",
    shell: "#f2f0ed",
    hint: "Contorno discontinuo y acreditación de visita",
    defaultSkill: "campana-visual",
    skillTitle: "Diseño visual, guiones y storyboards",
    personality: "Creativo, adaptable y enfocado en el producto visible y la experiencia de usuario.",
    example: "Prepara storyboards, guiones de vídeo o recursos gráficos para difusión.",
  },
  {
    id: "be",
    name: "Becario",
    role: "Ejecución y Pruebas",
    vendor: "ErBolamm",
    color: "#005fa9",
    dark: "#004073",
    light: "#5ecef5",
    shell: "#f0f9ff",
    hint: "Gorra azul, mono de trabajo y mochila de herramientas",
    defaultSkill: "implementacion-tdd",
    skillTitle: "Código, pruebas unitarias y linters",
    personality: "Rápido, disciplinado y riguroso. Implementa código y pruebas bajo la tutela del Orquestador.",
    example: "Escribe funciones TypeScript, tests en Dart y linters sin tocar arquitectura.",
  },
];

export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentDef>;

export const TASK_POOL = [
  "Repartir INBOX.md entre las puertas de categorías",
  "Auditar licencias reales con gh api",
  "Redactar el brand-spec de un proyecto nuevo",
  "Cribar restos/ y generar la suite trabajo/",
  "Revisar una skill externa antes de integrarla",
  "Actualizar la bitácora con enlaces reales",
  "Preparar capturas para App Store / Play Store",
  "Sincronizar tareas del tablero compartido",
  "Comprobar subdominios rotos en Cloudflare",
  "Escribir las release notes multilingües",
  "Auditar contratos y modelos de datos",
  "Revisar el panel de costes y suscripciones",
];
