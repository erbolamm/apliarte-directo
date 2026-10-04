// test/bronca.test.mjs
// Tests for the pure !bronca state machine in oficina-3d/src/office/bronca.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as bronca from '../oficina-3d/src/office/bronca.ts';

test('emptyBroncaState returns idle phase with zero shake, no particles and empty avatars', () => {
  const s = bronca.emptyBroncaState();
  assert.equal(s.phase, 'idle');
  assert.equal(s.startedAt, 0);
  assert.equal(s.endsAt, 0);
  assert.equal(s.shakeX, 0);
  assert.equal(s.shakeY, 0);
  assert.equal(s.shakeIntensity, 0);
  assert.equal(s.particles.length, 0);
  assert.deepEqual(s.avatars, {});
});

test('startBronca transitions from idle to brawl with 15s duration and generated battle particles', () => {
  const s0 = bronca.emptyBroncaState();
  const t0 = 100_000;
  const s1 = bronca.startBronca(s0, t0, ['ja', 'co', 'cl'], 12345);

  assert.equal(s1.phase, 'brawl');
  assert.equal(s1.startedAt, t0);
  assert.equal(s1.endsAt, t0 + bronca.BRONCA_DURATION_MS);
  assert.equal(s1.endsAt - s1.startedAt, 15_000);

  const totalParticles =
    bronca.BRONCA_SMOKE_COUNT +
    bronca.BRONCA_STAR_COUNT +
    bronca.BRONCA_FIRE_COUNT +
    bronca.BRONCA_SPARK_COUNT +
    bronca.BRONCA_LINE_COUNT;
  assert.equal(s1.particles.length, totalParticles);

  const smoke = s1.particles.filter((p) => p.kind === 'smoke');
  const stars = s1.particles.filter((p) => p.kind === 'star');
  const fire = s1.particles.filter((p) => p.kind === 'fire');
  const sparks = s1.particles.filter((p) => p.kind === 'spark');
  const lines = s1.particles.filter((p) => p.kind === 'line');

  assert.equal(smoke.length, bronca.BRONCA_SMOKE_COUNT);
  assert.equal(stars.length, bronca.BRONCA_STAR_COUNT);
  assert.equal(fire.length, bronca.BRONCA_FIRE_COUNT);
  assert.equal(sparks.length, bronca.BRONCA_SPARK_COUNT);
  assert.equal(lines.length, bronca.BRONCA_LINE_COUNT);

  // Check avatars initialization
  assert.ok(s1.avatars.ja, 'ja avatar exists');
  assert.ok(s1.avatars.co, 'co avatar exists');
  assert.ok(s1.avatars.cl, 'cl avatar exists');
  assert.ok(s1.avatars.ja.speed >= 360, 'avatar brawl speed is high stampede');
  assert.ok(['brawl', 'walk', 'fall'].includes(s1.avatars.ja.pose));
  assert.ok(s1.avatars.ja.chasingId, 'avatar has a rival target');
});

test('startBronca is idempotent: does not restart or mutate if already in brawl phase', () => {
  const s0 = bronca.emptyBroncaState();
  const t0 = 50_000;
  const s1 = bronca.startBronca(s0, t0, ['ja'], 123);
  const s2 = bronca.startBronca(s1, t0 + 2000, ['ja', 'co'], 456);

  assert.equal(s2, s1, 'returns identical reference when already brawling');
  assert.equal(s2.startedAt, t0);
  assert.equal(s2.endsAt, t0 + bronca.BRONCA_DURATION_MS);
});

test('tickBronca advances particles and updates positions, rotation and life', () => {
  const s0 = bronca.emptyBroncaState();
  const t0 = 0;
  const s1 = bronca.startBronca(s0, t0, ['ja', 'co'], 999);
  const p0 = s1.particles[0];

  const dt = 0.05;
  const s2 = bronca.tickBronca(s1, t0 + 50, dt);
  const p1 = s2.particles[0];

  assert.notEqual(p1.x, p0.x, 'particle x position advances');
  assert.notEqual(p1.y, p0.y, 'particle y position advances');
  assert.notEqual(p1.rotation, p0.rotation, 'particle rotation updates');
  assert.ok(p1.life < p0.life, 'particle remaining life decreases');
});

