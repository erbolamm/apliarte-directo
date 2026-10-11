import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const planoHtml = readFileSync(new URL('../public/plano.html', import.meta.url), 'utf8');
const blogHtml = readFileSync(new URL('../voces-blogger.html', import.meta.url), 'utf8');

test('plano.html contains the full catalog of voice effects and aliases', () => {
  assert.match(planoHtml, /const CATALOGO_VOCES = \{/);
  assert.match(planoHtml, /const ALIAS_VOCES = \{/);

  // Animal voices
  for (const animal of ['gato', 'perro', 'pato', 'vaca', 'oveja', 'rana', 'pollo', 'lobo', 'mono', 'cerdo', 'grillo', 'abeja']) {
    assert.match(planoHtml, new RegExp(`${animal}:\\s*\\{[^}]*tipo:\\s*'animal'`, 'm'), `Falta voz de animal: ${animal}`);
  }

  // Character voices
  for (const pers of ['borracho', 'bebe', 'abuelo', 'pirata', 'tartamudo', 'acelerado', 'perezoso', 'pijo', 'susurro', 'pregonero', 'dramatico']) {
    assert.match(planoHtml, new RegExp(`${pers}:\\s*\\{[^}]*tipo:\\s*'personaje'`, 'm'), `Falta voz de personaje: ${pers}`);
  }

  // DSP modulations
  for (const dsp of ['helio', 'ogro', 'robot', 'walkie', 'cueva', 'telefono', 'alien', 'megafono']) {
    assert.match(planoHtml, new RegExp(`${dsp}:\\s*\\{[^}]*tipo:\\s*'dsp'`, 'm'), `Falta efecto dsp: ${dsp}`);
  }

  // Clean country accents
  for (const pais of ['espana', 'mexico', 'argentina', 'colombia', 'chile', 'peru', 'japon']) {
    assert.match(planoHtml, new RegExp(`${pais}:\\s*\\{[^}]*tipo:\\s*'idioma'`, 'm'), `Falta país: ${pais}`);
  }

  // Reset
  assert.match(planoHtml, /reset:\s*\{[^}]*reset:\s*true/);
});

test('plano.html handles !voz commands and transforms text for TTS while keeping original text in bubbles', () => {
  // Verifies the regex and handler
  assert.match(planoHtml, /const mVoz = text\.match\(\/\^!voz\(\?:\\s\+\(\[a-záéíóúñ0-9_-\]\+\)\)\?\(\?:\\s\+\(\[12\]\)\)\?\\b\/i\);/);
  assert.match(planoHtml, /CATALOGO_VOCES\[rawClave\] \|\| ALIAS_VOCES\[rawClave\]/);
  assert.match(planoHtml, /userVoiceConfigs\.set\(userKey, configVoz\)/);
  assert.match(planoHtml, /fetch\('\/api\/panel\/voces'/);

  // Verifies text transformation inside procesarSiguienteTts
  assert.match(planoHtml, /if \(efectoActivo\.tipo === 'animal' && Array\.isArray\(efectoActivo\.sonidos\)\)/);
  assert.match(planoHtml, /textoParaTts = rep\.join\(', '\) \+ '\.'/);
  assert.match(planoHtml, /textoParaTts = efectoActivo\.transformar\(textoLimpio,\s*ctx\)/);

  // Verifies audio pitch modulation
  assert.match(planoHtml, /const factorTonoFinal = factorEfectoTono \?/);
});

test('plano.html implements short, randomized coletillas without repetitive boilerplate', () => {
  // Helpers exist
  assert.match(planoHtml, /function elegirAzar\(lista\)/);
  assert.match(planoHtml, /function aplicarColetillaAzar\(texto,/);

  // Short coletillas for characters requested by Javier
  // Pijo: short start/end like "O sea,", "o sea", "¿sabes?"
  assert.match(planoHtml, /prefijos:\s*\[['"]O sea,['"]/);
  assert.match(planoHtml, /sufijos:\s*\[['"]o sea['"],\s*['"]¿sabes\?['"]/);

  // Borracho: short tag like "uf qué taja!", "hip", "salud!"
  assert.match(planoHtml, /¡uf qué taja!/);
  assert.match(planoHtml, /hip hip\.\.\./);

  // Susurro: subtle short tags
  assert.match(planoHtml, /Ssshh\.\.\./);
  assert.match(planoHtml, /\(en secreto\)/);

  // Multi-chunk context awareness
  assert.match(planoHtml, /trozoIndex:\s*i,\s*totalTrozos:\s*trozosAceptados\.length/);
  assert.match(planoHtml, /esPrimero:\s*item\.trozoIndex === undefined \|\| item\.trozoIndex === 0/);
  assert.match(planoHtml, /esUltimo:\s*item\.trozoIndex === undefined \|\| item\.trozoIndex === \(\(item\.totalTrozos \|\| 1\) - 1\)/);

  // Randomized activation phrases
  assert.match(planoHtml, /const frasesActivacion = \[/);
  assert.match(planoHtml, /elegirAzar\(frasesActivacion\)/);
});

test('plano.html preserves backward compatibility with !speak -config', () => {
  assert.match(planoHtml, /const mSpeak = text\.match\(\/\^!speak\\s\+-config\\s\+\(\[a-z\]\{2\}\(\?:-\[a-z\]\{2,4\}\)\?\)\\s\+\(\[12\]\)\\b\/i\);/);
});

test('voces-blogger.html has real-time search, category badges and copyable buttons for all effects', () => {
  // Real-time search
  assert.match(blogHtml, /id="apliarte-voces-filtro"/);
  assert.match(blogHtml, /filtro\.addEventListener\('input'/);

  // All 4 major categories
  assert.match(blogHtml, /🐾 Reino Animal/);
  assert.match(blogHtml, /🎭 Personajes y Tropos Cómicos/);
  assert.match(blogHtml, /🎛️ Efectos de Audio y Filtros/);
  assert.match(blogHtml, /Acentos en Español/);

  // Verify copy script fallback and visual confirmation
  assert.match(blogHtml, /navigator\.clipboard\.writeText/);
  assert.match(blogHtml, /boton\.classList\.add\('copiado'\)/);
  assert.match(blogHtml, /data-comando="!voz reset"/);
});

