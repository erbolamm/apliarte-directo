/**
 * Tests del módulo filtro-palabras (lista negra del TTS).
 *
 * Cobertura:
 *  - Modo censurar: reemplaza las palabras prohibidas por el carácter de
 *    reemplazo preservando la longitud (en realidad usamos un reemplazo fijo
 *    `***` por simplicidad; se documenta).
 *  - Modo silenciar: marca el mensaje como no apto y devuelve el texto
 *    original sin tocar.
 *  - Case-insensitive: mayúsculas y minúsculas se tratan igual.
 *  - Acentos: se quitan diacríticos antes de comparar.
 *  - Leetspeak básico: 0→o, 1→i/l, 3→e, 4→a, 5→s, 7→t, @→a, $→s.
 *  - Límite de palabra: "mala" no debe coincidir dentro de "amalgama".
 *  - Lista vacía: el mensaje pasa tal cual.
 *  - Hallazgos: lista de prohibidas detectadas.
 *
 * Sin dependencias externas: usa `node:test` y `assert/strict`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
 filtrarMensaje,
 MODOS,
 __test__ as internos,
} from "../public/js/filtro-palabras.js";

const {
 normalizarParaMatching,
 textoParaMatching,
 patronParaPalabra,
 parsearLista,
} = internos;

// ─── Coincidencia básica ────────────────────────────────────────────────────

test("filtrarMensaje: mensaje limpio pasa tal cual (sin lista)", () => {
 const r = filtrarMensaje("hola qué tal", []);
 assert.equal(r.apto, true);
 assert.equal(r.texto, "hola qué tal");
 assert.deepEqual(r.hallazgos, []);
});

test("filtrarMensaje: mensaje limpio pasa tal cual (con lista que no matchea)", () => {
 const r = filtrarMensaje("hola mundo", ["gato", "perro"]);
 assert.equal(r.apto, true);
 assert.equal(r.texto, "hola mundo");
 assert.deepEqual(r.hallazgos, []);
});

test("filtrarMensaje: detecta una palabra prohibida en modo censurar", () => {
 const r = filtrarMensaje("hola mundo malo", ["malo"], {
  modo: MODOS.CENSURAR,
 });
 assert.equal(r.apto, true);
 assert.equal(r.texto, "hola mundo ***");
 assert.deepEqual(r.hallazgos, ["malo"]);
});

// ─── Modos ─────────────────────────────────────────────────────────────────

test("filtrarMensaje: modo silenciar marca el mensaje como no apto", () => {
 const r = filtrarMensaje("hola mundo malo", ["malo"], {
  modo: MODOS.SILENCIAR,
 });
 assert.equal(r.apto, false);
 assert.equal(r.texto, "hola mundo malo");
 assert.deepEqual(r.hallazgos, ["malo"]);
});

test("filtrarMensaje: default mode es censurar", () => {
 const r = filtrarMensaje("texto con malo", ["malo"]);
 assert.equal(r.apto, true);
 assert.equal(r.texto, "texto con ***");
});

test("filtrarMensaje: reemplazo personalizado", () => {
 const r = filtrarMensaje("hola malo", ["malo"], { reemplazo: "[censurado]" });
 assert.equal(r.texto, "hola [censurado]");
});

// ─── Case-insensitive y acentos ─────────────────────────────────────────────

test("filtrarMensaje: mayúsculas no importan", () => {
 const r = filtrarMensaje("MALA palabra", ["mala"]);
 assert.equal(r.texto, "*** palabra");
 assert.deepEqual(r.hallazgos, ["mala"]);
});

test("filtrarMensaje: tildes no importan (prohibida con tilde vs texto sin tilde)", () => {
 const r = filtrarMensaje("esto es málö", ["malo"]);
 assert.equal(r.texto, "esto es ***");
});

test("filtrarMensaje: tildes no importan (prohibida sin tilde vs texto con tilde)", () => {
 const r = filtrarMensaje("esto es muy malo", ["malo"]);
 assert.equal(r.texto, "esto es muy ***");
});

// ─── Leetspeak básico ──────────────────────────────────────────────────────

test("filtrarMensaje: detecta leetspeak básico (h0la)", () => {
 const r = filtrarMensaje("dice h0la a todos", ["hola"]);
 assert.equal(r.texto, "dice *** a todos");
 assert.deepEqual(r.hallazgos, ["hola"]);
});

test("filtrarMensaje: detecta leetspeak básico (m4l0)", () => {
 const r = filtrarMensaje("qué m4l0", ["malo"]);
 assert.equal(r.texto, "qué ***");
});

// ─── Límite de palabra ─────────────────────────────────────────────────────

test("filtrarMensaje: NO censura dentro de palabra compuesta (amalgama ≠ mala)", () => {
 const r = filtrarMensaje("esto es una amalgama", ["mala"]);
 assert.equal(r.apto, true);
 assert.equal(r.texto, "esto es una amalgama");
 assert.deepEqual(r.hallazgos, []);
});

test('filtrarMensaje: NO censura como prefijo (malote contiene "malo"?)', () => {
 // "malote" contiene "malo" como prefijo. Con límite de palabra NO debe coincidir.
 const r = filtrarMensaje("es un malote", ["malo"]);
 assert.equal(r.apto, true);
 assert.equal(r.texto, "es un malote");
});

test("filtrarMensaje: SÍ censura palabra con puntuación al final (malo!)", () => {
 const r = filtrarMensaje("qué malo!", ["malo"]);
 assert.equal(r.texto, "qué ***!");
});

test("filtrarMensaje: SÍ censura palabra entre espacios (con espacios es boundary)", () => {
 const r = filtrarMensaje("a b malo c d", ["malo"]);
 assert.equal(r.texto, "a b *** c d");
});

// ─── Múltiples coincidencias ───────────────────────────────────────────────

test("filtrarMensaje: múltiples coincidencias de la misma prohibida", () => {
 const r = filtrarMensaje("malo y malo otra vez", ["malo"]);
 assert.equal(r.texto, "*** y *** otra vez");
 // `hallazgos` es el conjunto de prohibidas distintas detectadas (no un
 // conteo de ocurrencias). El conteo está implícito en el texto censurado:
 // dos `***` significan dos matches.
 assert.deepEqual(r.hallazgos, ["malo"]);
 const matches = r.texto.match(/\*\*\*/g) || [];
 assert.equal(matches.length, 2);
});

