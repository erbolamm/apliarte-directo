// oficina-3d/src/office/fiesta.ts
// Pure state machine for the !fiesta celebration overlay.
// No DOM, no React, no Three.js. Side effects live in runtime.ts and FloorPlan.tsx.

export type FiestaPhase = 'idle' | 'party' | 'ended';

export type FiestaParticleKind = 'confetti' | 'streamer';

export type FiestaParticle = {
  id: number;
  kind: FiestaParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  rotation: number;
  rotSpeed: number;
  color: string;
  wobbleSpeed: number;
  wobblePhase: number;
};

export type FiestaAvatarPose = 'dance' | 'game' | 'walk';

export type FiestaAvatarState = {
  agentId: string;
  target: { x: number; y: number };
  pose: FiestaAvatarPose;
  jumping: boolean;
  nextChangeAt: number;
  speed: number;
};

export type FiestaState = {
  phase: FiestaPhase;
  startedAt: number;
  endsAt: number;
  particles: FiestaParticle[];
  avatars: Record<string, FiestaAvatarState>;
  discoHue: number;
};

export const FIESTA_DURATION_MS = 15_000;
export const FIESTA_ENDED_MS = 1_000;
export const FIESTA_CONFETTI_COUNT = 60;
export const FIESTA_STREAMER_COUNT = 16;
export const FIESTA_VIEW_W = 1280;
export const FIESTA_VIEW_H = 860;

export const FIESTA_COLORS: readonly string[] = [
  '#ff4d6d',
  '#ffd166',
  '#06d6a0',
  '#118ab2',
  '#70d6ff',
  '#ff9f1c',
  '#c77dff',
  '#e0aaff',
  '#ff5c8a',
];

export const FIESTA_WAYPOINTS: readonly { x: number; y: number }[] = [
  { x: 310, y: 300 }, // lounge centro
  { x: 200, y: 320 }, // lounge sofa
  { x: 450, y: 260 }, // lounge ventana
  { x: 310, y: 456 }, // pasillo lounge
  { x: 470, y: 456 }, // pasillo izq
  { x: 628, y: 456 }, // pasillo centro junction
  { x: 790, y: 456 }, // pasillo dcha
  { x: 950, y: 456 }, // pasillo reuniones
  { x: 800, y: 280 }, // reuniones mesa
  { x: 950, y: 250 }, // reuniones centro
  { x: 310, y: 620 }, // trabajo centro
  { x: 200, y: 640 }, // trabajo mesas
  { x: 950, y: 620 }, // entregas puerta
  { x: 800, y: 640 }, // entregas libre
];

