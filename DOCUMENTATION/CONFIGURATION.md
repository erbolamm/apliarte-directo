# ⚙️ Configuration Reference Manual

This document details all configuration options available in **ApliArte Directo** through environment variables, persistent volumes, and OBS Studio integration.

---

## 📄 Environment Variables (`.env`)

| Variable | Type | Default | Required | Description |
| :--- | :---: | :---: | :---: | :--- |
| `PANEL_PASS` | String | *(Empty)* | **YES** | Master password to authenticate in the mobile cockpit and authorize control API calls. |
| `TWITCH_STREAM_KEY` | String | *(Empty)* | **YES** (to broadcast) | Twitch broadcast key (`live_...`) required by the `whip` container. |
| `VDO_ROOM` | String | `my_vdo_room` | No | Name of the VDO.ninja room where incoming audio/video feeds are mixed. |
| `VDO_PASS` | String | `my_vdo_password` | No | Password for the VDO.ninja mixer room. |
| `OVERLAY_PORT` | Number | `7979` | No | Host port mapped to the overlay HTTP/WebSocket server. |
| `AUTO_START` | Boolean | `false` | No | When set to `true`, the `whip` container automatically initiates live Twitch broadcast upon container start. |
| `VDO_CAM_ROOM` | String | `my_vdo_room` | No | VDO.ninja room for remote camera ingress (e.g. mobile smartphone camera). |
| `VDO_CAM_STREAM` | String | `cam_stream_id` | No | Stream ID identifier for the camera source. |
| `VDO_CAM_PASS` | String | *(Empty)* | No | Custom password for the camera video stream. |
| `DOMAIN` | String | *(Empty)* | Required with SSL | Public domain name (e.g. `directo.mydomain.com`) used by Caddy for automated SSL certificates (`--profile ssl`). |

---

## 💾 Storage Directories & Volumes

### `./data` (Mounted to `/app/data`)
Stores application persistent state in JSON format:
- `layers.json`: Visibility and ordering of overlay visual layers (clock, chat, 3D diorama, alert banners).
- `categoria.json`: Active stream category and theme configuration.
- `camara.json`: Persisted credentials and parameters for remote camera ingestion.
- `panel/usuario.json`, `panel/canal.json`, `panel/mensaje.json`, `panel/comandos-bot.json`: saved users, channels, messages and bot commands of the admin panel (see below).
- `panel/bienvenida.json`: Estado de la bienvenida automática (`{ "activa": true }`, siempre activa).
- `panel/bienvenida-vistos.json`: Marcas de tiempo de los espectadores saludados para la regla de cooldown de 6 horas.

#### Admin panel lists: the server is the owner (since 2026-09-30)

The studio panel (`/estudio`, or legacy `/admin`, port 7979) reads and writes these lists only through
`/api/panel/lista?tipo=usuario|canal|mensaje` and `/api/panel/comandos-bot`. The
same `data/panel/` files are shared with every browser and device that opens the panel.

- **A save exists only after the server confirms it.** The panel shows `✓` only
  after a successful response that contains the value. On 401 (expired session),
  5xx or no connection it shows `❌` with the reason and keeps what was typed.
- **An empty list stays empty.** The panel never fills an empty list with
  defaults on its own. The 📥 button adds the default commands, users, channels
  and messages after a confirmation; it only adds what is missing and never
  changes a saved command description.
- **A corrupt file is never overwritten.** If a list file is not a valid JSON
  array, the API answers `500 lista-danada` for reads and writes and leaves the
  file untouched for manual recovery.
- **Only the three list types are accepted**; any other `tipo`, `accion` or an
  empty value is rejected with `400`. Writes are atomic (temporary file + rename).
- **The browser keeps nothing.** Older panel versions stored these lists in
  `localStorage` (`directo_panel_usuarios_v1`, `directo_panel_canales_v1`,
  `directo_panel_mensajes_v1`). They are neither read nor deleted any more, so a
  later explicit import can still recover browser-only entries.

#### Chat unificado y soberano (Twitch + YouTube nativo, sin Botrix)

El panel `/estudio` incorpora lectura directa y simultánea de Twitch (vía WebSocket IRC) y YouTube Live Chat (vía API ligera InnerTube sin cuotas ni servicios privativos).

- **Mensajes destacados en pantalla (👁️)**: Cada mensaje en el panel incluye un botón con icono de ojo para mostrarlo inmediatamente en el overlay flotante `/sms-pantalla.html` junto con su avatar y nombre.
- **Historial de bienvenida**: Los nuevos espectadores son saludados automáticamente si es su primer mensaje hoy, respetando un cooldown de 6 horas por usuario guardado en `data/panel/bienvenida-vistos.json`.
- *(Nota histórica: El endpoint `/api/panel/chat-config` y el parámetro de widget de Botrix quedan mantenidos únicamente por retrocompatibilidad, pero ya no son necesarios en la suite actual).*

### `./medios` (Mounted to `/app/medios`)
User media directory for custom static assets:
- Alert audio sound effects (`.mp3`, `.wav`).
- Custom background images and banners (`.png`, `.jpg`, `.svg`).
- Video stings and transitions (`.mp4`, `.webm`).

---

## 🌐 OBS Studio Integration

To display overlays in OBS Studio, Streamlabs, or Prism Live Studio, add **Browser Sources** (Fuentes de Navegador):

1. **Plano 3D Integrado**:
   - URL: `http://localhost:7979/plano?transparente=1`
   - Tamaño: `1920×1080`
   - Parámetros opcionales: `&nocontexto=1` (desactiva barra de contexto integrada), `&noavatares=1` (desactiva tira de avatares integrada).

2. **Fuentes Modulares Independientes**:
   - **Barra de Contexto flotante**: `http://localhost:7979/contexto.html` (transparente, reacciona a `!contexto <tema>`, zoom con `+`/`-`).
   - **Tira de Avatares flotante**: `http://localhost:7979/avatares.html?modo=horizontal` o `?modo=vertical` (transparente, interactiva con `+`/`-`).
   - **Overlay de SMS y Chat destacado**: `http://localhost:7979/sms-pantalla.html` (muestra notas de buzón y mensajes destacados del chat con el botón 👁️).
   - **Cámara conmutable inteligente**: `http://localhost:7979/camara.html` (monigote por defecto, conmuta a vídeo real, bocadillo de saludo en la parte superior).

3. Check **Control audio via OBS** if you wish to route overlay sound effects and audio through a dedicated OBS audio channel.
4. Check **Shutdown source when not visible** to preserve RAM during inactive scenes.
5. In OBS, use right-click **Interact** (Interactuar) on browser sources to adjust zoom levels using the discreet `+` and `−` controls.
