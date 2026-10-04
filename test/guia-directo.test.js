import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const guiaLocalPath = path.join(__dirname, '..', 'public', 'guia-directo.html');
const guiaVpsPath = path.join(__dirname, '..', 'vps-overlay', 'public', 'guia-directo.html');

test('Guía del Directo: public/guia-directo.html existe y es autosuficiente', () => {
  assert.equal(fs.existsSync(guiaLocalPath), true, 'public/guia-directo.html debe existir');
  const content = fs.readFileSync(guiaLocalPath, 'utf8');
  assert.ok(content.length > 5000, 'El archivo debe contener el documento completo');
  // Estilo embebido autosuficiente (sin dependencias CSS externas locales que rompan en Blogger)
  assert.match(content, /<style>[\s\S]*<\/style>/i, 'Debe tener estilos CSS embebidos para funcionar en Blogger');
  // No scripts remotos no verificados
  assert.ok(!content.includes('<script src="http'), 'No debe cargar scripts JS externos arbitrarios');
});

test('Guía del Directo: paridad exacta entre public/ y vps-overlay/public/', () => {
  assert.equal(fs.existsSync(guiaVpsPath), true, 'vps-overlay/public/guia-directo.html debe existir');
  const local = fs.readFileSync(guiaLocalPath, 'utf8');
  const vps = fs.readFileSync(guiaVpsPath, 'utf8');
  assert.equal(vps, local, 'La versión de vps-overlay debe ser idéntica a la versión de public');
});

test('Guía del Directo: metadatos Schema.org y Web MCP ItemList válidos', () => {
  const content = fs.readFileSync(guiaLocalPath, 'utf8');
  const jsonLdMatch = content.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch, 'Debe incluir bloque <script type="application/ld+json">');

  const jsonLd = JSON.parse(jsonLdMatch[1]);
  assert.ok(jsonLd['@graph'], 'Debe contener grafo Schema.org');

  const itemList = jsonLd['@graph'].find(item => item['@type'] === 'ItemList');
  assert.ok(itemList, 'Debe incluir un ItemList de comandos para indexación y MCP');
  assert.ok(itemList.itemListElement.length >= 10, 'Debe listar al menos 10 comandos canónicos en el ItemList');
});

test('Guía del Directo: explicita la regla fundamental de votación en minijuegos (avatar asignado)', () => {
  const content = fs.readFileSync(guiaLocalPath, 'utf8');
  // Debe explicitar que solo pueden votar quienes tengan avatar asignado
  assert.match(
    content,
    /SOLO pueden votar los usuarios del chat que tengan un avatar asignado/i,
    'Debe explicitar claramente la regla de votación para minijuegos'
  );
  assert.match(content, /!traidor/, 'Debe explicar el minijuego del traidor');
  assert.match(content, /!trofeo/, 'Debe explicar la carrera por la copa');
});

test('Guía del Directo: documenta todos los comandos públicos y del streamer', () => {
  const content = fs.readFileSync(guiaLocalPath, 'utf8');

  // Comandos de espectadores
  const publicCommands = [
    '!conga',
    '!trabajar',
    '!libre',
    '!reset',
    '!salta',
    '!beso',
    '!liberar',
    '!sms',
    '!speak',
    '!info',
    '!redes',
    '!repo',
    '!cafecito'
  ];

  for (const cmd of publicCommands) {
    assert.ok(content.includes(cmd), `Debe contener el comando público ${cmd}`);
  }

  // Comandos de movimiento
  assert.ok(content.includes('!w') && content.includes('!a') && content.includes('!s') && content.includes('!d'));

  // Comandos del streamer (Javier)
  const streamerCommands = [
    '!bronca',
    '!fiesta',
    '!liberar todos',
    '!juego',
    '!trofeo',
    '!traidor',
    '!tema',
    '!claro',
    '!oscuro'
  ];

  for (const cmd of streamerCommands) {
    assert.ok(content.includes(cmd), `Debe contener el comando del streamer ${cmd}`);
  }
});

test('Guía del Directo: rutas limpias registradas en server.js', () => {
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverJs, /path === '\/guia' \|\| path === '\/guia\.html' \|\| path === '\/guia-directo'/);

  const vpsServerJs = fs.readFileSync(path.join(__dirname, '..', 'vps-overlay', 'server.js'), 'utf8');
  assert.match(vpsServerJs, /path === '\/guia' \|\| path === '\/guia\.html' \|\| path === '\/guia-directo'/);
});
