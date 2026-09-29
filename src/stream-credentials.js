import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { readConfig } = require('./streaming-config.js');
const fieldByDestination = Object.freeze({ twitch: 'twitchStreamKey', youtube: 'youtubeStreamKey' });

export function resolveDestinationKey(destination, dataDir, env = process.env) {
  const field = fieldByDestination[destination?.nombre];
  if (field) {
    const value = readConfig(dataDir).streaming?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return destination?.variableClave ? env[destination.variableClave] || null : null;
}
