// Without clickable buttons in OBS, Javier switches the plano view from chat:
// !3d shows the 3D office and !2d the diorama (Javier, 2026-09-29).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const RUTAS_PLANO = ["../vps-overlay/public/plano.html", "../public/plano.html"]
  .filter((r) => existsSync(new URL(r, import.meta.url)));

for (const ruta of RUTAS_PLANO) {
  const html = readFileSync(new URL(ruta, import.meta.url), "utf8");
  const inicio = html.indexOf("// !3d / !2d");
  const handler = html.slice(inicio, inicio + 700);

  test(`${ruta}: !3d y !2d existen y solo los usa Javier`, () => {
    assert.ok(inicio > 0, "falta el manejador de !3d / !2d");
    assert.match(handler, /\/\^!\(3d\|2d\)\$\/i/);
    assert.match(handler, /if \(!isJavier\) return;/);
  });

  test(`${ruta}: !2d abre el diorama y !3d la oficina 3D con el evento que escucha el plano`, () => {
    // window.Oficina3D.setViewMode is never registered (App replaces the object after
    // FloorPlan's effect runs), so the command must use the erbolamm:set-view event.
    assert.match(handler, /=== '2d' \? 'diorama' : '3d'/);
    assert.match(handler, /new CustomEvent\('erbolamm:set-view', \{ detail: /);
    assert.doesNotMatch(handler, /setViewMode/);
  });
}
