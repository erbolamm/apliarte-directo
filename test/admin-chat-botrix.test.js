// The admin chat tab can switch between Twitch only and all chats together through
// the viewer's own Botrix widget (Javier, 2026-09-29). No personal widget id in code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const ruta of ["../public/admin.html", "../vps-overlay/public/admin.html"]) {
  const html = readFileSync(new URL(ruta, import.meta.url), "utf8");

  test(`${ruta}: botón Todos y fila para pegar la dirección de Botrix`, () => {
    assert.match(html, /id="btn-chat-todos"[^>]*aria-label="[^"]+"[^>]*data-tip="[^"]+"/);
    assert.match(html, /id="botrix-config"[^>]*hidden/);
    assert.match(html, /id="botrix-url"/);
  });

  test(`${ruta}: solo acepta widgets de botrix.live y se guarda en el navegador`, () => {
    assert.match(html, /const CLAVE_BOTRIX_URL = 'erbolamm-botrix-widget-url'/);
    assert.match(html, /function esUrlBotrix\(/);
    assert.match(html, /url\.hostname === 'botrix\.live'/);
    assert.match(html, /localStorage\.setItem\(CLAVE_BOTRIX_URL/);
  });

  test(`${ruta}: no lleva ningún widget personal escrito en el código`, () => {
    assert.doesNotMatch(html, /botrix\.live\/widgets\/chat\/\?bid=[A-Za-z0-9]/);
  });
}
