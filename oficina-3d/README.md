# 3D CSS Virtual Office Runtime

Technical implementation of the interactive 3D office diorama for the streaming overlay.

---

## Operating Contract

- `panel-shell.js`: Periodic poller of `/api/tasks` (5s interval) providing `erbolamm:snapshot`.
- `runtime.ts`: Interprets actual file system folders. Javier (`ja`) has a dedicated fixed station in his office (`OWNER_DESK`).
- When an agent's task is opened, edited, or added, that agent moves directly to Javier's office (`VISITOR_SEAT`).
- If multiple cards are open simultaneously, only the agent with active browser focus enters the office; other agents wait in the adjacent holding area (`WAITING_SLOTS`) without overlapping.
- Desk visits are visual only; upon closing the card, the agent returns to their work table (if in `haciendo/`) or to the break lounge.
- Default priority is `Normal`.
- RAF execution is throttled to 30 fps during movement/delivery and paused when the tab is hidden. Character/fan CSS animations are capped with reduced-motion support.

---

## Build & Testing

Bundles `dist/office-3d.js` and `.css` are served statically; no CDN or external node runtime is required in production.

```sh
node build.mjs
```

---

## Controls & Gestures

- Workers face North towards their displays with differentiated back/front SVG sprites.
- Intuitive navigation: pinch/wheel for zoom, single-finger / left-drag for orbit/tilt, two-finger / right-drag for panning.
- Dark theme preserves clear floor materials with surface-level lighting and overhead fan fixtures.

