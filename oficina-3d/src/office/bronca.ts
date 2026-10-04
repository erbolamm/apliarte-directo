// oficina-3d/src/office/bronca.ts
// Pure state machine for the !bronca comedic brawl / battle overlay.
// No DOM, no React, no Three.js. Side effects live in runtime.ts and FloorPlan.tsx.

export type BroncaPhase = 'idle' | 'brawl' | 'ended';

export type BroncaParticleKind = 'smoke' | 'star' | 'spark' | 'fire' | 'line';

export type BroncaParticle = {
  id: number;
  kind: BroncaParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  color: string;
  opacity: number;
  scale: number;
  life: number;
  maxLife: number;
  epicenterIdx: number;
};

export type BroncaAvatarPose = 'brawl' | 'walk' | 'fall';

export type BroncaAvatarState = {
  agentId: string;
  target: { x: number; y: number };
  pose: BroncaAvatarPose;
  speed: number;
  chasingId: string | null;
  epicenterIdx: number;
  nextChangeAt: number;
};

export type BroncaState = {
  phase: BroncaPhase;
  startedAt: number;
  endsAt: number;
  shakeX: number;
  shakeY: number;
  shakeIntensity: number;
  particles: BroncaParticle[];
  avatars: Record<string, BroncaAvatarState>;
};

export const BRONCA_DURATION_MS = 15_000;
export const BRONCA_ENDED_MS = 2_500;
export const BRONCA_VIEW_W = 1280;
export const BRONCA_VIEW_H = 860;

export const BRONCA_SMOKE_COUNT = 30;
export const BRONCA_STAR_COUNT = 24;
export const BRONCA_FIRE_COUNT = 24;
export const BRONCA_SPARK_COUNT = 26;
export const BRONCA_LINE_COUNT = 16;

export const BRONCA_EPICENTERS: readonly { x: number; y: number }[] = [
  { x: 628, y: 456 }, // pasillo central junction
  { x: 310, y: 620 }, // sala de trabajo centro
  { x: 950, y: 250 }, // sala de reuniones centro
  { x: 310, y: 300 }, // sala de descanso centro
  { x: 950, y: 620 }, // zona de entregas centro
];

export const BRONCA_WAYPOINTS: readonly { x: number; y: number }[] = [
  { x: 628, y: 456 }, // pasillo central junction
  { x: 470, y: 456 }, // pasillo izq
  { x: 790, y: 456 }, // pasillo dcha
  { x: 310, y: 456 }, // pasillo puerta lounge
  { x: 950, y: 456 }, // pasillo puerta reuniones
  { x: 310, y: 300 }, // sala descanso centro
  { x: 200, y: 320 }, // sala descanso sofa
  { x: 450, y: 260 }, // sala descanso ventana
  { x: 950, y: 250 }, // sala reuniones centro
  { x: 800, y: 280 }, // sala reuniones mesa
  { x: 950, y: 340 }, // sala reuniones sur
  { x: 310, y: 620 }, // sala trabajo centro
  { x: 200, y: 640 }, // sala trabajo mesas
  { x: 450, y: 640 }, // sala trabajo pasillo
  { x: 950, y: 620 }, // zona entregas puerta
  { x: 800, y: 640 }, // zona entregas centro
  { x: 950, y: 720 }, // zona entregas fondo
];

export const DEFAULT_BRONCA_AGENTS: readonly string[] = [
  'ja',
  'co',
  'cl',
  'pi',
  'ge',
  'gr',
  'op',
  'ex',
  'be',
];

export const SMOKE_COLORS: readonly string[] = [
  '#f5f5f5',
  '#e6e6e6',
  '#d6dbe0',
  '#f0ebe1',
  '#c8ced4',
];

export const STAR_COLORS: readonly string[] = [
  '#ffe600',
  '#ff9900',
  '#ff3b30',
  '#ffffff',
  '#ffd700',
];

export const FIRE_COLORS: readonly string[] = [
  '#ff3b00',
  '#ff6600',
  '#ff9900',
  '#ffcc00',
  '#ff2200',
];

export const SPARK_COLORS: readonly string[] = [
  '#ffffff',
  '#fff275',
  '#ffa600',
  '#ffeedd',
];

export const LINE_COLORS: readonly string[] = [
  '#ffffff',
  '#ffe600',
  '#ff5500',
  '#ff3344',
];

