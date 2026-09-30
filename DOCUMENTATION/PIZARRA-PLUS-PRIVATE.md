# Keep Admin and add a private tablet pizarra

Status: integrated and locally activated with Javier's approval on 2026-09-30. Not pushed or approved for publication. The default remains disabled; the current panel process explicitly uses `DIRECTO_PIZARRA_PLUS=1`. Device/real-OBS acceptance remains pending.

Activation checks: private HTTPS and local page return 200, original Admin returns 200, foreign Origin/public Host return 403, OBS state discovery returns 200, and panel JSON files are byte-identical to the pre-restart backup. No scene, mute or broadcast was changed. These checks are not visual/audio QA or proof of effective public network isolation. The existing launcher is unchanged; a normal restart without the opt-in flag disables the plus.

Device feedback: Javier confirmed Pencil drawing with the palm resting, without jumps. He then reported visible menu buttons whose content did not appear. The header's filtered/clipping box contained fixed-position popups. The correction positions the popups below a relative header with visible overflow and explicitly hides closed menus; gesture suppression remains on the canvases, not every ancestor. A source-level regression test guards this CSS contract. Dropdown visibility still requires his device confirmation; no backend or service restart is involved in this static fix.

## Quick review path

1. Read `private/pizarra-plus-guide.html`: HTML operating contract, boundaries, QA and rollback.
2. Review `src/pizarra-plus.js`: opt-in gate, private Host/Origin/auth checks, bounded drawing channel, and explicit OBS request allowlist.
3. Review `private/pointer-owner.js` and `test/pizarra-plus.test.js`: pointer ownership, real page handlers in a simulated DOM, fake OBS and real isolated WebSocket tests.
4. `server.js` only mounts the private routes and socket. No changes to existing Admin, its storage, the 8790 service or VPS server.

## Sources of truth

| Area | Owner | Invariant |
| --- | --- | --- |
| Admin and tabs | `public/admin.html` | Reuse same-origin iframe and discover actual navigation; do not duplicate controls/data. |
| Lists/commands | Existing A1 APIs and ignored `data/panel/` | Preserve server authority and existing records. |
| OBS protocol/config | `src/obs-bridge.js` | Local loopback client; never disclose passwords; no stream start/stop through the plus. |
| Drawing | Private plus socket | Own normalized canvas/history; do not alter the original 8790 channel. |
| Publication | Javier | Local branch only, no push/deploy/public demo links. The feature flag is not a substitute for private network policy. |

## Runtime routes (only with `DIRECTO_PIZARRA_PLUS=1`)

- `/pizarra-plus`: tablet page.
- `/pizarra-plus/guia`: private HTML manual.
- `/cristal-plus`: transparent drawing source for OBS, separate from the original source.
- `/pizarra-plus/ws`: drawing socket; `?overlay=1` is a read-only drawing consumer.
- `/api/pizarra-plus/obs/state`, `/screenshot`: private GET responses, no-store.
- `/api/pizarra-plus/obs/action`: private POST, only scene and mute.

Use the existing private HTTPS Tailscale origin. Do not launch `npm run directo` in parallel with live services. Activation/integration and any panel restart require Javier's approval. Disable the flag to roll back without changing the A1 data.

## Explicit limitations

Drawing history is bounded server memory and does not survive restart. Botrix persistence (A3), Damas changes, camera audio diagnosis, and the general living-documentation ADR are separate pending work. A periodic screenshot is not proof of broadcast readiness. Physical iPad/OBS QA is not replaced by VM/static tests.
