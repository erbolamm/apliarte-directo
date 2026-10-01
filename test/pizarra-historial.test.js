// Drawing history survives a centre restart (Javier, 2026-10-01). The centre
// keeps it in memory for speed and saves it to data/pizarra/historial.json at
// most once per delay; it is loaded and validated on startup. A damaged file is
// moved aside, never overwritten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cargarHistorial, crearGuardador, segmentoValido } from '../src/pizarra-historial.js';

const seg = (id, extra = {}) => ({ type: 'pizarra_draw', strokeId: id, from: { x: 0.1, y: 0.2 }, to: { x: 0.3, y: 0.4 }, color: '#005fa9', size: 6, shape: 'stroke', tool: 'pen', ...extra });
const temp = name => mkdtempSync(join(tmpdir(), `pizarra-hist-${name}-`));

test('a missing file means an empty board and creates nothing', () => {
  const dir = temp('vacio');
  const file = join(dir, 'pizarra', 'historial.json');
  assert.deepEqual(cargarHistorial(file, 4000), []);
  assert.equal(existsSync(join(dir, 'pizarra')), false);
});

test('saved history comes back after a restart, validated and capped', async () => {
  const dir = temp('ida-vuelta');
  const file = join(dir, 'pizarra', 'historial.json');
  const timers = [];
  const guardar = crearGuardador(file, { retrasoMs: 1000, programar: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, cancelar() {} });
  const history = [seg('a'), seg('b', { shape: 'text', text: 'Hola' }), seg('c', { shape: 'rect', fill: true })];
  guardar.programar(history);
  assert.equal(existsSync(file), false, 'nothing written before the delay');
  timers.at(-1)[0]();
  const loaded = cargarHistorial(file, 4000);
  assert.deepEqual(loaded, history);
  assert.equal(readdirSync(join(dir, 'pizarra')).some(name => name.endsWith('.tmp')), false, 'no temporary file left');
  assert.deepEqual(cargarHistorial(file, 2).map(s => s.strokeId), ['b', 'c'], 'keeps the most recent segments');
});

test('many changes in a row produce a single write with the latest state', () => {
  const dir = temp('rafaga');
  const file = join(dir, 'historial.json');
  const timers = [];
  let cancelled = 0;
  const guardar = crearGuardador(file, { retrasoMs: 1000, programar: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, cancelar: () => { cancelled++; } });
  const history = [];
  for (let i = 0; i < 5; i++) { history.push(seg('s' + i)); guardar.programar(history); }
  assert.equal(timers.length, 1, 'one pending write');
  timers[0][0]();
  assert.equal(cargarHistorial(file, 4000).length, 5);
  history.length = 0;
  guardar.programar(history);
  guardar.ahora();
  assert.deepEqual(cargarHistorial(file, 4000), [], 'clearing the board is saved too');
  assert.ok(cancelled >= 1, 'flushing now cancels the pending timer');
});

test('invalid segments are dropped when loading; nothing else is accepted', () => {
  assert.equal(segmentoValido(seg('ok')), true);
  assert.equal(segmentoValido({ ...seg('x'), type: 'otro' }), false);
  assert.equal(segmentoValido({ ...seg('x'), from: { x: 2, y: 0 } }), false);
  assert.equal(segmentoValido({ ...seg('x'), text: 'x'.repeat(121) }), false);
  assert.equal(segmentoValido({ ...seg('x'), size: 'big' }), false);
  const dir = temp('mezcla');
  const file = join(dir, 'historial.json');
  writeFileSync(file, JSON.stringify([seg('a'), { type: 'pizarra_draw' }, 'texto', seg('b')]));
  assert.deepEqual(cargarHistorial(file, 4000).map(s => s.strokeId), ['a', 'b']);
});

test('a damaged file is moved aside for recovery, never overwritten', () => {
  const dir = temp('danado');
  mkdirSync(join(dir, 'pizarra'));
  const file = join(dir, 'pizarra', 'historial.json');
  writeFileSync(file, '[{"type":"pizarra_draw", roto');
  assert.deepEqual(cargarHistorial(file, 4000), []);
  const aside = readdirSync(join(dir, 'pizarra')).filter(name => name.startsWith('historial.json.danado-'));
  assert.equal(aside.length, 1, 'the damaged copy is kept');
  assert.equal(readFileSync(join(dir, 'pizarra', aside[0]), 'utf8'), '[{"type":"pizarra_draw", roto');
});

test('the centre loads the history on startup, saves after every change and flushes on shutdown', () => {
  const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server, /import \{ cargarHistorial, crearGuardador \} from "\.\/pizarra-historial\.js";/);
  assert.match(server, /const pizarraHistory = cargarHistorial\(PIZARRA_FILE, MAX_PIZARRA_HISTORY\);/);
  const handler = server.slice(server.indexOf('if (data && data.type === "pizarra_draw")'), server.indexOf('} else if (data && data.type === "pizarra_solicitar_estado")'));
  assert.equal((handler.match(/guardarPizarra\.programar\(pizarraHistory\)/g) || []).length, 3, 'draw, clear and undo are saved');
  assert.match(server, /guardarPizarra\.ahora\(\)/, 'pending changes are written on shutdown');
});

test('saved drawings stay out of Git', () => {
  const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /^data\/pizarra\/$/m);
});
