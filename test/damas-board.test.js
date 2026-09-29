// !damas turns the whole office floor into a 12x8 board without furniture or inner
// walls (Javier, 2026-09-29). Squares are named like chess: columns a-l from the
// left, rows 1-8 from the bottom (a1 = bottom-left). These tests compile the real
// TypeScript sources of the 3D office and exercise their behaviour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuildPath = fileURLToPath(new URL("../oficina-3d/node_modules/esbuild", import.meta.url));
const hasEsbuild = existsSync(esbuildPath);
const skip = hasEsbuild ? false : "run `npm install` in oficina-3d/ to test the 3D office sources";

async function load(relPath) {
  const esbuild = require(esbuildPath);
  const out = await esbuild.build({
    entryPoints: [fileURLToPath(new URL(relPath, import.meta.url))],
    bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent",
  });
  return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
}

test("parseSquare reads chess-style names and rejects anything off the board", { skip }, async () => {
  const g = await load("../oficina-3d/src/office/geometry.ts");
  assert.deepEqual(g.parseSquare("a1"), { col: 0, row: 1 });
  assert.deepEqual(g.parseSquare("L8"), { col: 11, row: 8 });
  for (const bad of ["m1", "a0", "a9", "a", "11", "aa1", ""]) assert.equal(g.parseSquare(bad), null, bad);
});

test("a1 is bottom-left, l8 top-right, and squares are the same size", { skip }, async () => {
  const g = await load("../oficina-3d/src/office/geometry.ts");
  const a1 = g.squareCenter(0, 1), l8 = g.squareCenter(11, 8), b1 = g.squareCenter(1, 1), a2 = g.squareCenter(0, 2);
  assert.ok(a1.x < l8.x && a1.y > l8.y, "a1 must be left of and below l8");
  assert.equal(b1.x - a1.x, g.BOARD.cell);
  assert.equal(a1.y - a2.y, g.BOARD.cell);
  assert.equal(g.BOARD.cols, 12);
  assert.equal(g.BOARD.rows, 8);
  g.setBoardMode(true);
  for (const p of [a1, l8]) assert.ok(g.isFree(p), "board corners must be walkable on the board");
  g.setBoardMode(false);
});

test("board mode removes furniture and inner walls from collisions and restores them", { skip }, async () => {
  const g = await load("../oficina-3d/src/office/geometry.ts");
  // Straight line across the work room desks and the central wall.
  const from = g.squareCenter(0, 2), to = g.squareCenter(11, 2);
  assert.equal(g.segmentFree(from, to), false, "furniture and walls block the office");
  g.setBoardMode(true);
  assert.equal(g.isBoardMode(), true);
  assert.equal(g.segmentFree(from, to), true, "the board has no obstacles inside");
  assert.deepEqual(g.navigate(from, to), [from, to]);
  g.setBoardMode(false);
  assert.equal(g.segmentFree(from, to), false, "leaving board mode restores the office");
});

test("on the board avatars go to a square and stay; leaving the board sends them home", { skip }, async () => {
  const g = await load("../oficina-3d/src/office/geometry.ts");
  const { OfficeRuntime } = await load("../oficina-3d/src/office/runtime.ts");
  const rt = new OfficeRuntime();
  rt.setBoard(true, 0);
  assert.equal(rt.goToSquare("co", "c3", 0), true);
  const co = rt.people.find((p) => p.id === "co");
  const target = g.squareCenter(2, 3);
  assert.deepEqual(co.target, target);
  for (let t = 1; t <= 120; t++) rt.tick(t * 1000, 1); // two minutes later it is still there
  assert.deepEqual(co.pos, target);
  assert.equal(rt.goToSquare("co", "z9", 0), false, "invalid square");
  rt.setBoard(false, 200000);
  assert.equal(co.manualUntil, 0, "leaving the board releases manual control");
  assert.equal(g.isFree(co.pos), true, "avatars never end up inside restored furniture");
  assert.equal(rt.goToSquare("co", "c3", 0), false, "squares only work on the board");
});

test("board labels sit outside the board, in black, with the top wall moved back", { skip }, async () => {
  const g = await load("../oficina-3d/src/office/geometry.ts");
  const top = g.BOARD_WALLS.find((w) => w.w > 1000 && w.y < g.BOARD.y);
  assert.ok(top.y + top.d <= g.BOARD.y - g.BOARD.frame, "top wall must leave room for the letters");
  const css = readFileSync(new URL("../oficina-3d/src/interface.css", import.meta.url), "utf8");
  assert.match(css, /\.damas-label\{[^}]*color:#111/);
  assert.match(css, /\.damas-col\{top:-/);
  assert.match(css, /\.damas-row\{left:-/);
  const plan = readFileSync(new URL("../oficina-3d/src/components/FloorPlan.tsx", import.meta.url), "utf8");
  assert.match(plan, /BOARD\.y - BOARD\.frame \/ 2/);
  assert.match(plan, /fill="#111"/);
});
