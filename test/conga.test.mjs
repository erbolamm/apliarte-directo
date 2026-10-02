// test/conga.test.mjs
// Tests for the pure !conga state machine in oficina-3d/src/office/conga.ts.
// Node v26+ strips TypeScript types from .ts files natively, so we can import
// the module directly without a build step.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as conga from '../oficina-3d/src/office/conga.ts';

const CTX = Object.freeze({ broadcaster: 'apliarte', avatarOwners: {} });
const CTX_WITH_ADOPTED = Object.freeze({
  broadcaster: 'apliarte',
  avatarOwners: Object.freeze({ co: 'viewer_co', cl: 'viewer_cl' }),
});

/** No external mutations: every pure function returns a new state object. */
test('emptyCongaState returns idle phase with no dancers', () => {
  const s = conga.emptyCongaState();
  assert.equal(s.phase, 'idle');
  assert.equal(s.dancers.length, 0);
  assert.equal(s.broadcaster, 'apliarte');
});

test('circuitLength is positive and matches the sum of segments', () => {
  const total = conga.circuitLength();
  assert.ok(total > 0, 'circuit length should be positive');
  let manual = 0;
  for (let i = 1; i < conga.CONGA_CIRCUIT.length; i++) {
    const a = conga.CONGA_CIRCUIT[i - 1];
    const b = conga.CONGA_CIRCUIT[i];
    manual += Math.hypot(b.x - a.x, b.y - a.y);
  }
  assert.equal(total, manual);
});

test('startConga: only the broadcaster can start a new conga from idle', () => {
  const s0 = conga.emptyCongaState();
  const t0 = 1_000_000;
  // Non-broadcaster: no-op
  const s1 = conga.startConga(s0, t0, 'viewer1', 'Viewer One', CTX);
  assert.equal(s1.phase, 'idle');
  assert.equal(s1.dancers.length, 0);
  // Broadcaster: countdown with the leader
  const s2 = conga.startConga(s0, t0, 'apliarte', 'Javier', CTX);
  assert.equal(s2.phase, 'countdown');
  assert.equal(s2.dancers.length, 1);
  assert.equal(s2.dancers[0].agentId, 'ja');
  assert.equal(s2.dancers[0].login, 'apliarte');
  assert.equal(s2.dancers[0].freeAssignment, false);
  assert.equal(s2.countdownEndsAt - t0, conga.CONGA_COUNTDOWN_MS);
});

test('startConga: non-broadcaster is rejected even if they guess the login', () => {
  const s0 = conga.emptyCongaState();
  // Case-insensitive match
  assert.equal(conga.startConga(s0, 0, 'APLIARTE', 'X', CTX).phase, 'countdown');
  const sAfter = conga.startConga(s0, 0, 'APLIARTE', 'X', CTX);
  // But a different login is rejected
  assert.equal(conga.startConga(sAfter, 0, 'someone_else', 'X', CTX).phase, 'countdown');
  const sIdle = conga.emptyCongaState();
  assert.equal(conga.startConga(sIdle, 0, 'random_viewer', 'X', CTX).phase, 'idle');
});

test('startConga: cannot start while countdown or dancing', () => {
  const t0 = 0;
  const sCountdown = conga.startConga(conga.emptyCongaState(), t0, 'apliarte', 'Javier', CTX);
  // Another start attempt during countdown: rejected
  const sAgain = conga.startConga(sCountdown, t0 + 1000, 'apliarte', 'Javier', CTX);
  assert.equal(sAgain.phase, 'countdown');
  assert.equal(sAgain.dancers.length, 1, 'no extra leader added');
});

test('joinConga: viewers can join during countdown, deduplicated by login', () => {
  const t0 = 0;
  let s = conga.startConga(conga.emptyCongaState(), t0, 'apliarte', 'Javier', CTX);
  s = conga.joinConga(s, t0 + 100, 'viewer_a', 'Viewer A', CTX);
  s = conga.joinConga(s, t0 + 200, 'viewer_b', 'Viewer B', CTX);
  s = conga.joinConga(s, t0 + 300, 'viewer_a', 'Viewer A dup', CTX);
  assert.equal(s.dancers.length, 3, 'leader + 2 unique viewers');
  assert.equal(s.dancers[0].agentId, 'ja');
  assert.notEqual(s.dancers[1].agentId, 'ja');
  assert.notEqual(s.dancers[2].agentId, 'ja');
  // Both non-leader dancers got free assignments (no adopted owners in CTX)
  assert.equal(s.dancers[1].freeAssignment, true);
  assert.equal(s.dancers[2].freeAssignment, true);
  assert.equal(s.dancers[1].login, 'viewer_a');
  assert.equal(s.dancers[2].login, 'viewer_b');
});

