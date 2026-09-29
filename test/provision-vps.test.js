'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const script = path.join(root, 'deploy/provision.sh');

test('provisioner has valid Bash syntax', () => {
  const result = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('provisioner fails closed and requires root', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /set -euo pipefail/);
  assert.match(source, /EUID.*-ne 0/);
  assert.match(source, /sudo/);
  assert.match(source, /exit 1/);
});

test('provisioner does not print generated secrets or environment files', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /echo[^\n]*\$\{?password/i);
  assert.doesNotMatch(source, /cat[^\n]*install\.env/i);
  assert.match(source, /> "\$CONFIG_FILE"/);
  assert.match(source, /umask 077/);
  assert.match(source, /--env-file/);
});

test('existing VPS compose binds overlay to loopback, even with a domain', () => {
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /127\.0\.0\.1:\$\{OVERLAY_PORT:-7979\}:7979/);
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /-f docker-compose\.yml/);
  assert.match(source, /--profile ssl/);
  assert.match(fs.readFileSync(path.join(root, 'deploy/compose.vps.yml'), 'utf8'), /user: "1000:1000"/);
  assert.match(source, /--ref/);
  assert.match(source, /\[0-9a-fA-F\]\{40\}/);
});

test('claim link is read from overlay logs with bounded wait', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /primer-arranque.*Enlace de reclamación:/);
  assert.match(source, /deadline=.*60/);
  assert.match(source, /claim.*t=/);
});

test('the installer leaves PANEL_PASS empty so the first run prints the claim link', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /openssl rand/);
  assert.match(source, /printf 'PANEL_PASS=\\n/);
});
