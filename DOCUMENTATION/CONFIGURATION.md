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

### `./medios` (Mounted to `/app/medios`)
User media directory for custom static assets:
- Alert audio sound effects (`.mp3`, `.wav`).
- Custom background images and banners (`.png`, `.jpg`, `.svg`).
- Video stings and transitions (`.mp4`, `.webm`).

---

## 🌐 OBS Studio Integration

To display the 3D overlay in OBS Studio, Streamlabs, or Prism Live Studio:

1. Add a new **Browser Source** in OBS.
2. Enter the overlay URL:
   - Local: `http://localhost:7979/`
   - Remote VPS: `https://directo.yourdomain.com/` (or `http://YOUR_VPS_IP:7979/`)
3. Set the canvas dimensions:
   - **Width**: `1920`
   - **Height**: `1080`
4. Check **Control audio via OBS** if you wish to route overlay sound effects and audio through a dedicated OBS audio channel.
5. Check **Shutdown source when not visible** to preserve RAM during inactive scenes.