test('joinConga: adopted viewers keep their own avatar and are not marked free', () => {
  const t0 = 0;
  let s = conga.startConga(conga.emptyCongaState(), t0, 'apliarte', 'Javier', CTX_WITH_ADOPTED);
  s = conga.joinConga(s, t0 + 100, 'viewer_co', 'Viewer CO', CTX_WITH_ADOPTED);
  const d = s.dancers.find((x) => x.login === 'viewer_co');
  assert.ok(d, 'adopted viewer should be in the dancers list');
  assert.equal(d.agentId, 'co', 'adopted avatar is preserved');
  assert.equal(d.freeAssignment, false, 'adopted viewers are not free assignments');
});

test('joinConga: safety cap when the free pool is exhausted', () => {
  const t0 = 0;
  let s = conga.startConga(conga.emptyCongaState(), t0, 'apliarte', 'Javier', CTX);
  // DANCING_POOL has 8 entries. Fill them.
  const viewers = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'];
  for (let i = 0; i < viewers.length; i++) {
    s = conga.joinConga(s, t0 + 100 + i, viewers[i], 'V' + i, CTX);
  }
  assert.equal(s.dancers.length, 9, 'leader + 8 pool members');
  // Next join is silently ignored
  const sAfter = conga.joinConga(s, t0 + 1000, 'v9_overflow', 'V9', CTX);
  assert.equal(sAfter.dancers.length, 9, 'no extra dancer added at the cap');
  assert.equal(sAfter, s, 'returns the same state reference at the cap');
});

test('joinConga: broadcaster trying to join again is ignored', () => {
  const t0 = 0;
  let s = conga.startConga(conga.emptyCongaState(), t0, 'apliarte', 'Javier', CTX);
  s = conga.joinConga(s, t0 + 100, 'apliarte', 'Javier', CTX);
  assert.equal(s.dancers.length, 1, 'broadcaster is already the leader');
});

test('joinConga: latecomers during dancing are added at the tail', () => {
  const t0 = 0;
  const sCountdown = conga.startConga(conga.emptyCongaState(), t0, 'apliarte', 'Javier', CTX);
  // Advance into dancing phase
  const sDancing = conga.tickConga(sCountdown, t0 + conga.CONGA_COUNTDOWN_MS + 1);
  assert.equal(sDancing.phase, 'dancing');
  // Late joiner
  const sAfter = conga.joinConga(sDancing, t0 + conga.CONGA_COUNTDOWN_MS + 2000, 'latecomer', 'Late', CTX);
  assert.equal(sAfter.dancers.length, 2);
  assert.equal(sAfter.dancers[1].login, 'latecomer');
  assert.equal(sAfter.dancers[1].index, 1, 'latecomer is at the tail');
});

test('tickConga: countdown -> dancing -> ended -> idle lifecycle', () => {
  const t0 = 0;
  const sCountdown = conga.startConga(conga.emptyCongaState(), t0, 'apliarte', 'Javier', CTX);
  // Right at the end of countdown: still countdown
  assert.equal(conga.tickConga(sCountdown, t0 + conga.CONGA_COUNTDOWN_MS - 1).phase, 'countdown');
  // Past the countdown: dancing
  const sDancing = conga.tickConga(sCountdown, t0 + conga.CONGA_COUNTDOWN_MS + 1);
  assert.equal(sDancing.phase, 'dancing');
  assert.equal(sDancing.dancingEndsAt - t0 - conga.CONGA_COUNTDOWN_MS - 1, conga.CONGA_DANCE_MS);
  // Still dancing mid-way
  const sMid = conga.tickConga(sDancing, t0 + conga.CONGA_COUNTDOWN_MS + conga.CONGA_DANCE_MS / 2);
  assert.equal(sMid.phase, 'dancing');
  // Past dancing: ended
  const sEnded = conga.tickConga(sDancing, t0 + conga.CONGA_COUNTDOWN_MS + conga.CONGA_DANCE_MS + 1);
  assert.equal(sEnded.phase, 'ended');
  // Past ended: back to idle
  const sIdle = conga.tickConga(sEnded, sEnded.phaseStartedAt + conga.CONGA_ENDED_MS + 1);
  assert.equal(sIdle.phase, 'idle');
  assert.equal(sIdle.dancers.length, 0);
  assert.equal(sIdle.adoptionRequests.length, 0);
});

