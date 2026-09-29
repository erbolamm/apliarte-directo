'use strict';
const fs = require('fs');
const path = require('path');

function readConfig(dataDir, strict = false) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (strict) throw new Error('Invalid existing configuration');
  } catch (error) {
    if (strict && error.code !== 'ENOENT') throw error;
  }
  return {};
}

function safeState(config) {
  const streaming = config.streaming || {};
  return {
    vdoRoom: typeof streaming.vdoRoom === 'string' ? streaming.vdoRoom : '',
    hasTwitchStreamKey: Boolean(streaming.twitchStreamKey),
    hasYoutubeStreamKey: Boolean(streaming.youtubeStreamKey),
    hasVdoPassword: Boolean(streaming.vdoPassword)
  };
}

function saveStreamingConfig(dataDir, updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) throw new Error('Invalid configuration');
  const allowed = { vdoRoom: 128, twitchStreamKey: 512, youtubeStreamKey: 512, vdoPassword: 512 };
  const config = readConfig(dataDir, true);
  const streaming = { ...(config.streaming || {}) };
  for (const [key, maxLength] of Object.entries(allowed)) {
    if (!(key in updates)) continue;
    if (typeof updates[key] !== 'string') throw new Error('Invalid configuration');
    const value = updates[key].trim();
    if (value.length > maxLength || /[\u0000-\u001f]/.test(value)) throw new Error('Invalid configuration');
    if (value) streaming[key] = value;
  }
  config.streaming = streaming;
  fs.mkdirSync(dataDir, { recursive: true });
  const target = path.join(dataDir, 'config.json');
  const temp = path.join(dataDir, `config.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temp, JSON.stringify(config, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, target);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch (_) {}
    throw error;
  }
  return safeState(config);
}

function handleStreamingConfig(req, res, dataDir, isAuth) {
  if (!isAuth(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    return;
  }
  const origin = req.headers.origin;
  if (origin) {
    let matches = false;
    try { matches = new URL(origin).host === req.headers.host; } catch (_) {}
    if (!matches) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Origin rejected' }));
      return;
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.removeHeader('Access-Control-Allow-Origin');
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, streaming: safeState(readConfig(dataDir)) }));
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'GET, POST' });
    res.end();
    return;
  }
  let body = '';
  let tooLarge = false;
  req.on('data', chunk => {
    if (tooLarge) return;
    body += chunk;
    if (body.length > 16384) { body = ''; tooLarge = true; }
  });
  req.on('end', () => {
    if (tooLarge) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
    }
    try {
      const state = saveStreamingConfig(dataDir, JSON.parse(body || '{}'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, streaming: state }));
    } catch (_) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid configuration' }));
    }
  });
}

module.exports = { readConfig, safeState, saveStreamingConfig, handleStreamingConfig };
