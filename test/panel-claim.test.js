// First run without PANEL_PASS: the server prints a one-time claim link; whoever opens
// it first gets a strong password shown once (idea from AgentSystemLabs/agent-office, MIT).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, statSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

for (const base of ["../src/panel-claim.js", "../vps-overlay/src/panel-claim.js"]) {
  const { resolvePanelPassword, claimPanel, CLAIM_LOG_PREFIX } = require(base);

  test(`${base}: PANEL_PASS in the environment wins and no claim is created`, () => {
    const dir = mkdtempSync(join(tmpdir(), "claim-env-"));
    const logs = [];
    const r = resolvePanelPassword({ env: { PANEL_PASS: "from-env" }, dataDir: dir, log: (l) => logs.push(l) });
    assert.equal(r.password, "from-env");
    assert.equal(logs.length, 0);
    assert.equal(existsSync(join(dir, "panel-auth.json")), false);
  });

  test(`${base}: first run prints the claim line once and stores only a hash`, () => {
    const dir = mkdtempSync(join(tmpdir(), "claim-first-"));
    const logs = [];
    const r = resolvePanelPassword({ env: {}, dataDir: dir, log: (l) => logs.push(l) });
    assert.equal(r.password, "");
    assert.equal(logs.length, 1);
    assert.match(logs[0], new RegExp(`^\\${CLAIM_LOG_PREFIX}/claim\\?t=[A-Za-z0-9_-]{40,}$`));
    const token = logs[0].split("t=")[1];
    const file = readFileSync(join(dir, "panel-auth.json"), "utf8");
    assert.ok(!file.includes(token), "the token itself is never stored");
    assert.equal(statSync(join(dir, "panel-auth.json")).mode & 0o777, 0o600);
    // A restart before claiming prints a new link (the old one stops working).
    const again = [];
    resolvePanelPassword({ env: {}, dataDir: dir, log: (l) => again.push(l) });
    assert.notEqual(again[0], logs[0]);
    assert.equal(claimPanel(dir, token), null, "old link no longer valid");
  });

  test(`${base}: an unwritable data folder never crashes the server`, () => {
    const dir = mkdtempSync(join(tmpdir(), "claim-ro-"));
    chmodSync(dir, 0o500);
    const logs = [];
    try {
      const r = resolvePanelPassword({ env: {}, dataDir: dir, log: (l) => logs.push(l) });
      assert.equal(r.password, "");
      assert.match(logs.join("\n"), /\[primer-arranque\] No se puede guardar/);
      assert.doesNotMatch(logs.join("\n"), /\/claim\?t=/, "no link that could never be claimed");
    } finally {
      chmodSync(dir, 0o700);
    }
  });

  test(`${base}: the right token claims once; wrong or reused tokens fail`, () => {
    const dir = mkdtempSync(join(tmpdir(), "claim-use-"));
    const logs = [];
    resolvePanelPassword({ env: {}, dataDir: dir, log: (l) => logs.push(l) });
    const token = logs[0].split("t=")[1];
    assert.equal(claimPanel(dir, "wrong-token-value"), null);
    const password = claimPanel(dir, token);
    assert.match(password, /^[A-Za-z0-9_-]{24,}$/);
    assert.equal(claimPanel(dir, token), null, "a link works only once");
    const after = [];
    const r = resolvePanelPassword({ env: {}, dataDir: dir, log: (l) => after.push(l) });
    assert.equal(r.password, password, "the claimed password survives restarts");
    assert.equal(after.length, 0, "no new link once claimed");
  });
}

test("server: first run without PANEL_PASS serves a one-time claim link that sets the panel cookie", async () => {
  const dir = mkdtempSync(join(tmpdir(), "claim-server-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [fileURLToPath(new URL("../server.js", import.meta.url))], {
    env: { ...process.env, PANEL_PASS: "", PORT: String(port), DATA_DIR: dir, NODE_ENV: "production", TWITCH_CHAT_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const line = await new Promise((resolve, reject) => {
      let out = "";
      const timer = setTimeout(() => reject(new Error("no claim line:\n" + out)), 8000);
      const onData = (d) => {
        out += d;
        const m = out.match(/\[primer-arranque\] Enlace de reclamación: (\/claim\?t=[A-Za-z0-9_-]+)/);
        if (m) { clearTimeout(timer); resolve(m[1]); }
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.on("exit", (code) => reject(new Error(`server exited ${code}:\n${out}`)));
    });
    await new Promise((r) => setTimeout(r, 300));
    const first = await fetch(`http://127.0.0.1:${port}${line}`, { redirect: "manual" });
    assert.equal(first.status, 200);
    assert.match(first.headers.get("set-cookie") || "", /tts_auth=[A-Za-z0-9_-]{24,};.*HttpOnly/);
    assert.equal(first.headers.get("cache-control"), "no-store");
    const second = await fetch(`http://127.0.0.1:${port}${line}`);
    assert.equal(second.status, 410);
  } finally {
    child.kill();
  }
});
