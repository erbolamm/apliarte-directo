# `config/escenas.json` — Scene × Category Matrix

Editable configuration tracked in Git (distinct from `data/`, which stores runtime state). Consumed by streaming overlays via `/api/escena` and `/api/categoria` endpoints in `server.js`.

---

## Orthogonal Axes

1. **Activity Category (`src/categorias.js`)**: `arte`, `musica`, `apps`, and `andando` (walk mode).
2. **Broadcast Scene / Phase**: `inicio`, `trabajando`, `hablando`, `espera`, `final`.

Each scene maintains a distinct palette per category.

---

## Schema Structure

The design follows a nested palette pattern (`palette` object containing theme colors and flags), adapting to property names defined in `categorias.js` (`primario`, `secundario`, `oscuro`).

---

## Scene → OBS Collection Mapping

| Scene | Approximate OBS Scene | Overlay HTML |
| :--- | :--- | :--- |
| `inicio` | `UniversoErBola` | `08-pantalla-inicio.html` |
| `trabajando` | `Solo_Calca` | `02-marco-tv.html` |
| `hablando` | `CON_CAMARA`, `chatEscena` | `03-marco-cam.html`, `04-marco-chat.html` |
| `espera` | `ModoEspera`, `PAUSA` | `06-pantalla-pausa.html` |
| `final` | *(none)* | *(none)* |

---

## Notes & Open Items

1. **`final`**: No dedicated OBS scene or HTML template is configured.
2. **`andando`**: Reserved category (`null` across all 5 scenes) awaiting final color specification.
3. **`apps` → `desarrollo-de-software`**: When executed, rename atomically across `escenas.json`, `categorias.js`, and persisted runtime state.
