// The overlay server listened on 0.0.0.0, and it trusts forwarded-IP headers from
// private ranges (meant for Docker). On a home network any device could then claim
// to be a Tailscale client and get admin. Outside Docker it now listens on loopback;
// the images set HOST=0.0.0.0 because inside a container that is required (2026-09-29).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

for (const server of ["../server.js", "../vps-overlay/server.js"]) {
  test(`${server} escucha en 127.0.0.1 salvo que HOST diga otra cosa`, () => {
    const src = read(server);
    assert.match(src, /const HOST = process\.env\.HOST \|\| '127\.0\.0\.1';/);
    assert.match(src, /server\.listen\(PORT, HOST,/);
    assert.doesNotMatch(src, /server\.listen\(PORT, '0\.0\.0\.0'/);
  });
}

for (const dockerfile of ["../Dockerfile", "../vps-overlay/Dockerfile"]) {
  test(`${dockerfile} abre el contenedor con HOST=0.0.0.0`, () => {
    assert.match(read(dockerfile), /^ENV HOST=0\.0\.0\.0$/m);
  });
}
