# 🚀 VPS Deployment Guide (Docker in 5 Minutes)

This guide covers deploying **ApliArte Directo** on any Linux VPS (Ubuntu, Debian, AlmaLinux, Arch, etc.) using Docker and Docker Compose.

---

## 📋 Prerequisites

1. **A Linux VPS** with:
   - Minimum 1 vCPU (2 vCPUs recommended).
   - Minimum 1 GB RAM (2 GB recommended).
   - 64-bit Linux distribution (Ubuntu/Debian recommended).
   - > 💡 **Recommended Provider**: Get a high-performance, affordable VPS at [Hostinger KVM VPS](https://hostinger.es?REFERRALCODE=APLIARTE). Using this link directly supports ApliArte open-source development at no additional cost.
2. **Docker & Docker Compose**:
   If not yet installed, install them using the official script:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. **Twitch Stream Key**:
   Retrieved from the Twitch Creator Dashboard (`Settings > Stream > Primary Stream Key`).

---

## 🛠️ Step 1: Clone the Repository

On your VPS, clone the repository and navigate into the project directory:

```bash
git clone https://github.com/erbolamm/apliarte-directo.git
cd apliarte-directo
```

---

## ⚙️ Step 2: Configure Environment Variables

Copy the template environment configuration:

```bash
cp .env.example .env
```

Edit `.env` with your preferred editor (`nano .env`):

```env
# 1. Set a strong password for your web panel and APIs
PANEL_PASS=YourSuperSecretPassword2026!

# 2. Enter your Twitch Stream Key
TWITCH_STREAM_KEY=live_12345678_xxxxxxxxxxxxxxxxxxxx

# 3. Enter your VDO.ninja room name (and password if configured)
VDO_ROOM=my_stream_room
VDO_PASS=my_room_password

# 4. Host port for the overlay server (default: 7979)
OVERLAY_PORT=7979
```

Save and exit (`Ctrl + O`, `Enter`, `Ctrl + X` in nano).

---

## 🚢 Step 3: Start the Docker Stack

### Mode A: Standard Deployment (Direct IP / Tailscale / Existing Reverse Proxy)

```bash
docker compose up -d --build
```

The stack will start the `overlay` and `whip` services.
You can immediately access:
- **Control Dashboard**: `http://YOUR_VPS_IP:7979/` or `http://YOUR_VPS_IP:7979/panel-twitch-comandos.html`
- **OBS Browser Source**: `http://YOUR_VPS_IP:7979/` (add as Browser Source in OBS Studio at 1920x1080 resolution).

### Mode B: Automated SSL Deployment (Caddy Profile)

If you have a domain pointing to your VPS IP and want automatic Let's Encrypt HTTPS:

1. Uncomment `DOMAIN` in your `.env` file:
   ```env
   DOMAIN=directo.yourdomain.com
   ```
2. Ensure ports `80` and `443` are open in your server firewall.
3. Start the stack enabling the `ssl` profile:
   ```bash
   docker compose --profile ssl up -d --build
   ```

Caddy will automatically acquire SSL certificates and handle HTTPS redirection.

---

## 🔍 Checking Service Health and Logs

Check running containers:
```bash
docker compose ps
```

View real-time aggregated logs:
```bash
docker compose logs -f
```

View only the WHIP streamer logs:
```bash
docker compose logs -f whip
```

---

## 🛑 Stopping or Updating the Services

To stop the containers:
```bash
docker compose down
```

To update to the latest release:
```bash
git pull
docker compose up -d --build
```
Your configuration files in `./data` and uploaded media in `./medios` will persist across container rebuilds.

---

## 🛡️ Local and VPS Parity Guarantee (Auditoría de Paridad)

One of the core architectural principles of **ApliArte Directo** is absolute parity between what you run and test on your local studio machine and what gets deployed to your remote VPS.

### Why this matters
When customizing or maintaining live broadcasting suites, remote VPS instances often silently diverge from local codebases (e.g. outdated overlay templates, desynchronized WebSocket authentication, or stale sound assets).

### Automated Parity Enforcement
Every user and contributor who clones this repository benefits from built-in automated parity tests (`test/vps-*.test.js`):
1. **Source Code Parity**: Validates byte-by-byte equality between local modules (`src/ws-auth.js`, `src/streaming-config.js`, `src/centro-status.js`) and the VPS package (`vps-overlay/src/`).
2. **Overlay & View Parity**: Validates exact equality between `public/` and `vps-overlay/public/` for all public overlays (`avatares.html`, `sms-pantalla.html`, `contexto.html`, `demo.html`, `docs/index.html`).
3. **Route Coverage**: Ensures the VPS server preserves all public endpoints (`/landing`, `/demo`, `/docs`).

You can run this verification locally at any time:
```bash
npm test
# Or specifically for VPS parity tests:
node --test test/vps-*.test.js
```
If you edit a local overlay and forget to update its VPS counterpart, the test suite will fail immediately with a clear diff, preventing broken or desynchronized code from ever reaching production.

> 🚀 **Ready to deploy your 24/7 cloud broadcast center?**  
> Deploy on a fast KVM VPS using our partner link: **[Hostinger VPS (KVM)](https://hostinger.es?REFERRALCODE=APLIARTE)**.