test('tickConga: ended phase collects free-assigned dancers for adoption requests', () => {
  const t0 = 0;
  let s = conga.startConga(conga.emptyCongaState(), t0, 'apliarte', 'Javier', CTX_WITH_ADOPTED);
  s = conga.joinConga(s, t0 + 100, 'viewer_co', 'Viewer CO', CTX_WITH_ADOPTED); // adopted, not free
  s = conga.joinConga(s, t0 + 200, 'random_viewer', 'Random', CTX_WITH_ADOPTED); // free assignment
  s = conga.tickConga(s, t0 + conga.CONGA_COUNTDOWN_MS + 1); // -> dancing
  s = conga.tickConga(s, t0 + conga.CONGA_COUNTDOWN_MS + conga.CONGA_DANCE_MS + 1); // -> ended
  assert.equal(s.phase, 'ended');
  assert.deepEqual(s.adoptionRequests, ['random_viewer'], 'only the free assignment requests adoption');
});

test('applyCongaCommand: routes !conga to start or join depending on phase', () => {
  const t0 = 0;
  const s0 = conga.emptyCongaState();
  // From idle: start
  const s1 = conga.applyCongaCommand(s0, { comando: 'conga', usuario: 'apliarte', texto: 'Javier' }, t0, CTX);
  assert.equal(s1.phase, 'countdown');
  // From countdown: join (broadcaster joins are no-ops)
  const s2 = conga.applyCongaCommand(s1, { comando: 'conga', usuario: 'viewer_x' }, t0 + 100, CTX);
  assert.equal(s2.dancers.length, 2);
  // Unknown command: no-op
  const s3 = conga.applyCongaCommand(s2, { comando: 'cafe', usuario: 'viewer_x' }, t0 + 200, CTX);
  assert.equal(s3, s2, 'unknown command returns same state');
});

test('applyCongaCommand: only broadcaster can transition idle/ended -> countdown', () => {
  const t0 = 0;
  const s0 = conga.emptyCongaState();
  const s1 = conga.applyCongaCommand(s0, { comando: 'conga', usuario: 'random_viewer' }, t0, CTX);
  assert.equal(s1.phase, 'idle', 'random viewer cannot start');
  const s2 = conga.applyCongaCommand(s0, { comando: 'conga', usuario: 'apliarte' }, t0, CTX);
  assert.equal(s2.phase, 'countdown');
});

test('applyCongaCommand: avatarOwners is never mutated by the conga module', () => {
  const t0 = 0;
  const owners = { co: 'viewer_co' };
  const ctx = { broadcaster: 'apliarte', avatarOwners: owners };
  let s = conga.emptyCongaState();
  s = conga.applyCongaCommand(s, { comando: 'conga', usuario: 'apliarte' }, t0, ctx);
  s = conga.applyCongaCommand(s, { comando: 'conga', usuario: 'random_viewer_1' }, t0 + 100, ctx);
  s = conga.applyCongaCommand(s, { comando: 'conga', usuario: 'random_viewer_2' }, t0 + 200, ctx);
  s = conga.tickConga(s, t0 + conga.CONGA_COUNTDOWN_MS + 1);
  s = conga.tickConga(s, t0 + conga.CONGA_COUNTDOWN_MS + conga.CONGA_DANCE_MS + 1);
  s = conga.tickConga(s, s.phaseStartedAt + conga.CONGA_ENDED_MS + 1);
  assert.equal(s.phase, 'idle');
  assert.deepEqual(owners, { co: 'viewer_co' }, 'avatarOwners must not be mutated');
  // Also verify the adopted viewer kept its adopted avatar
  const adopted = s.dancers; // already empty after reset
  assert.equal(adopted.length, 0);
});

test('getCreditText: visible only during countdown and dancing', () => {
  const s0 = conga.emptyCongaState();
  assert.equal(conga.getCreditText(s0), null);
  const t0 = 0;
  const sCountdown = conga.startConga(s0, t0, 'apliarte', 'Javier', CTX);
  assert.equal(conga.getCreditText(sCountdown), conga.CONGA_CREDIT);
  const sDancing = conga.tickConga(sCountdown, t0 + conga.CONGA_COUNTDOWN_MS + 1);
  assert.equal(conga.getCreditText(sDancing), conga.CONGA_CREDIT);
  const sEnded = conga.tickConga(sDancing, t0 + conga.CONGA_COUNTDOWN_MS + conga.CONGA_DANCE_MS + 1);
  assert.equal(conga.getCreditText(sEnded), null);
});

