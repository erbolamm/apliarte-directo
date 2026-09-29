// One-click launcher for non-technical streamers (Javier, 2026-09-29): pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import {
  CLAIM_LINE, extraerEnlaceReclamacion, lineaSegura, comandoAbrir, resumenOBS, versionNodeValida,
} from "../scripts/lanzador.mjs";

test("detecta el enlace de reclamación en la salida del servidor", () => {
  const linea = "[primer-arranque] Enlace de reclamación: /claim?t=Abc_123-xyz";
  assert.equal(extraerEnlaceReclamacion(linea), "/claim?t=Abc_123-xyz");
  assert.equal(extraerEnlaceReclamacion("TTS Overlay server escuchando en puerto 7979"), null);
  assert.ok(CLAIM_LINE.test(linea));
});

test("nunca muestra el enlace de reclamación en pantalla (puede verse en directo)", () => {
  const segura = lineaSegura("[primer-arranque] Enlace de reclamación: /claim?t=SECRETO123");
  assert.doesNotMatch(segura, /SECRETO123/);
  assert.match(segura, /navegador/);
  assert.equal(lineaSegura("otra línea"), "otra línea");
});

test("abre el navegador con el comando de cada sistema", () => {
  assert.deepEqual(comandoAbrir("darwin", "http://x"), ["open", ["http://x"]]);
  assert.deepEqual(comandoAbrir("win32", "http://x"), ["cmd", ["/c", "start", "", "http://x"]]);
  assert.deepEqual(comandoAbrir("linux", "http://x"), ["xdg-open", ["http://x"]]);
});

test("el resumen explica en español qué poner en OBS y dónde está el panel", () => {
  const texto = resumenOBS(7979, { centro: true });
  for (const parte of ["http://127.0.0.1:7979/plano?transparente=1", "http://127.0.0.1:7979/fondo.html",
    "rtmp://127.0.0.1:1935/live", "http://127.0.0.1:7979/admin", "Ctrl+C"]) {
    assert.ok(texto.includes(parte), parte);
  }
  assert.match(texto, /«⚙️ Config & OBS» → «🔑 Credenciales & Red»/);
  assert.match(resumenOBS(7979, { centro: false }), /ffmpeg/);
});

test("exige Node 20 o superior", () => {
  assert.equal(versionNodeValida("v22.3.0"), true);
  assert.equal(versionNodeValida("v20.0.0"), true);
  assert.equal(versionNodeValida("v18.19.1"), false);
});

test("hay icono de doble clic para Mac (ejecutable) y Windows, y un script npm", () => {
  const mac = new URL("../Iniciar directo.command", import.meta.url);
  assert.ok(statSync(mac).mode & 0o111, "el .command debe ser ejecutable");
  assert.match(readFileSync(mac, "utf8"), /npm run directo/);
  assert.match(readFileSync(new URL("../Iniciar directo.bat", import.meta.url), "utf8"), /npm run directo/);
  assert.equal(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts.directo, "node scripts/directo.mjs");
});

test("instala exactamente lo revisado y sin scripts de instalación (npm ci --ignore-scripts)", () => {
  const src = readFileSync(new URL("../scripts/directo.mjs", import.meta.url), "utf8");
  assert.match(src, /\['ci', '--ignore-scripts', '--no-audit', '--no-fund'\]/);
  assert.doesNotMatch(src, /\['install'/);
  assert.match(src, /package-lock\.json/);
});

test("el centro no asusta con avisos técnicos en inglés ni con el respaldo opcional", () => {
  const lanzador = readFileSync(new URL("../scripts/directo.mjs", import.meta.url), "utf8");
  assert.match(lanzador, /--disable-warning=MODULE_TYPELESS_PACKAGE_JSON/);
  assert.match(lanzador, /allowedNodeEnvironmentFlags\.has\('--disable-warning'\)/);
  const centro = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.doesNotMatch(centro, /aviso: no existe el vídeo de respaldo/);
  assert.match(centro, /Opcional: si pones un vídeo en/);
});
