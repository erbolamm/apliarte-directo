import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIAS } from '../src/categorias.js';

// Contrato de directo/config/escenas.json: paso 2 de la cadena directo/tts-apliarte.
// Matriz escena x categoria, sin inventar valores para 'andando' (pendiente de
// cl--tts-apliarte--modo-paseo-1-estudio-escenas-por-categoria).

const raiz = dirname(fileURLToPath(import.meta.url));
const escenas = JSON.parse(readFileSync(join(raiz, '..', 'config', 'escenas.json'), 'utf8'));

const HEX = /^#[0-9a-f]{6}$/i;
const ESCENAS_ESPERADAS = ['inicio', 'trabajando', 'hablando', 'espera', 'final'];

test('declara exactamente las 5 escenas pedidas por Javier', () => {
  assert.deepEqual(Object.keys(escenas.escenas).sort(), [...ESCENAS_ESPERADAS].sort());
});

test('categorias_validas coincide con las cuatro categorias de categorias.js', () => {
  const reales = Object.keys(CATEGORIAS).sort();
  const declaradas = [...escenas.categorias_validas].sort();
  assert.deepEqual(declaradas, reales);
  assert.ok(escenas.categorias_validas.includes('andando'));
});

for (const nombre of ESCENAS_ESPERADAS) {
  test(`escena "${nombre}" define una entrada por cada categoria valida`, () => {
    const entrada = escenas.escenas[nombre];
    assert.ok(entrada, nombre);
    assert.deepEqual(Object.keys(entrada.por_categoria).sort(), [...escenas.categorias_validas].sort());
  });

  test(`escena "${nombre}": las cuatro categorias tienen paleta hexadecimal completa`, () => {
    const porCategoria = escenas.escenas[nombre].por_categoria;
    for (const categoria of Object.keys(CATEGORIAS)) {
      const paleta = porCategoria[categoria];
      assert.ok(paleta, `${nombre}/${categoria}`);
      assert.ok(HEX.test(paleta.primario), `${nombre}/${categoria}.primario`);
      assert.ok(HEX.test(paleta.secundario), `${nombre}/${categoria}.secundario`);
      assert.ok(HEX.test(paleta.oscuro), `${nombre}/${categoria}.oscuro`);
    }
  });
}

test('"andando" usa la paleta oficial del Kit de Marca ApliArte en las 5 escenas', () => {
  for (const nombre of ESCENAS_ESPERADAS) {
    const paleta = escenas.escenas[nombre].por_categoria.andando;
    assert.equal(paleta.primario, '#00e676', nombre);
    assert.equal(paleta.secundario, '#00c853', nombre);
    assert.equal(paleta.oscuro, '#0a3d1c', nombre);
  }
});

test('la escena "final" declara honestamente que no tiene escena de OBS ni HTML todavia', () => {
  assert.equal(escenas.escenas.final.obs_escena_aproximada, null);
  assert.equal(escenas.escenas.final.html_overlay, null);
});
