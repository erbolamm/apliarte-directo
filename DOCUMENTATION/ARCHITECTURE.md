# 🏗️ Technical Architecture of ApliArte Directo

**ApliArte Directo** is built on the principles of clean architecture, minimal resource footprint, strict service decoupling, and security by design.

---

## 🧭 Service Topology Diagram

```
                           [ INTERNET / USERS ]
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │                                                   │
    [ Ports 80 / 443 ]                                  [ Port 7979 ]
 (Optional: Profile ssl)                            (Direct Access / Proxy)
            ▼                                                   ▼
┌───────────────────────┐                           ┌───────────────────────┐
│     caddy (proxy)     │──────────(HTTP)──────────>│    overlay (Node 22)  │
│  (Caddy 2 Auto SSL)   │                           │ - Three.js 3D Diorama │
└───────────────────────┘                           │ - Twitch Chat (IRC)   │
                                                    │ - Digital Audio Relay │
                                                    │ - Mobile Cockpit UI   │
                                                    │ - Layer Persistence   │
                                                    └───────────┬───────────┘
                                                                │
                                            Private Bridge Network: directo-network
                                            (Internal HTTP Requests :3000)
                                                                │
                                                                ▼
                                                    ┌───────────────────────┐
                                                    │      whip (Node/Web)  │
                                                    │ - Headless Chromium   │
                                                    │ - VDO.ninja WebRTC    │
                                                    │ - WHIP Push to Twitch │
                                                    │ - Internal Control API│
                                                    └───────────┬───────────┘
                                                                │ (WHIP WebRTC)
                                                                ▼
                                                        [ TWITCH INGEST ]
```

---

## 🧩 Docker Compose Services

### 1. `overlay` (Scene, Audio Relay & Web Cockpit Server)
- **Base Image**: `node:22-alpine` (minimal attack surface, no unnecessary binaries).
- **Core Responsibilities**:
  - Serves real-time 3D diorama (Three.js), animated avatars, lip-sync engine with incoming audio, digital clock, and alert widgets.
  - Client WebSocket server and direct digital PCM audio relay from mobile devices straight to OBS Browser Source without latency.
  - Client Twitch IRC anonymous listener for displaying chat messages and real-time command processing.
  - Interactive chat mini-games (`!traidor` and avatar adoptions).
  - Mobile cockpit dashboard (`panel-twitch-comandos.html`) secured via `PANEL_PASS`.
- **Persistence**:
  - `./data:/app/data`: Persistent state JSON files (`layers.json`, `categoria.json`, `camara.json`).
  - `./medios:/app/medios`: Sound effects, overlays, banners, and media assets.
- **Security**:
  - Runs without elevated host root privileges.
  - **No `/var/run/docker.sock` Mount**: Completely decoupled from the host Docker daemon.

### 2. `whip` (Headless WebRTC Twitch Streamer)
- **Base Image**: Debian Bookworm with headless Chromium and Puppeteer.
- **Core Responsibilities**:
  - Headless browser loading the VDO.ninja audiovisual mixer (`https://vdo.ninja/mixer`).
  - Direct WebRTC push to Twitch servers using the standard **WHIP (WebRTC HTTP Ingestion Protocol)**.
  - Low memory footprint: ~300-500 MB RAM (compared to 2+ GB in legacy Xvfb + FFmpeg pipelines).
- **Internal HTTP Control API (Port `3000`)**:
  - Endpoints exposed **strictly inside the private Docker bridge network**:
    - `GET http://whip:3000/status`: Returns current streaming state (`{ ok: true, streaming: true/false }`).
    - `POST http://whip:3000/start`: Launches headless browser capture and initiates Twitch broadcast.
    - `POST http://whip:3000/stop`: Gracefully terminates the stream and frees Chromium resources.

### 3. `caddy` (Reverse Proxy with Automated SSL)
- **Base Image**: `caddy:2-alpine`.
- **Profile**: `profiles: ["ssl"]` (disabled by default when using external reverse proxies like Nginx Proxy Manager or Traefik).
- **Core Responsibilities**:
  - Automatic Let's Encrypt SSL/TLS certificate provisioning and renewal via ACME.
  - TLS termination and secure proxy pass to port `7979` on the `overlay` container.

---

## 🔒 Network Isolation

- **Isolated Bridge Network (`directo-network`)**:
  - All containers communicate through this internal network.
  - The streamer control port (`:3000`) is **never exposed to the host or internet**, ensuring that only authorized requests from the `overlay` service can trigger or stop broadcasts.
