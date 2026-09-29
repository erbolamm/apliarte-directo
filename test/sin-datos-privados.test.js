// The public project must not ship Javier's private data (2026-09-29 scan before publishing):
// camera password, Botrix widget id, Tailscale machine names, home IP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

// Private words are stored only as sha256 fingerprints so this test never publishes them.
const PRIVADOS = new Set(["2f5596d3bf15e5ed9a27bbe4c48dee9ef1f4633ba5a4deadb8ea9c2e9a87c04b", "439731392bc534b4a5a225999b0a18b1edb3488f3939198ce1191a7c5d156133", "72874fe886a92757706c81f8f42eff9b4f8ecaa53b193470454ea43644eb8474", "74542c95e25440fc421bc35bb65b24026e1ba1d2e2a7cb0d59781a1cd311e070", "80bef9f5e7f2e785c4365f7572085a9ecfc096ec0fe754468ed7675961e42ff4"]);
const huella = (t) => createHash("sha256").update(t).digest("hex");
const contienePrivado = (s) => (s.match(/[A-Za-z0-9.-]+/g) || []).some((t) => PRIVADOS.has(huella(t)) ||
  t.split(/[.]/).some((p) => PRIVADOS.has(huella(p))));

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const files = ["../public/docs/index.html", "../vps-overlay/public/docs/index.html", "../public/chat.html",
  "../vps-overlay/public/chat.html", "../public/admin.html", "../vps-overlay/public/admin.html",
  "../public/panel-twitch-comandos.html", "../panel-twitch-comandos.html"].filter((p) => existsSync(new URL(p, import.meta.url)));

for (const f of files) {
  test(`${f} no contiene datos privados`, () => {
    const s = read(f);
    assert.equal(contienePrivado(s), false, "private word found");
    assert.doesNotMatch(s, /botrix\.live\/widgets\/chat\/\?bid=[A-Za-z0-9]/);
  });
}

for (const f of ["../public/chat.html", "../vps-overlay/public/chat.html"]) {
  test(`${f}: Botrix se toma de ?botrix= o de lo guardado, solo de botrix.live`, () => {
    const s = read(f);
    assert.match(s, /params\.get\('botrix'\)/);
    assert.match(s, /localStorage\.getItem\('erbolamm-botrix-widget-url'\)/);
    assert.match(s, /url\.hostname === 'botrix\.live'/);
  });
}

test("la config de Nginx no publica direcciones Tailscale reales", () => {
  const s = read("../vps-overlay/npm-proxy-host-19.conf");
  // Only the CGNAT range itself (100.64.0.0/10) may appear, never a machine address.
  const ips = s.match(/\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+\b/g) || [];
  assert.deepEqual(ips.filter((ip) => ip !== "100.64.0.0"), []);
});
