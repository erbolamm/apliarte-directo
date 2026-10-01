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
  assert.match(script, /getElementById\('btn-obs-snapshot'\)/);
});
test('one drawing button opens the drawing panel and a stroke closes it', () => {
  assert.match(script, /drawPanel\.hidden = !open/);
  assert.match(script, /pointerOwner\.begin\(e, allowTouch\.checked\)\) return;\n\s*closeDrawPanel\(\);/);
  assert.doesNotMatch(html, /<details|<summary|<footer/);
});
test('quick controls delegate to the original Admin handlers', () => {
  for (const id of ['btn-micro-toggle', 'btn-apagar-camara', 'btn-toggle-camara-modo', 'btn-tts-main-toggle']) assert.ok(script.includes(id));
  assert.match(script, /original\.click\(\)/);
});
test('closing Settings or the camera preview never dispatches capture or audio controls', () => {
  for (const id of ['btn-settings-close', 'btn-camera-preview-close']) {
    const start = script.indexOf(`getElementById('${id}').addEventListener('click'`);
    assert.ok(start > 0, `${id} handler exists`);
    const body = script.slice(start, script.indexOf('});', start));
    assert.doesNotMatch(body, /original\.click|obsAction|sendWs|\.src\s*=/);
  }
  assert.match(script, /function closeSettings\(\) \{[\s\S]*?syncAdminDock\(\);/);
});
test('pointer sizing guards against palm-induced layout changes during drawing', () => {
  assert.match(script, /if \(isDrawing && event\.pointerType !== 'pen'\) return/);
  assert.match(html, /html\[data-precision="pen"\]/);
});
