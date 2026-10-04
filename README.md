# 🎙️ ApliArte Directo

> **Sovereign live broadcasting suite and interactive 3D overlays for streaming with Docker.**
> 
> 🌐 **Landing Page**: [directo.apliarte.com](https://directo.apliarte.com) · 📖 **Guía Oficial de Comandos y Avatares**: [directo.apliarte.com/guia-directo.html](https://directo.apliarte.com/guia-directo.html) · 🚀 **Versión v1.0.0**

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](./docker-compose.yml)
[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-339933?logo=node.js&logoColor=white)](./package.json)
[![Tests](https://img.shields.io/badge/Tests-run_locally-success)](./test)
[![Interactive Demo](https://img.shields.io/badge/Demo-browser_practice_preview-orange)](./public/demo.html)
[![Landing Page](https://img.shields.io/badge/Landing_Page-ApliArte_Brand_Kit-005fa9)](./public/landing.html)
[![Web MCP](https://img.shields.io/badge/Web_MCP-Standard_Ready-8A2BE2)](./public/docs/index.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**ApliArte Directo** is a comprehensive live broadcasting platform engineered for content creators, streamers, and developers who broadcast to **Twitch** via **WebRTC / WHIP**, render an **interactive 3D overlay** in OBS, and operate broadcasts via an **accessible mobile web cockpit** in a local environment.

---

## ✨ Key Features

- 🎮 **Interactive 3D Overlay (Three.js)**: Visual diorama featuring animated avatars, audio-reactive lip synchronization, digital clock, and live status widgets.
- ⚡ **Direct WebRTC / WHIP Twitch Ingestion**: Real-time headless Chromium/Puppeteer capture of the VDO.ninja mixer with minimal RAM consumption (~300–500 MB).
- 📱 **Accessible Mobile Cockpit**: Touch-optimized control dashboard for smartphones. Switch cameras, toggle visual layers, trigger audio alerts, and fire sound effects.
- 🤖 **Web MCP Semantic Documentation**: Native HTML semantic documentation interface with Web MCP attributes (`tool-name`, `description`, `tool-param-description`) for local AI agents at `/docs`.
- 💬 **Bidirectional Twitch IRC Integration**: Live chat ingestion and interactive commands (`!cafe`, `!git`, `!agentes`, and mini-games like `!traidor`).
- 🎙️ **Digital Voice Audio Relay**: Direct low-latency PCM audio streaming from a mobile microphone straight to the OBS browser source via WebSockets without echo.
- 🔒 **Security by Design & Zero Docker Socket**: No insecure mounts of `/var/run/docker.sock`. Streamer control is handled exclusively via an internal HTTP API on an isolated bridge network.
- 🌐 **Automated SSL with Caddy**: Integrated reverse proxy with automated Let's Encrypt certificates enabled with a single profile flag (`--profile ssl`).

---

## 🖱️ Easiest start: double-click

1. Install **Node.js LTS** from [nodejs.org](https://nodejs.org) (once).
2. Download this project and double-click **`Iniciar directo.command`** (Mac) or **`Iniciar directo.bat`** (Windows).
3. The first time it installs what it needs and opens your browser to create the panel password (shown once: save it). Then it prints exactly what to paste in OBS.

It starts the overlay, the panel and the Twitch + YouTube restream centre together; closing the window stops everything. For simultaneous streaming you also need [ffmpeg](https://ffmpeg.org/download.html); without it the overlay and panel still work. From a terminal the same launcher runs with `npm run directo`.

## 🚀 Quick Start in 3 Steps

On any local machine or server with Docker and Docker Compose:

```bash
# 1. Clone the repository
git clone https://github.com/erbolamm/apliarte-directo.git
cd apliarte-directo

# 2. Set a unique local panel master password (all other streaming/chat keys
#    can be entered later through the private admin panel)
cp .env.example .env
nano .env   # Set PANEL_PASS; never commit this file

# 3. Start the container stack
docker compose up -d
```

The private cockpit opens at `http://localhost:7979/admin`. On first use, open its configuration panel to enter your own Twitch chat OAuth token, Twitch stream key and VDO mixer credentials. Those values persist under ignored `data/`; keep that directory backed up and never commit or publish it. The public demo is separate and does not connect to your private instance.

For detailed operational procedures, consult the [**Deployment Guide**](./DOCUMENTATION/DEPLOYMENT.md).

---

## 🤖 AI-Assisted Deployment (Kodee / Hostinger VPS AI / Claude)

You can deploy the complete sovereign broadcasting suite in minutes using an AI agent on your VPS (such as **Kodee** in Hostinger, Claude, or ChatGPT).

> 💡 **Recommended Infrastructure**: For 24/7 low-latency streaming and zero-friction automated deployment with Kodee AI, we recommend Hostinger VPS Hosting (KVM 2 or KVM 4).

Simply copy and paste the following prompt:

```text
Deploy and configure the sovereign apliarte-directo streaming suite on this VPS:

1. Clone the repository:
   git clone https://github.com/erbolamm/apliarte-directo.git && cd apliarte-directo

2. Setup environment configuration:
   cp .env.example .env
   - Generate a strong, random password for PANEL_PASS.
   - Request my Twitch Stream Key to set TWITCH_STREAM_KEY.
   - Configure a dedicated VDO_ROOM and VDO_PASS for audio/video ingress.

3. Start the Docker Compose stack:
   docker compose up -d

4. SOVEREIGN SECURITY ENFORCEMENT:
   - Ensure /admin and control endpoints are NOT exposed to the public internet.
   - Configure Tailscale or Tailscale Serve (.ts.net) for secure HTTPS mobile access.
   - Output the private access URL and confirm container health.
```

---

## 🔒 Private Sovereignty & Mobile Camera Access (Tailscale Serve)

To use your smartphone's front-facing camera and microphone on the road, modern mobile browsers (iOS Safari, Android Chrome) enforce `getUserMedia` security, requiring **HTTPS**.

- **Do NOT expose `/admin` to the public internet** with basic authentication or URL tokens.
- Use **Tailscale Serve** to get an automatic, private Let's Encrypt TLS certificate:
  ```bash
  tailscale serve https / http://127.0.0.1:7979
  ```
- Your mobile cockpit will be accessible securely at `https://<your-vps-node>.<your-tailnet>.ts.net/admin` exclusively from your authenticated Tailscale devices, with zero application passwords needed and zero public exposure.

---

## 📐 Service Topology

```
[ Twitch / Internet ] ◄──(WHIP WebRTC)── [ whip (Chromium) ]
                                                ▲
                                                │ (Internal HTTP :3000)
[ Mobile Cockpit / OBS ] ───(HTTP / WS)─────► [ overlay (Node 22) ]
                                                ▲
                                                │
[ Caddy SSL (Optional) ] ◄──(Let's Encrypt)─────┘
```

---

## 📚 Technical Documentation

The complete documentation suite is located in [`DOCUMENTATION/`](./DOCUMENTATION/) and served interactively via Web MCP at [`/docs`](./public/docs/index.html):

- **Interactive Portals & Showcases**:
  - [**Product Landing Page (`landing.html`)**](./public/landing.html) — Official product presentation complying with INBOX.md and ApliArte Brand Kit.
  - [**Web MCP Semantic Documentation Portal (`/docs`)**](./public/docs/index.html) — Interactive tool runner and machine-readable schema for AI agents.

- **System Specifications**:
  - [**Architecture (`ARCHITECTURE.md`)**](./DOCUMENTATION/ARCHITECTURE.md) — Container topology and internal APIs.
  - [**Deployment Guide (`DEPLOYMENT.md`)**](./DOCUMENTATION/DEPLOYMENT.md) — 5-minute Docker setup and operational commands.
  - [**Configuration Reference (`CONFIGURATION.md`)**](./DOCUMENTATION/CONFIGURATION.md) — Environment variables, persistence volumes, and OBS configuration.
  - [**Security Audit (`SECURITY.md`)**](./DOCUMENTATION/SECURITY.md) — Defensive boundaries, privilege containment, and threat model.
  - [**Architecture Decision Record (`ADR-0001`)**](./DOCUMENTATION/ADR-0001-docker-architecture-decoupling.md) — Foundation ADR on containerization and decoupling.

---

## 🧪 Automated Testing Suite

Run the automated unit and integration suite before every update:

```bash
npm test
```

---

## Autor
Javier Mateo (ApliArte) — github.com/erbolamm

## 💬 Una nota personal del autor / A personal note from the author
ℹ️ Nota: El texto siguiente es un mensaje personal del autor, escrito en varios idiomas para que pueda leerlo gente de todo el mundo. Esto no implica que el proyecto tenga soporte funcional completo en esos idiomas.

ℹ️ Note: The text below is a personal message from the author, written in several languages so people around the world can read it. This does not imply full multilingual feature support in those languages.

<details>
<summary>🇪🇸 Español</summary>
ApliArte Directo es una suite integral de emisión y overlays 3D interactivos con Three.js diseñada para que cualquier creador de contenido pueda emitir a Twitch y YouTube sin depender de herramientas de terceros ni servicios privativos. Todo corre en tu propio equipo con un doble clic, o en un servidor VPS en la nube.
</details>

<details>
<summary>🇬🇧 English</summary>
ApliArte Directo is a sovereign live broadcasting and interactive 3D overlay suite designed for streamers to broadcast to Twitch and YouTube without relying on third-party opaque software. Everything runs locally with a double click or on your own VPS server in the cloud.
</details>

<details>
<summary>🇧🇷 Português</summary>
ApliArte Directo é uma suíte soberana de transmissão ao vivo e overlays 3D interativos desenvolvida para streamers transmitirem na Twitch e no YouTube com total privacidade e independência.
</details>

<details>
<summary>🇫🇷 Français</summary>
ApliArte Directo est une suite souveraine de diffusion en direct et d'overlays 3D interactifs conçue pour permettre aux créateurs de diffuser sur Twitch et YouTube en toute indépendance.
</details>

<details>
<summary>🇩🇪 Deutsch</summary>
ApliArte Directo ist eine souveräne Live-Streaming-Suite mit interaktiven 3D-Overlays für Twitch und YouTube, die unabhängig und datenschutzfreundlich auf dem eigenen Rechner oder VPS läuft.
</details>

<details>
<summary>🇮🇹 Italiano</summary>
ApliArte Directo è una suite sovrana per live streaming con overlay 3D interattivi progettata per trasmettere su Twitch e YouTube in totale indipendenza.
</details>

## 💖 Apoya el proyecto
Herramienta gratuita y open source. Si te ahorra tiempo, tu apoyo ayuda a mantener el desarrollo y la infraestructura.

| Plataforma | Enlace |
|-----------|--------|
| GitHub Sponsors | [github.com/sponsors/erbolamm](https://github.com/sponsors/erbolamm) |
| PayPal | [paypal.me/erbolamm](https://paypal.me/erbolamm) |
| Ko-fi | [ko-fi.com/C0C11TWR1K](https://ko-fi.com/C0C11TWR1K) |
| Twitch Tip | [streamelements.com/apliarte/tip](https://streamelements.com/apliarte/tip) |

🌐 [Sitio Oficial y Landing](https://directo.apliarte.com) · 📖 [Guía de Comandos](https://directo.apliarte.com/guia-directo.html) · 📦 [GitHub](https://github.com/erbolamm/apliarte-directo)

## Licencia
MIT — © 2026 ApliArte

## About
ApliArte Directo — Suite soberana de emisión y overlays 3D interactivos para streaming con Docker, Three.js y panel de control web móvil.
