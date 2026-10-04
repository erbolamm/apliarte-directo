// test/fiesta.test.mjs
// Tests for the pure !fiesta state machine in oficina-3d/src/office/fiesta.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as fiesta from '../oficina-3d/src/office/fiesta.ts';

test('emptyFiestaState returns idle phase with no particles, empty avatars and zero hue', () => {
  const s = fiesta.emptyFiestaState();
  assert.equal(s.phase, 'idle');
  assert.equal(s.startedAt, 0);
  assert.equal(s.endsAt, 0);
  assert.equal(s.particles.length, 0);
  assert.deepEqual(s.avatars, {});
  assert.equal(s.discoHue, 0);
});

test('startFiesta transitions from idle to party with 15s duration and generated particles', () => {
  const s0 = fiesta.emptyFiestaState();
  const t0 = 100_000;
  const s1 = fiesta.startFiesta(s0, t0, ['ja', 'co', 'cl'], 12345);

  assert.equal(s1.phase, 'party');
  assert.equal(s1.startedAt, t0);
  assert.equal(s1.endsAt, t0 + fiesta.FIESTA_DURATION_MS);
  assert.equal(s1.endsAt - s1.startedAt, 15_000);
  assert.equal(s1.particles.length, fiesta.FIESTA_CONFETTI_COUNT + fiesta.FIESTA_STREAMER_COUNT);
  assert.equal(s1.discoHue, 0);

  // Check confetti and streamers count
  const confetti = s1.particles.filter((p) => p.kind === 'confetti');
  const streamers = s1.particles.filter((p) => p.kind === 'streamer');
  assert.equal(confetti.length, fiesta.FIESTA_CONFETTI_COUNT);
  assert.equal(streamers.length, fiesta.FIESTA_STREAMER_COUNT);

  // Check avatars initialization
  assert.ok(s1.avatars.ja, 'ja avatar exists');
  assert.ok(s1.avatars.co, 'co avatar exists');
  assert.ok(s1.avatars.cl, 'cl avatar exists');
  assert.ok(s1.avatars.ja.speed >= 300, 'avatar party speed is high');
  assert.ok(['dance', 'game', 'walk'].includes(s1.avatars.ja.pose));
});

test('startFiesta is idempotent: does not restart or mutate if already in party phase', () => {
  const s0 = fiesta.emptyFiestaState();
  const t0 = 50_000;
  const s1 = fiesta.startFiesta(s0, t0, ['ja'], 123);
  const s2 = fiesta.startFiesta(s1, t0 + 2000, ['ja', 'co'], 456);

  assert.equal(s2, s1, 'returns identical reference when already partying');
  assert.equal(s2.startedAt, t0);
  assert.equal(s2.endsAt, t0 + fiesta.FIESTA_DURATION_MS);
});

test('tickFiesta advances particles, wobble phases and disco hue', () => {
  const s0 = fiesta.emptyFiestaState();
  const t0 = 0;
  const s1 = fiesta.startFiesta(s0, t0, ['ja', 'co'], 999);
  const p0 = s1.particles[0];

  const dt = 0.05;
  const s2 = fiesta.tickFiesta(s1, t0 + 50, dt);
  const p1 = s2.particles[0];

  assert.notEqual(p1.y, p0.y, 'particle y position should change');
  assert.ok(p1.y > p0.y, 'particle falls downwards');
  assert.notEqual(p1.rotation, p0.rotation, 'particle rotates');
  assert.notEqual(p1.wobblePhase, p0.wobblePhase, 'wobble phase advances');
  assert.ok(s2.discoHue > s1.discoHue, 'disco hue increases over time');
});

test('tickFiesta wraps particles falling below view height back to top', () => {
  const s0 = fiesta.emptyFiestaState();
  const t0 = 0;
  const s1 = fiesta.startFiesta(s0, t0, ['ja'], 42);

  // Manually position particle near the bottom
  s1.particles[0] = {
    ...s1.particles[0],
    y: fiesta.FIESTA_VIEW_H + 50,
  };

  const s2 = fiesta.tickFiesta(s1, t0 + 100, 0.1);
  assert.ok(s2.particles[0].y < 0, 'particle wrapped around above the top of screen');
});

