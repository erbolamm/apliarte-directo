# 🚀 VPS Deployment Guide (Docker in 5 Minutes)

This guide covers deploying **ApliArte Directo** on any Linux VPS (Ubuntu, Debian, AlmaLinux, Arch, etc.) using Docker and Docker Compose.

---

## 📋 Prerequisites

1. **A Linux VPS** with:
   - Minimum 1 vCPU (2 vCPUs recommended).
   - Minimum 1 GB RAM (2 GB recommended).
   - 64-bit Linux distribution.
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
