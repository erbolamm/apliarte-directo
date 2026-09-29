// The restream centre's RTMP ingest listened on every interface (bind undefined),
// so any device on the home network could push video to Javier's channels.
// It now binds to loopback unless RTMP_BIND says otherwise (2026-09-29).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("RTMP ingest binds to 127.0.0.1 by default", () => {
  const src = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  const cfg = src.slice(src.indexOf("new NodeMediaServer({"), src.indexOf("new NodeMediaServer({") + 300);
  assert.match(cfg, /bind: process\.env\.RTMP_BIND \|\| "127\.0\.0\.1"/);
});
