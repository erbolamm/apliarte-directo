// Guard: the suite must run with a temporary DATA_DIR, never the repo's data folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

test("las pruebas usan una carpeta de datos temporal", () => {
  const real = resolve(fileURLToPath(new URL("../data", import.meta.url)));
  assert.ok(process.env.DATA_DIR, "run the suite with npm test (scripts/run-tests.mjs)");
  assert.notEqual(resolve(process.env.DATA_DIR), real);
  assert.equal(process.env.DATA_DIR, process.env.APLIARTE_TEST_DATA_DIR);
});
