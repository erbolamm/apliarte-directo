// The public demo has its own view controls; the office toolbar (EN VIVO banner,
// inbox and task search) does nothing there, so it is hidden (2026-09-29).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const ruta of ["../public/demo.html", "../vps-overlay/public/demo.html"]) {
  const html = readFileSync(new URL(ruta, import.meta.url), "utf8");
  test(`${ruta}: oculta la barra de la oficina y mantiene sus propios botones de vista`, () => {
    assert.match(html, /#office-3d \.camera-tools\s*\{\s*display:\s*none/);
    assert.match(html, /Diorama 2D/);
  });
}
