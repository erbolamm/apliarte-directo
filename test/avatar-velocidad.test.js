import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const RUTAS_PLANO = ['../public/plano.html', '../vps-overlay/public/plano.html']
  .filter((r) => existsSync(new URL(r, import.meta.url)));

function extraerCalcularPlaybackRate(ruta) {
  const html = readFileSync(new URL(ruta, import.meta.url), 'utf8');
  const match = html.match(/function calcularPlaybackRate\([^)]*\)\s*\{[\s\S]*?\n    \}/);
  assert.ok(match, `${ruta} debe definir la función pura calcularPlaybackRate`);
  return new Function(`${match[0]}; return calcularPlaybackRate;`)();
}

test('calcularPlaybackRate calcula el producto puro de avatar x estudio x tono con precisión numérica', () => {
  for (const ruta of RUTAS_PLANO) {
    const fn = extraerCalcularPlaybackRate(ruta);

    // Slot 1 (agudo / femenino, factor 1.12) con velocidad 1.0
    const agudo = fn(1.15, 1.0, 1.12);
    assert.equal(agudo, 1.288, '1.15 * 1.0 * 1.12 debe ser 1.288');

    // Slot 2 (grave / masculino, factor 0.88) con velocidad 1.0
    const grave = fn(1.15, 1.0, 0.88);
    assert.equal(grave, 1.012, '1.15 * 1.0 * 0.88 debe ser 1.012');

    // Modificación de velocidad del estudio a 1.5x
    const acelerado = fn(1.15, 1.5, 1.0);
    assert.equal(acelerado, 1.725, '1.15 * 1.5 * 1.0 debe ser 1.725');
  }
});

test('calcularPlaybackRate respeta estrictamente los límites [0.6, 2.5]', () => {
  for (const ruta of RUTAS_PLANO) {
    const fn = extraerCalcularPlaybackRate(ruta);

    // Límite inferior: valores muy lentos nunca bajan de 0.6
    assert.equal(fn(0.5, 0.5, 0.88), 0.6, 'Debe acotar a 0.6 como mínimo');
    assert.equal(fn(0.1, 0.5, 0.5), 0.6, 'Debe acotar a 0.6 con valores extremos');

    // Límite superior: valores muy rápidos nunca suben de 2.5
    assert.equal(fn(1.5, 2.0, 1.12), 2.5, 'Debe acotar a 2.5 como máximo');
    assert.equal(fn(2.0, 2.0, 1.5), 2.5, 'Debe acotar a 2.5 con valores extremos');
  }
});

test('plano.html: conserva el tono por defecto (Camino 2, preservesPitch = false) y conmuta reactivamente', () => {
  for (const ruta of RUTAS_PLANO) {
    const html = readFileSync(new URL(ruta, import.meta.url), 'utf8');

    // De serie en Camino 2 (preservesPitch = false)
    assert.match(
      html,
      /let ttsPreservePitchEnOverlay\s*=\s*false;/,
      `${ruta} debe iniciar con ttsPreservePitchEnOverlay = false (Camino 2 de serie)`
    );

    // Audio asigna el valor dinámico del interruptor
    assert.match(
      html,
      /audio\.preservesPitch\s*=\s*preservarTono;/,
      `${ruta} debe asignar audio.preservesPitch dinámicamente según el interruptor`
    );

    // Recepción reactiva por WebSocket
    assert.match(
      html,
      /if\s*\(data\.preservePitch !== undefined\)\s*\{\s*ttsPreservePitchEnOverlay\s*=\s*Boolean\(data\.preservePitch\);/,
      `${ruta} debe actualizar ttsPreservePitchEnOverlay con el evento tts_estado`
    );
  }
});

test('estudio.html: incluye el interruptor para conmutar entre Camino 1 y Camino 2', () => {
  const html = readFileSync(new URL('../public/estudio.html', import.meta.url), 'utf8');

  // Clave en TTS_KEYS
  assert.match(html, /preservePitch:\s*['"]apliarte_estudio_tts_preserve_pitch['"]/,
    'estudio.html debe registrar preservePitch en TTS_KEYS');

  // De serie apagado (Camino 2)
  assert.match(html, /ttsPreservePitch\s*=\s*\(\)\s*=>\s*micSetting\(TTS_KEYS\.preservePitch,\s*['"]false['"]\)\s*===\s*['"]true['"]/,
    'estudio.html debe configurar ttsPreservePitch con valor por defecto false');

  // Envío en WebSocket
  assert.match(html, /preservePitch:\s*ttsPreservePitch\(\)/,
    'estudio.html debe enviar preservePitch vía tts_estado');
});
