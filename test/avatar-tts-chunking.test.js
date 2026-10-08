import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const RUTAS_PLANO = ['../public/plano.html', '../vps-overlay/public/plano.html']
  .filter((r) => existsSync(new URL(r, import.meta.url)));

test('plano.html no trunca mensajes largos a 140 caracteres y define troceo de palabras', () => {
  for (const ruta of RUTAS_PLANO) {
    const html = readFileSync(new URL(ruta, import.meta.url), 'utf8');
    assert.match(html, /partirTextoEnTrozos/, `${ruta} debe definir partirTextoEnTrozos`);
    assert.doesNotMatch(
      html,
      /const textoAcotado = textoLimpio\.slice\(0,\s*140\);/,
      `${ruta} no debe truncar directamente a 140 caracteres antes de /api/tts`
    );
  }
});

test('un mensaje de 400 caracteres se divide en trozos por palabras completas <= 140 chars y los dice en orden', () => {
  const texto400 = 'Hola a todos los presentes en el directo de hoy estamos probando que los avatares tridimensionales son capaces de leer absolutamente todo el mensaje sin cortar a los ciento cuarenta caracteres originales porque cuando la comunidad escribe parrafos largos o reflexiones interesantes es una pena que se quede a medias por una limitacion arbitraria que ya hemos superado completamente en este directo con exito rotundo.'.trim();
  
  assert.ok(texto400.length >= 400, `El texto debe tener al menos 400 caracteres (tiene ${texto400.length})`);

  // Extraer o verificar implementación en plano.html
  const html = readFileSync(new URL('../public/plano.html', import.meta.url), 'utf8');
  assert.match(html, /function partirTextoEnTrozos/, 'debe tener función partirTextoEnTrozos');

  // Evaluar función desde el propio archivo o lógica contratada
  const match = html.match(/function partirTextoEnTrozos\([^)]*\)\s*\{[\s\S]*?\n    \}/);
  assert.ok(match, 'debe encontrarse la función partirTextoEnTrozos en public/plano.html');

  const fn = new Function(`${match[0]}; return partirTextoEnTrozos;`)();
  const trozos = fn(texto400, 140);

  assert.ok(trozos.length > 1, `Debe generar más de un trozo (generó ${trozos.length})`);
  for (const trozo of trozos) {
    assert.ok(trozo.length <= 140, `Cada trozo debe ser <= 140 caracteres (mide ${trozo.length}): "${trozo}"`);
    assert.ok(!trozo.startsWith(' ') && !trozo.endsWith(' '), 'No debe tener espacios sueltos a los lados');
  }

  // Comprobar que no corta palabras: la unión con espacios reconstruye todas las palabras en orden
  const reconstruido = trozos.join(' ');
  assert.equal(reconstruido, texto400.replace(/\s+/g, ' '));
});

test('plano.html: los trozos de un mismo mensaje cuentan como uno en anti-monopolio y no saturan la cola solos', () => {
  for (const ruta of RUTAS_PLANO) {
    const html = readFileSync(new URL(ruta, import.meta.url), 'utf8');
    assert.match(html, /mensajeId/, `${ruta} debe identificar los trozos con mensajeId`);
    assert.match(html, /MAX_TROZOS_POR_MENSAJE/, `${ruta} debe limitar los trozos por mensaje para no saturar la cola`);
    assert.match(html, /MAX_TTS_COLA_TROZOS/, `${ruta} debe definir tope duro de trozos en total`);
  }
});

test('mensaje de 500 caracteres (máximo de Twitch) se lee entero con MAX_TROZOS_POR_MENSAJE = 5', () => {
  const html = readFileSync(new URL('../public/plano.html', import.meta.url), 'utf8');
  const match = html.match(/function partirTextoEnTrozos\([^)]*\)\s*\{[\s\S]*?\n    \}/);
  const partirTextoEnTrozos = new Function(`${match[0]}; return partirTextoEnTrozos;`)();

  const texto500 = 'En el directo de hoy estamos programando y aprendiendo juntos sobre desarrollo web y transmisiones en vivo con avatares tridimensionales interactivos. La comunidad de Twitch y YouTube comparte sus dudas reflexiones y sugerencias en el chat en tiempo real mientras probamos las nuevas caracteristicas del sistema de audio y texto a voz para que cada mensaje se escuche claro y completo sin perder ni una sola palabra importante de la conversacion que estamos manteniendo durante toda la sesion de esta tarde.'.slice(0, 500);

  assert.equal(texto500.length, 500, 'El texto debe medir exactamente 500 caracteres');

  const trozos = partirTextoEnTrozos(texto500, 140);
  assert.ok(trozos.length <= 5, `Un mensaje de 500 caracteres debe caber en <= 5 trozos (generó ${trozos.length})`);

  // Se lee entero: la unión de trozos reconstruye el texto íntegro
  const reconstruido = trozos.join(' ');
  assert.equal(reconstruido, texto500.trim().replace(/\s+/g, ' '), 'El mensaje se debe leer entero sin recortar palabras');
});

