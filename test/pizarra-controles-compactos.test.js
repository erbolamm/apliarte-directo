import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

test('the whole inline script parses and the existing Admin iframe remains unique', () => {
  new Script(script);
  assert.equal((html.match(/id="admin-frame"/g) || []).length, 1);
});

function schedule(value, active = true, hidden = false) {
  const source = script.slice(script.indexOf('function scheduleCapture()'), script.indexOf('async function solicitarCapturaObs()'));
  const calls = [];
  const context = {
    obsPreviewInterval: 10, obsPreviewActive: active,
    document: { hidden }, intervalSelect: { value: String(value) },
    clearTimeout() {}, solicitarCapturaObs() {},
    setTimeout(fn, delay) { calls.push(delay); return 20; },
  };
  runInNewContext(source + ';scheduleCapture()', context);
  return calls;
}

test('the default mode is a fixed image, with no capture timer', () => {
  assert.match(html, /<option value="0" selected>/);
  assert.deepEqual(schedule(0), []);
});
test('periodic capture is explicit and obeys the chosen interval', () => {
  assert.deepEqual(schedule(5000), [5000]);
  assert.deepEqual(schedule(10000), [10000]);
});
test('hidden document and hidden preview never schedule captures', () => {
  assert.deepEqual(schedule(5000, false), []);
  assert.deepEqual(schedule(5000, true, true), []);
});
test('clearing drawings does not remove the independent snapshot image', () => {
  const clear = script.slice(script.indexOf("document.getElementById('btn-clear')"), script.indexOf('function reportObs('));
  assert.doesNotMatch(clear, /obsPreviewBg/);
});
test('the capture shortcut switches back to manual mode', () => {
  assert.match(script, /intervalSelect\.value = '0'/);
  assert.match(script, /iconButton\('btn-obs-snapshot'/);
});
test('compact menus reuse the original tools, palette and width controls', () => {
  assert.match(script, /popup\.appendChild\(document\.getElementById\(group\)\)/);
  assert.match(script, /\['palette-group', 'size-group'\]/);
  assert.match(script, /\['tools-group'\]/);
  assert.match(html, /\.compact-popup \.tool-label \{display:none!important;\}/);
});
test('quick controls delegate to the original Admin handlers', () => {
  for (const id of ['btn-micro-toggle', 'btn-apagar-camara', 'btn-toggle-camara-modo']) assert.ok(script.includes(id));
  assert.match(script, /original\.click\(\)/);
  assert.match(script, /'tab-chat'/);
  assert.match(script, /'tab-comandos'/);
});
test('closing the panel does not dispatch capture or audio controls', () => {
  const close = script.slice(script.indexOf("adminDock.prepend(iconButton('btn-admin-dock-close'"), script.indexOf("document.getElementById('btn-admin-dock-close').classList"));
  assert.doesNotMatch(close, /original\.click|obsAction|sendWs|\.src\s*=/);
});
test('pointer sizing guards against palm-induced layout changes during drawing', () => {
  assert.match(script, /if \(isDrawing && event\.pointerType !== 'pen'\) return/);
  assert.match(html, /html\[data-precision="pen"\]/);
});
