FROM node:20-slim

# Chromium + fuentes mínimas (sin Xvfb, sin ffmpeg, sin PulseAudio)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto \
    fonts-noto-color-emoji \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer usará el chromium del sistema, no descargará el suyo
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY start-whip.js ./
COPY runtime-config.js ./

CMD ["node", "start-whip.js"]