function createLcg(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 2147483647;
  if (s === 0) s = 123456789;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pseudoRand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function computeScreenShake(elapsed: number, remaining: number): { x: number; y: number; intensity: number } {
  if (remaining <= 0) return { x: 0, y: 0, intensity: 0 };
  const cycle = (elapsed % 1200) / 1200;
  const shock = Math.exp(-cycle * 3.5);
  const brawlEnvelope = Math.min(1, remaining / 2000);
  const intensity = (0.4 + 0.6 * shock) * brawlEnvelope;
  const maxOffset = 10;
  const x = (Math.sin(elapsed * 0.038) * 0.7 + Math.sin(elapsed * 0.083) * 0.3) * maxOffset * intensity;
  const y = (Math.cos(elapsed * 0.044) * 0.7 + Math.cos(elapsed * 0.071) * 0.3) * maxOffset * intensity;
  return { x, y, intensity };
}

function respawnParticle(p: BroncaParticle, now: number): BroncaParticle {
  const epi = BRONCA_EPICENTERS[p.epicenterIdx % BRONCA_EPICENTERS.length];
  const r1 = pseudoRand(p.id * 17 + now * 0.001);
  const r2 = pseudoRand(p.id * 31 + now * 0.002);
  const r3 = pseudoRand(p.id * 47 + now * 0.003);

  let vx = p.vx;
  let vy = p.vy;
  let scale = 1;

  if (p.kind === 'smoke') {
    vx = -35 + r1 * 70;
    vy = -40 + r2 * 30;
    scale = 0.6 + r3 * 0.4;
  } else if (p.kind === 'star') {
    vx = -60 + r1 * 120;
    vy = -60 + r2 * 120;
  } else if (p.kind === 'fire') {
    vx = -25 + r1 * 50;
    vy = -80 - r2 * 70;
  } else if (p.kind === 'spark') {
    vx = -180 + r1 * 360;
    vy = -200 + r2 * 240;
  }

  return {
    ...p,
    x: epi.x - 45 + r1 * 90,
    y: epi.y - 35 + r2 * 70,
    vx,
    vy,
    scale,
    opacity: p.kind === 'smoke' ? 0.75 : 0.9,
    life: p.maxLife,
  };
}

export function createBroncaParticles(seed = 42): BroncaParticle[] {
  const rand = createLcg(seed);
  const particles: BroncaParticle[] = [];
  let idCounter = 1;

  for (let i = 0; i < BRONCA_SMOKE_COUNT; i++) {
    const epiIdx = i % BRONCA_EPICENTERS.length;
    const epi = BRONCA_EPICENTERS[epiIdx];
    const maxLife = 0.8 + rand() * 1.2;
    particles.push({
      id: idCounter++,
      kind: 'smoke',
      epicenterIdx: epiIdx,
      x: epi.x - 45 + rand() * 90,
      y: epi.y - 35 + rand() * 70,
      vx: -35 + rand() * 70,
      vy: -40 + rand() * 30,
      size: 24 + rand() * 32,
      rotation: rand() * 360,
      rotSpeed: -120 + rand() * 240,
      color: SMOKE_COLORS[Math.floor(rand() * SMOKE_COLORS.length)],
      opacity: 0.65 + rand() * 0.3,
      scale: 0.6 + rand() * 0.5,
      life: rand() * maxLife,
      maxLife,
    });
  }

  for (let i = 0; i < BRONCA_STAR_COUNT; i++) {
    const epiIdx = i % BRONCA_EPICENTERS.length;
    const epi = BRONCA_EPICENTERS[epiIdx];
    const maxLife = 0.3 + rand() * 0.5;
    particles.push({
      id: idCounter++,
      kind: 'star',
      epicenterIdx: epiIdx,
      x: epi.x - 55 + rand() * 110,
      y: epi.y - 45 + rand() * 90,
      vx: -60 + rand() * 120,
      vy: -60 + rand() * 120,
      size: 16 + rand() * 20,
      rotation: rand() * 360,
      rotSpeed: -360 + rand() * 720,
      color: STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)],
      opacity: 0.85 + rand() * 0.15,
      scale: 0.8 + rand() * 0.4,
      life: rand() * maxLife,
      maxLife,
    });
  }

  for (let i = 0; i < BRONCA_FIRE_COUNT; i++) {
    const epiIdx = i % BRONCA_EPICENTERS.length;
    const epi = BRONCA_EPICENTERS[epiIdx];
    const maxLife = 0.6 + rand() * 0.8;
    particles.push({
      id: idCounter++,
      kind: 'fire',
      epicenterIdx: epiIdx,
      x: epi.x - 40 + rand() * 80,
      y: epi.y - 20 + rand() * 40,
      vx: -30 + rand() * 60,
      vy: -80 - rand() * 70,
      size: 12 + rand() * 16,
      rotation: -25 + rand() * 50,
      rotSpeed: -60 + rand() * 120,
      color: FIRE_COLORS[Math.floor(rand() * FIRE_COLORS.length)],
      opacity: 0.8 + rand() * 0.2,
      scale: 0.7 + rand() * 0.6,
      life: rand() * maxLife,
      maxLife,
    });
  }

  for (let i = 0; i < BRONCA_SPARK_COUNT; i++) {
    const epiIdx = i % BRONCA_EPICENTERS.length;
    const epi = BRONCA_EPICENTERS[epiIdx];
    const maxLife = 0.4 + rand() * 0.6;
    particles.push({
      id: idCounter++,
      kind: 'spark',
      epicenterIdx: epiIdx,
      x: epi.x - 30 + rand() * 60,
      y: epi.y - 30 + rand() * 60,
      vx: -180 + rand() * 360,
      vy: -200 + rand() * 240,
      size: 3 + rand() * 4,
      rotation: rand() * 360,
      rotSpeed: -300 + rand() * 600,
      color: SPARK_COLORS[Math.floor(rand() * SPARK_COLORS.length)],
      opacity: 0.9 + rand() * 0.1,
      scale: 0.8 + rand() * 0.4,
      life: rand() * maxLife,
      maxLife,
    });
  }

  for (let i = 0; i < BRONCA_LINE_COUNT; i++) {
    const epiIdx = i % BRONCA_EPICENTERS.length;
    const epi = BRONCA_EPICENTERS[epiIdx];
    const maxLife = 0.25 + rand() * 0.35;
    particles.push({
      id: idCounter++,
      kind: 'line',
      epicenterIdx: epiIdx,
      x: epi.x - 50 + rand() * 100,
      y: epi.y - 40 + rand() * 80,
      vx: -40 + rand() * 80,
      vy: -40 + rand() * 80,
      size: 20 + rand() * 30,
      rotation: rand() * 360,
      rotSpeed: -100 + rand() * 200,
      color: LINE_COLORS[Math.floor(rand() * LINE_COLORS.length)],
      opacity: 0.8 + rand() * 0.2,
      scale: 0.8 + rand() * 0.4,
      life: rand() * maxLife,
      maxLife,
    });
  }

  return particles;
}