test('tickBronca applies specific physics for sparks, fire and smoke', () => {
  const s0 = bronca.emptyBroncaState();
  const t0 = 0;
  const s1 = bronca.startBronca(s0, t0, ['ja'], 42);

  const sparkIdx = s1.particles.findIndex((p) => p.kind === 'spark');
  const fireIdx = s1.particles.findIndex((p) => p.kind === 'fire');
  const smokeIdx = s1.particles.findIndex((p) => p.kind === 'smoke');

  const spark0 = s1.particles[sparkIdx];
  const fire0 = s1.particles[fireIdx];
  const smoke0 = s1.particles[smokeIdx];

  const dt = 0.1;
  const s2 = bronca.tickBronca(s1, t0 + 100, dt);

  const spark1 = s2.particles[sparkIdx];
  const fire1 = s2.particles[fireIdx];
  const smoke1 = s2.particles[smokeIdx];

  assert.ok(spark1.vy > spark0.vy, 'sparks accelerate downwards with gravity');
  assert.ok(fire1.vy < fire0.vy, 'fire accelerates upwards with buoyancy');
  assert.ok(smoke1.scale > smoke0.scale, 'smoke puffs expand as they billow');
});

test('tickBronca respawns expired particles during brawl phase', () => {
  const s0 = bronca.emptyBroncaState();
  const t0 = 0;
  const s1 = bronca.startBronca(s0, t0, ['ja'], 42);

  // Set particle life to almost expired
  s1.particles[0] = {
    ...s1.particles[0],
    life: 0.01,
  };

  const s2 = bronca.tickBronca(s1, t0 + 50, 0.05);
  assert.ok(s2.particles[0].life > 0.1, 'expired particle respawned with fresh life');
});

test('screen shake oscillates and damps towards the end of brawl', () => {
  const s0 = bronca.emptyBroncaState();
  const t0 = 10_000;
  const s1 = bronca.startBronca(s0, t0, ['ja'], 42);

  // Middle of brawl: active shake
  const midTime = t0 + 5_000;
  const sMid = bronca.tickBronca(s1, midTime, 0.05);
  assert.ok(sMid.shakeIntensity > 0.2, 'shake intensity is strong during brawl');

  // Near the end (last 500ms): shake damps down
  const nearEndTime = t0 + 14_800;
  const sNearEnd = bronca.tickBronca(s1, nearEndTime, 0.05);
  assert.ok(sNearEnd.shakeIntensity < sMid.shakeIntensity, 'shake intensity damps near the end');

  // Exactly at end: shake is 0
  const endTime = t0 + 15_000;
  const sEnd = bronca.tickBronca(s1, endTime, 0.05);
  assert.equal(sEnd.shakeX, 0);
  assert.equal(sEnd.shakeY, 0);
  assert.equal(sEnd.shakeIntensity, 0);
});

test('tickBronca updates avatar targets, poses and epicenters over time', () => {
  const s0 = bronca.emptyBroncaState();
  const t0 = 10_000;
  const s1 = bronca.startBronca(s0, t0, ['ja', 'co'], 42);

  const initialJa = s1.avatars.ja;
  const tAfter = initialJa.nextChangeAt + 100;
  const s2 = bronca.tickBronca(s1, tAfter, 0.1);

  const updatedJa = s2.avatars.ja;
  assert.notEqual(updatedJa.nextChangeAt, initialJa.nextChangeAt);
  assert.ok(['brawl', 'walk', 'fall'].includes(updatedJa.pose));
});

test('tickBronca transitions from brawl to ended at endsAt with dissipating smoke', () => {
  const s0 = bronca.emptyBroncaState();
  const t0 = 10_000;
  const s1 = bronca.startBronca(s0, t0, ['ja'], 42);

  const sEnd = bronca.tickBronca(s1, s1.endsAt, 0.1);
  assert.equal(sEnd.phase, 'ended');
  assert.equal(sEnd.shakeX, 0);
  assert.equal(sEnd.shakeY, 0);
  assert.equal(sEnd.shakeIntensity, 0);

  // In ended phase, sharp stars and sparks are gone, only lingering smoke/fire remain
  const hasSparks = sEnd.particles.some((p) => p.kind === 'spark');
  assert.equal(hasSparks, false, 'flying sparks cleared when brawl ends');
});

test('tickBronca transitions from ended to idle after BRONCA_ENDED_MS', () => {
  const s0 = bronca.emptyBroncaState();
  const t0 = 0;
  const s1 = bronca.startBronca(s0, t0, ['ja'], 42);
  const sEnded = bronca.tickBronca(s1, s1.endsAt, 0.1);
  assert.equal(sEnded.phase, 'ended');

  // Within ended buffer
  const sBuffer = bronca.tickBronca(sEnded, s1.endsAt + bronca.BRONCA_ENDED_MS / 2, 0.1);
  assert.equal(sBuffer.phase, 'ended');

  // Past ended buffer: idle
  const sIdle = bronca.tickBronca(sEnded, s1.endsAt + bronca.BRONCA_ENDED_MS + 10, 0.1);
  assert.equal(sIdle.phase, 'idle');
  assert.deepEqual(sIdle.avatars, {});
});