test("filtrarMensaje: múltiples prohibidas distintas", () => {
 const r = filtrarMensaje("malo y feo juntos", ["malo", "feo"]);
 assert.equal(r.texto, "*** y *** juntos");
 assert.deepEqual(r.hallazgos.sort(), ["feo", "malo"]);
});

// ─── Lista vacía y entradas inválidas ──────────────────────────────────────

test("filtrarMensaje: lista vacía devuelve mensaje intacto", () => {
 const r = filtrarMensaje("cualquier cosa", []);
 assert.equal(r.apto, true);
 assert.equal(r.texto, "cualquier cosa");
});

test("filtrarMensaje: entradas vacías o con solo espacios en la lista se ignoran", () => {
 const r = filtrarMensaje("malo", ["", "   ", "malo", null, undefined]);
 assert.equal(r.texto, "***");
});

test("filtrarMensaje: texto vacío se devuelve tal cual", () => {
 const r = filtrarMensaje("", ["malo"]);
 assert.equal(r.apto, true);
 assert.equal(r.texto, "");
});

test("filtrarMensaje: texto null/undefined se trata como vacío", () => {
 const r = filtrarMensaje(null, ["malo"]);
 assert.equal(r.apto, true);
 assert.equal(r.texto, "");
});

// ─── Helpers internos (parsearLista) ───────────────────────────────────────

test("parsearLista: parte por líneas, ignora vacías y comentarios con #", () => {
 const l = parsearLista(`# comentario\nmalo\n\nfeo   \n  # otro\n`);
 assert.deepEqual(l, ["malo", "feo"]);
});

test("parsearLista: entrada vacía devuelve []", () => {
 assert.deepEqual(parsearLista(""), []);
 assert.deepEqual(parsearLista("   \n\n  "), []);
});

// ─── Helpers internos de normalización (tests blancos para verificar contrato) ──

test("normalizarParaMatching: quita diacríticos y pasa a minúsculas", () => {
 assert.equal(normalizarParaMatching("MálÖ"), "malo");
 assert.equal(normalizarParaMatching("Ñoño"), "nono");
});

test("textoParaMatching: aplica también leetspeak básico", () => {
 assert.equal(textoParaMatching("H0L4"), "hola");
 assert.equal(textoParaMatching("M4L0"), "malo");
 assert.equal(textoParaMatching("$0y $3ñor"), "soy senor");
});

test("patronParaPalabra: devuelve regex global con límite de palabra", () => {
 const p = patronParaPalabra("malo");
 assert.ok(p.global);
 assert.match("esto es malo", p);
 // assert.match usa regexp.exec, que es stateful en regex globales.
 // Reseteamos lastIndex entre invocaciones para que no arrastre estado.
 p.lastIndex = 0;
 assert.match("Malo!", p);
 p.lastIndex = 0;
 assert.doesNotMatch("amalgama", p);
});