export function emptyBroncaState(): BroncaState {
  return {
    phase: 'idle',
    startedAt: 0,
    endsAt: 0,
    shakeX: 0,
    shakeY: 0,
    shakeIntensity: 0,
    particles: [],
    avatars: {},
  };
}

export function startBronca(
  state: BroncaState,
  now: number,
  agentIds: readonly string[] = DEFAULT_BRONCA_AGENTS,
  seed = now,
): BroncaState {
  if (state.phase === 'brawl') return state;

  const particles = createBroncaParticles(seed);
  const avatars: Record<string, BroncaAvatarState> = {};

  agentIds.forEach((id, index) => {
    const wpIdx = (index * 3) % BRONCA_WAYPOINTS.length;
    const target = BRONCA_WAYPOINTS[wpIdx];
    const pose = index % 3 === 0 ? 'brawl' : 'walk';

    avatars[id] = {
      agentId: id,
      target,
      pose,
      speed: 370 + (index % 4) * 25,
      chasingId: agentIds[(index + 1) % agentIds.length],
      epicenterIdx: wpIdx,
      nextChangeAt: now + 1100 + ((index * 260) % 900),
    };
  });

  const shake = computeScreenShake(0, BRONCA_DURATION_MS);

  return {
    phase: 'brawl',
    startedAt: now,
    endsAt: now + BRONCA_DURATION_MS,
    shakeX: shake.x,
    shakeY: shake.y,
    shakeIntensity: shake.intensity,
    particles,
    avatars,
  };
}