test('tickFiesta updates avatar targets, poses and jumping over time', () => {
  const s0 = fiesta.emptyFiestaState();
  const t0 = 10_000;
  const s1 = fiesta.startFiesta(s0, t0, ['ja', 'co'], 42);

  const initialJa = s1.avatars.ja;
  // Advance time past nextChangeAt
  const tAfter = initialJa.nextChangeAt + 100;
  const s2 = fiesta.tickFiesta(s1, tAfter, 0.1);

  const updatedJa = s2.avatars.ja;
  assert.notEqual(updatedJa.nextChangeAt, initialJa.nextChangeAt);
  assert.notEqual(updatedJa.pose, initialJa.pose, 'pose cycled');
  assert.equal(updatedJa.jumping, !initialJa.jumping, 'jumping state toggled');
});

test('tickFiesta transitions from party to ended at endsAt', () => {
  const s0 = fiesta.emptyFiestaState();
  const t0 = 10_000;
  const s1 = fiesta.startFiesta(s0, t0, ['ja'], 42);

  // Still partying just before endsAt
  const sMid = fiesta.tickFiesta(s1, s1.endsAt - 10, 0.1);
  assert.equal(sMid.phase, 'party');

  // Exactly or after endsAt: ended
  const sEnd = fiesta.tickFiesta(s1, s1.endsAt, 0.1);
  assert.equal(sEnd.phase, 'ended');
  assert.equal(sEnd.particles.length, 0, 'particles cleared upon fiesta ending');
  assert.equal(sEnd.discoHue, 0);
});

test('tickFiesta transitions from ended to idle after FIESTA_ENDED_MS', () => {
  const s0 = fiesta.emptyFiestaState();
  const t0 = 0;
  const s1 = fiesta.startFiesta(s0, t0, ['ja'], 42);
  const sEnded = fiesta.tickFiesta(s1, s1.endsAt, 0.1);
  assert.equal(sEnded.phase, 'ended');

  // Within ended buffer
  const sBuffer = fiesta.tickFiesta(sEnded, s1.endsAt + fiesta.FIESTA_ENDED_MS / 2, 0.1);
  assert.equal(sBuffer.phase, 'ended');

  // Past ended buffer: idle
  const sIdle = fiesta.tickFiesta(sEnded, s1.endsAt + fiesta.FIESTA_ENDED_MS + 10, 0.1);
  assert.equal(sIdle.phase, 'idle');
  assert.deepEqual(sIdle.avatars, {});
});

test('stopFiesta aborts party immediately into ended phase', () => {
  const s0 = fiesta.emptyFiestaState();
  const t0 = 0;
  const s1 = fiesta.startFiesta(s0, t0, ['ja'], 42);
  const sStopped = fiesta.stopFiesta(s1, t0 + 2000);

  assert.equal(sStopped.phase, 'ended');
  assert.equal(sStopped.endsAt, t0 + 2000);
  assert.equal(sStopped.particles.length, 0);

  // Calling stop on idle is no-op
  const sIdleStopped = fiesta.stopFiesta(s0, t0);
  assert.equal(sIdleStopped, s0);
});

test('isFiestaActive and fiestaSecondsLeft query helpers', () => {
  const s0 = fiesta.emptyFiestaState();
  assert.equal(fiesta.isFiestaActive(s0), false);
  assert.equal(fiesta.fiestaSecondsLeft(s0, 0), 0);

  const t0 = 100_000;
  const s1 = fiesta.startFiesta(s0, t0, ['ja'], 42);
  assert.equal(fiesta.isFiestaActive(s1), true);
  assert.equal(fiesta.fiestaSecondsLeft(s1, t0), 15);
  assert.equal(fiesta.fiestaSecondsLeft(s1, t0 + 5000), 10);
  assert.equal(fiesta.fiestaSecondsLeft(s1, t0 + 14100), 1);
  assert.equal(fiesta.fiestaSecondsLeft(s1, t0 + 15000), 0);
});

test('FIESTA_WAYPOINTS are all within office dimensions and non-empty', () => {
  assert.ok(fiesta.FIESTA_WAYPOINTS.length >= 10, 'at least 10 waypoints defined');
  for (const wp of fiesta.FIESTA_WAYPOINTS) {
    assert.ok(wp.x >= 50 && wp.x <= fiesta.FIESTA_VIEW_W - 50, `x within bounds: ${wp.x}`);
    assert.ok(wp.y >= 50 && wp.y <= fiesta.FIESTA_VIEW_H - 50, `y within bounds: ${wp.y}`);
  }
});

test('ZERO EMOJIS: fiesta.ts contains no emojis in code, comments or strings', () => {
  const code = readFileSync(new URL('../oficina-3d/src/office/fiesta.ts', import.meta.url), 'utf8');
  // Unicode ranges for emojis
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
  const match = code.match(emojiRegex);
  assert.equal(match, null, `Emoji detected in fiesta.ts: ${match?.[0]}`);
});
