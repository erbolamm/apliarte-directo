// The overlay must request the current 3D bundle, not a cached old one: the ?v=
// value is the first 10 hex chars of the bundle's sha256 (2026-09-29).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const hash = (p) => createHash("sha256").update(readFileSync(new URL(p, import.meta.url))).digest("hex").slice(0, 10);

for (const dir of ["../public/", "../vps-overlay/public/"]) {
  for (const page of ["plano.html", "demo.html"]) {
    const html = readFileSync(new URL(dir + page, import.meta.url), "utf8");
    test(`${dir}${page} pide la versión actual de office-3d.js y .css`, () => {
      assert.match(html, new RegExp(`office-3d\\.js\\?v=${hash(dir + "office-3d.js")}"`));
      assert.match(html, new RegExp(`office-3d\\.css\\?v=${hash(dir + "office-3d.css")}"`));
    });
  }
}
