import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  MAPA_CATEGORIAS_ESCENAS,
  crearClienteObsWebSocket,
  iniciarObsBridge,
  obtenerConfiguracionObsLocal,
} from '../src/obs-bridge.js';

test('MAPA_CATEGORIAS_ESCENAS mapea todas las categorias principales a escenas de OBS', () => {
  assert.equal(MAPA_CATEGORIAS_ESCENAS.apps, 'PLANO-INTERACTIVO');
  assert.equal(MAPA_CATEGORIAS_ESCENAS.arte, 'Solo_Calca');
  assert.equal(MAPA_CATEGORIAS_ESCENAS.charlando, 'CON_CAMARA');
  assert.equal(MAPA_CATEGORIAS_ESCENAS.andando, 'CAM');
  assert.equal(MAPA_CATEGORIAS_ESCENAS.musica, 'PLANO-INTERACTIVO');
});

test('obtenerConfiguracionObsLocal devuelve un objeto con puerto y password', () => {
  const cfg = obtenerConfiguracionObsLocal();
  assert.ok(typeof cfg.puerto === 'number');
  assert.ok(typeof cfg.password === 'string');
});

// OBS falso: habla lo justo del protocolo obs-websocket v5 (Hello → Identify → Identified)
// y luego emite los eventos que se le pidan. No toca el OBS real.
async function conObsFalso(eventos, usar) {
  const { WebSocketServer } = await import('ws');
  const servidor = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(servidor, 'listening');
  const identificaciones = [];
  servidor.on('connection', (socket) => {
    socket.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.0.0', rpcVersion: 1 } }));
    socket.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.op !== 1) return;
      identificaciones.push(msg.d);
      socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      for (const d of eventos) socket.send(JSON.stringify({ op: 5, d }));
    });
  });
  try {
    await usar(servidor.address().port, identificaciones);
  } finally {
    for (const socket of servidor.clients) socket.terminate();
    await new Promise((resolve) => servidor.close(resolve));
  }
}

function esperarHasta(condicion, ms = 2000) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now();
    const mirar = () => {
      if (condicion()) return resolve();
      if (Date.now() - inicio > ms) return reject(new Error('tiempo agotado esperando al bridge'));
      setTimeout(mirar, 10);
    };
    mirar();
  });
}

const EVENTOS_EMISION = [
  { eventType: 'StreamStateChanged', eventIntent: 64, eventData: { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_RECONNECTING' } },
  { eventType: 'StreamStateChanged', eventIntent: 64, eventData: { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPING' } },
  { eventType: 'StreamStateChanged', eventIntent: 64, eventData: { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' } },
];

test('el cliente OBS entrega StreamStateChanged a onCambioEmision, sin filtrar ni reordenar', async () => {
  await conObsFalso(EVENTOS_EMISION, async (puerto, identificaciones) => {
    const recibidos = [];
    const escenas = [];
    const cliente = crearClienteObsWebSocket({
      puerto,
      onCambioEmision: (datos) => recibidos.push(datos),
      onCambioEscena: (escena) => escenas.push(escena),
    });
    try {
      await esperarHasta(() => recibidos.length === 3);
      assert.deepEqual(recibidos, EVENTOS_EMISION.map((e) => e.eventData));
      assert.deepEqual(escenas, []);
      // Sin máscara explícita OBS manda todas las categorías normales, Outputs incluida.
      const mascara = identificaciones[0].eventSubscriptions;
      assert.ok(mascara === undefined || (mascara & 64) === 64);
    } finally {
      cliente.cerrar();
    }
  });
});

test('el cliente OBS no falla con StreamStateChanged si nadie escucha', async () => {
  await conObsFalso(
    [...EVENTOS_EMISION, { eventType: 'CurrentProgramSceneChanged', eventData: { sceneName: 'PAUSA' } }],
    async (puerto) => {
      const escenas = [];
      const cliente = crearClienteObsWebSocket({ puerto, onCambioEscena: (escena) => escenas.push(escena) });
      try {
        await esperarHasta(() => escenas.length === 1);
        assert.deepEqual(escenas, ['PAUSA']);
      } finally {
        cliente.cerrar();
      }
    },
  );
});

test('iniciarObsBridge pasa el cambio de emisión de OBS a quien lo arranca', async () => {
  await conObsFalso(EVENTOS_EMISION, async (puerto) => {
    const recibidos = [];
    const bridge = iniciarObsBridge({
      // El mismo servidor falso hace de bus: ignora lo que no sea Identify.
      busWsUrl: `ws://127.0.0.1:${puerto}`,
      configObs: { puerto, password: '', authRequired: false },
      onCambioEmision: (datos) => recibidos.push(datos?.outputState),
    });
    try {
      await esperarHasta(() => recibidos.length === 3);
      assert.deepEqual(recibidos, EVENTOS_EMISION.map((e) => e.eventData.outputState));
    } finally {
      bridge.cerrar();
    }
  });
});
