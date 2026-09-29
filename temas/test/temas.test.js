import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cargarTema,
  cargarTemaEmbebido,
  aplicarTema,
  tokensDerivados,
  normalizarAlias,
  TOKENS_CSS,
  ALIASES_DISPONIBLES,
} from '../tema-overlay.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_TEMAS = resolve(AQUI, '..');

function leerJson(nombre) {
  return JSON.parse(readFileSync(join(RAIZ_TEMAS, nombre), 'utf8'));
}

/* ──────────────────────────────────────────────────────────────────────────
 * Validación estructural de los 3 JSON entregados por Javier.
 * ────────────────────────────────────────────────────────────────────────── */

test('existen los tres JSON exigidos por la tarjeta', () => {
  for (const f of ['musica.json', 'arte.json', 'desarrollo-de-software.json']) {
    assert.ok(existsSync(join(RAIZ_TEMAS, f)), `falta ${f}`);
  }
});

const CAMPOS_PALETA = ['fondo', 'primario', 'secundario', 'borde', 'texto', 'acento'];
const CAMPOS_FUENTES = ['principal', 'mono'];
const CAMPOS_MARCO = ['estilo', 'radio', 'grosorBorde', 'sombra'];
const CAMPOS_INTRO = ['titulo', 'subtitulo', 'duracionSeg'];
const CAMPOS_TEXTOS = ['pausa', 'comenzamos', 'alertaSeguidor'];

function esHex6(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }

for (const archivo of ['musica', 'arte', 'desarrollo-de-software']) {
  test(`${archivo}.json declara todos los campos exigidos`, () => {
    const j = leerJson(`${archivo}.json`);
    assert.equal(typeof j.id, 'string');
    assert.equal(typeof j.aliasExterno, 'string');
    assert.equal(typeof j.nombre, 'string');
    for (const k of CAMPOS_PALETA) {
      assert.ok(esHex6(j.paleta?.[k]), `paleta.${k} no es hex6: ${j.paleta?.[k]}`);
    }
    for (const k of CAMPOS_FUENTES) assert.equal(typeof j.fuentes?.[k], 'string');
    for (const k of CAMPOS_MARCO) {
      assert.equal(typeof j.marco?.[k], 'string', `marco.${k} debe ser string`);
    }
    for (const k of CAMPOS_INTRO) {
      assert.ok(j.intro?.[k] !== undefined, `intro.${k} falta`);
    }
    for (const k of CAMPOS_TEXTOS) {
      assert.equal(typeof j.textos?.[k], 'string', `textos.${k} debe ser string`);
    }
  });

  test(`${archivo}.json declara un estilo de marco soportado`, () => {
    const j = leerJson(`${archivo}.json`);
    assert.ok(['solido', 'cristal', 'cristal-color'].includes(j.marco.estilo),
      `estilo no soportado: ${j.marco.estilo}`);
  });
}

/* ──────────────────────────────────────────────────────────────────────────
 * Mapeo id interno ↔ aliasExterno
 * ────────────────────────────────────────────────────────────────────────── */

test('desarrollo-de-software.json mapea al id interno "apps" sin tocar categorias.js', () => {
  const j = leerJson('desarrollo-de-software.json');
  assert.equal(j.aliasExterno, 'desarrollo-de-software');
  assert.equal(j.id, 'apps');
});

test('normalizarAlias convierte "apps" al nombre de archivo "desarrollo-de-software"', () => {
  assert.equal(normalizarAlias('apps'), 'desarrollo-de-software');
  assert.equal(normalizarAlias('musica'), 'musica');
  assert.equal(normalizarAlias('arte'), 'arte');
});

test('ALIASES_DISPONIBLES lista exactamente los 3 archivos pedidos', () => {
  assert.deepEqual([...ALIASES_DISPONIBLES].sort(),
    ['arte', 'desarrollo-de-software', 'musica']);
});

/* ──────────────────────────────────────────────────────────────────────────
 * Derivación de tokens CSS desde un tema.
 * ────────────────────────────────────────────────────────────────────────── */

test('tokensDerivados cubre las 6 entradas de paleta y los tokens de marco y fuentes', () => {
  const t = leerJson('musica.json');
  const tokens = tokensDerivados(t);
  assert.equal(tokens['--color-primary'], '#ff1493');
  assert.equal(tokens['--color-secondary'], '#e91e63');
  assert.equal(tokens['--color-dark'], '#260519');
  assert.equal(tokens['--color-border'], '#ff66b3');
  assert.equal(tokens['--color-text'], '#fde7f1');
  assert.equal(tokens['--color-accent'], '#ffd1e3');
  assert.match(tokens['--font-primary'], /Inter/);
  assert.match(tokens['--font-mono'], /JetBrains/);
  assert.equal(tokens['--marco-estilo'], 'cristal-color');
  assert.equal(tokens['--marco-radio'], '14px');
  assert.equal(tokens['--marco-grosor'], '2px');
  assert.match(tokens['--marco-sombra'], /^0 12px/);
});

