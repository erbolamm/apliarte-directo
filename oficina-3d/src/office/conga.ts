// oficina-3d/src/office/conga.ts
// Pure state machine for the !conga circuit through the 3D office.
// No DOM, no React, no Three.js. All side effects live in runtime.ts.

export type CongaAgentId = 'co' | 'cl' | 'pi' | 'ja' | 'ge' | 'gr' | 'op' | 'om' | 'ex' | 'be';
export type CongaPt = { x: number; y: number };
export type CongaPhase = 'idle' | 'countdown' | 'dancing' | 'ended';

export type CongaDancer = {
  login: string;
  displayName: string;
  agentId: CongaAgentId;
  freeAssignment: boolean;
  index: number;
  joinedAt: number;
};

export type CongaState = {
  phase: CongaPhase;
  phaseStartedAt: number;
  countdownEndsAt: number;
  dancingEndsAt: number;
  dancers: CongaDancer[];
  adoptionRequests: string[];
  broadcaster: string;
};

export type CongaContext = {
  broadcaster: string;
  avatarOwners: Record<string, string>;
};

export const CONGA_COUNTDOWN_MS = 10_000;
export const CONGA_DANCE_MS = 30_000;
export const CONGA_ENDED_MS = 8_000;
/** Spacing between dancers as a fraction of the circuit (0.018 ~= 0.54s of dance). */
export const CONGA_SPACING = 0.018;
/** Credit sign text shown while the countdown or dance is active. No emojis. */
export const CONGA_CREDIT = 'Idea: Conga de ManzDev · manz.dev';
/** Adoption request text for free-assigned avatars. No emojis. */
export const CONGA_ADOPT_TEXT = 'Adoptadme, por favor';

/** Pool of avatars that can be temporarily assigned to viewers without an adopted avatar.
 *  Excludes `ja` (the leader) and `om` (not animated in the office). */
const DANCING_POOL: CongaAgentId[] = ['co', 'cl', 'pi', 'ge', 'gr', 'op', 'ex', 'be'];

/** Circuit waypoints. One full circuit returns to the start.
 *  Every room is entered and left through its door (layout.ts DOORS at x=310/950,
 *  walls at y=414/498) and rooms are linked only through the corridor (y=456),
 *  so dancers never cross a wall. */
export const CONGA_CIRCUIT: CongaPt[] = [
  { x: 310, y: 300 }, // lounge (descanso)
  { x: 310, y: 414 }, // lounge door
  { x: 310, y: 456 }, // corridor
  { x: 950, y: 456 }, // corridor
  { x: 950, y: 414 }, // orch door
  { x: 950, y: 250 }, // orch (reuniones)
  { x: 950, y: 414 }, // orch door
  { x: 950, y: 456 }, // corridor
  { x: 950, y: 498 }, // deliv door
  { x: 950, y: 640 }, // deliv (entregas)
  { x: 950, y: 498 }, // deliv door
  { x: 950, y: 456 }, // corridor
  { x: 310, y: 456 }, // corridor
  { x: 310, y: 498 }, // work door
  { x: 310, y: 640 }, // work (trabajo)
  { x: 310, y: 498 }, // work door
  { x: 310, y: 456 }, // corridor
  { x: 310, y: 414 }, // lounge door
  { x: 310, y: 300 }, // lounge (back to start)
];

