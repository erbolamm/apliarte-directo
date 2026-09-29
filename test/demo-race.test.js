import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPracticeSession, PRACTICE_AGENTS } from '../public/demo-practice.js';

// Deterministic helpers for tests
const noopRng = () => 0.5; // forces TARGET_OPTIONS[1] = 3
const noopTimer = () => 0;
const noopClear = () => {};

function freshSession(rng = noopRng) {
  return createPracticeSession({ rng, setTimeoutImpl: noopTimer, clearTimeoutImpl: noopClear });
}

// ─── Race start ──────────────────────────────────────────────────────────────

test('race: !juego starts a local race with countdown and a target', () => {
  const session = freshSession();
  session.choose('cl');
  const result = session.submit('!juego');
  const race = result.state.race;
  assert.equal(race.phase, 'countdown');
  assert.equal(race.secondsLeft, 3);
  assert.ok(race.target === -3 || race.target === 3, 'target must be a valid position');
  assert.equal(race.winner, null);
  assert.equal(result.events[0].type, 'race_start');
});

test('race: !carrera and !trofeo also start the race (same handler)', () => {
  for (const cmd of ['!carrera', '!trofeo', '!game']) {
    const session = freshSession();
    session.choose('cl');
    const result = session.submit(cmd);
    assert.equal(result.state.race.phase, 'countdown', `${cmd} should start race`);
  }
});

test('race: !traidor stays as a notice (out of scope for local sim)', () => {
  const session = freshSession();
  session.choose('cl');
  const result = session.submit('!traidor');
  assert.equal(result.events[0].type, 'notice');
  assert.equal(result.state.race.phase, 'idle', '!traidor must NOT start a race');
});

// ─── Countdown progression ──────────────────────────────────────────────────

test('race: _tickCountdown advances seconds and switches to racing after 3 ticks', () => {
  const session = freshSession();
  session.choose('cl');
  session.submit('!juego');
  assert.equal(session.getState().race.phase, 'countdown');
  assert.equal(session.getState().race.secondsLeft, 3);
  session._tickCountdown();
  assert.equal(session.getState().race.secondsLeft, 2);
  session._tickCountdown();
  assert.equal(session.getState().race.secondsLeft, 1);
  session._tickCountdown();
  const after = session.getState().race;
  assert.equal(after.secondsLeft, 0);
  assert.equal(after.phase, 'racing');
});

// ─── Movement during race ──────────────────────────────────────────────────

test('race: movement is ignored during countdown', () => {
  const session = freshSession();
  session.choose('cl');
  session.submit('!juego');
  const result = session.submit('!d 3');
  assert.equal(result.events[0].type, 'notice');
  assert.match(result.events[0].text, /cuenta atrás/);
  assert.equal(session.getState().offsets.cl, 0, 'offset must not change during countdown');
});

test('race: movement toward target during racing declares winner', () => {
  const session = freshSession(() => 0.5); // target = 3
  session.choose('cl');
  session.submit('!juego');
  // Advance countdown to racing phase
  session._tickCountdown();
  session._tickCountdown();
  session._tickCountdown();
  assert.equal(session.getState().race.phase, 'racing');
  assert.equal(session.getState().race.target, 3);
  // Move right
  const result = session.submit('!d 3');
  assert.equal(session.getState().race.winner, 'cl');
  assert.equal(session.getState().race.phase, 'finished');
  const winEvent = result.events.find((e) => e.type === 'race_win');
  assert.ok(winEvent, 'race_win event emitted');
  assert.match(winEvent.text, /Claude/);
});

test('race: movement away from target does not win', () => {
  const session = freshSession(() => 0.5); // target = 3
  session.choose('cl');
  session.submit('!juego');
  session._tickCountdown();
  session._tickCountdown();
  session._tickCountdown();
  // Move left (away from target 3)
  const result = session.submit('!a 3');
  assert.equal(session.getState().race.phase, 'racing', 'still racing, no win');
  assert.equal(session.getState().race.winner, null);
  assert.equal(result.events.find((e) => e.type === 'race_win'), undefined);
  // Move to target
  const result2 = session.submit('!d 6'); // try to overshoot
  assert.equal(session.getState().offsets.cl, 3, 'clamped to max');
  assert.equal(session.getState().race.winner, 'cl');
  assert.equal(result2.events.find((e) => e.type === 'race_win').type, 'race_win');
});

test('race: position resets to 0 when race starts', () => {
  const session = freshSession();
  session.choose('cl');
  session.submit('!d 2');
  assert.equal(session.getState().offsets.cl, 2);
  session.submit('!juego');
  assert.equal(session.getState().offsets.cl, 0, 'race resets position');
});

// ─── Visitor-local isolation ───────────────────────────────────────────────

test('race: two sessions are fully isolated (no shared state)', () => {
  const a = freshSession();
  const b = freshSession();
  a.choose('cl');
  b.choose('co');
  a.submit('!juego');
  assert.equal(a.getState().race.phase, 'countdown');
  assert.equal(b.getState().race.phase, 'idle', 'session B must not see session A race');
  b.submit('!juego');
  a._tickCountdown();
  assert.equal(b.getState().race.secondsLeft, 3, 'session B countdown not affected by session A tick');
});

test('race: changing agent cancels the race (visitor-local reset)', () => {
  const session = freshSession();
  session.choose('cl');
  session.submit('!juego');
  assert.equal(session.getState().race.phase, 'countdown');
  session.choose('co');
  assert.equal(session.getState().race.phase, 'idle', 'race cancelled on agent change');
});

// ─── Source-level guard: no network calls in the race code path ────────────

test('race: demo-practice.js source never opens network channels', () => {
  const source = readFileSync(new URL('../public/demo-practice.js', import.meta.url), 'utf8');
  const vps = readFileSync(new URL('../vps-overlay/public/demo-practice.js', import.meta.url), 'utf8');
  // The race must not introduce fetch, WebSocket, XMLHttpRequest, sendBeacon
  assert.doesNotMatch(source, /fetch\s*\(/, 'no fetch() allowed in practice');
  assert.doesNotMatch(source, /new\s+WebSocket\s*\(/i, 'no WebSocket allowed in practice');
  assert.doesNotMatch(source, /XMLHttpRequest|sendBeacon|navigator\.send/i, 'no XHR/sendBeacon allowed');
  assert.equal(vps, source, 'public and vps-overlay copies must be identical');
});

test('race: !juego target is reachable (between -3 and 3 inclusive)', () => {
  for (let i = 0; i < 10; i++) {
    const session = createPracticeSession({
      rng: () => (i % 2 ? 0.1 : 0.9),
      setTimeoutImpl: noopTimer,
      clearTimeoutImpl: noopClear,
    });
    session.choose('cl');
    session.submit('!juego');
    const t = session.getState().race.target;
    assert.ok(t >= -3 && t <= 3, `target ${t} must be reachable`);
  }
});
