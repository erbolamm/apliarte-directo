import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('public landing offers honest local launch, install steps and community links', () => {
  const html = readFileSync(new URL('../public/landing.html', import.meta.url), 'utf8');
  assert.match(html, /http:\/\/localhost:7979\/admin/);
  assert.match(html, /id="install-commands"/);
  assert.match(html, /git clone https:\/\/github\.com\/erbolamm\/apliarte-directo\.git/);
  assert.match(html, /docker compose up -d/);
  assert.match(html, /git pull --ff-only/);
  assert.match(html, /no puede arrancar Docker ni detectar un clon local/);
  for (const link of ['/issues', '/fork', 'github.com/sponsors/erbolamm', 'paypal.me/erbolamm', 'ko-fi.com/', 'twitch.tv/apliarte', 'streamelements.com/apliarte/tip']) {
    assert.ok(html.includes(link), `missing ${link}`);
  }
  for (const service of ['x.com/intent', 'linkedin.com/sharing', 'whatsapp.com/send', 't.me/share', 'reddit.com/submit', 'facebook.com/sharer', 'mailto:']) {
    assert.ok(html.includes(service), `missing sharing service ${service}`);
  }
  assert.doesNotMatch(html, /Hostinger VPS Discount/);
});

test('VPS landing copy matches public landing', () => {
  const local = readFileSync(new URL('../public/landing.html', import.meta.url), 'utf8');
  const vps = readFileSync(new URL('../vps-overlay/public/landing.html', import.meta.url), 'utf8');
  assert.equal(vps, local);
});
