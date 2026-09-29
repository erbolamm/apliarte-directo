// The admin panel saved TTS voices to the server but only loaded them from the
// browser, so voices set on one device never appeared on another (2026-09-29).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const ruta of ["../public/admin.html", "../vps-overlay/public/admin.html"]) {
  const html = readFileSync(new URL(ruta, import.meta.url), "utf8");
  test(`${ruta}: syncVoces también lee las voces del servidor`, () => {
    const i = html.indexOf("async function syncVoces()");
    const cuerpo = html.slice(i, html.indexOf("async function syncSilenciados()"));
    assert.match(cuerpo, /fetch\('\/api\/panel\/voces', \{ cache: 'no-store' \}\)/);
    assert.match(cuerpo, /data\.voces/);
  });
}