export function tickBronca(state: BroncaState, now: number, dt: number): BroncaState {
  if (dt <= 0 && state.phase !== 'ended') return state;

  if (state.phase === 'brawl') {
    if (now >= state.endsAt) {
      const lingeringSmoke = state.particles
        .filter((p) => p.kind === 'smoke' || p.kind === 'fire')
        .map((p) => ({
          ...p,
          vx: p.vx * 0.4,
          vy: -20 - (p.id % 20),
          rotSpeed: p.rotSpeed * 0.3,
        }));

      return {
        ...state,
        phase: 'ended',
        shakeX: 0,
        shakeY: 0,
        shakeIntensity: 0,
        particles: lingeringSmoke,
      };
    }

    const elapsed = now - state.startedAt;
    const remaining = state.endsAt - now;
    const shake = computeScreenShake(elapsed, remaining);

    const updatedParticles = state.particles.map((p) => {
      const nextLife = p.life - dt;
      if (nextLife <= 0) {
        return respawnParticle(p, now);
      }

      let vx = p.vx;
      let vy = p.vy;

      if (p.kind === 'spark') {
        vy += 220 * dt;
      } else if (p.kind === 'fire') {
        vy -= 35 * dt;
      }

      const nextX = p.x + vx * dt;
      const nextY = p.y + vy * dt;
      const nextRot = (p.rotation + p.rotSpeed * dt) % 360;
      const lifeRatio = Math.max(0, nextLife / p.maxLife);
      const nextScale = p.kind === 'smoke' ? p.scale + dt * 0.2 : p.scale;
      const nextOpacity = p.kind === 'smoke' ? Math.min(0.85, lifeRatio * 1.1) : lifeRatio;

      return {
        ...p,
        x: nextX,
        y: nextY,
        vx,
        vy,
        rotation: nextRot,
        scale: nextScale,
        opacity: nextOpacity,
        life: nextLife,
      };
    });

    const poses: readonly BroncaAvatarPose[] = ['brawl', 'walk', 'brawl', 'fall'];
    const nextAvatars: Record<string, BroncaAvatarState> = {};
    let avatarIdx = 0;

    for (const [id, av] of Object.entries(state.avatars)) {
      if (now >= av.nextChangeAt) {
        const nextWpIdx = (av.epicenterIdx + 3 + (avatarIdx % 2)) % BRONCA_WAYPOINTS.length;
        const target = BRONCA_WAYPOINTS[nextWpIdx];
        const pose = poses[(avatarIdx + Math.floor(now / 1400)) % poses.length];
        const speed = 360 + ((avatarIdx * 23) % 80);
        const nextChangeAt = now + 1200 + ((avatarIdx * 250) % 1000);

        nextAvatars[id] = {
          ...av,
          target,
          pose,
          speed,
          epicenterIdx: nextWpIdx,
          nextChangeAt,
        };
      } else {
        nextAvatars[id] = av;
      }
      avatarIdx++;
    }

    return {
      ...state,
      shakeX: shake.x,
      shakeY: shake.y,
      shakeIntensity: shake.intensity,
      particles: updatedParticles,
      avatars: nextAvatars,
    };
  }

  if (state.phase === 'ended') {
    if (now >= state.endsAt + BRONCA_ENDED_MS) {
      return emptyBroncaState();
    }

    const updatedParticles = state.particles
      .map((p) => ({
        ...p,
        x: p.x + p.vx * dt,
        y: p.y + p.vy * dt,
        rotation: (p.rotation + p.rotSpeed * dt) % 360,
        scale: p.scale + dt * 0.15,
        opacity: Math.max(0, p.opacity - dt * 0.5),
      }))
      .filter((p) => p.opacity > 0.01);

    return {
      ...state,
      shakeX: 0,
      shakeY: 0,
      shakeIntensity: 0,
      particles: updatedParticles,
    };
  }

  return state;
}

export function stopBronca(state: BroncaState, now: number): BroncaState {
  if (state.phase === 'idle') return state;
  return {
    ...state,
    phase: 'ended',
    endsAt: now,
    shakeX: 0,
    shakeY: 0,
    shakeIntensity: 0,
    particles: [],
  };
}

export function isBroncaActive(state: BroncaState): boolean {
  return state.phase === 'brawl';
}

export function broncaSecondsLeft(state: BroncaState, now: number): number {
  if (state.phase !== 'brawl') return 0;
  return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}
