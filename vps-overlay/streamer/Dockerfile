FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    chromium \
    ffmpeg \
    pulseaudio \
    dbus \
    fonts-noto \
    fonts-noto-color-emoji \
    procps \
    libegl1-mesa \
    libgles2-mesa \
    libegl-dev \
    libasound2-plugins \
    && rm -rf /var/lib/apt/lists/*

# ALSA → PulseAudio bridge (Chromium usa ALSA, lo redirigimos a PulseAudio)
RUN printf 'pcm.!default {\n    type pulse\n}\nctl.!default {\n    type pulse\n}\n' > /etc/asound.conf

COPY start-stream.sh /start-stream.sh
RUN chmod +x /start-stream.sh

CMD ["/start-stream.sh"]
