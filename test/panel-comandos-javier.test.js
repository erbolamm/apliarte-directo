// Commands sent from Javier's panel arrive as user 'ja'. !beso, WASD, !salta, !r and
// !trabajar only recognised 'apliarte'/'erbolamm', so they failed from the panel
// (found 2026-09-29). They now resolve the avatar with avatarDeUsuario(user, isJavier).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const ruta of ["../public/plano.html", "../vps-overlay/public/plano.html"]) {
  const html = readFileSync(new URL(ruta, import.meta.url), "utf8");
  test(`${ruta}: ningún comando reconoce a Javier solo por su nombre de Twitch`, () => {
    assert.doesNotMatch(html, /let caller = lowerUser === 'apliarte' \|\| lowerUser === 'erbolamm' \? 'ja' : null;/);
  });
  test(`${ruta}: mover, salta, reset, trabajar y beso usan avatarDeUsuario`, () => {
    for (const comando of ["mover", "salta", "reset", "trabajar", "beso"]) {
      const i = html.indexOf(`} else if (cmd.comando === '${comando}') {`);
      assert.ok(i > 0, comando);
      assert.match(html.slice(i, i + 400), /let caller = avatarDeUsuario\(user, isJavier\);/, comando);
    }
  });
}
