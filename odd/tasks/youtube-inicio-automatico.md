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

## Scope change (2026-10-09, approved by Javier)

T2 as first written was wrong: the "Emitir" tab of YouTube Studio has no auto-start / auto-stop toggles (checked in his Chrome with his permission; nothing changed). Research (Google docs, OBS forum): YouTube no longer keeps a default broadcast per channel, so video sent to a key with no waiting broadcast is not guaranteed to go live. This matches Javier's report that on 2026-10-08 YouTube sometimes went live and sometimes did not (inference, not confirmed on his channel).

Approved approach: the centre asks the YouTube Data API for a public broadcast with `enableAutoStart` and `enableAutoStop`, bound to the existing stream (his key), each time OBS starts.

Javier's condition (hard requirement): if the API fails for any reason (quota exhausted, no credentials, network, Google error), Twitch keeps going and the YouTube relay behaves exactly as today. The API call must never block or delay Twitch.

Cost studied: 10,000 quota units per day per project. Worst case about 160 units per live stream, so 5 per day is about 8%. Not confirmed from a source: that the API is free of charge; whether YouTube caps broadcasts created per day.

### Design decisions

- No new dependency: plain `fetch` against the REST API and `oauth2.googleapis.com/token`.
- OAuth client of type "Desktop app" with a loopback redirect; one-time consent by Javier.
- Secrets (client id, client secret, refresh token) live in `DATA_DIR/youtube-oauth.json`, mode 0600, git-ignored (same pattern as `data/twitch-auth.json`). Never logged.
- One-time connection through a script (`scripts/youtube-conectar.mjs`) that imports the JSON downloaded from Google Cloud and runs the consent flow. No panel UI in this feature.
- The stream is found by comparing the saved stream key with `cdn.ingestionInfo.streamName` locally; the key is never logged or sent anywhere new.
- A waiting broadcast already bound to that stream with auto-start is reused instead of creating another.
- Title and description are copied from the channel's most recent broadcast; fallback title "Directo ApliArte".
- The YouTube relay waits for the broadcast preparation with a short timeout; Twitch starts at once.

### Tasks (revised)

- [x] T1 — done, commit 85bc38d.
- [~] T2 — superseded by T3-T6 (no toggle exists on the "Emitir" tab).
- [ ] T3 — YouTube API client and OAuth credentials store, with the connection script and tests. Route: delegated direct (new modules, 2+ non-trivial files).
- [ ] T4 — Centre wiring on `postPublish` with the fail-safe, status in `/api/estado`, docs. Route: delegated direct.
- [ ] T5 — One-time Google Cloud setup and consent with Javier (outside the repo; needs his explicit permission per step).
- [ ] T6 — Live check: start OBS, both platforms go live; stop OBS, both end.

### Delivery (revised)

Forecast now about 700 authored changed lines, over the 400 heuristic. Strategy chosen for this feature: `exception-ok`. Reason: the workspace convention is one worktree branch per task card, the owner is not a programmer, and push / PR / merge stay his decision. Work-unit commits keep the slices readable: T1 = 85bc38d; T3 and T4 one commit each.
