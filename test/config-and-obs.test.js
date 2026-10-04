import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const {
  loadAppConfig,
  saveAppConfig,
  maskSecret,
  resolveDataDir,
  getObsUrls,
  isAuth
} = require('../server.js');

test('maskSecret oculta cadenas sensibles adecuadamente', () => {
  assert.equal(maskSecret(''), '');
  assert.equal(maskSecret(null), '');
  assert.equal(maskSecret('12345678'), '••••••••');
  assert.equal(maskSecret('super_secret_token_oauth_123'), 'sup••••••••123');
});

test('resolveDataDir selecciona ruta válida y consistente', () => {
  const dir = resolveDataDir();
  assert.ok(typeof dir === 'string' && dir.length > 0);
  assert.ok(fs.existsSync(dir));
});

test('loadAppConfig y saveAppConfig gestionan configuracion y permisos 0o600', () => {
  const dataDir = resolveDataDir();
  const testConfigFile = path.join(dataDir, 'config.json');

  const initial = loadAppConfig();
  assert.ok(initial.vdo);
  assert.ok(initial.twitch);
  assert.ok(initial.openai);

  try {
    // Guardar configuración de prueba
    const saved = saveAppConfig({
      vdo: { room: 'sala-test-123' },
      twitch: { canal: 'canaltest' },
      openai: { apiKey: 'sk-test-secret-key-456' }
    });

    assert.equal(saved.vdo.room, 'sala-test-123');
    assert.equal(saved.twitch.canal, 'canaltest');
    assert.equal(saved.openai.apiKey, 'sk-test-secret-key-456');

    // Verificar que el archivo existe con permisos seguros
    assert.ok(fs.existsSync(testConfigFile));
    const stats = fs.statSync(testConfigFile);
    // En sistemas POSIX los permisos deben ser 0o600 (lectura y escritura solo para el dueño)
    const mode = stats.mode & 0o777;
    assert.equal(mode, 0o600);

    // Al guardar de nuevo con un token enmascarado, no debe sobreescribir con los puntos
    const reSaved = saveAppConfig({
      openai: { apiKey: 'sk-••••••••456' }
    });
    assert.equal(reSaved.openai.apiKey, 'sk-test-secret-key-456');
  } finally {
    saveAppConfig(initial);
  }
});

test('getObsUrls genera URLs completas de fuentes OBS Studio según la petición', () => {
  const mockReqLocal = {
    headers: { host: 'localhost:7979' },
    socket: { encrypted: false }
  };
  const cfg = {
    vdo: { room: 'apliarte-obs', camStreamId: 'ja_cam_77', password: 'mypassword' }
  };
  const urlsLocal = getObsUrls(mockReqLocal, cfg);
  assert.equal(urlsLocal.fondo, 'http://localhost:7979/fondo.html');
  assert.equal(urlsLocal.chat, 'http://localhost:7979/chat.html');
  assert.equal(urlsLocal.plano, 'http://localhost:7979/plano?transparente=1');
  assert.ok(urlsLocal.vdoCamPush.includes('https://vdo.ninja/?push=ja_cam_77&room=apliarte-obs&password=mypassword'));
  assert.ok(urlsLocal.vdoCamView.includes('https://vdo.ninja/?view=ja_cam_77&room=apliarte-obs&password=mypassword'));

  // Petición con proxy inverso HTTPS (ej. Tailscale Serve o VPS)
  const mockReqProxy = {
    headers: {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'directo.apliarte.com'
    },
    socket: {}
  };
  const urlsProxy = getObsUrls(mockReqProxy, cfg);
  assert.equal(urlsProxy.fondo, 'https://directo.apliarte.com/fondo.html');
  assert.equal(urlsProxy.chat, 'https://directo.apliarte.com/chat.html');
  assert.equal(urlsProxy.plano, 'https://directo.apliarte.com/plano?transparente=1');
});

test('DEFAULT_LAYERS usa plantilla saneada e idéntica en servidor local y VPS', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const vps = fs.readFileSync(path.join(__dirname, '..', 'vps-overlay/server.js'), 'utf8');
  const extract = source => {
    const start = source.indexOf('// ── Capas por defecto');
    const end = source.indexOf('// ── Estado din', start);
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end);
  };
  const defaults = extract(main);
  assert.equal(extract(vps), defaults);
  assert.match(defaults, /sample-overlay-id/);
  assert.match(defaults, /sample-kofi-id/);
  assert.match(defaults, /sample-soundalert-id/);
  assert.match(defaults, /passQueryCamDef/);
  assert.doesNotMatch(defaults, /password=[^$\s]/);
});

test('/api/directo/camara/config exige autenticación estricta', () => {
  const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const camEndpointMatch = serverCode.match(/if\s*\(\s*path\s*===\s*'\/api\/directo\/camara\/config'[\s\S]+?\{([\s\S]+?)\}/);
  assert.ok(camEndpointMatch, 'El endpoint debe estar definido');
  assert.ok(camEndpointMatch[1].includes('!isAuth(req)'), 'Debe exigir isAuth(req) antes de devolver datos');
  assert.ok(camEndpointMatch[1].includes('401'), 'Debe responder con 401 si no está autenticado');
});

