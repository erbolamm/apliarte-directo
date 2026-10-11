process.env.NODE_ENV = 'test';
process.env.APLIARTE_TEST_DATA_DIR = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const SERVER_PATH = fileURLToPath(new URL('../server.js', import.meta.url));

async function arrancarServidorTest(dataDir) {
  const port = 26000 + Math.floor(Math.random() * 20000);
  const pass = 'test-pass-' + Math.random().toString(36).slice(2);
  const child = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      PANEL_PASS: pass,
      NODE_ENV: 'production',
      TWITCH_CHAT_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  child.stdout.on('data', d => { salida += d; });
  child.stderr.on('data', d => { salida += d; });
  const base = `http://127.0.0.1:${port}`;
  const wsBase = `ws://127.0.0.1:${port}/ws?token=${pass}`;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('server exited:\n' + salida);
    try {
      const res = await fetch(base + '/api/directo/chat/historial');
      if (res.status === 200) break;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  const parar = () => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill();
  });
  return { base, wsBase, pass, port, parar, salida: () => salida };
}

test('1. Buffer en memoria circular (MAX_CHAT_HISTORIAL = 100)', async () => {
  const { chatHistorial, agregarAlHistorialChat, MAX_CHAT_HISTORIAL } = await import('../server.js');
  assert.equal(MAX_CHAT_HISTORIAL, 100);
  assert.ok(Array.isArray(chatHistorial));
  assert.equal(typeof agregarAlHistorialChat, 'function');

  // Guardar longitud previa
  const lenInicial = chatHistorial.length;

  // Insertar un mensaje de prueba
  const testMsg = {
    id: 'tw_test_' + Date.now(),
    type: 'chat_mensaje',
    plataforma: 'twitch',
    usuario: 'espectador_test',
    nombreVisible: 'EspectadorTest',
    texto: '¡Hola chat!',
    avatar: null,
    color: '#00ffcc',
    timestamp: Date.now()
  };
  agregarAlHistorialChat(testMsg);
  assert.ok(chatHistorial.includes(testMsg));

  // Verificar que respeta el límite de 100
  for (let i = 0; i < 120; i++) {
    agregarAlHistorialChat({
      id: 'msg_' + i,
      type: 'chat_mensaje',
      plataforma: 'youtube',
      usuario: 'user_' + i,
      nombreVisible: 'User ' + i,
      texto: 'Mensaje ' + i,
      avatar: null,
      color: '#ff0033',
      timestamp: Date.now() + i
    });
  }
  assert.equal(chatHistorial.length, 100);
  assert.equal(chatHistorial[chatHistorial.length - 1].id, 'msg_119');
});

test('2. Endpoint GET /api/directo/chat/historial y restricciones HTTP', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'historial-test-'));
  const srv = await arrancarServidorTest(dir);
  try {
    // GET público
    const res = await fetch(srv.base + '/api/directo/chat/historial');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(typeof data.total, 'number');
    assert.ok(Array.isArray(data.mensajes));
    assert.equal(data.total, data.mensajes.length);

    // POST no permitido (405)
    const postRes = await fetch(srv.base + '/api/directo/chat/historial', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' }
    });
    assert.equal(postRes.status, 405);
  } finally {
    await srv.parar();
  }
});

test('3. WebSocket envía chat_historial en el handshake de conexión', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'historial-ws-test-'));
  const srv = await arrancarServidorTest(dir);
  try {
    const ws = new WebSocket(srv.wsBase);
    const mensajesRecibidos = [];

    const historialPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout esperando chat_historial. Mensajes recibidos: ' + JSON.stringify(mensajesRecibidos)));
      }, 5000);

      ws.on('message', data => {
        try {
          const parsed = JSON.parse(data.toString());
          mensajesRecibidos.push(parsed);
          if (parsed && parsed.type === 'chat_historial') {
            clearTimeout(timeout);
            resolve(parsed);
          }
        } catch (_) {}
      });

      ws.on('error', err => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    await new Promise((resolve, reject) => {
      if (ws.readyState === 1) return resolve();
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    const historialMsg = await historialPromise;
    assert.ok(historialMsg, 'Debe recibir mensaje de tipo chat_historial al conectar');
    assert.ok(Array.isArray(historialMsg.mensajes), 'chat_historial debe contener array de mensajes');

    ws.close();
  } finally {
    await srv.parar();
  }
});

