import test from 'node:test';
import assert from 'node:assert/strict';
import { argumentosRelay, argumentosRespaldo } from '../src/ffmpeg.js';

test('el relay copia los flujos sin recodificar', () => {
  const a = argumentosRelay({ entrada: 'rtmp://localhost:1935/live/obs', salida: 'rtmp://a/app/clave' });
  assert.equal(a.includes('-c'), true);
  assert.equal(a.includes('copy'), true);
  assert.equal(a.at(-1), 'rtmp://a/app/clave');
});

test('el relay declara el formato flv de salida', () => {
  const a = argumentosRelay({ entrada: 'rtmp://localhost:1935/live/obs', salida: 'rtmp://a/app/c' });
  assert.equal(a[a.indexOf('-f') + 1], 'flv');
});

test('el respaldo emite en bucle infinito', () => {
  const a = argumentosRespaldo({ archivo: '/medios/fallback.mp4', salida: 'rtmp://a/app/c' });
  assert.equal(a[a.indexOf('-stream_loop') + 1], '-1');
});

test('el respaldo lee a velocidad real para no adelantarse', () => {
  const a = argumentosRespaldo({ archivo: '/medios/fallback.mp4', salida: 'rtmp://a/app/c' });
  assert.equal(a.includes('-re'), true);
});

test('-re va antes de -i, o ffmpeg lo ignora', () => {
  const a = argumentosRespaldo({ archivo: '/m/f.mp4', salida: 'rtmp://a/app/c' });
  assert.ok(a.indexOf('-re') < a.indexOf('-i'), '-re debe preceder a -i');
});

test('-stream_loop va antes de -i, o no hace bucle', () => {
  const a = argumentosRespaldo({ archivo: '/m/f.mp4', salida: 'rtmp://a/app/c' });
  assert.ok(a.indexOf('-stream_loop') < a.indexOf('-i'), '-stream_loop debe preceder a -i');
});

test('el respaldo fuerza un fotograma clave cada 2 s, o YouTube no lo acepta', () => {
  const a = argumentosRespaldo({ archivo: '/m/f.mp4', salida: 'rtmp://a/app/c' });
  const i = a.indexOf('-force_key_frames');
  assert.ok(i > a.indexOf('-i'), '-force_key_frames es opción de salida: va detrás de -i');
  assert.equal(a[i + 1], 'expr:gte(t,n_forced*2)');
});

test('los argumentos son un array, nunca una cadena de shell', () => {
  const a = argumentosRelay({ entrada: 'rtmp://x/y', salida: 'rtmp://a/b' });
  assert.equal(Array.isArray(a), true);
  assert.equal(a.some((x) => typeof x !== 'string'), false);
});

test('rechaza una salida vacia', () => {
  assert.throws(() => argumentosRelay({ entrada: 'rtmp://x/y', salida: '' }), /salida/i);
});

test('rechaza un archivo de respaldo vacio', () => {
  assert.throws(() => argumentosRespaldo({ archivo: '', salida: 'rtmp://a/b' }), /archivo/i);
});

test('el respaldo acepta duracion opcional y añade -t', () => {
  const a = argumentosRespaldo({ archivo: '/m/f.mp4', salida: 'rtmp://a/app/c', duracion: 30 });
  assert.equal(a.includes('-t'), true);
  assert.equal(a[a.indexOf('-t') + 1], '30');
});

// El modo «vaivén» (filtro reverse + -stream_loop -1) acumuló 30 GB de RAM y colgó el Mac el
// 2026-09-19. Se retiró por completo: el respaldo nunca debe invertir el vídeo en vivo.
test('el respaldo nunca lleva filtros que acumulen el vídeo en memoria', () => {
  const a = argumentosRespaldo({ archivo: '/m/f.mp4', salida: 'rtmp://a/app/c', vaiven: true });
  assert.equal(a.includes('-filter_complex'), false);
  assert.equal(a.some((x) => String(x).includes('reverse')), false);
});

