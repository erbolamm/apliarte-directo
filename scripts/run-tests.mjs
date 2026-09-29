#!/usr/bin/env node
// Runs the test suite with a throwaway DATA_DIR so tests can never write into the
// streamer's real data folder (a test once overwrote data/config.json, 2026-09-29).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'apliarte-directo-tests-'));
const args = process.argv.slice(2);
const files = args.length ? args : ['test/', 'temas/test/'];
const r = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  env: { ...process.env, DATA_DIR: dataDir, APLIARTE_TEST_DATA_DIR: dataDir },
});
rmSync(dataDir, { recursive: true, force: true });
process.exit(r.status ?? 1);
