// Test suite for the new "Hundir la Flota" game (!flota) on the 12x8 checkers board.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  puedeIniciarJuego,
  mensajeExplicativoNoSub,
  mensajeJuegoEnCurso,
  crearPartidaFlota,
  dispararFlota,
  BARCOS_CONFIG_DEFAULT
} from "../public/js/juego-flota.js";

test("puedeIniciarJuego: broadcaster (Javier) siempre está autorizado", () => {
  assert.equal(puedeIniciarJuego("ja", { badges: "broadcaster/1" }), true);
  assert.equal(puedeIniciarJuego("erbolamm", { badges: null }), true);
  assert.equal(puedeIniciarJuego("apliarte", { badges: "" }), true);
});

test("puedeIniciarJuego: suscriptores de Twitch autorizados mediante badge subscriber", () => {
  assert.equal(puedeIniciarJuego("viewer_pro", { badges: "subscriber/6,premium/1" }), true);
  assert.equal(puedeIniciarJuego("pepito", { badges: "subscriber/1" }), true);
});

test("puedeIniciarJuego: espectadores sin suscripción a Twitch son rechazados", () => {
  assert.equal(puedeIniciarJuego("espectador_anon", { badges: null }), false);
  assert.equal(puedeIniciarJuego("espectador_anon", { badges: "vip/1" }), false);
  assert.equal(puedeIniciarJuego("random_user", { badges: "" }), false);
});

test("mensajeExplicativoNoSub: educa al no suscriptor sobre cómo suscribirse en Twitch", () => {
  const msg = mensajeExplicativoNoSub("espectador_anon", "!flota");
  assert.match(msg, /espectador_anon/);
  assert.match(msg, /suscr/i);
  assert.match(msg, /Twitch/i);
  assert.match(msg, /!flota/);
});

test("mensajeJuegoEnCurso: avisa educadamente que ya hay una partida activa", () => {
  const msg = mensajeJuegoEnCurso("!flota", "Hundir la Flota");
  assert.match(msg, /en curso/i);
});

test("crearPartidaFlota: inicializa el tablero 12x8 con barcos dentro de los límites", () => {
  const partida = crearPartidaFlota();
  assert.equal(partida.filas, 8);
  assert.equal(partida.columnas, 12);
  assert.ok(partida.barcos.length >= 3);
  assert.equal(partida.activa, true);

  // Cada barco debe estar dentro de columnas a-l (0..11) y filas 1..8 (0..7)
  for (const barco of partida.barcos) {
    for (const casilla of barco.casillas) {
      assert.ok(casilla.col >= 0 && casilla.col < 12);
      assert.ok(casilla.row >= 0 && casilla.row < 8);
    }
  }
});

test("dispararFlota: cálculo de puntos (1 golpe, 2 hundido, 0 agua)", () => {
  // Configuración determinista para el test
  const barcos = [
    { id: "sub1", casillas: [{ col: 0, row: 0 }] }, // a1 (1 casilla)
    { id: "dest1", casillas: [{ col: 2, row: 1 }, { col: 3, row: 1 }] } // c2, d2 (2 casillas)
  ];
  const partida = crearPartidaFlota({ barcos });

  // 1. Disparo al agua (b1 -> col 1, row 0)
  const rAgua = dispararFlota(partida, "usuario1", "b1");
  assert.equal(rAgua.resultado, "agua");
  assert.equal(rAgua.puntos, 0);

  // 2. Disparo a barco no hundido (c2 -> col 2, row 1)
  const rGolpe = dispararFlota(partida, "usuario2", "c2");
  assert.equal(rGolpe.resultado, "golpe");
  assert.equal(rGolpe.puntos, 1);
  assert.equal(partida.marcador["usuario2"], 1);

  // 3. Disparo que completa el barco y lo hunde (d2 -> col 3, row 1)
  const rHundido = dispararFlota(partida, "usuario2", "d2");
  assert.equal(rHundido.resultado, "hundido");
  assert.equal(rHundido.puntos, 2);
  assert.equal(partida.marcador["usuario2"], 3); // 1 + 2 = 3

  // 4. Casilla repetida ya impactada
  const rRepetido = dispararFlota(partida, "usuario3", "c2");
  assert.equal(rRepetido.resultado, "repetido");
  assert.equal(rRepetido.puntos, 0);
});