/** Total length of the circuit path in pixels. */
export function circuitLength(): number {
  let l = 0;
  for (let i = 1; i < CONGA_CIRCUIT.length; i++) {
    const a = CONGA_CIRCUIT[i - 1];
    const b = CONGA_CIRCUIT[i];
    l += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return l;
}

/** Empty initial state. */
export function emptyCongaState(broadcaster?: string): CongaState {
  return {
    phase: 'idle',
    phaseStartedAt: 0,
    countdownEndsAt: 0,
    dancingEndsAt: 0,
    dancers: [],
    adoptionRequests: [],
    broadcaster: broadcaster || 'apliarte',
  };
}

function normalizeLogin(login: string): string {
  return String(login || '').trim().toLowerCase();
}

function isBroadcaster(login: string, ctx: CongaContext): boolean {
  return normalizeLogin(login) === normalizeLogin(ctx.broadcaster);
}

function pickFreeAvatar(used: Set<CongaAgentId>, ctx: CongaContext): CongaAgentId | null {
  for (const id of DANCING_POOL) {
    if (used.has(id)) continue;
    if (ctx.avatarOwners[id]) continue;
    return id;
  }
  return null;
}

function findAdoptedAvatar(login: string, ctx: CongaContext): CongaAgentId | null {
  const key = normalizeLogin(login);
  for (const avatar of Object.keys(ctx.avatarOwners)) {
    const owner = ctx.avatarOwners[avatar];
    if (owner && normalizeLogin(owner) === key) return avatar as CongaAgentId;
  }
  return null;
}

/** Start a new conga. Only the broadcaster can start, and only from idle or ended. */
export function startConga(
  state: CongaState,
  now: number,
  login: string,
  displayName: string,
  ctx: CongaContext,
): CongaState {
  if (state.phase !== 'idle' && state.phase !== 'ended') return state;
  if (!isBroadcaster(login, ctx)) return state;
  const leader: CongaDancer = {
    login: normalizeLogin(login),
    displayName: displayName || 'Javier',
    agentId: 'ja',
    freeAssignment: false,
    index: 0,
    joinedAt: now,
  };
  return {
    ...state,
    phase: 'countdown',
    phaseStartedAt: now,
    countdownEndsAt: now + CONGA_COUNTDOWN_MS,
    dancingEndsAt: 0,
    dancers: [leader],
    adoptionRequests: [],
  };
}

/** Join a conga. During countdown: added to dancers. During dancing: latecomer.
 *  Returns the same state if the login is invalid, a duplicate, the broadcaster,
 *  or if the free-avatar pool is exhausted (safety cap). */
export function joinConga(
  state: CongaState,
  now: number,
  login: string,
  displayName: string,
  ctx: CongaContext,
): CongaState {
  if (state.phase !== 'countdown' && state.phase !== 'dancing') return state;
  const key = normalizeLogin(login);
  if (!key) return state;
  if (state.dancers.some((d) => d.login === key)) return state;
  if (isBroadcaster(login, ctx)) return state;
  let agentId: CongaAgentId | null = findAdoptedAvatar(key, ctx);
  let freeAssignment = false;
  if (!agentId) {
    const used = new Set<CongaAgentId>();
    for (const d of state.dancers) used.add(d.agentId);
    agentId = pickFreeAvatar(used, ctx);
    if (!agentId) return state;
    freeAssignment = true;
  }
  const dancer: CongaDancer = {
    login: key,
    displayName: displayName || key,
    agentId,
    freeAssignment,
    index: state.dancers.length,
    joinedAt: now,
  };
  return { ...state, dancers: [...state.dancers, dancer] };
}

/** Advance the conga state based on the current time. Pure. */
export function tickConga(state: CongaState, now: number): CongaState {
  if (state.phase === 'countdown' && now >= state.countdownEndsAt) {
    return {
      ...state,
      phase: 'dancing',
      phaseStartedAt: now,
      dancingEndsAt: now + CONGA_DANCE_MS,
    };
  }
  if (state.phase === 'dancing' && now >= state.dancingEndsAt) {
    const adoptionRequests: string[] = [];
    for (const d of state.dancers) {
      if (d.freeAssignment) adoptionRequests.push(d.login);
    }
    return {
      ...state,
      phase: 'ended',
      phaseStartedAt: now,
      adoptionRequests,
    };
  }
  if (state.phase === 'ended' && now >= state.phaseStartedAt + CONGA_ENDED_MS) {
    return {
      ...state,
      phase: 'idle',
      phaseStartedAt: now,
      countdownEndsAt: 0,
      dancingEndsAt: 0,
      dancers: [],
      adoptionRequests: [],
    };
  }
  return state;
}

/** Apply a chat command. Returns a new state. */
export function applyCongaCommand(
  state: CongaState,
  cmd: { comando?: string; usuario?: string; texto?: string },
  now: number,
  ctx: CongaContext,
): CongaState {
  if (!cmd || cmd.comando !== 'conga') return state;
  const login = String(cmd.usuario || '').trim();
  const displayName = String(cmd.texto || login).trim();
  if (!login) return state;
  if (state.phase === 'idle' || state.phase === 'ended') {
    return startConga(state, now, login, displayName, ctx);
  }
  return joinConga(state, now, login, displayName, ctx);
}

/** Get the position of one dancer along the circuit. Returns null if not in the conga. */
export function getDancerPosition(state: CongaState, login: string, now: number): CongaPt | null {
  if (state.phase !== 'dancing' && state.phase !== 'ended') return null;
  const key = normalizeLogin(login);
  const dancer = state.dancers.find((d) => d.login === key);
  if (!dancer) return null;
  const elapsed = now - state.phaseStartedAt;
  const leaderT = Math.min(1, Math.max(0, elapsed / CONGA_DANCE_MS));
  const dancerT = Math.max(0, leaderT - dancer.index * CONGA_SPACING);
  return pointOnCircuit(dancerT);
}

/** Get the position of every dancer keyed by login. */
export function getAllDancerPositions(state: CongaState, now: number): Map<string, CongaPt> {
  const map = new Map<string, CongaPt>();
  if (state.phase !== 'dancing' && state.phase !== 'ended') return map;
  for (const d of state.dancers) {
    const pos = getDancerPosition(state, d.login, now);
    if (pos) map.set(d.login, pos);
  }
  return map;
}

/** Map a dancer's agentId to their current conga position, if any. */
export function getCongaAgentPositions(state: CongaState, now: number): Map<CongaAgentId, CongaPt> {
  const map = new Map<CongaAgentId, CongaPt>();
  if (state.phase !== 'dancing' && state.phase !== 'ended') return map;
  for (const d of state.dancers) {
    const pos = getDancerPosition(state, d.login, now);
    if (pos) map.set(d.agentId, pos);
  }
  return map;
}

/** Point on the circuit at parameter t (0 to 1). */
function pointOnCircuit(t: number): CongaPt {
  const clamped = Math.max(0, Math.min(1, t));
  const total = circuitLength();
  const target = clamped * total;
  let travelled = 0;
  for (let i = 1; i < CONGA_CIRCUIT.length; i++) {
    const a = CONGA_CIRCUIT[i - 1];
    const b = CONGA_CIRCUIT[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (travelled + seg >= target || i === CONGA_CIRCUIT.length - 1) {
      const remaining = target - travelled;
      const frac = seg === 0 ? 1 : Math.min(1, remaining / seg);
      return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
    }
    travelled += seg;
  }
  return {
    x: CONGA_CIRCUIT[CONGA_CIRCUIT.length - 1].x,
    y: CONGA_CIRCUIT[CONGA_CIRCUIT.length - 1].y,
  };
}

/** Credit text to show while the countdown or dance is active. Null otherwise. */
export function getCreditText(state: CongaState): string | null {
  if (state.phase === 'countdown' || state.phase === 'dancing') return CONGA_CREDIT;
  return null;
}

/** Adoption-request speech for a dancer, or null. */
export function getAdoptionSpeech(state: CongaState, login: string): string | null {
  if (state.phase !== 'ended') return null;
  const key = normalizeLogin(login);
  if (!state.adoptionRequests.includes(key)) return null;
  return CONGA_ADOPT_TEXT;
}

/** True if the given login is currently a conga dancer. */
export function isCongaDancer(state: CongaState, login: string): boolean {
  const key = normalizeLogin(login);
  return state.dancers.some((d) => d.login === key);
}

/** Seconds remaining in the current countdown, or 0 if not in countdown. */
export function countdownSecondsLeft(state: CongaState, now: number): number {
  if (state.phase !== 'countdown') return 0;
  return Math.max(0, Math.ceil((state.countdownEndsAt - now) / 1000));
}
