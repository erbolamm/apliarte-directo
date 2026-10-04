// Viewers' avatar adoptions must survive an OBS cache refresh or a server restart
// (they were lost several times live on 2026-09-26).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const RUTAS_PLANO = ["../vps-overlay/public/plano.html", "../public/plano.html"]
  .filter((r) => existsSync(new URL(r, import.meta.url)));

for (const ruta of RUTAS_PLANO) {
  const html = readFileSync(new URL(ruta, import.meta.url), "utf8");

  test(`${ruta}: las adopciones se guardan y se restauran desde localStorage`, () => {
    assert.match(html, /const CLAVE_DUENOS_AVATAR = 'erbolamm-directo-avatar-owners'/);
    assert.match(html, /localStorage\.getItem\(CLAVE_DUENOS_AVATAR\)/);
    assert.match(html, /localStorage\.setItem\(CLAVE_DUENOS_AVATAR/);
  });

  test(`${ruta}: !r y un movimiento nuevo cancelan los tramos pendientes de una ruta`, () => {
    assert.match(html, /const rutasPendientes = new Map\(\)/);
    assert.match(html, /cancelarRutaPendiente\(caller\);\s*office\?\.resetAvatar/);
    assert.match(html, /rutasPendientes\.set\(caller, pendientes\)/);
  });

  test(`${ruta}: cualquier cambio en los dueños se persiste y ja sigue siendo de Javier`, () => {
    assert.match(html, /const avatarOwners = new Proxy\(/);
    assert.match(html, /deleteProperty/);
    assert.match(html, /ja: 'apliarte'/);
  });

  test(`${ruta}: un espectador no puede tener múltiples avatares simultáneos en el proxy`, () => {
    assert.match(html, /aId !== 'ja' && aId !== agente && String\(u\)\.toLowerCase\(\) === uLower/);
  });
}

for (const ruta of RUTAS_PLANO) {
  const html = readFileSync(new URL(ruta, import.meta.url), "utf8");
  test(`${ruta}: el overlay solo repuebla adopciones al inicio si el servidor está vacío (sin bucle periódico)`, () => {
    assert.match(html, /ultimoSeqComando === -1 && Object\.keys\(data\.duenos\)\.length === 0/);
    assert.match(html, /body: JSON\.stringify\(\{ comando: 'adoptar', agente, usuario \}\)/);
    assert.match(html, /cmd\.comando !== 'adoptar' && cmd\.comando !== 'liberar'/);
  });
  test(`${ruta}: Javier puede iniciar !traidor directamente sin votación`, () => {
    assert.match(html, /fetch\('\/api\/directo\/juego\/iniciar-traidor'/);
    assert.doesNotMatch(html, /!traidor se elige en la votación/);
  });
}

for (const ruta of RUTAS_PLANO) {
  const html = readFileSync(new URL(ruta, import.meta.url), "utf8");
  test(`${ruta}: en la votación del traidor el número de un jugador se envía como voto`, () => {
    assert.match(html, /filtrarMensajeDuranteVotacion \} from '\/js\/tts-fuentes\.js/);
    assert.match(html, /fetch\('\/api\/directo\/juego\/voto'/);
  });
  test(`${ruta}: durante el traidor solo se atiende a jugadores y a Javier`, () => {
    assert.match(html, /if \(!esJugador && !esJavier\(user\)\) return;/);
  });
  test(`${ruta}: en la votación del traidor se explicita que solo votan avatares asignados`, () => {
    assert.match(html, /Solo votan avatares asignados · Escribe el número del sospechoso en el chat/);
  });
}

for (const ruta of RUTAS_PLANO) {
  const html = readFileSync(new URL(ruta, import.meta.url), "utf8");
  test(`${ruta}: durante el traidor la cámara se mantiene en la sala de reuniones`, () => {
    assert.match(html, /function mantenerFocoTraidor\(players\)/);
    assert.match(html, /mantenerFocoTraidor\(hub\.players \|\| \[\]\);/);
  });
  test(`${ruta}: Javier puede liberar todos los avatares o un agente concreto`, () => {
    assert.match(html, /cmd\.agente === 'todos' \|\| cmd\.agente === 'all'/);
    assert.match(html, /isJavier && cmd\.agente && cmd\.agente !== 'ja'/);
  });
  test(`${ruta}: la adopción notifica al servidor y protege adopciones recientes de carreras`, () => {
    assert.match(html, /ultimasAdopcionesLocales\.set\(cmd\.agente/);
    assert.match(html, /fetch\('\/api\/directo\/comando'/);
  });
}

test("server.js: guarda serverOwners al recibir comando adoptar", () => {
  const serverPath = new URL("../server.js", import.meta.url);
  const serverCode = readFileSync(serverPath, "utf8");
  assert.match(serverCode, /serverOwners\[cmd\.agente\]\s*=\s*cmd\.usuario;/);
});

