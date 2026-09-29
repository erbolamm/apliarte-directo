// The radar view belonged to the central office (/vista/radar) and 404s in
// Directo, so it was removed from the plano (Javier, 2026-09-29).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the plano source has no radar button, view or route", () => {
  const src = read("../oficina-3d/src/components/FloorPlan.tsx");
  assert.doesNotMatch(src, /changeViewMode\('radar'\)/);
  assert.doesNotMatch(src, /\/vista\/radar/);
  assert.doesNotMatch(src, /params\.get\('vista'\) === 'radar'/);
});

for (const bundle of ["../public/office-3d.js", "../vps-overlay/public/office-3d.js"]) {
  test(`${bundle} no longer links to the missing radar page`, () => {
    assert.doesNotMatch(read(bundle), /\/vista\/radar/);
  });
}
