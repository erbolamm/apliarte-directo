import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { GestorProcesos } from '../src/procesos.js';
import { planificarRelevo } from '../src/relevo.js';

const destino = { nombre: 'local', url: 'rtmp://127.0.0.1:1936/live/prueba' };
function harness({ salirAlKill = true } = {}) {
  const hijos = [];
  const gestor = new GestorProcesos({ plazoTermMs: 5, plazoKillMs: 10, lanzar: () => {
    const hijo = new EventEmitter();
    hijo.pid = 100 + hijos.length; hijo.stderr = new EventEmitter();
    hijo.exitCode = null; hijo.signalCode = null; hijo.senales = [];
    hijo.kill = senal => {
      hijo.senales.push(senal);
      if (senal === 'SIGKILL' && salirAlKill) queueMicrotask(() => hijo.salir(null, senal));
      return true;
    };
    hijo.salir = (codigo = 0, senal = null) => { hijo.exitCode = codigo; hijo.signalCode = senal; hijo.emit('exit', codigo, senal); hijo.emit('close', codigo, senal); };
    hijos.push(hijo); return hijo;
  }});
  const relay = alSalir => gestor.arrancarRelay({ destino, entrada: 'rtmp://127.0.0.1:1935/live/obs', entorno: {}, alSalir });
  const respaldo = () => gestor.arrancarRespaldo({ destino, archivo: '/tmp/respaldo.mp4', entorno: {} });
  return { hijos, gestor, relay, respaldo };
}

test('SIGTERM no libera mapa ni inicia respaldo hasta salida real', async () => {
  const h = harness(); let fallos = 0;
  await h.relay(() => fallos++);
  const viejo = h.hijos[0];
  const nuevo = h.respaldo();
  await Promise.resolve();
  assert.equal(h.hijos.length, 1);
  assert.equal(h.gestor.propios.get('local'), viejo);
  await nuevo;
  assert.deepEqual(viejo.senales, ['SIGTERM', 'SIGKILL']);
  assert.equal(h.hijos.length, 2);
  assert.equal(fallos, 0, 'parada intencionada no dispara otro relevo');
  // Un evento tardío de proceso viejo nunca borra el nuevo.
  viejo.emit('exit', 0, null);
  assert.equal(h.gestor.propios.get('local'), h.hijos[1]);
  await h.gestor.detenerTodos();
});

test('si ni SIGKILL confirma salida falla cerrado, sin segundo publicador', async () => {
  const h = harness({ salirAlKill: false });
  await h.relay();
  await assert.rejects(h.respaldo(), /no confirmó su salida/);
  assert.equal(h.hijos.length, 1);
  assert.equal(h.gestor.propios.get('local'), h.hijos[0]);
  h.hijos[0].salir();
});

test('pausa empieza después de morir relay, no después de enviar SIGTERM', async () => {
  const h = harness(); await h.relay(); const orden = [];
  h.hijos[0].on('exit', () => orden.push('exit'));
  await planificarRelevo({ matar: () => h.gestor.detenerTodos(), esperar: fn => { orden.push('pausa'); fn(); }, arrancar: async () => { orden.push('respaldo'); await h.respaldo(); } });
  assert.deepEqual(orden, ['exit', 'pausa', 'respaldo']);
  await h.gestor.detenerTodos();
});

test('parada manual cancela lanzamientos pendientes y no mata proceso ajeno', async () => {
  const h = harness(); await h.relay();
  const pending = h.respaldo();
  await h.gestor.detener('local');
  assert.equal(await pending, null);
  assert.equal(h.hijos.length, 1);
  assert.equal(await h.gestor.detener('desconocido'), false);
});

test('sin salida confirmada no se programa pausa ni respaldo', async () => {
  let arrancado = false;
  await assert.rejects(planificarRelevo({ matar: async () => { throw new Error('vivo'); }, esperar: () => { throw new Error('no debe programar'); }, arrancar: () => { arrancado = true; } }), /vivo/);
  assert.equal(arrancado, false);
});

test('salida normal tras SIGTERM evita SIGKILL', async () => {
  const h = harness(); await h.relay();
  const stop = h.gestor.detener('local');
  h.hijos[0].salir(null, 'SIGTERM');
  assert.equal(await stop, true);
  assert.deepEqual(h.hijos[0].senales, ['SIGTERM']);
  assert.equal(h.gestor.propios.size, 0);
});

test('error de señal con PID no borra un proceso que sigue vivo', async () => {
  const h = harness(); await h.relay();
  h.hijos[0].emit('error', new Error('no autorizado'));
  assert.equal(h.gestor.propios.get('local'), h.hijos[0]);
  await h.gestor.detenerTodos();
});

test('dos lanzamientos competidores solo conservan el último', async () => {
  const h = harness(); await h.relay();
  const first = h.respaldo(), second = h.respaldo();
  assert.equal(await first, null);
  assert.equal(await second, 101);
  assert.equal(h.hijos.length, 2);
  await h.gestor.detenerTodos();
});

test('la clave nunca sale en el registro, ni en la URL ni en un error crudo de FFmpeg', async () => {
  const registrado = [];
  const hijos = [];
  const gestor = new GestorProcesos({
    registrar: (linea) => registrado.push(linea),
    lanzar: () => {
      const hijo = new EventEmitter();
      hijo.pid = 200 + hijos.length; hijo.stderr = new EventEmitter();
      hijo.kill = () => true;
      hijos.push(hijo); return hijo;
    },
  });
  // Mismo caso que reventó con Kick: url sin segmento "app" antes de la clave, así que
  // enmascararUrl por sí sola (basada en contar partes) no la habría ocultado.
  const destinoSinApp = { nombre: 'kick', url: 'rtmps://host.ejemplo.net', variableClave: 'CLAVE_KICK' };
  const clave = 'sk_secreto_muy_largo_que_no_debe_salir';

  await gestor.arrancarRelay({
    destino: destinoSinApp,
    entrada: 'rtmp://127.0.0.1:1935/live/obs',
    entorno: { CLAVE_KICK: clave },
  });
  // Un error real de FFmpeg incluye la URL completa, con clave, en texto libre.
  hijos[0].stderr.emit('data', Buffer.from(
    `Error opening output rtmps://host.ejemplo.net/${clave}: Input/output error`
  ));

  const texto = registrado.join('\n');
  assert.ok(!texto.includes(clave), `la clave no debe aparecer en el registro: ${texto}`);
  assert.ok(texto.includes('***'), 'debe quedar una marca de ocultación en su lugar');
  await gestor.detenerTodos();
});
