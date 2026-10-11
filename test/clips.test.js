import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVER_LOCAL = fileURLToPath(new URL('../server.js', import.meta.url));
const SERVER_VPS = fileURLToPath(new URL('../vps-overlay/server.js', import.meta.url));

async function arrancarServidor(scriptPath, dataDir, extraEnv = {}) {
  const port = 26000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      PANEL_PASS: 'test-panel-pass',
      NODE_ENV: 'production',
      TWITCH_CHAT_TOKEN: '',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let salida = '';
  child.stdout.on('data', d => { salida += d; });
  child.stderr.on('data', d => { salida += d; });
  const base = `http://127.0.0.1:${port}`;

  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) {
      throw new Error(`Servidor ${scriptPath} terminó prematuramente:\n${salida}`);
    }
    try {
      const res = await fetch(`${base}/api/directo/clips`);
      if (res.status === 200) break;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }

  const parar = () => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill();
  });

  return { base, parar, salida: () => salida };
}

test('Overlay Twitch clips: archivos públicos existen y mantienen paridad 1:1 VPS', () => {
  const localPath = join(process.cwd(), 'public', 'clips.html');
  const vpsPath = join(process.cwd(), 'vps-overlay', 'public', 'clips.html');

  assert.ok(existsSync(localPath), 'public/clips.html debe existir');
  assert.ok(existsSync(vpsPath), 'vps-overlay/public/clips.html debe existir');

  const localContent = readFileSync(localPath, 'utf8');
  const vpsContent = readFileSync(vpsPath, 'utf8');

  // Paridad byte a byte
  assert.equal(localContent, vpsContent, 'public/clips.html y vps-overlay/public/clips.html deben ser idénticos');

  // Estructura DOM requerida
  assert.match(localContent, /id="clip-container"/, 'Debe contener #clip-container');
  assert.match(localContent, /id="clip-video"/, 'Debe contener #clip-video');
  assert.match(localContent, /id="clip-frame"/, 'Debe contener #clip-frame');
  assert.match(localContent, /id="clip-progress"/, 'Debe contener #clip-progress');
  assert.match(localContent, /id="clip-badge"/, 'Debe contener #clip-badge');
  assert.match(localContent, /id="clip-title"/, 'Debe contener #clip-title');
  assert.match(localContent, /id="clip-creator"/, 'Debe contener #clip-creator');
  assert.match(localContent, /id="clip-counter"/, 'Debe contener #clip-counter');

  // Parámetros URL soportados
  assert.match(localContent, /params\.get\('aleatorio'\)/, 'Soporta parámetro aleatorio');
  assert.match(localContent, /params\.get\('random'\)/, 'Soporta parámetro random');
  assert.match(localContent, /params\.get\('channel'\)/, 'Soporta parámetro channel');
  assert.match(localContent, /params\.getAll\('parent'\)/, 'Soporta parámetro parent múltiple');
  assert.match(localContent, /params\.get\('muted'\)/, 'Soporta parámetro muted');
  assert.match(localContent, /params\.get\('duration'\)/, 'Soporta duración fija opcional');
  assert.match(localContent, /params\.get\('badge'\)/, 'Soporta control de visibilidad del badge');

  // Atajos de teclado para producción / depuración
  assert.match(localContent, /e\.code === 'Space'/, 'Espacio para avanzar al siguiente clip');
  assert.match(localContent, /e\.key === 'm'/, 'M para silenciar/activar audio');
  assert.match(localContent, /e\.key === 'r'/, 'R para recargar clips');

  // WebSocket reactivo ante clips_actualizados
  assert.match(localContent, /clips_actualizados/, 'Escucha evento clips_actualizados vía WebSocket');

  // URL Twitch embed segura
  assert.match(localContent, /https:\/\/clips\.twitch\.tv\/embed/, 'Usa iframe embed oficial de Twitch');
  assert.match(localContent, /autoplay=true/, 'Activa reproducción automática');
});