test('stopBronca aborts brawl immediately into ended phase', () => {
  const s0 = bronca.emptyBroncaState();
  const t0 = 0;
  const s1 = bronca.startBronca(s0, t0, ['ja'], 42);
  const sStopped = bronca.stopBronca(s1, t0 + 2000);

  assert.equal(sStopped.phase, 'ended');
  assert.equal(sStopped.endsAt, t0 + 2000);
  assert.equal(sStopped.particles.length, 0);
  assert.equal(sStopped.shakeX, 0);
  assert.equal(sStopped.shakeY, 0);

  // Calling stop on idle is no-op
  const sIdleStopped = bronca.stopBronca(s0, t0);
  assert.equal(sIdleStopped, s0);
});

test('isBroncaActive and broncaSecondsLeft query helpers', () => {
  const s0 = bronca.emptyBroncaState();
  assert.equal(bronca.isBroncaActive(s0), false);
  assert.equal(bronca.broncaSecondsLeft(s0, 0), 0);

  const t0 = 100_000;
  const s1 = bronca.startBronca(s0, t0, ['ja'], 42);
  assert.equal(bronca.isBroncaActive(s1), true);
  assert.equal(bronca.broncaSecondsLeft(s1, t0), 15);
  assert.equal(bronca.broncaSecondsLeft(s1, t0 + 5000), 10);
  assert.equal(bronca.broncaSecondsLeft(s1, t0 + 14100), 1);
  assert.equal(bronca.broncaSecondsLeft(s1, t0 + 15000), 0);
});

test('BRONCA_EPICENTERS are within office dimensions and non-empty', () => {
  assert.ok(bronca.BRONCA_EPICENTERS.length >= 4, 'at least 4 epicenters defined');
  for (const epi of bronca.BRONCA_EPICENTERS) {
    assert.ok(epi.x >= 50 && epi.x <= bronca.BRONCA_VIEW_W - 50, `x within bounds: ${epi.x}`);
    assert.ok(epi.y >= 50 && epi.y <= bronca.BRONCA_VIEW_H - 50, `y within bounds: ${epi.y}`);
  }
});

test('BRONCA_WAYPOINTS are within bounds and all avatar targets belong to waypoints', () => {
  assert.ok(bronca.BRONCA_WAYPOINTS.length >= 10, 'at least 10 waypoints defined');
  for (const wp of bronca.BRONCA_WAYPOINTS) {
    assert.ok(wp.x >= 50 && wp.x <= bronca.BRONCA_VIEW_W - 50, `wp x within bounds: ${wp.x}`);
    assert.ok(wp.y >= 50 && wp.y <= bronca.BRONCA_VIEW_H - 50, `wp y within bounds: ${wp.y}`);
  }

  const s0 = bronca.emptyBroncaState();
  const s1 = bronca.startBronca(s0, 10_000, ['ja', 'co', 'cl']);
  for (const av of Object.values(s1.avatars)) {
    const isWp = bronca.BRONCA_WAYPOINTS.some((wp) => wp.x === av.target.x && wp.y === av.target.y);
    assert.ok(isWp, `initial target (${av.target.x}, ${av.target.y}) must be in BRONCA_WAYPOINTS`);
  }

  const s2 = bronca.tickBronca(s1, 15_000, 0.1);
  for (const av of Object.values(s2.avatars)) {
    const isWp = bronca.BRONCA_WAYPOINTS.some((wp) => wp.x === av.target.x && wp.y === av.target.y);
    assert.ok(isWp, `ticked target (${av.target.x}, ${av.target.y}) must be in BRONCA_WAYPOINTS`);
  }
});

test('ZERO EMOJIS: bronca.ts contains no emojis in code, comments or strings', () => {
  const code = readFileSync(new URL('../oficina-3d/src/office/bronca.ts', import.meta.url), 'utf8');
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
  const match = code.match(emojiRegex);
  assert.equal(match, null, `Emoji detected in bronca.ts: ${match?.[0]}`);
});

test('ZERO EMOJIS: bronca.test.mjs contains no emojis in code, comments or strings', () => {
  const code = readFileSync(new URL('./bronca.test.mjs', import.meta.url), 'utf8');
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
  const match = code.match(emojiRegex);
  assert.equal(match, null, `Emoji detected in bronca.test.mjs: ${match?.[0]}`);
});