test('TOKENS_CSS lista exactamente las 12 variables CSS que aplicarTema escribe', () => {
  assert.equal(TOKENS_CSS.length, 12);
  assert.ok(TOKENS_CSS.includes('--color-primary'));
  assert.ok(TOKENS_CSS.includes('--font-mono'));
  assert.ok(TOKENS_CSS.includes('--marco-sombra'));
});

test('tokensDerivados lanza Error con tema sin paleta', () => {
  assert.throws(() => tokensDerivados({ id: 'x' }), /no incluye paleta/i);
});

test('tokensDerivados lanza Error con argumento nulo o no-objeto', () => {
  assert.throws(() => tokensDerivados(null), /se esperaba/);
  assert.throws(() => tokensDerivados('x'), /se esperaba/);
});

/* ──────────────────────────────────────────────────────────────────────────
 * aplicarTema con root mockeado (no hay DOM en Node).
 * ────────────────────────────────────────────────────────────────────────── */

test('aplicarTema escribe cada token en el root mockeado', () => {
  const root = { style: new Map() };
  // setProperty no existe en Map; lo adaptamos:
  root.style.setProperty = (k, v) => root.style.set(k, v);
  globalThis.__temaRoot = root;
  try {
    const tema = leerJson('arte.json');
    const tokens = aplicarTema(tema);
    assert.equal(root.style.get('--color-primary'), '#f5cba7');
    assert.equal(root.style.get('--color-secondary'), '#3e2723');
    assert.equal(root.style.get('--color-dark'), '#1a0f0b');
    assert.equal(root.style.get('--marco-estilo'), 'cristal');
    assert.equal(tokens['--color-primary'], '#f5cba7');
  } finally {
    delete globalThis.__temaRoot;
  }
});

test('aplicarTema lanza Error si el tema no tiene paleta (no aplica nada a medias)', () => {
  const root = { style: new Map() };
  root.style.setProperty = (k, v) => root.style.set(k, v);
  globalThis.__temaRoot = root;
  try {
    assert.throws(() => aplicarTema({ id: 'arte' }), /no incluye paleta/);
    assert.equal(root.style.size, 0, 'no debe haber escrito ningún token');
  } finally {
    delete globalThis.__temaRoot;
  }
});

test('cargarTemaEmbebido devuelve el objeto recibido tal cual', () => {
  const t = { id: 'x', paleta: { primario: '#000' } };
  assert.equal(cargarTemaEmbebido(t), t);
  assert.throws(() => cargarTemaEmbebido(null), /se esperaba/);
});

/* ──────────────────────────────────────────────────────────────────────────
 * cargarTema con fetch mockeado (Node 21+ tiene fetch nativo).
 * ────────────────────────────────────────────────────────────────────────── */

test('cargarTema carga el JSON desde la ruta canónica ./<alias>.json', async () => {
  const temaJson = readFileSync(join(RAIZ_TEMAS, 'musica.json'), 'utf8');
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    assert.match(String(url), /musica\.json$/);
    return new Response(temaJson, { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const tema = await cargarTema('musica');
    assert.equal(tema.id, 'musica');
    assert.equal(tema.paleta.primario, '#ff1493');
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('cargarTema normaliza "apps" a "desarrollo-de-software.json"', async () => {
  const temaJson = readFileSync(join(RAIZ_TEMAS, 'desarrollo-de-software.json'), 'utf8');
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /desarrollo-de-software\.json$/);
    return new Response(temaJson, { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const tema = await cargarTema('apps');
    assert.equal(tema.aliasExterno, 'desarrollo-de-software');
    assert.equal(tema.paleta.primario, '#5ecef5');
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('cargarTema rechaza un id desconocido sin red', async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 404 });
  try {
    await assert.rejects(() => cargarTema('cine'), /No se pudo cargar el tema/);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('cargarTema descarta un JSON cuyo id no coincide con el solicitado', async () => {
  const temaJson = readFileSync(join(RAIZ_TEMAS, 'musica.json'), 'utf8');
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => new Response(temaJson, { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    // Cargamos pidiendo id "musica" en la primera ruta (./musica.json) y como
    // el JSON declara id="musica", debe pasar. Cargamos pidiendo "apps" en la
    // segunda ruta debería caer al fallback o descartarlo.
    await assert.rejects(() => cargarTema('apps'), /No se pudo cargar el tema/);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});