import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));

async function arrancar(dataDir) {
  const port = 25000 + Math.floor(Math.random() * 25000);
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      PANEL_PASS: 'test-only-pass',
      NODE_ENV: 'production',
      TWITCH_CHAT_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  child.stdout.on('data', d => { salida += d; });
  child.stderr.on('data', d => { salida += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('server exited:\n' + salida);
    try { if ((await fetch(base + '/api/directo/avatares')).status > 0) break; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  let parado = false;
  const parar = () => new Promise(resolve => {
    if (parado || child.exitCode !== null || child.killed) return resolve();
    parado = true;
    child.once('exit', resolve);
    child.kill();
  });
  return { base, parar, salida: () => salida };
}

test('P6 Arreglado: /api/directo/avatares es solo lectura y no permite sobreescribir adopciones con un mapa ajeno', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'avatares-p6-test-'));
  const srv = await arrancar(dir);
  try {
    // 1. Cliente A adopta 'cl' mediante /api/directo/comando
    const resA = await fetch(srv.base + '/api/directo/comando', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: 'adoptar', agente: 'cl', usuario: 'viewer1' })
    });
    assert.equal(resA.status, 200);
    const dataA = await resA.json();
    assert.equal(dataA.duenos.cl, 'viewer1');

    // 2. Comprobar que el endpoint /api/directo/avatares refleja al dueño legítimo
    const get1 = await fetch(srv.base + '/api/directo/avatares');
    assert.equal(get1.status, 200);
    const avatares1 = await get1.json();
    assert.equal(avatares1.avatares.cl, 'viewer1');

    // 3. Cliente B intenta enviar un mapa viejo o vacío por POST a /api/directo/avatares
    const resB = await fetch(srv.base + '/api/directo/avatares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatares: {} })
    });
    // Debe ser rechazado con 405 Method Not Allowed
    assert.equal(resB.status, 405);

    // 4. Comprobar que la adopción legítima de viewer1 sigue INTACTA en el servidor
    const get2 = await fetch(srv.base + '/api/directo/avatares');
    assert.equal(get2.status, 200);
    const avatares2 = await get2.json();
    assert.equal(avatares2.avatares.cl, 'viewer1', 'La adopción de viewer1 no fue pisada');
  } finally {
    await srv.parar();
  }
});

test('P0 Lista de verificación 1 a 5: Ciclo de vida completo de adopción de avatares', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'avatares-p0-test-'));
  const srv = await arrancar(dir);
  try {
    // 1. Un usuario adopta un avatar y aparece como dueño en plano y en avatares.html
    const resP1 = await fetch(srv.base + '/api/directo/comando', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: 'adoptar', agente: 'cl', usuario: 'viewerA' })
    });
    assert.equal(resP1.status, 200);
    const dataP1 = await resP1.json();
    assert.equal(dataP1.duenos.cl, 'viewerA');

    // Verificado tanto en /api/directo/avatares (usado por avatares.html) como /api/directo/comando (usado por plano.html)
    const getAvatares1 = await (await fetch(srv.base + '/api/directo/avatares')).json();
    assert.equal(getAvatares1.avatares.cl, 'viewerA');
    const getComando1 = await (await fetch(srv.base + '/api/directo/comando')).json();
    assert.equal(getComando1.duenos.cl, 'viewerA');

    // 2. Otro usuario adopta otro avatar; el primero sigue teniendo el suyo
    const resP2 = await fetch(srv.base + '/api/directo/comando', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: 'adoptar', agente: 'py', usuario: 'viewerB' })
    });
    assert.equal(resP2.status, 200);
    const dataP2 = await resP2.json();
    assert.equal(dataP2.duenos.cl, 'viewerA');
    assert.equal(dataP2.duenos.py, 'viewerB');

    // 3. Un usuario cambia de avatar; el anterior queda libre
    const resP3 = await fetch(srv.base + '/api/directo/comando', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: 'adoptar', agente: 'so', usuario: 'viewerA' })
    });
    assert.equal(resP3.status, 200);
    const dataP3 = await resP3.json();
    assert.equal(dataP3.duenos.cl, undefined, 'El avatar anterior cl quedó libre');
    assert.equal(dataP3.duenos.so, 'viewerA', 'El nuevo avatar so pertenece a viewerA');
    assert.equal(dataP3.duenos.py, 'viewerB', 'viewerB sigue teniendo py');

    // 4. Javier libera un avatar y libera todos
    // 4a. Javier libera un avatar específico ('so')
    const resP4a = await fetch(srv.base + '/api/directo/comando', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: 'liberar', usuario: 'ja', agente: 'so' })
    });
    assert.equal(resP4a.status, 200);
    const dataP4a = await resP4a.json();
    assert.equal(dataP4a.duenos.so, undefined, 'so ha quedado libre');
    assert.equal(dataP4a.duenos.py, 'viewerB', 'py sigue perteneciendo a viewerB');

    // 4b. Javier libera todos los avatares ('todos')
    const resP4b = await fetch(srv.base + '/api/directo/comando', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: 'liberar', usuario: 'ja', agente: 'todos' })
    });
    assert.equal(resP4b.status, 200);
    const dataP4b = await resP4b.json();
    assert.equal(dataP4b.duenos.py, undefined, 'py ha quedado libre');
    assert.equal(dataP4b.duenos.cl, undefined, 'cl sigue libre');
    assert.equal(dataP4b.duenos.so, undefined, 'so sigue libre');
    // Javier sigue teniendo su avatar ja
    assert.equal(dataP4b.duenos.ja, 'apliarte');

    // 5. Tras recargar una página (nueva lectura de /api/directo/avatares y /api/directo/comando), los dueños siguen igual
    // Adoptamos uno para comprobar persistencia ante recarga de cliente
    await fetch(srv.base + '/api/directo/comando', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comando: 'adoptar', agente: 'as', usuario: 'viewerC' })
    });

    const reloadAvatares = await (await fetch(srv.base + '/api/directo/avatares')).json();
    const reloadComando = await (await fetch(srv.base + '/api/directo/comando')).json();
    assert.equal(reloadAvatares.avatares.as, 'viewerC');
    assert.equal(reloadComando.duenos.as, 'viewerC');

    // 5b. Tras reiniciar el servidor con el mismo dataDir, los dueños persisten desde data/panel/avatares.json
    await srv.parar();
    const srv2 = await arrancar(dir);
    try {
      const getTrasReinicio = await (await fetch(srv2.base + '/api/directo/avatares')).json();
      assert.equal(getTrasReinicio.avatares.as, 'viewerC', 'Los dueños persisten tras reiniciar el servidor');
      assert.equal(getTrasReinicio.avatares.ja, 'apliarte');
    } finally {
      await srv2.parar();
    }
  } finally {
    await srv.parar();
  }
});
