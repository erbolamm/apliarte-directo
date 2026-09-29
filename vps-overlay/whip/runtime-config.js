'use strict';
const fs = require('fs');
const path = require('path');

// Read on each start, so a panel save can take effect without restarting Docker.
function loadWhipConfig(env = process.env, dataDir = env.DATA_DIR || '/app/data') {
  let saved = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
    if (parsed && typeof parsed.streaming === 'object' && !Array.isArray(parsed.streaming)) saved = parsed.streaming;
  } catch (_) { /* An unconfigured clone remains idle until credentials are saved. */ }

  const streamKey = String(saved.twitchStreamKey || env.TWITCH_STREAM_KEY || '').trim();
  const room = String(saved.vdoRoom || env.VDO_ROOM || '').trim();
  const password = String(saved.vdoPassword || env.VDO_PASS || '').trim();
  if (!streamKey || !room || !password) return null;
  return { streamKey, room, password };
}

module.exports = { loadWhipConfig };
