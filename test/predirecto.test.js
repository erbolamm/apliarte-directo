import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/predirecto.html', import.meta.url), 'utf8');
const replica = readFileSync(new URL('../vps-overlay/public/predirecto.html', import.meta.url), 'utf8');

test('both standalone pre-stream pages are identical', () => assert.equal(replica, source));

test('checklist contains all required checks and accessible theme control', () => {
  for (const phrase of ['Teaser', 'X, Telegram y Discord', 'Twitch, YouTube y Kick', 'RTMP', 'Micrófono']) {
    assert.ok(source.includes(phrase), phrase);
  }
  assert.match(source, /data-tip="[^"]+"/);
  assert.match(source, /aria-label="Cambiar tema"/);
  assert.doesNotMatch(source, /\btitle=/);
});

test('countdown and checklist persist, survive unavailable storage, and alert below 2 minutes', () => {
  const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const elements = new Map();
  const checkboxes = Array.from({ length: 5 }, (_, i) => ({ checked: false, addEventListener(event, callback) { this[event] = callback; }, dataset: { index: String(i) } }));
  const document = {
    documentElement: { dataset: {} },
    getElementById(id) { if (!elements.has(id)) elements.set(id, { textContent: '', dataset: {}, addEventListener(event, callback) { this[event] = callback; } }); return elements.get(id); },
    querySelectorAll() { return checkboxes; },
  };
  let now = 1_000_000;
  const values = new Map();
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const context = { document, localStorage, Date: { now: () => now }, setInterval() {} };
  vm.runInNewContext(script, context);
  assert.equal(elements.get('countdown').textContent, '10:00');
  checkboxes[0].checked = true;
  checkboxes[0].change();
  assert.equal(JSON.parse(values.get('directo_predirecto_v1')).checks[0], true);
  now += 481_000;
  context.render();
  assert.equal(elements.get('countdown').textContent, '01:59');
  assert.equal(document.documentElement.dataset.urgent, 'true');
  context.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  checkboxes[1].checked = true;
  assert.doesNotThrow(() => checkboxes[1].change());
  assert.doesNotThrow(() => elements.get('reset').click());
  assert.equal(elements.get('countdown').textContent, '10:00');
});