test('4. Lógica de desduplicación de chat en UI (agregarMensajeTwitchFeed)', () => {
  const chatMensajesTwitch = [];

  function simularAgregarMensajeTwitchFeed(msg) {
    if (!msg || !msg.texto) return false;
    const yaExiste = chatMensajesTwitch.some(m => {
      if (msg.id && m.id && m.id === msg.id) return true;
      return m.usuario === msg.usuario &&
             m.texto === msg.texto &&
             Math.abs((m.timestamp || 0) - (msg.timestamp || 0)) < 2000;
    });
    if (yaExiste) return false;

    chatMensajesTwitch.push(msg);
    if (chatMensajesTwitch.length > 100) chatMensajesTwitch.shift();
    return true;
  }

  const m1 = { id: 'tw_123', usuario: 'pepe', texto: 'hola!', timestamp: 1000 };
  assert.equal(simularAgregarMensajeTwitchFeed(m1), true, 'Primer mensaje insertado');

  // Duplicado por id
  const m1DupId = { id: 'tw_123', usuario: 'pepe', texto: 'hola!', timestamp: 1000 };
  assert.equal(simularAgregarMensajeTwitchFeed(m1DupId), false, 'Duplicado por id descartado');

  // Duplicado sin id pero mismo usuario, texto y timestamp cercano (<2000ms)
  const m1DupContent = { usuario: 'pepe', texto: 'hola!', timestamp: 1500 };
  assert.equal(simularAgregarMensajeTwitchFeed(m1DupContent), false, 'Duplicado por contenido descartado');

  // Mismo contenido pero timestamp lejano (>=2000ms)
  const m1Tarde = { usuario: 'pepe', texto: 'hola!', timestamp: 4000 };
  assert.equal(simularAgregarMensajeTwitchFeed(m1Tarde), true, 'Mismo texto pero tiempo posterior permitido');

  // Distinto usuario
  const m2 = { id: 'tw_124', usuario: 'maria', texto: 'hola!', timestamp: 1000 };
  assert.equal(simularAgregarMensajeTwitchFeed(m2), true, 'Distinto usuario permitido');
});

test('5. Integración y paridad en archivos del sistema', () => {
  const wsAuth = readFileSync(new URL('../src/ws-auth.js', import.meta.url), 'utf8');
  const vpsWsAuth = readFileSync(new URL('../vps-overlay/src/ws-auth.js', import.meta.url), 'utf8');
  const serverCode = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const estudioHtml = readFileSync(new URL('../public/estudio.html', import.meta.url), 'utf8');

  // Paridad estricta ws-auth
  assert.equal(wsAuth, vpsWsAuth, 'src/ws-auth.js y vps-overlay/src/ws-auth.js deben ser 100% idénticos');
  assert.match(wsAuth, /'chat_historial'/, 'ws-auth.js debe contener chat_historial en PUBLIC_EVENTS');

  // server.js
  assert.match(serverCode, /const MAX_CHAT_HISTORIAL = 100;/, 'server.js define MAX_CHAT_HISTORIAL');
  assert.match(serverCode, /agregarAlHistorialChat/, 'server.js define agregarAlHistorialChat');
  assert.match(serverCode, /\/api\/directo\/chat\/historial/, 'server.js define ruta GET /api/directo/chat/historial');
  assert.match(serverCode, /canReceive\(ws\.rol, 'chat_historial'\)/, 'server.js valida canReceive para chat_historial');

  // public/estudio.html
  assert.match(estudioHtml, /data\.type === 'chat_historial'/, 'estudio.html gestiona chat_historial');
  assert.match(estudioHtml, /btn-ojo-pantalla/, 'estudio.html renderiza botón del ojo');
  assert.match(estudioHtml, /toggleMostrarEnPantalla/, 'estudio.html conecta botón del ojo a toggleMostrarEnPantalla');
});
