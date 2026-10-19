import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { readConfig } = require('./streaming-config.js');
const path = require('node:path');
const fs = require('node:fs');

const fieldByDestination = Object.freeze({ twitch: 'twitchStreamKey', youtube: 'youtubeStreamKey' });

const YOUTUBE_KEY_BY_CATEGORY = Object.freeze({
  apps: 'youtubeKeyApps',
  musica: 'youtubeKeyMusica',
  arte: 'youtubeKeyArte',
  drones: 'youtubeKeyDrones'
});

export function resolveDestinationKey(destination, dataDir, env = process.env, categoria = null) {
  if (destination?.nombre === 'youtube') {
    const config = readConfig(dataDir);
    let cat = categoria;
    if (!cat) {
      try {
        const catFile = path.join(dataDir, 'categoria.json');
        if (fs.existsSync(catFile)) {
          const d = JSON.parse(fs.readFileSync(catFile, 'utf8'));
          cat = d?.categoria;
        }
      } catch (_) {}
    }
    cat = (typeof cat === 'string' && cat.trim()) ? cat.trim() : (config.categoria || 'apps');
    const catField = YOUTUBE_KEY_BY_CATEGORY[cat];
    if (catField) {
      const catVal = config.streaming?.[catField];
      if (typeof catVal === 'string' && catVal.trim()) return catVal.trim();
      const envCatKey = `YOUTUBE_KEY_${cat.toUpperCase()}`;
      if (typeof env[envCatKey] === 'string' && env[envCatKey].trim()) return env[envCatKey].trim();
    }
    const val = config.streaming?.youtubeStreamKey;
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (typeof env.YOUTUBE_STREAM_KEY === 'string' && env.YOUTUBE_STREAM_KEY.trim()) return env.YOUTUBE_STREAM_KEY.trim();
    return destination?.variableClave ? env[destination.variableClave] || null : null;
  }
  const field = fieldByDestination[destination?.nombre];
  if (field) {
    const value = readConfig(dataDir).streaming?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return destination?.variableClave ? env[destination.variableClave] || null : null;
}
