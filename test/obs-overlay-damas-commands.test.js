// Chat wiring of the !damas board in the overlay (Javier, 2026-09-29).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const RUTAS_PLANO = ["../vps-overlay/public/plano.html", "../public/plano.html"]
  .filter((r) => existsSync(new URL(r, import.meta.url)));

for (const ruta of RUTAS_PLANO) {
  const html = readFileSync(new URL(ruta, import.meta.url), "utf8");
  const bloque = (marca, largo = 900) => html.slice(html.indexOf(marca), html.indexOf(marca) + largo);

  test(`${ruta}: !damas solo lo usa Javier y alterna el tablero`, () => {
    const h = bloque("// !damas");
    assert.match(h, /\/\^!damas\$\/i/);
    assert.match(h, /if \(!isJavier\) return;/);
    assert.match(h, /office\?\.setBoard\?\.\(!office\?\.isBoard\?\.\(\)\)/);
  });

  test(`${ruta}: !3d también quita el tablero`, () => {
    assert.match(bloque("// !3d / !2d"), /if \(vista === '3d'\) window\.Oficina3D\?\.setBoard\?\.\(false\)/);
  });

  test(`${ruta}: !a2 lleva a la casilla el avatar de quien escribe, solo con tablero`, () => {
    const h = bloque("// Board squares");
    assert.match(h, /\/\^!\(\[a-l\]\[1-8\]\)\$\/i/);
    assert.match(h, /if \(!office\?\.isBoard\?\.\(\)\) return;/);
    assert.match(h, /avatarDeUsuario\(user, isJavier\)/);
    assert.match(h, /office\?\.irACasilla\?\.\(/);
  });

  test(`${ruta}: liberar un avatar con tablero lo devuelve a su puesto`, () => {
    const proxy = bloque("deleteProperty(destino, agente)", 400);
    assert.match(proxy, /window\.Oficina3D\?\.isBoard\?\.\(\)/);
    assert.match(proxy, /window\.Oficina3D\.resetAvatar\?\.\(agente\)/);
  });
}
