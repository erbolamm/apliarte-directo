#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

readonly APP_DIR=/opt/apliarte-directo
readonly CONFIG_DIR=/etc/apliarte-directo
readonly CONFIG_FILE="$CONFIG_DIR/install.env"
readonly REPO_URL=https://github.com/erbolamm/apliarte-directo.git
readonly PORT=7979
DOMAIN=""
REF=""

usage() {
  printf 'Usage: sudo bash provision.sh --ref RELEASE_COMMIT_SHA [--domain example.com]\n' >&2
}

while (($#)); do
  case "$1" in
    --domain)
      if (($# < 2)); then usage; exit 1; fi
      DOMAIN="$2"
      shift 2
      ;;
    --ref)
      if (($# < 2)); then usage; exit 1; fi
      REF="$2"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 1 ;;
  esac
done
if [[ ! "$REF" =~ ^[0-9a-fA-F]{40}$ ]]; then
  usage
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  printf 'Run as root with sudo (for a pipe: curl -fsSL URL | sudo bash).\n' >&2
  exit 1
fi
if [[ ! -f /etc/os-release ]]; then
  printf 'Ubuntu or Debian is required.\n' >&2
  exit 1
fi
# shellcheck disable=SC1091
source /etc/os-release
if [[ "$ID" != ubuntu && "$ID" != debian ]]; then
  printf 'Ubuntu or Debian is required.\n' >&2
  exit 1
fi
if [[ -n "$DOMAIN" && ! "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
  printf 'Invalid domain.\n' >&2
  exit 1
fi

apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  # The official Docker convenience installer provisions Engine and Compose plugin.
  curl -fsSL https://get.docker.com -o /tmp/apliarte-directo-get-docker.sh
  sh /tmp/apliarte-directo-get-docker.sh
  rm -f /tmp/apliarte-directo-get-docker.sh
fi
systemctl enable --now docker

if [[ ! -d "$APP_DIR/.git" ]]; then
  if [[ -e "$APP_DIR" ]]; then
    printf 'Installation directory exists but is not a Git checkout; stop.\n' >&2
    exit 1
  fi
  git clone "$REPO_URL" "$APP_DIR"
else
  if [[ -n "$(git -C "$APP_DIR" status --porcelain)" ]]; then
    printf 'Checkout has local changes; update it manually before retrying.\n' >&2
    exit 1
  fi
fi
git -C "$APP_DIR" fetch origin
git -C "$APP_DIR" cat-file -e "$REF^{commit}"
git -C "$APP_DIR" checkout --detach "$REF"

# Node in the overlay container runs as uid/gid 1000 via the VPS override.
install -d -m 0750 -o 1000 -g 1000 "$APP_DIR/data" "$APP_DIR/medios"
install -d -m 0700 -o root -g root "$CONFIG_DIR"
if [[ ! -e "$CONFIG_FILE" ]]; then
  # PANEL_PASS stays empty on purpose: the first start prints a one-time claim link
  # and the streamer gets the panel password from it. Stream keys are pasted in the panel.
  printf 'PANEL_PASS=\nTWITCH_STREAM_KEY=\nVDO_ROOM=\nVDO_PASS=\n' > "$CONFIG_FILE"
  chmod 0600 "$CONFIG_FILE"
fi

cd "$APP_DIR"
compose=(docker compose --env-file "$CONFIG_FILE" -f docker-compose.yml -f deploy/compose.vps.yml)
if [[ -n "$DOMAIN" ]]; then
  export DOMAIN
  compose+=(--profile ssl)
fi
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
"${compose[@]}" up -d --build

# The claim path is a bearer credential. Do not dump logs or persist it.
deadline=$((SECONDS + 60))
claim_path=""
while ((SECONDS < deadline)); do
  claim_path="$("${compose[@]}" logs --no-color --since "$started_at" overlay 2>/dev/null | grep -oE '\[primer-arranque\] Enlace de reclamación: /claim\?t=[A-Za-z0-9_-]+' | tail -n 1 | sed 's/^.*: //' || true)"
  if [[ -n "$claim_path" ]]; then break; fi
  sleep 2
done

if [[ -n "$DOMAIN" ]]; then
  base_url="https://$DOMAIN"
else
  base_url="http://127.0.0.1:$PORT"
  printf 'From your computer, open an SSH tunnel: ssh -L %s:127.0.0.1:%s USER@VPS_IP\n' "$PORT" "$PORT"
fi
if [[ -n "$claim_path" ]]; then
  printf 'Open this private one-time link; do not share it:\n'
  claim_url="${base_url}${claim_path}"
  printf '%s\n' "$claim_url"
else
  printf 'No first-run claim link appeared within 60 seconds. Inspect logs on the VPS:\n'
  printf 'cd %s && sudo docker compose --env-file %s -f docker-compose.yml -f deploy/compose.vps.yml logs overlay\n' "$APP_DIR" "$CONFIG_FILE"
fi
