'use strict';
// First-run panel password without shared defaults (pattern from AgentSystemLabs/agent-office, MIT).
// With PANEL_PASS set nothing changes. Otherwise the server prints a one-time claim link;
// the first visit turns it into a strong password stored in DATA_DIR/panel-auth.json (0600).
const { createHash, randomBytes, timingSafeEqual } = require('crypto');
const fs = require('fs');
const path = require('path');

const CLAIM_LOG_PREFIX = '[primer-arranque] Enlace de reclamación: ';
const AUTH_FILE = 'panel-auth.json';

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function authPath(dataDir) {
  return path.join(dataDir, AUTH_FILE);
}

function readAuth(dataDir) {
  try {
    const data = JSON.parse(fs.readFileSync(authPath(dataDir), 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

function writeAuth(dataDir, data) {
  fs.mkdirSync(dataDir, { recursive: true });
  const target = authPath(dataDir);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, target);
  fs.chmodSync(target, 0o600);
}

/**
 * Returns the panel password to use. On a first run without one, creates a fresh
 * one-time claim token (only its hash is stored) and logs the claim link.
 */
function resolvePanelPassword({ env = process.env, dataDir, log = console.log } = {}) {
  if (env.PANEL_PASS) return { password: env.PANEL_PASS };
  const auth = readAuth(dataDir);
  if (typeof auth.password === 'string' && auth.password) return { password: auth.password };
  const token = randomBytes(32).toString('base64url');
  try {
    writeAuth(dataDir, { claimTokenHash: sha256(token), createdAt: new Date().toISOString() });
  } catch (error) {
    // Never crash the server: explain how to fix it instead of printing a link that cannot work.
    log(`[primer-arranque] No se puede guardar la contraseña del panel en ${dataDir} (${error.code || error.message}). `
      + 'Da permiso de escritura a esa carpeta o define PANEL_PASS, y reinicia.');
    return { password: '' };
  }
  log(`${CLAIM_LOG_PREFIX}/claim?t=${token}`);
  return { password: '' };
}

/** Consumes a valid claim token and returns the new password, or null. */
function claimPanel(dataDir, token) {
  const auth = readAuth(dataDir);
  if (typeof auth.password === 'string' && auth.password) return null;
  if (typeof auth.claimTokenHash !== 'string' || typeof token !== 'string' || !token) return null;
  const expected = Buffer.from(auth.claimTokenHash, 'hex');
  const given = Buffer.from(sha256(token), 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const password = randomBytes(24).toString('base64url');
  try {
    writeAuth(dataDir, { password, claimedAt: new Date().toISOString() });
  } catch (_) {
    return null; // cannot persist it: refuse rather than hand out a password lost on restart
  }
  return password;
}

module.exports = { CLAIM_LOG_PREFIX, resolvePanelPassword, claimPanel };
