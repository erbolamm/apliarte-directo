// In the OBS overlay (?transparente=1) nothing can be clicked, so the top toolbar
// and the right HUD panel are hidden and a single row of avatars shows who is free
// or adopted (Javier, 2026-09-29). The normal plano view keeps its controls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const RUTAS_PLANO = ["../vps-overlay/public/plano.html", "../public/plano.html"]
  .filter((r) => existsSync(new URL(r, import.meta.url)));

for (const ruta of RUTAS_PLANO) {
  const html = readFileSync(new URL(ruta, import.meta.url), "utf8");

  test(`${ruta}: existe la fila de avatares para OBS`, () => {
    assert.match(html, /<div[^>]+id="obs-avatar-strip"/);
  });

  test(`${ruta}: en modo OBS se ocultan la barra superior y el panel derecho`, () => {
    assert.match(html, /body\.obs-overlay #office-3d \.camera-tools\s*\{\s*display:\s*none/);
    assert.match(html, /body\.obs-overlay #directo-hud\s*\{\s*display:\s*none/);
  });

  test(`${ruta}: la columna solo se ve en modo OBS, pegada a la derecha`, () => {
    assert.match(html, /\.obs-avatar-strip\s*\{[^}]*display:\s*none/);
    const rule = html.match(/body\.obs-overlay \.obs-avatar-strip\s*\{([^}]*)\}/)[1];
    assert.match(rule, /display:\s*flex/);
    assert.match(rule, /flex-direction:\s*column/);
    assert.match(rule, /right:\s*10px/);
  });

  test(`${ruta}: los textos de la columna son al menos el doble que en el panel`, () => {
    assert.match(html, /body\.obs-overlay \.obs-avatar-strip \.hud-avatar-chip\s*\{[^}]*font-size:\s*1\.36rem/);
    assert.match(html, /body\.obs-overlay \.obs-avatar-strip \.hud-avatar-owner\s*\{[^}]*font-size:\s*1\.24rem/);
  });

  test(`${ruta}: existe el rótulo de contexto del directo, oculto si está vacío`, () => {
    assert.match(html, /<div[^>]+id="obs-context"/);
    assert.match(html, /body\.obs-overlay \.obs-context:not\(:empty\)\s*\{[^}]*display:\s*block/);
  });

  test(`${ruta}: !contexto solo lo cambia Javier y se guarda`, () => {
    const handler = html.slice(html.indexOf("// !contexto"), html.indexOf("// !contexto") + 900);
    assert.match(handler, /\/\^!contexto\(\?:\\s\+\(\.\*\)\)\?\$\/i/);
    assert.match(handler, /if \(!isJavier\) return;/);
    assert.match(handler, /fijarContextoDirecto\(/);
    assert.match(html, /const CLAVE_CONTEXTO_DIRECTO = 'erbolamm-directo-contexto'/);
    assert.match(html, /obsContext\.textContent = /);
  });

  test(`${ruta}: en modo OBS el plano baja y se desplaza a la derecha lo que mide la barra`, () => {
    assert.match(html, /--obs-bar-offset:\s*66px/);
    const rule = html.match(/body\.obs-overlay #office-3d \.world-anchor\s*\{([^}]*)\}/)[1];
    assert.match(rule, /left:\s*calc\(41% \+ var\(--obs-bar-offset\)\) !important/);
    assert.match(rule, /top:\s*calc\(37% \+ var\(--obs-bar-offset\)\) !important/);
  });

  test(`${ruta}: en modo OBS el 2D cabe entre el rótulo, la columna y la cámara (lienzo 1920x1080)`, () => {
    const anchor = html.match(/body\.obs-overlay #office-3d \.diorama-anchor\s*\{([^}]*)\}/)[1];
    assert.match(anchor, /left:\s*730px !important/);
    assert.match(anchor, /top:\s*560px !important/);
    assert.match(html, /body\.obs-overlay #office-3d \.diorama-stage\s*\{[^}]*transform:\s*scale\(1\.125\) !important/);
  });

  test(`${ruta}: el modo OBS lo activa solo la URL, no el interruptor guardado`, () => {
    assert.match(html, /bodyEl\.classList\.toggle\('obs-overlay', initialTransparent\)/);
  });

  test(`${ruta}: la fila se pinta con los mismos datos que la cuadrícula de avatares`, () => {
    const render = html.slice(html.indexOf("function renderAvatarsGridActual"), html.indexOf("function adoptedViewers"));
    assert.match(render, /obsAvatarStrip\.innerHTML\s*=\s*AGENTS_INFO\.map/);
    assert.match(render, /avatarOwners\[a\.id\]/);
  });
}
