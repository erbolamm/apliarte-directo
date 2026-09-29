import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const demoHtmlPath = path.join(__dirname, '..', 'public', 'demo.html');
const serverJsPath = path.join(__dirname, '..', 'server.js');

test('Public Demo: public/demo.html exists, is readable and complete', () => {
  assert.equal(fs.existsSync(demoHtmlPath), true, 'public/demo.html must exist');
  const stat = fs.statSync(demoHtmlPath);
  assert.ok(stat.size > 2000, 'Demo simulator should be complete and non-empty');
});

test('Public Demo: operates 100% in client-side simulation without backend calls', () => {
  const html = fs.readFileSync(demoHtmlPath, 'utf8');
  const practice = fs.readFileSync(path.join(__dirname, '..', 'public', 'demo-practice.js'), 'utf8');
  const vpsHtml = fs.readFileSync(path.join(__dirname, '..', 'vps-overlay', 'public', 'demo.html'), 'utf8');
  assert.equal(vpsHtml, html, 'public and VPS demo pages must be identical');
  for (const [name, source] of [['demo.html', html], ['demo-practice.js', practice]]) {
    assert.doesNotMatch(source, /fetch\s*\(/i, `${name} must not fetch at all, including non-GET methods`);
    assert.doesNotMatch(source, /new\s+WebSocket\s*\(/i, `${name} must not open WebSockets`);
    assert.doesNotMatch(source, /\/api\//i, `${name} must not reference API write endpoints`);
  }
  assert.match(html, /connect-src\s+'none'/i, 'embedded overlay must be blocked from connecting too');
  assert.match(html, /id="office-3d"/);
  assert.match(html, /office-3d\.js/);
  assert.match(html, /office-3d\.css/);
  assert.doesNotMatch(html, /<canvas[^>]*id="stageCanvas"/i);
  assert.match(html, /erbolamm:set-view/);
  assert.match(html, /https:\/\/hostinger\.es\?REFERRALCODE=APLIARTE" target="_blank" rel="noopener sponsored"/);
});

test('Public Demo: includes Assisted Deployment with Kodee (Hostinger) and Docker Compose', () => {
  const html = fs.readFileSync(demoHtmlPath, 'utf8');
  assert.match(html, /Kodee/i, 'Must mention Kodee for Hostinger VPS deployment');
  assert.match(html, /docker compose up -d/i, 'Must include Docker Compose instructions');
  assert.match(html, /Tailscale/i, 'Must mention Tailscale for private mobile security');
  assert.match(html, /copyPrompt/i, 'Must provide one-click copy for the AI deployment prompt');
});

test('Server Routing: server.js routes /demo and /demo.html to public/demo.html', () => {
  const serverCode = fs.readFileSync(serverJsPath, 'utf8');
  assert.match(serverCode, /path === '\/demo' \|\| path === '\/demo\.html'/i, 'server.js must route /demo');
});
