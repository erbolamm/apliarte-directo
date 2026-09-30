# Keep Admin and add a private tablet pizarra

Status: integrated and locally activated with Javier's approval on 2026-09-30. Not pushed or approved for publication. The default remains disabled; the current panel process explicitly uses `DIRECTO_PIZARRA_PLUS=1`. Device/real-OBS acceptance remains pending.

Activation checks: private HTTPS and local page return 200, original Admin returns 200, foreign Origin/public Host return 403, OBS state discovery returns 200, and panel JSON files are byte-identical to the pre-restart backup. No scene, mute or broadcast was changed. These checks are not visual/audio QA or proof of effective public network isolation. The existing launcher is unchanged; a normal restart without the opt-in flag disables the plus.

Device feedback: Javier confirmed Pencil drawing with the palm resting, without jumps. He then reported visible menu buttons whose content did not appear. The header's filtered/clipping box contained fixed-position popups. The correction positions the popups below a relative header with visible overflow and explicitly hides closed menus; gesture suppression remains on the canvases, not every ancestor. A source-level regression test guards this CSS contract. Javier confirmed dropdown visibility; no backend or service restart is involved in this static fix.

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
| Drawing | Original centre `src/server.js` on 8790 `/ws` | Private validated loopback proxy; original centre owns history and feeds existing OBS `/cristal.html`. No second drawing store. |
| Publication | Javier | Local branch only, no push/deploy/public demo links. The feature flag is not a substitute for private network policy. |

## Runtime routes (only with `DIRECTO_PIZARRA_PLUS=1`)

- `/pizarra-plus`: tablet page.
- `/pizarra-plus/guia`: private HTML manual.
- `/cristal-plus`: optional private read-only view of the same original drawing bus; not required for existing OBS sources.
- `/pizarra-plus/ws`: drawing socket; `?overlay=1` is a read-only drawing consumer.
- `/api/pizarra-plus/obs/state`, `/screenshot`: private GET responses, no-store.
- `/api/pizarra-plus/obs/action`: private POST, only scene and mute.

Use the existing private HTTPS Tailscale origin. Do not launch `npm run directo` in parallel with live services. Activation/integration and any panel restart require Javier's approval. Disable the flag to roll back without changing the A1 data.

## Explicit limitations

Drawing history is bounded original-centre memory (4,000 segments). A 7979 panel restart does not clear it; a centre restart does. The proxy accepts only drawing messages, strips extra fields, blocks overlay writes and never forwards OBS control messages. `CENTRO_PANEL_PORT` selects a numeric loopback port (default 8790); no remote host is accepted. The page reports connected only after original-centre history arrives. Restoration is code-tested, not yet activated or visually accepted. Botrix persistence (A3), Damas changes, camera audio diagnosis, and the general living-documentation ADR are separate pending work. A periodic screenshot is not proof of broadcast readiness. Physical iPad/OBS QA is not replaced by VM/static tests.

## Camera visibility and toolbar contract

The single existing Admin iframe lives outside the collapsing menu. While the menu is closed and its camera-push-container is active, only the original camera card's preview is shown in a compact dock. CSS is injected into the same-origin Admin document; neither Admin nor its nested VDO.ninja iframe is moved, recreated, navigated or cloned. Explicit camera off still hides the dock; closing the menu never changes mute/capture state. Device acceptance remains pending.

Toolbar uses the central `ingredientes/marca/APLIARTE_BRAND_KIT.md`, not the stale project brand-spec neon palette: blue #005fa9, navy #00467b, cyan #5ecef5, charcoal #303030, white #fdfdfd. Compact vector buttons, no emoji, accessible labels. Light/dark preference is per-device presentation only. Native RGB picker allows arbitrary drawing colors, which are user content and not UI brand tokens. Text insertion is still pending; not claimed here.
