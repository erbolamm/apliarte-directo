// New drawing shapes (Javier, 2026-10-01): text, double arrow, filled rectangle
// and ellipse, dashed lines. One shared renderer paints them identically on the
// tablet, the OBS layer (/cristal) and the other drawing views, and the private
// proxy lets only these validated fields through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const rendererSource = readFileSync(new URL('../public/js/pizarra-render.js', import.meta.url), 'utf8');

function renderer() {
  const context = {};
  runInNewContext(rendererSource, context);
  assert.equal(typeof context.drawPizarraShape, 'function', 'renderer exposes drawPizarraShape');
  return context.drawPizarraShape;
}

function fakeCtx() {
  const calls = [];
  const ctx = new Proxy({ calls }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { calls.push([key, ...args]); };
    },
    set(target, key, value) { target[key] = value; calls.push(['set', key, value]); return true; },
  });
  return ctx;
}
const box = { width: 1920, height: 1080, scale: 1 };
const base = { type: 'pizarra_draw', strokeId: 's1', from: { x: 0.1, y: 0.1 }, to: { x: 0.5, y: 0.5 }, color: '#005fa9', size: 6, tool: 'pen' };
const names = ctx => ctx.calls.map(call => call[0]);

test('text is painted with fillText, bounded and in the stroke colour', () => {
  const draw = renderer();
  const ctx = fakeCtx();
  draw(ctx, { ...base, shape: 'text', text: 'Hola chat' }, box);
  const fill = ctx.calls.find(call => call[0] === 'fillText');
  assert.ok(fill, 'fillText is used');
  assert.equal(fill[1], 'Hola chat');
  assert.equal(fill[2], 0.1 * 1920);
  assert.ok(ctx.calls.some(call => call[0] === 'set' && call[1] === 'fillStyle' && call[2] === '#005fa9'));
  const long = fakeCtx();
  draw(long, { ...base, shape: 'text', text: 'x'.repeat(500) }, box);
  assert.equal(long.calls.find(call => call[0] === 'fillText')[1].length, 120);
  const erased = fakeCtx();
  draw(erased, { ...base, shape: 'text', text: 'no', tool: 'eraser' }, box);
  assert.ok(!names(erased).includes('fillText'), 'the eraser never paints text');
});

test('double arrow has a head at each end; a normal arrow keeps one', () => {
  const draw = renderer();
  const single = fakeCtx();
  draw(single, { ...base, shape: 'arrow' }, box);
  const double = fakeCtx();
  draw(double, { ...base, shape: 'arrow2' }, box);
  const strokes = ctx => names(ctx).filter(name => name === 'stroke').length;
  assert.equal(strokes(single), 2);
  assert.equal(strokes(double), 3);
});

test('filled rectangle and ellipse use fill; outlines stay as before', () => {
  const draw = renderer();
  const filledRect = fakeCtx();
  draw(filledRect, { ...base, shape: 'rect', fill: true }, box);
  assert.ok(names(filledRect).includes('fillRect'));
  assert.ok(!names(filledRect).includes('strokeRect'));
  const outlineRect = fakeCtx();
  draw(outlineRect, { ...base, shape: 'rect' }, box);
  assert.ok(names(outlineRect).includes('strokeRect'));
  const filledEllipse = fakeCtx();
  draw(filledEllipse, { ...base, shape: 'ellipse', fill: true }, box);
  assert.ok(names(filledEllipse).includes('fill'));
  const lineFill = fakeCtx();
  draw(lineFill, { ...base, shape: 'line', fill: true }, box);
  assert.ok(!names(lineFill).includes('fill'), 'fill only applies to closed shapes');
});

test('dashed lines set a dash pattern only when asked, never on freehand strokes', () => {
  const draw = renderer();
  const dashed = fakeCtx();
  draw(dashed, { ...base, shape: 'line', dash: true }, box);
  const dash = dashed.calls.find(call => call[0] === 'setLineDash');
  assert.ok(dash && dash[1].length === 2 && dash[1][0] > 0);
  const free = fakeCtx();
  draw(free, { ...base, shape: 'stroke', dash: true }, box);
  assert.ok(!names(free).includes('setLineDash'));
  const plain = fakeCtx();
  draw(plain, { ...base, shape: 'line' }, box);
  assert.ok(!names(plain).includes('setLineDash'));
});

test('unknown shapes are drawn as a plain segment, as before', () => {
  const draw = renderer();
  const ctx = fakeCtx();
  draw(ctx, { ...base, shape: 'rocket' }, box);
  assert.deepEqual(names(ctx).filter(name => ['moveTo', 'lineTo', 'stroke'].includes(name)), ['moveTo', 'lineTo', 'stroke']);
});

test('the private proxy accepts the new fields with limits and strips everything else', () => {
  const { drawingMessage, cleanDraw } = require('../src/pizarra-plus.js');
  assert.equal(drawingMessage({ ...base, shape: 'arrow2' }), true);
  assert.equal(drawingMessage({ ...base, shape: 'text', text: 'Hola' }), true);
  assert.equal(drawingMessage({ ...base, shape: 'text', text: '' }), false, 'empty text');
  assert.equal(drawingMessage({ ...base, shape: 'text', text: 'x'.repeat(121) }), false, 'text too long');
  assert.equal(drawingMessage({ ...base, shape: 'text' }), false, 'text shape needs text');
  assert.equal(drawingMessage({ ...base, shape: 'rect', fill: 'yes' }), false, 'fill must be boolean');
  assert.equal(drawingMessage({ ...base, shape: 'line', dash: 1 }), false, 'dash must be boolean');
  assert.equal(drawingMessage({ ...base, shape: 'rocket' }), false);
  const clean = cleanDraw({ ...base, shape: 'rect', fill: true, dash: true, text: 'ignored', evil: '<script>' });
  assert.equal(clean.fill, true);
  assert.equal(clean.dash, true);
  assert.equal('text' in clean, false, 'text only travels with the text shape');
  assert.equal('evil' in clean, false);
  const plain = cleanDraw({ ...base, shape: 'line' });
  assert.equal('fill' in plain || 'dash' in plain, false, 'old messages keep their old shape');
  assert.equal(cleanDraw({ ...base, shape: 'text', text: 'Hola' }).text, 'Hola');
});

test('every drawing view uses the shared renderer instead of its own shape code', () => {
  for (const file of ['../private/pizarra-plus.html', '../public/cristal.html', '../private/cristal-plus.html', '../public/pizarra.html']) {
    const html = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(html, /<script src="\/js\/pizarra-render\.js\?v=\d+"><\/script>/, `${file} loads the shared renderer`);
    assert.match(html, /drawPizarraShape\(/, `${file} delegates to it`);
    assert.doesNotMatch(html, /shape === 'ellipse'/, `${file} has no duplicated shape code`);
  }
});

test('the drawing panel offers text, double arrow, fill and dashed options', () => {
  const html = readFileSync(new URL('../private/pizarra-plus.html', import.meta.url), 'utf8');
  const panel = html.match(/<section id="draw-panel"[\s\S]*?<\/section>/)[0];
  assert.match(panel, /data-tool="arrow2"/);
  assert.match(panel, /data-tool="text"/);
  assert.match(panel, /id="shape-fill" type="checkbox"/);
  assert.match(panel, /id="shape-dash" type="checkbox"/);
  assert.match(html, /id="text-entry"/);
  assert.doesNotMatch(html, /\bprompt\(/, 'text is typed without a browser dialog');
});
