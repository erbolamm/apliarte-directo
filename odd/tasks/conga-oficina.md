# Feature: !conga circuit through the office

**Status:** in progress
**Branch:** ge/conga-oficina
**Worktree:** /Users/apliarte/repos/apliarte-directo-publico-worktrees/ge--conga-oficina
**Brief by:** Javier (2026-10-03, live stream in progress)
**Authorised:** yes (full brief, no negotiation needed)

## Objective

Add a Twitch chat command `!conga` to the 3D office that:

1. Only Javier (broadcaster) starts a conga by typing `!conga`.
2. Viewers typing `!conga` during the 10-second countdown get selected.
3. Viewers without an adopted avatar get a free avatar assigned for the conga (not stored in `avatarOwners`).
4. The conga starts in `descanso`, walks every room and returns to `descanso` in exactly 30 s; dancers follow the leader with fixed spacing.
5. Late joiners during the dance catch up to the tail.
6. When the circuit ends, adopted avatars resume; free-assigned avatars show "Adoptadme, por favor" via the speech-bubble mechanism.
7. Credit sign "Idea: Conga de ManzDev · manz.dev" visible during countdown/dance.
8. Safety cap on dancers (number of available free avatars); extra joins ignored silently.

## Hard limits (Javier is live)

- Worktree-only: `ge--conga-oficina` based on `main`. Do NOT touch the live checkout's `public/`, `oficina-3d/dist/`, `server.js`, `src/`.
- Do NOT restart/stop `:7979`, `:8790`, `:1935`.
- Do NOT push to `origin` (public repo). Push only to the private repo: `https://github.com/erbolamm/apliarte-directo-privado.git`.
- Staging by exact path only.
- No emojis in conga UI.
- No input to `ja--`, `ja-`, "no tocar" terminals.
- No other workers in the office scene.

## Tasks

1. Create worktree and ODD task file (this file).
2. Install oficina-3d deps in worktree.
3. Write failing tests for the pure conga module.
4. Implement `oficina-3d/src/office/conga.ts` (pure, no DOM/Three/React).
5. Wire `case 'conga'` in `runtime.applyCommand`, conga tick in `tick()`, conga positioning in `destination()` (or override for conga dancers), credit banner dispatch, adoption-request speech bubbles.
6. Build bundle: `node build.mjs` in `oficina-3d/`.
7. Run test suite: `node scripts/run-tests.mjs`.
8. Commit: `feat(oficina-3d): add !conga circuit through the office` on `ge/conga-oficina`.
9. Push to `apliarte-directo-privado`, verify with `git ls-remote`.
10. Report in Spanish with activation and rollback steps.

## Acceptance

- Broadcaster-only start (tests prove it).
- Joins during countdown and during dance (tests prove it).
- Free avatars assigned without modifying `avatarOwners` (tests prove it).
- Adoption request triggered on `ended` phase (tests prove it).
- Credit banner text exactly "Idea: Conga de ManzDev · manz.dev" (no emojis).
- Adoption bubble text exactly "Adoptadme, por favor" (no emojis).
- Build succeeds, test suite green, push verified, no merge to live, no push to origin.

## Files

- NEW: `oficina-3d/src/office/conga.ts`
- NEW: `test/conga.test.mjs`
- MODIFIED: `oficina-3d/src/office/runtime.ts` (conga dispatch + tick + position)

## Verification evidence

(populated after tasks complete)