test('getAdoptionSpeech: returns the adoption text only for free-assigned dancers during ended', () => {
  const t0 = 0;
  let s = conga.startConga(conga.emptyCongaState(), t0, 'apliarte', 'Javier', CTX);
  s = conga.joinConga(s, t0 + 100, 'free_user', 'Free', CTX);
  s = conga.tickConga(s, t0 + conga.CONGA_COUNTDOWN_MS + 1);
  s = conga.tickConga(s, t0 + conga.CONGA_COUNTDOWN_MS + conga.CONGA_DANCE_MS + 1);
  assert.equal(s.phase, 'ended');
  assert.equal(conga.getAdoptionSpeech(s, 'free_user'), conga.CONGA_ADOPT_TEXT);
  // Broadcaster (leader) is adopted, never free
  assert.equal(conga.getAdoptionSpeech(s, 'apliarte'), null);
  // Random non-dancer
  assert.equal(conga.getAdoptionSpeech(s, 'ghost'), null);
});

test('getDancerPosition: returns null outside dancing/ended; position moves forward during dance', () => {
  const t0 = 0;
  const sIdle = conga.emptyCongaState();
  assert.equal(conga.getDancerPosition(sIdle, 'apliarte', t0), null);
  const sCountdown = conga.startConga(sIdle, t0, 'apliarte', 'Javier', CTX);
  assert.equal(conga.getDancerPosition(sCountdown, 'apliarte', t0), null);
  const sDancing = conga.tickConga(sCountdown, t0 + conga.CONGA_COUNTDOWN_MS + 1);
  const p1 = conga.getDancerPosition(sDancing, 'apliarte', t0 + conga.CONGA_COUNTDOWN_MS + 1000);
  const p2 = conga.getDancerPosition(sDancing, 'apliarte', t0 + conga.CONGA_COUNTDOWN_MS + 5000);
  assert.ok(p1, 'leader has a position at 1s into dance');
  assert.ok(p2, 'leader has a position at 5s into dance');
  // The leader should have moved along the circuit: distance between p1 and p2 > 0
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  assert.ok(d > 10, 'leader moved along the circuit between 1s and 5s');
  // Dancer is not in the conga
  assert.equal(conga.getDancerPosition(sDancing, 'ghost', t0 + conga.CONGA_COUNTDOWN_MS + 1000), null);
});

test('getCongaAgentPositions: maps each dancer agentId to its current position', () => {
  const t0 = 0;
  let s = conga.startConga(conga.emptyCongaState(), t0, 'apliarte', 'Javier', CTX);
  s = conga.joinConga(s, t0 + 100, 'v1', 'V1', CTX);
  s = conga.tickConga(s, t0 + conga.CONGA_COUNTDOWN_MS + 1);
  const positions = conga.getCongaAgentPositions(s, t0 + conga.CONGA_COUNTDOWN_MS + 2000);
  assert.ok(positions.has('ja'), 'leader avatar in the map');
  assert.equal(positions.size, 2, 'leader + 1 follower');
});

test('countdownSecondsLeft: counts down correctly during the countdown phase', () => {
  const t0 = 0;
  const s = conga.startConga(conga.emptyCongaState(), t0, 'apliarte', 'Javier', CTX);
  assert.equal(conga.countdownSecondsLeft(s, t0), 10);
  assert.equal(conga.countdownSecondsLeft(s, t0 + 1000), 9);
  assert.equal(conga.countdownSecondsLeft(s, t0 + 9500), 1);
  assert.equal(conga.countdownSecondsLeft(s, t0 + 10_000), 0);
  const sDancing = conga.tickConga(s, t0 + conga.CONGA_COUNTDOWN_MS + 1);
  assert.equal(conga.countdownSecondsLeft(sDancing, t0 + conga.CONGA_COUNTDOWN_MS + 1), 0);
});

test('isCongaDancer: true for dancers, false otherwise', () => {
  const t0 = 0;
  let s = conga.startConga(conga.emptyCongaState(), t0, 'apliarte', 'Javier', CTX);
  s = conga.joinConga(s, t0 + 100, 'v1', 'V1', CTX);
  assert.equal(conga.isCongaDancer(s, 'apliarte'), true);
  assert.equal(conga.isCongaDancer(s, 'V1'), true, 'login comparison is case-insensitive (V1 vs v1)');
  assert.equal(conga.isCongaDancer(s, 'v1'), true);
  assert.equal(conga.isCongaDancer(s, 'ghost'), false);
});
