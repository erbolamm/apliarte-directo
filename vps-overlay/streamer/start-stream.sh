#!/bin/bash
echo "=== TTS ApliArte Streamer ==="

# ── Pantalla virtual 1920x1080 ──
rm -f /tmp/.X99-lock
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
export DISPLAY=:99
sleep 1
echo "[OK] Xvfb :99 activo"

# ── dbus (necesario para PulseAudio en contenedor) ──
mkdir -p /run/dbus
dbus-daemon --system --fork 2>/dev/null || true
sleep 1
echo "[OK] dbus iniciado"

# ── PulseAudio (audio del navegador) ──
# Matar instancias zombie de runs anteriores
pulseaudio --kill 2>/dev/null || true
sleep 1

# Iniciar PulseAudio con reintentos
pulseaudio -D --exit-idle-time=-1 --disallow-exit 2>&1 || true

PULSE_READY=false
for i in $(seq 1 15); do
  if pactl info >/dev/null 2>&1; then
    PULSE_READY=true
    break
  fi
  echo "[...] Esperando PulseAudio (intento $i/15)..."
  sleep 1
done

if ! $PULSE_READY; then
  # Segundo intento: reiniciar completamente
  echo "[RETRY] Reintentando PulseAudio..."
  pulseaudio --kill 2>/dev/null || true
  sleep 2
  pulseaudio -D --exit-idle-time=-1 --disallow-exit 2>&1 || true
  for i in $(seq 1 10); do
    if pactl info >/dev/null 2>&1; then
      PULSE_READY=true
      break
    fi
    sleep 1
  done
fi

if $PULSE_READY; then
  pactl load-module module-null-sink sink_name=DummyOutput \
    sink_properties=device.description="Dummy_Output" 2>/dev/null || true
  pactl set-default-sink DummyOutput 2>/dev/null || true
  pactl set-default-source DummyOutput.monitor 2>/dev/null || true
  sleep 1
  echo "[OK] PulseAudio activo con DummyOutput"
else
  echo "[WARN] PulseAudio NO arrancó — se usará audio silencioso"
fi

# ── Chromium en modo kiosk ──
# Limpiar lock files de sesion anterior (evita crash por perfil bloqueado)
rm -f /root/.config/chromium/SingletonLock /root/.config/chromium/SingletonCookie /root/.config/chromium/SingletonSocket
chromium \
  --no-sandbox \
  --user-data-dir=/root/.config/chromium \
  --unsafely-treat-insecure-origin-as-secure=http://overlay:7979 \
  --ignore-gpu-blocklist \
  --use-gl=angle \
  --use-angle=swiftshader-webgl \
  --enable-unsafe-swiftshader \
  --disable-dev-shm-usage \
  --no-first-run \
  --no-default-browser-check \
  --disable-extensions \
  --disable-translate \
  --lang=es \
  --disable-background-networking \
  --disable-features=WebRtcHWDecoding,TranslateUI \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  --window-size=1920,1080 \
  --window-position=0,0 \
  --hide-scrollbars \
  "http://overlay:7979/" &

echo "[...] Esperando a que Chromium cargue la pagina..."
sleep 10
echo "[OK] Chromium listo"

# ── FFmpeg: captura pantalla + audio → RTMP Twitch ──
echo "[>>>] Iniciando stream a Twitch..."
if $PULSE_READY; then
  exec ffmpeg \
    -thread_queue_size 1024 \
    -video_size 1920x1080 \
    -framerate 30 \
    -f x11grab -i :99 \
    -thread_queue_size 1024 \
    -f pulse -ac 2 -i default \
    -c:v libx264 -preset ultrafast -tune zerolatency \
    -b:v 3000k -maxrate 3500k -bufsize 6000k \
    -pix_fmt yuv420p \
    -g 60 \
    -c:a aac -b:a 128k -ar 44100 \
    -f flv "rtmp://live.twitch.tv/app/${TWITCH_STREAM_KEY}"
else
  exec ffmpeg \
    -thread_queue_size 1024 \
    -video_size 1920x1080 \
    -framerate 30 \
    -f x11grab -i :99 \
    -f lavfi -i anullsrc=r=44100:cl=stereo \
    -c:v libx264 -preset ultrafast -tune zerolatency \
    -b:v 3000k -maxrate 3500k -bufsize 6000k \
    -pix_fmt yuv420p \
    -g 60 \
    -c:a aac -b:a 128k -ar 44100 \
    -f flv "rtmp://live.twitch.tv/app/${TWITCH_STREAM_KEY}"
fi
