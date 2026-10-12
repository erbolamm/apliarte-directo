process.env.NODE_ENV = 'test';
process.env.APLIARTE_TEST_DATA_DIR = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const SERVER_PATH = fileURLToPath(new URL('../server.js', import.meta.url));
const VPS_SERVER_PATH = fileURLToPath(new URL('../vps-overlay/server.js', import.meta.url));
const PLANO_PATH = fileURLToPath(new URL('../public/plano.html', import.meta.url));
const VPS_PLANO_PATH = fileURLToPath(new URL('../vps-overlay/public/plano.html', import.meta.url));

test('1. server.js y vps-overlay/server.js incluyen tts_estado en TIPOS_RETRANS_PERMITIDOS y on connection', () => {
  for (const [name, path] of [['Local', SERVER_PATH], ['VPS', VPS_SERVER_PATH]]) {
    const code = readFileSync(path, 'utf8');
    assert.match(code, /'tts_estado'/, `${name} debe contener tts_estado`);
    assert.match(code, /ws\.send\(JSON\.stringify\(\{\s*type:\s*'tts_estado'/, `${name} debe emitir tts_estado en on connection`);
    assert.match(code, /case 'tts_estado':/, `${name} debe manejar case 'tts_estado'`);
  }
});

test('2. public/plano.html y vps-overlay/public/plano.html escuchan chat_mensaje y actualizan tts_estado', () => {
  for (const [name, path] of [['Local', PLANO_PATH], ['VPS', VPS_PLANO_PATH]]) {
    const code = readFileSync(path, 'utf8');
    assert.match(code, /data\.type === 'chat_mensaje' && data\.texto/, `${name} debe escuchar chat_mensaje en wsOverlay.onmessage`);
    assert.match(code, /data\.type === 'tts_estado'/, `${name} debe escuchar tts_estado`);
    assert.match(code, /let ttsActivoEnOverlay\s*=\s*true;/, `${name} debe tener ttsActivoEnOverlay activo por defecto`);
    assert.match(code, /desbloquearAudioSiHaceFalta/, `${name} debe incluir desbloqueo de audio en navegadores`);
  }
});

async function arrancarServidorTest(dataDir) {
  const port = 27000 + Math.floor(Math.random() * 20000);
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
      const res = await fetch(base + '/api/directo/avatares');
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

test('3. WebSocket emite tts_estado en conexión inicial y sincroniza cambios entre clientes', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'apliarte-tts-ws-'));
  const srv = await arrancarServidorTest(dataDir);

  try {
    const ws1 = new WebSocket(srv.wsBase);
    const msgs1 = [];
    ws1.on('message', m => msgs1.push(JSON.parse(m.toString())));

    await new Promise((resolve, reject) => {
      ws1.once('open', resolve);
      ws1.once('error', reject);
    });

    // Esperar a recibir el evento tts_estado inicial
    for (let i = 0; i < 50; i++) {
      if (msgs1.some(m => m.type === 'tts_estado')) break;
      await new Promise(r => setTimeout(r, 50));
    }

    const ttsInicial = msgs1.find(m => m.type === 'tts_estado');
    assert.ok(ttsInicial, 'El cliente 1 debe recibir tts_estado al conectar');
    assert.equal(ttsInicial.activo, true, 'tts_estado.activo debe ser true por defecto');

    // Conectar un segundo cliente
    const ws2 = new WebSocket(srv.wsBase);
    const msgs2 = [];
    ws2.on('message', m => msgs2.push(JSON.parse(m.toString())));

    await new Promise((resolve, reject) => {
      ws2.once('open', resolve);
      ws2.once('error', reject);
    });

    // El cliente 1 envía un cambio de tts_estado (desactivar)
    ws1.send(JSON.stringify({ type: 'tts_estado', activo: false, velocidad: 1.25, preservePitch: true }));

    // Esperar a que el cliente 2 reciba la retransmisión
    for (let i = 0; i < 50; i++) {
      if (msgs2.some(m => m.type === 'tts_estado' && m.activo === false)) break;
      await new Promise(r => setTimeout(r, 50));
    }

    const ttsActualizado = msgs2.find(m => m.type === 'tts_estado' && m.activo === false);
    assert.ok(ttsActualizado, 'El cliente 2 debe recibir la retransmisión de tts_estado desactivado');
    assert.equal(ttsActualizado.velocidad, 1.25);
    assert.equal(ttsActualizado.preservePitch, true);

    // Conectar un tercer cliente y verificar que recibe el estado actualizado
    const ws3 = new WebSocket(srv.wsBase);
    const msgs3 = [];
    ws3.on('message', m => msgs3.push(JSON.parse(m.toString())));

    await new Promise((resolve, reject) => {
      ws3.once('open', resolve);
      ws3.once('error', reject);
    });

    for (let i = 0; i < 50; i++) {
      if (msgs3.some(m => m.type === 'tts_estado')) break;
      await new Promise(r => setTimeout(r, 50));
    }

    const ttsTercero = msgs3.find(m => m.type === 'tts_estado');
    assert.ok(ttsTercero, 'El cliente 3 debe recibir el estado persistido');
    assert.equal(ttsTercero.activo, false, 'El cliente 3 recibe el estado modificado (activo: false)');

    ws1.close();
    ws2.close();
    ws3.close();
  } finally {
    await srv.parar();
  }
});

test('4. plano.html y vps-overlay nunca descartan audio de avatares adoptados en modo transparente', () => {
  for (const [name, path] of [['Local', PLANO_PATH], ['VPS', VPS_PLANO_PATH]]) {
    const code = readFileSync(path, 'utf8');
    assert.match(
      code,
      /if\s*\(!ttsActivoEnOverlay\s*&&\s*initialTransparent\)\s*\{\s*if\s*\(!item\.forzarVozLimpia\s*&&\s*!item\.agente\)/,
      `${name} debe exigir !item.agente para descartar audio (los avatares siempre suenan)`
    );
  }
});

test('5. FloorPlan.tsx muestra solo @owner al adoptar un avatar, sin el nombre del agente', () => {
  const floorPlanPath = fileURLToPath(new URL('../oficina-3d/src/components/FloorPlan.tsx', import.meta.url));
  const code = readFileSync(floorPlanPath, 'utf8');
  // En 2D (AgentPillTag)
  assert.match(
    code,
    /name=\{\(r\.id !== 'ja' && effectiveOwners\[r\.id\]\) \? `@\$\{effectiveOwners\[r\.id\]\}` : a\.name\}/,
    'AgentPillTag debe mostrar exclusivamente @owner al adoptar'
  );
  // En 3D (person-name)
  assert.match(
    code,
    /\{\(r\.id !== 'ja' && effectiveOwners\[r\.id\]\) \? `@\$\{effectiveOwners\[r\.id\]\}` : a\.name\}/,
    'person-name en 3D debe mostrar exclusivamente @owner al adoptar'
  );
  // Verificar que el formato antiguo no esté presente
  assert.doesNotMatch(
    code,
    /effectiveOwners\[r\.id\] \? `\$\{a\.name\} · @\$\{effectiveOwners\[r\.id\]\}` : a\.name/,
    'No debe existir el formato antiguo a.name · @owner en AgentPillTag'
  );
});

test('6. plano.html incluye watchdog maestro para evitar bloqueo permanente del chat tras una raid', () => {
  for (const [name, path] of [['Local', PLANO_PATH], ['VPS', VPS_PLANO_PATH]]) {
    const code = readFileSync(path, 'utf8');
    assert.match(code, /armarWatchdogSeguridadRaid/, `${name} debe definir armarWatchdogSeguridadRaid`);
    assert.match(code, /mostrarAvisoRaid[\s\S]*?armarWatchdogSeguridadRaid/, `${name} debe armar el watchdog en mostrarAvisoRaid`);
    assert.match(code, /iniciarSecuenciaRaidBienvenida[\s\S]*?armarWatchdogSeguridadRaid/, `${name} debe armar el watchdog en iniciarSecuenciaRaidBienvenida`);
  }
});

