# Feature: youtube-inicio-automatico

Task card: `cl--apliarte-directo--automatizar-inicio-youtube-obs--javier--normal--2026-10-09` (creator: Javier).

## Objective

When Javier presses "Start streaming" in OBS, YouTube goes public by itself (as Twitch does). When he stops OBS, the YouTube broadcast ends cleanly. He never has to use YouTube Studio.

## Problem

- The centre (`src/server.js`) relays OBS to YouTube with `ffmpeg -c copy` to `live2/<key>`. The repo has no YouTube Data API, no Google OAuth and no browser automation, so it cannot change YouTube's broadcast state.
- Whether YouTube goes live on ingest is decided on YouTube's side: the broadcast's auto-start / auto-stop flags. With them off, YouTube holds the stream in preview.
- On stop: `donePublish` (`src/server.js:446-462`) cannot tell a deliberate OBS stop from a network cut. With a backup video configured it starts the fallback loop towards YouTube, so the broadcast never ends unless `/api/emision/finalizar` is called.

## Scope

1. Code: the OBS websocket bridge reports a deliberate stream stop; the centre treats it as a voluntary close (same path as `/api/emision/finalizar`), so all relays stop and YouTube's auto-stop can end the broadcast.
2. Docs: explain the one-time YouTube auto-start / auto-stop setting and the new stop behaviour.
3. YouTube account setting (auto-start / auto-stop on): outside the repo. Needs Javier's decision on who changes it.

Out of scope: YouTube Data API / OAuth client, new dependencies.

## Constraints

- No new dependencies (`DOCUMENTATION/LOCAL_RESTREAM_RTMP.md:154-163`); tests use `node:test`.
- Stream keys stay only in `DATA_DIR/config.json`; never logged.
- A network cut (OBS reconnecting) must keep today's behaviour, including the backup video.
- `OBS_BRIDGE=off` keeps today's behaviour.

## Tasks

- [x] T1 — OBS deliberate stop ends the emission (bridge event + centre wiring + tests + docs). Route: delegated direct (writer trigger: 2+ non-trivial files: `src/obs-bridge.js`, `src/server.js`, tests, docs).
- [ ] T2 — YouTube auto-start / auto-stop enabled on Javier's channel. Route: pending Javier's decision (account change outside the repo).

## Acceptance criteria

- T1: an OBS `StreamStateChanged` stop event marks the close as voluntary before `donePublish` runs; a reconnecting state does not. Focused tests show RED then GREEN; `npm test` passes.
- T2: starting OBS shows the broadcast public on YouTube without touching YouTube Studio; stopping OBS ends it.

## Checks

- `node scripts/run-tests.mjs test/obs-bridge.test.js test/cierre-obs.test.js`
- `npm test`

## Delivery

- Strategy: `ask-on-risk`. Forecast: about 150 authored changed lines, single slice.

## Progress and evidence

- 2026-10-09: exploration done (read-only map of relay, YouTube code, bridge, docs, tests).
- 2026-10-09: T1 implemented by one bounded writer, checked by an independent read-only verifier (verdict: pass with notes), one scoped correction applied by the parent.
  - Risk tier applied: high (`gentle-ai review assess` returned `unassessable` because of untracked files). RDD is off (global), so no native review ran.
  - RED observed: `test/cierre-obs.test.js` failed with `ERR_MODULE_NOT_FOUND`; two new bridge tests timed out.
  - `node scripts/run-tests.mjs test/obs-bridge.test.js test/cierre-obs.test.js`: 12 pass, 0 fail.
  - `node --check src/server.js`: OK.
  - `npm test`: 910 tests, 900 pass, 5 fail, 5 skipped. The 5 failures are environmental and confirmed by the verifier: `oficina-3d/node_modules/esbuild`, `.env.example` and `medios/*` are git-ignored and absent from this worktree; none of those tests touches the changed files.
  - Correction: a guard (`cierrePorObsEnCurso`) so the second OBS event (STOPPED) arriving while ffmpeg is still being stopped does not close and log twice.
  - Not covered by tests: the wiring in `src/server.js` (the file starts servers on import); checked by reading only. Not tried against a real OBS.
  - Shared close function also bumps `revisionEntrada`, so a backup handoff in its pause no longer starts after a close. This applies to the panel button too.

## Known limits

- OBS may report the same stop state when it gives up by itself (reconnect retries exhausted). Unverified against real OBS. If so, the backup video covering that cut would be closed. Documented in `DOCUMENTATION/LOCAL_RESTREAM_RTMP.md`.
- Stopping OBS while a manual video plays over an active OBS publish also stops that video.
- Needs the OBS bridge connected to OBS's websocket server.

## Next step

T2: Javier decides who turns on auto-start / auto-stop on the YouTube channel. Then a live check with real OBS.