test('server.js: Rutas estáticas y endpoints REST de clips (/clips, /api/directo/clips)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'clips-test-local-'));
  const srv = await arrancarServidor(SERVER_LOCAL, dir);

  try {
    // 1. Ruta estática /clips y /clips.html
    const resStatic1 = await fetch(`${srv.base}/clips`);
    assert.equal(resStatic1.status, 200);
    assert.match(resStatic1.headers.get('content-type') || '', /text\/html/);
    const html1 = await resStatic1.text();
    assert.match(html1, /id="clip-container"/);

    const resStatic2 = await fetch(`${srv.base}/clips.html`);
    assert.equal(resStatic2.status, 200);

    // 2. GET /api/directo/clips inicial con valores por defecto
    const resGet = await fetch(`${srv.base}/api/directo/clips`);
    assert.equal(resGet.status, 200);
    assert.equal(resGet.headers.get('access-control-allow-origin'), '*');
    const dataGet = await resGet.json();
    assert.equal(dataGet.ok, true);
    assert.ok(dataGet.total >= 2);
    assert.ok(Array.isArray(dataGet.clips));
    assert.ok(dataGet.clips[0].slug);
    assert.ok(dataGet.clips[0].duration > 0);

    // 3. GET /api/directo/clips?aleatorio=1
    const resRandom = await fetch(`${srv.base}/api/directo/clips?aleatorio=1`);
    assert.equal(resRandom.status, 200);
    const dataRandom = await resRandom.json();
    assert.equal(dataRandom.ok, true);
    assert.equal(dataRandom.total, dataGet.total);

    // 4. OPTIONS preflight
    const resOptions = await fetch(`${srv.base}/api/directo/clips`, { method: 'OPTIONS' });
    assert.equal(resOptions.status, 204);

    // 5. POST /api/directo/clips para actualizar lista completa con normalización de URLs
    const nuevosClips = [
      'https://clips.twitch.tv/FaintResoluteLouseBudBlast-t_4r01Z9q7s6-a1c',
      'https://www.twitch.tv/apliarte/clip/TenderAntsyCaterpillarPupper-Zc0r29-sample?filter=clips',
      {
        id: 'CustomClip123',
        slug: 'CustomClip123',
        title: 'Clip personalizado de prueba',
        creator_name: 'testuser',
        duration: 45
      }
    ];

    const resPost = await fetch(`${srv.base}/api/directo/clips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clips: nuevosClips, canal: 'apliarte_test' })
    });
    assert.equal(resPost.status, 200);
    const dataPost = await resPost.json();
    assert.equal(dataPost.ok, true);
    assert.equal(dataPost.total, 3);
    assert.equal(dataPost.clips[0].slug, 'FaintResoluteLouseBudBlast-t_4r01Z9q7s6-a1c');
    assert.equal(dataPost.clips[1].slug, 'TenderAntsyCaterpillarPupper-Zc0r29-sample');
    assert.equal(dataPost.clips[2].slug, 'CustomClip123');
    assert.equal(dataPost.clips[2].duration, 45);

    // 6. POST /api/directo/clips para agregar un solo clip
    const resAddOne = await fetch(`${srv.base}/api/directo/clips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clip: 'https://clips.twitch.tv/SingleAddedClipSlug' })
    });
    assert.equal(resAddOne.status, 200);
    const dataAddOne = await resAddOne.json();
    assert.equal(dataAddOne.ok, true);
    assert.equal(dataAddOne.total, 4);

    // 7. GET /api/directo/clips verifica persistencia
    const resVerify = await fetch(`${srv.base}/api/directo/clips`);
    const dataVerify = await resVerify.json();
    assert.equal(dataVerify.canal, 'apliarte_test');
    assert.equal(dataVerify.total, 4);

    // 8. POST /api/directo/clips/sync sin token configurado devuelve aviso controlado
    const resSync = await fetch(`${srv.base}/api/directo/clips/sync`, { method: 'POST' });
    assert.equal(resSync.status, 200);
    const dataSync = await resSync.json();
    assert.equal(dataSync.ok, false);
    assert.match(dataSync.error, /Token de Twitch no configurado/);
    assert.ok(Array.isArray(dataSync.clips));

    // 9. GET /api/directo/clips/mp4 endpoint
    const resMp4Bad = await fetch(`${srv.base}/api/directo/clips/mp4`);
    assert.equal(resMp4Bad.status, 400);
    const resMp4None = await fetch(`${srv.base}/api/directo/clips/mp4?slug=Inexistente`);
    assert.equal(resMp4None.status, 404);
  } finally {
    await srv.parar();
  }
});

test('vps-overlay/server.js: Rutas estáticas y endpoints REST de clips en VPS', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'clips-test-vps-'));
  const srv = await arrancarServidor(SERVER_VPS, dir);

  try {
    // 1. Ruta estática /clips
    const resStatic = await fetch(`${srv.base}/clips`);
    assert.equal(resStatic.status, 200);
    assert.match(resStatic.headers.get('content-type') || '', /text\/html/);

    // 2. GET /api/directo/clips
    const resGet = await fetch(`${srv.base}/api/directo/clips`);
    assert.equal(resGet.status, 200);
    const dataGet = await resGet.json();
    assert.equal(dataGet.ok, true);
    assert.ok(dataGet.total >= 2);

    // 3. POST /api/directo/clips
    const resPost = await fetch(`${srv.base}/api/directo/clips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clips: [
          'https://clips.twitch.tv/VpsTestClip1',
          { slug: 'VpsTestClip2', title: 'VPS Clip 2', duration: 25 }
        ]
      })
    });
    assert.equal(resPost.status, 200);
    const dataPost = await resPost.json();
    assert.equal(dataPost.ok, true);
    assert.equal(dataPost.total, 2);
    assert.equal(dataPost.clips[0].slug, 'VpsTestClip1');
    assert.equal(dataPost.clips[1].slug, 'VpsTestClip2');
    assert.equal(dataPost.clips[1].duration, 25);

    // 4. POST /api/directo/clips/sync sin token
    const resSync = await fetch(`${srv.base}/api/directo/clips/sync`, { method: 'POST' });
    assert.equal(resSync.status, 200);
    const dataSync = await resSync.json();
    assert.equal(dataSync.ok, false);
    assert.match(dataSync.error, /Token de Twitch no configurado/);

    // 5. GET /api/directo/clips/mp4 en VPS
    const resMp4Bad = await fetch(`${srv.base}/api/directo/clips/mp4`);
    assert.equal(resMp4Bad.status, 400);
  } finally {
    await srv.parar();
  }
});