export const DEFAULT_FIESTA_AGENTS: readonly string[] = [
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

function createLcg(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 2147483647;
  if (s === 0) s = 123456789;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createFiestaParticles(seed = 42): FiestaParticle[] {
  const rand = createLcg(seed);
  const particles: FiestaParticle[] = [];
  let idCounter = 1;

  // Generate confetti pieces
  for (let i = 0; i < FIESTA_CONFETTI_COUNT; i++) {
    const colorIdx = Math.floor(rand() * FIESTA_COLORS.length);
    particles.push({
      id: idCounter++,
      kind: 'confetti',
      x: Math.round(rand() * FIESTA_VIEW_W),
      y: Math.round(-20 - rand() * 450),
      vx: -30 + rand() * 60,
      vy: 120 + rand() * 160,
      width: 6 + Math.floor(rand() * 8),
      height: 10 + Math.floor(rand() * 10),
      rotation: Math.round(rand() * 360),
      rotSpeed: -200 + rand() * 400,
      color: FIESTA_COLORS[colorIdx],
      wobbleSpeed: 3 + rand() * 5,
      wobblePhase: rand() * Math.PI * 2,
    });
  }

  // Generate streamers
  for (let i = 0; i < FIESTA_STREAMER_COUNT; i++) {
    const colorIdx = Math.floor(rand() * FIESTA_COLORS.length);
    particles.push({
      id: idCounter++,
      kind: 'streamer',
      x: Math.round(rand() * FIESTA_VIEW_W),
      y: Math.round(-30 - rand() * 500),
      vx: -20 + rand() * 40,
      vy: 80 + rand() * 110,
      width: 4 + Math.floor(rand() * 3),
      height: 50 + Math.floor(rand() * 35),
      rotation: -30 + rand() * 60,
      rotSpeed: -50 + rand() * 100,
      color: FIESTA_COLORS[colorIdx],
      wobbleSpeed: 2 + rand() * 3,
      wobblePhase: rand() * Math.PI * 2,
    });
  }

  return particles;
}

export function emptyFiestaState(): FiestaState {
  return {
    phase: 'idle',
    startedAt: 0,
    endsAt: 0,
    particles: [],
    avatars: {},
    discoHue: 0,
  };
}

export function startFiesta(
  state: FiestaState,
  now: number,
  agentIds: readonly string[] = DEFAULT_FIESTA_AGENTS,
  seed = now,
): FiestaState {
  if (state.phase === 'party') return state;

  const particles = createFiestaParticles(seed);
  const avatars: Record<string, FiestaAvatarState> = {};
  const poses: readonly FiestaAvatarPose[] = ['dance', 'game', 'walk'];

  agentIds.forEach((id, index) => {
    const wp = FIESTA_WAYPOINTS[(index * 2) % FIESTA_WAYPOINTS.length];
    avatars[id] = {
      agentId: id,
      target: wp,
      pose: poses[index % poses.length],
      jumping: index % 2 === 0,
      speed: 300 + (index % 3) * 20,
      nextChangeAt: now + 1600 + ((index * 250) % 1200),
    };
  });

  return {
    phase: 'party',
    startedAt: now,
    endsAt: now + FIESTA_DURATION_MS,
    particles,
    avatars,
    discoHue: 0,
  };
}

export function tickFiesta(state: FiestaState, now: number, dt: number): FiestaState {
  if (dt <= 0 && state.phase !== 'ended') return state;

  if (state.phase === 'party') {
    if (now >= state.endsAt) {
      return {
        ...state,
        phase: 'ended',
        particles: [],
        discoHue: 0,
      };
    }

    const updatedParticles = state.particles.map((p) => {
      const nextWobble = p.wobblePhase + p.wobbleSpeed * dt;
      const sway = Math.sin(nextWobble) * (p.kind === 'streamer' ? 40 : 20);
      let nextX = p.x + (p.vx + sway) * dt;
      let nextY = p.y + p.vy * dt;
      let nextRot = (p.rotation + p.rotSpeed * dt) % 360;

      if (nextY > FIESTA_VIEW_H + 40) {
        nextY = -40 - ((p.id * 17) % 80);
        nextX = ((p.x + 240) % (FIESTA_VIEW_W - 40)) + 20;
      }

      return {
        ...p,
        x: nextX,
        y: nextY,
        rotation: nextRot,
        wobblePhase: nextWobble,
      };
    });

    const nextDiscoHue = (state.discoHue + dt * 120) % 360;

    const poses: readonly FiestaAvatarPose[] = ['dance', 'game', 'walk'];
    const nextAvatars: Record<string, FiestaAvatarState> = {};
    let avatarIdx = 0;

    for (const [id, av] of Object.entries(state.avatars)) {
      if (now >= av.nextChangeAt) {
        const nextWpIdx = (avatarIdx * 3 + Math.floor(now / 1500)) % FIESTA_WAYPOINTS.length;
        const target = FIESTA_WAYPOINTS[nextWpIdx];
        const pose = poses[(poses.indexOf(av.pose) + 1) % poses.length];
        const jumping = !av.jumping;
        const speed = 280 + ((avatarIdx * 17) % 60);
        const nextChangeAt = now + 1500 + ((avatarIdx * 350) % 1200);

        nextAvatars[id] = {
          ...av,
          target,
          pose,
          jumping,
          speed,
          nextChangeAt,
        };
      } else {
        nextAvatars[id] = av;
      }
      avatarIdx++;
    }

    return {
      ...state,
      particles: updatedParticles,
      discoHue: nextDiscoHue,
      avatars: nextAvatars,
    };
  }

  if (state.phase === 'ended') {
    if (now >= state.endsAt + FIESTA_ENDED_MS) {
      return emptyFiestaState();
    }
    return state;
  }

  return state;
}

export function stopFiesta(state: FiestaState, now: number): FiestaState {
  if (state.phase === 'idle') return state;
  return {
    ...state,
    phase: 'ended',
    endsAt: now,
    particles: [],
    discoHue: 0,
  };
}

export function isFiestaActive(state: FiestaState): boolean {
  return state.phase === 'party';
}

export function fiestaSecondsLeft(state: FiestaState, now: number): number {
  if (state.phase !== 'party') return 0;
  return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}