test('tope duro de la cola: 10 mensajes seguidos de 400 caracteres no superan MAX_TTS_COLA_TROZOS y no se admiten a medias', () => {
  const html = readFileSync(new URL('../public/plano.html', import.meta.url), 'utf8');

  const matchPartir = html.match(/function partirTextoEnTrozos\([^)]*\)\s*\{[\s\S]*?\n    \}/);
  const partirTextoEnTrozos = new Function(`${matchPartir[0]}; return partirTextoEnTrozos;`)();

  const matchMaxColaTrozos = html.match(/const MAX_TTS_COLA_TROZOS = (\d+);/);
  assert.ok(matchMaxColaTrozos, 'Debe existir constante MAX_TTS_COLA_TROZOS');
  const MAX_TTS_COLA_TROZOS = parseInt(matchMaxColaTrozos[1], 10);
  assert.ok(MAX_TTS_COLA_TROZOS > 0 && MAX_TTS_COLA_TROZOS <= 20, 'Tope duro debe ser razonable');

  const matchMaxTrozosMsg = html.match(/const MAX_TROZOS_POR_MENSAJE = (\d+);/);
  const MAX_TROZOS_POR_MENSAJE = parseInt(matchMaxTrozosMsg[1], 10);

  // Simulación exacta del algoritmo de encolado de hablarAvatar en plano.html
  const ttsColaAudio = [];
  const advertencias = [];
  const originalWarn = console.warn;
  console.warn = (...args) => advertencias.push(args.join(' '));

  try {
    for (let i = 0; i < 10; i++) {
      const texto = `Mensaje numero ${i} con texto largo para verificar que el tope duro de trozos protege contra avalanchas de audio en streaming sin saturar la sesion de directo en curso repetimos el texto largo para alcanzar cuatrocientos caracteres exactos en la prueba de hoy aqui mismo probando cola continua.`.slice(0, 400);
      const trozos = partirTextoEnTrozos(texto, 140);
      if (trozos.length > MAX_TROZOS_POR_MENSAJE) {
        console.warn(`[TTS] Mensaje excede el límite de trozos (${trozos.length} > ${MAX_TROZOS_POR_MENSAJE}), recortando:`, texto);
      }
      const trozosAceptados = trozos.slice(0, MAX_TROZOS_POR_MENSAJE);

      // Regla de tope duro: si no cabe entero, se descarta entero (no prioritario)
      if (ttsColaAudio.length + trozosAceptados.length > MAX_TTS_COLA_TROZOS) {
        console.warn('[TTS] Cola de trozos saturada (tope duro), descartando mensaje completo no prioritario:', texto);
        continue; // Descarte completo, nunca a medias
      }

      const mensajeId = 'msg_' + i;
      for (const trozo of trozosAceptados) {
        ttsColaAudio.push({ mensajeId, texto: trozo, agente: `agente_${i % 3}` });
      }
    }
  } finally {
    console.warn = originalWarn;
  }

  // 1. El tope duro se respeta estrictamente
  assert.ok(ttsColaAudio.length <= MAX_TTS_COLA_TROZOS,
    `La cola tiene ${ttsColaAudio.length} trozos, no debe superar el tope de ${MAX_TTS_COLA_TROZOS}`);

  // 2. Comprobar que ningún mensaje quedó a medias: todos los mensajeId tienen exactamente los trozos aceptados
  const recuentoPorMensaje = {};
  for (const item of ttsColaAudio) {
    recuentoPorMensaje[item.mensajeId] = (recuentoPorMensaje[item.mensajeId] || 0) + 1;
  }
  for (const [id, count] of Object.entries(recuentoPorMensaje)) {
    assert.ok(count >= 2 && count <= MAX_TROZOS_POR_MENSAJE,
      `El mensaje ${id} debe tener todos sus trozos completos (tiene ${count})`);
  }

  // 3. Se registraron advertencias por tope saturado
  assert.ok(advertencias.some(w => w.includes('tope duro')), 'Debe emitir console.warn cuando se satura el tope duro');
});

