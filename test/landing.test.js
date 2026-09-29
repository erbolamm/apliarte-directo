import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const landingHtmlPath = path.join(__dirname, '..', 'public', 'landing.html');
const rootLandingPath = path.join(__dirname, '..', 'landing.html');

test('Landing Page: public/landing.html and root landing.html exist and are readable', () => {
  assert.equal(fs.existsSync(landingHtmlPath), true, 'public/landing.html must exist');
  assert.equal(fs.existsSync(rootLandingPath), true, 'root landing.html must exist');
  const stat = fs.statSync(landingHtmlPath);
  assert.ok(stat.size > 2000, 'Landing page should contain complete markup');
});

test('Landing Page: language is Spanish and metadata matches ApliArte Directo', () => {
  const html = fs.readFileSync(landingHtmlPath, 'utf8');
  assert.match(html, /<html\s+lang="es"/i, 'Document language must be Spanish (audience of the project)');
  assert.match(html, /<title>ApliArte Directo/i, 'Title must feature ApliArte Directo');
  assert.match(html, /data-theme="light"/i, 'Brand Kit: Light mode by default');
});

test('Landing Page: incorporates official ApliArte Brand Kit colors and typography', () => {
  const html = fs.readFileSync(landingHtmlPath, 'utf8');
  // Brand colors
  assert.match(html, /#005fa9/i, 'Primary Blue token must be present');
  assert.match(html, /#5ecef5/i, 'Accent Cyan token must be present');
  assert.match(html, /#303030/i, 'Dark Charcoal token must be present');

  // Official fonts
  assert.match(html, /Fira Sans Condensed/i, 'Must use Fira Sans Condensed for titles');
  assert.match(html, /Inter/i, 'Must use Inter for UI/subtitles');
  assert.match(html, /Abel/i, 'Must use Abel for body');
});

test('Landing Page: includes theme switcher with persistent local storage', () => {
  const html = fs.readFileSync(landingHtmlPath, 'utf8');
  assert.match(html, /id="theme-toggle"/i, 'Theme toggle button must exist');
  assert.match(html, /localStorage\.setItem\('apliarte_theme'/i, 'Must persist theme preference');
});

test('Landing Page: install guide comes first and credits the author', () => {
  const html = fs.readFileSync(landingHtmlPath, 'utf8');
  // 2026-09-29: the landing leads with the easy install instead of feature claims.
  for (const seccion of [/Instálalo en 3 pasos/, /Conéctalo a OBS/, /Problemas frecuentes/]) {
    assert.match(html, seccion);
  }
  assert.ok(html.indexOf('Instálalo en 3 pasos') < html.indexOf('Conéctalo a OBS'), 'install steps first');
  assert.match(html, /Javier Mateo/i, 'Must credit Javier Mateo');
});

test('Landing Page: explains how to recover a forgotten panel password', () => {
  const html = fs.readFileSync(landingHtmlPath, 'utf8');
  assert.match(html, /¿Olvidaste la contraseña del panel\?/);
  assert.match(html, /data\/panel-auth\.json/);
});
