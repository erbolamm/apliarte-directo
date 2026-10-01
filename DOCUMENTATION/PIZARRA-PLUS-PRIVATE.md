# Keep Admin and add a private tablet pizarra

Status: integrated and locally activated with Javier's approval on 2026-09-30. Not pushed or approved for publication. The default remains disabled; the current panel process explicitly uses `DIRECTO_PIZARRA_PLUS=1`. Device/real-OBS acceptance remains pending.

Activation checks: private HTTPS and local page return 200, original Admin returns 200, foreign Origin/public Host return 403, OBS state discovery returns 200, and panel JSON files are byte-identical to the pre-restart backup. No scene, mute or broadcast was changed. These checks are not visual/audio QA or proof of effective public network isolation. The existing launcher is unchanged; a normal restart without the opt-in flag disables the plus.

Device feedback: Javier confirmed Pencil drawing with the palm resting, without jumps. He then reported visible menu buttons whose content did not appear. The header's filtered/clipping box contained fixed-position popups. The correction positions the popups below a relative header with visible overflow and explicitly hides closed menus; gesture suppression remains on the canvases, not every ancestor. A source-level regression test guards this CSS contract. Javier confirmed dropdown visibility; no backend or service restart is involved in this static fix.

## Own panel redesign (branch `feature/pizarra-panel-propio`, not activated)

Requested by Javier on 2026-10-01. Layout and controls only; the drawing, Pencil/palm, OBS and drawing-bus engine is unchanged.

1. The drawing area keeps the 16:9 broadcast ratio and the single toolbar is glued directly under it. On 4:3 (iPad 2018) the area touches the sides; on 16:9 screens it shrinks slightly so the bar never covers it. Everything sits inside the iPad safe area (`env(safe-area-inset-*)`), so nothing is drawn under the clock, battery, Wi-Fi or multitasking dots.
2. One icon per control, no `<details>/<summary>` disclosure markers: Drawing, Undo, Redo, Clear, OBS snapshot, device camera, device microphone, TTS, Chat, Commands, OBS, Settings.
3. Drawing: one panel with the tools, 16 quick colours, the free colour picker, a 1–40 size slider and "draw with finger too". Starting a stroke closes it.
4. Chat, Commands and OBS open full-screen sheets inside the safe area. Commands read `/api/panel/comandos-bot` and the saved lists, fill `[usuario]/[canal]/[mensaje]/[agente]` in order like the Admin, ask for confirmation and send through `/api/directo/comando`; server errors are shown as returned.
5. Camera, microphone and TTS are toggles that click the original Admin controls in the hidden engine. Hiding the camera preview never stops the camera; with the preview hidden, the first camera tap shows it again.

Validation (2026-10-01): `node --test test/pizarra-controles-compactos.test.js test/pizarra-plus.test.js test/pizarra-cristal.test.js test/pizarra-panel-propio.test.js` → 41/41. Visual check on an isolated server (port 17979, temporary `DATA_DIR`, drawing bus pointed at an unused port, `OBS_BRIDGE=off`) at 1024×768, 768×1024, 1920×1080 and 500×900; Drawing panel, Commands flow, Chat and Settings exercised in Chrome. Not verified: a real iPad 2018 with Pencil, a real phone, Safari, iOS speech for TTS through the hidden engine, OBS/Twitch end to end. Not implemented: new drawing shapes (they need the OBS renderer in `public/cristal.html` too), persistence of drawings and screenshots, Botrix stored on the server (A3).

## Quick review path

1. Read `private/pizarra-plus-guide.html`: HTML operating contract, boundaries, QA and rollback.
2. Review `src/pizarra-plus.js`: opt-in gate, private Host/Origin/auth checks, bounded drawing channel, and explicit OBS request allowlist.
3. Review `private/pointer-owner.js` and `test/pizarra-plus.test.js`: pointer ownership, real page handlers in a simulated DOM, fake OBS and real isolated WebSocket tests.
4. `server.js` only mounts the private routes and socket. No changes to existing Admin, its storage, the 8790 service or VPS server.

## Sources of truth

| Area | Owner | Invariant |
| --- | --- | --- |
| Admin engine | `public/admin.html` | One hidden same-origin iframe drives device camera, microphone and TTS; it is shown complete only from the gear (Settings). The Pizarra never opens Admin tabs for Chat or Commands. |
| Chat | Twitch embed, or the viewer's Botrix widget when the Admin "Todos" option is on in that browser | Same storage keys as the Admin (`erbolamm-chat-todos`, `erbolamm-botrix-widget-url`); no new storage. |
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

### Compact controls candidate (isolated branch, not activated)

`fix/pizarra-controles-compactos` groups the existing drawing tools and the RGB
picker/width controls into closable top-bar menus. SVG shortcuts expose a fixed
OBS snapshot, OBS input mute, this device's microphone and camera, local camera
visibility, chat and commands. Camera/audio shortcuts delegate to the existing
Admin controls in one persistent iframe; opening or closing a view never invokes
capture or mute handlers. Device capture state is not claimed to be global OBS
state. The drawing canvas and snapshot image remain separate layers.

Snapshots default to manual refresh (interval `0`). Capturing explicitly returns
to manual mode; clearing strokes does not clear the image. Periodic snapshots
remain opt-in. Pen input reduces control size; coarse touch targets remain 44px,
and palm input cannot change the layout during an active pen stroke.

Validation: `node scripts/run-tests.mjs test/pizarra-controles-compactos.test.js
test/pizarra-plus.test.js`. The author's Node execution is blocked by runtime
permissions; only V8 syntax/function checks and source checks have run so far.
Independent Node tests, browser layout and real-device/OBS verification are still
required before activation. This change does not implement disk persistence of
drawing history or cross-device screenshot synchronization; those remain pending.

Review follow-up: compact-menu tool labels are hidden at every viewport width to
avoid desktop label overlap. The existing complete-page Pencil/palm test now
models the DOM creation, attribute APIs and observers required by the compact
toolbar; it still executes the actual page script and pointer handlers, and also
asserts the snapshot shortcut was mounted and the footer hidden. That test passes
in an author-side V8 adapter. A fresh independent Node run and desktop visual
check remain required; the live panel has not been changed.

The single existing Admin iframe lives outside the collapsing menu. While the menu is closed and its camera-push-container is active, only the original camera card's preview is shown in a compact dock. CSS is injected into the same-origin Admin document; neither Admin nor its nested VDO.ninja iframe is moved, recreated, navigated or cloned. Explicit camera off still hides the dock; closing the menu never changes mute/capture state. Device acceptance remains pending.

Toolbar uses the central `ingredientes/marca/APLIARTE_BRAND_KIT.md`, not the stale project brand-spec neon palette: blue #005fa9, navy #00467b, cyan #5ecef5, charcoal #303030, white #fdfdfd. Compact vector buttons, no emoji, accessible labels. Light/dark preference is per-device presentation only. Native RGB picker allows arbitrary drawing colors, which are user content and not UI brand tokens. Text insertion is still pending; not claimed here.
