import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearTtsBackground } from '../public/js/tts-background.js';

function banco({ sinWorker = false, rechazo = false, speakFalla = false } = {}) {
  let tiempo = 0, bombas = 0, pausas = 0, resumes = 0, cancels = 0;
  const workers = [], audios = [], blobs = [], revocados = [], timers = new Map(), estados = [], avisos = [];
  const env = {
    performance: { now: () => tiempo }, Blob,
    URL: { createObjectURL: b => { blobs.push(b); return `blob:${blobs.length}`; }, revokeObjectURL: u => revocados.push(u) },
    Worker: class {
      constructor() { if (sinWorker) throw Error('CSP'); workers.push(this); }
      terminate() { this.terminado = true; }
    },
    Audio: class {
      constructor(src) { this.src = src; audios.push(this); }
      play() { this.playCalls = (this.playCalls || 0) + 1; if (rechazo) return Promise.reject(Error('NotAllowed')); this.onplaying(); return Promise.resolve(); }
      pause() { this.pausado = true; }
      removeAttribute() { this.src = ''; }
      load() { this.liberado = true; }
    },
    setInterval: fn => { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearInterval: id => timers.delete(id),
    speechSynthesis: {
      speak() { if (speakFalla) throw Error('voz'); },
      cancel() { cancels++; }, pause() { pausas++; }, resume() { resumes++; },
    },
  };
  const control = crearTtsBackground({ env, bombear: () => bombas++, estado: s => estados.push(s), aviso: s => avisos.push(s) });
  return { control, workers, audios, blobs, revocados, timers, estados, avisos,
    avanzar: t => { tiempo = t; control.tick(); },
    get bombas() { return bombas; }, get pausas() { return pausas; },
    get resumes() { return resumes; }, get cancels() { return cancels; } };
}

test('activar idempotente: Worker 250 ms, WAV silencioso y media loop; detener libera todo', async () => {
  const b = banco(); b.control.iniciar(); b.control.iniciar();
  assert.equal(b.workers.length, 1); assert.equal(b.audios.length, 1);
  assert.match(await b.blobs[0].text(), /250/);
  const wav = new DataView(await b.blobs[1].arrayBuffer());
  assert.equal(wav.getUint32(40, true), 16000);
  for (let i = 44; i < wav.byteLength; i++) assert.equal(wav.getUint8(i), 0);
  assert.equal(b.audios[0].loop, true); assert.equal(b.audios[0].volume, 0.01);
  assert.match(b.estados.at(-1), /sin garantía/);
  b.workers[0].onmessage(); assert.equal(b.bombas, 1);
  b.control.detener(); b.control.detener();
  assert.equal(b.workers[0].terminado, true); assert.equal(b.audios[0].liberado, true);
  assert.deepEqual(b.revocados, ['blob:1', 'blob:2']);
  b.workers[0].onmessage(); assert.equal(b.bombas, 1);
});

test('watchdog despierta cada 12 s sin cancelar lecturas largas; timeout desbloquea cola', () => {
  const b = banco(); b.control.iniciar();
  b.control.hablar({ text: 'x'.repeat(1000), rate: 1 });
  b.avanzar(11999); assert.equal(b.pausas, 0);
  b.avanzar(12000); assert.equal(b.pausas, 1); assert.equal(b.resumes, 1);
  b.avanzar(12250); assert.equal(b.pausas, 1);
  b.avanzar(45000); assert.equal(b.cancels, 0); assert.equal(b.control.ocupado, true);
  b.avanzar(215000); assert.equal(b.cancels, 1); assert.equal(b.control.ocupado, false);
  assert.equal(b.avisos.length, 1); assert.equal(b.bombas, 1);
});

test('eventos duplicados/tardíos no liberan otro utterance; stop invalida la sesión', () => {
  const b = banco(); b.control.iniciar();
  const u = { text: 'uno', rate: 1 }; b.control.hablar(u); const finViejo = u.onend;
  b.avanzar(45000); const v = { text: 'dos', rate: 1 }; b.control.hablar(v);
  finViejo(); assert.equal(b.control.ocupado, true);
  const errorViejo = v.onerror; b.control.detener(); b.control.iniciar();
  b.control.hablar({ text: 'tres', rate: 1 }); errorViejo(); assert.equal(b.control.ocupado, true);
});

test('onend/onerror liberan y el tick bombea; speak síncrono fallido no bloquea', () => {
  for (const evento of ['onend', 'onerror']) {
    const b = banco(); b.control.iniciar(); const u = { text: 'hola', rate: 1 };
    b.control.hablar(u); u[evento](); assert.equal(b.control.ocupado, false);
    b.control.tick(); assert.equal(b.bombas, 1);
  }
  const b = banco({ speakFalla: true }); b.control.iniciar();
  b.control.hablar({ text: 'hola' }); assert.equal(b.control.ocupado, false);
  b.control.tick(); assert.equal(b.bombas, 1);
});

test('Worker ausente/error y autoplay rechazado: estado limitado, fallback y limpieza', async () => {
  const b = banco({ sinWorker: true, rechazo: true }); b.control.iniciar();
  await Promise.resolve(); assert.match(b.estados.at(-1), /limitado/);
  assert.equal(b.timers.size, 1); [...b.timers.values()][0](); assert.equal(b.bombas, 1);
  b.control.detener(); assert.equal(b.timers.size, 0);
  const c = banco(); c.control.iniciar(); c.workers[0].onerror();
  assert.equal(c.workers[0].terminado, true); assert.equal(c.timers.size, 1);
  assert.match(c.estados.at(-1), /limitado/);
});

test('eventos media/worker de una sesión vieja no cambian la sesión nueva', () => {
  const b = banco(); b.control.iniciar();
  const playViejo = b.audios[0].onplaying, errorViejo = b.workers[0].onerror;
  b.control.detener(); playViejo(); assert.equal(b.estados.at(-1), 'Detenido');
  b.control.iniciar(); errorViejo(); assert.equal(b.timers.size, 0);
  b.audios[1].onpause(); assert.match(b.estados.at(-1), /limitado/);
});

test('inactivo no habla ni bombea y no permite dos utterances simultáneos', () => {
  const b = banco(); assert.equal(b.control.hablar({ text: 'hola' }), false);
  b.control.tick(); assert.equal(b.bombas, 0); b.control.iniciar();
  assert.equal(b.control.hablar({ text: 'uno' }), true);
  assert.equal(b.control.hablar({ text: 'dos' }), false);
});

test('ambas páginas usan el mismo controlador y liberan recursos al salir', () => {
  for (const nombre of ['tts-multiplataforma', 'tts-twitch']) {
    const html = readFileSync(new URL(`../public/${nombre}.html`, import.meta.url), 'utf8');
    for (const texto of ["from './js/tts-background.js'", 'background.iniciar()', 'background.detener()',
      'background.hablar(u)', '!activo || background.ocupado', "'pagehide'", 'id="estado-background"']) {
      assert.ok(html.includes(texto), `${nombre}: ${texto}`);
    }
    assert.ok(!html.includes('hablando'));
  }
});

test('timeout absoluto a cinco minutos incluso con texto enorme y voz lenta', () => {
  const b = banco(); b.control.iniciar();
  b.control.hablar({ text: 'x'.repeat(10000), rate: 0.5 });
  b.avanzar(299999); assert.equal(b.control.ocupado, true);
  b.avanzar(300000); assert.equal(b.control.ocupado, false); assert.equal(b.cancels, 1);
});

test('rechazo de play después de detener no resucita el estado', async () => {
  const b = banco({ rechazo: true }); b.control.iniciar(); b.control.detener();
  await Promise.resolve(); assert.equal(b.estados.at(-1), 'Detenido');
  assert.equal(b.audios[0].pausado, true);
});
