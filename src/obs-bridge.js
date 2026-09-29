/**
 * Bridge bidireccional entre OBS WebSocket v5 y el servidor de Directo ErBolamm.
 *
 * Se ejecuta en el Mac local (donde corre OBS Studio en 127.0.0.1:4455)
 * y escucha eventos del overlay local para cambiar
 * automáticamente de escena según la categoría activa del directo o peticiones de Javier.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';

export const MAPA_CATEGORIAS_ESCENAS = Object.freeze({
  apps: 'PLANO-INTERACTIVO',
  arte: 'Solo_Calca',
  charlando: 'CON_CAMARA',
  andando: 'CAM',
  musica: 'PLANO-INTERACTIVO',
});

export function obtenerConfiguracionObsLocal() {
  const rutaConfigObs = join(
    homedir(),
    'Library',
    'Application Support',
    'obs-studio',
    'plugin_config',
    'obs-websocket',
    'config.json'
  );
  if (existsSync(rutaConfigObs)) {
    try {
      const data = JSON.parse(readFileSync(rutaConfigObs, 'utf8'));
      return {
        puerto: data.server_port || 4455,
        password: data.server_password || '',
        authRequired: Boolean(data.auth_required),
      };
    } catch (_) {}
  }
  return {
    puerto: 4455,
    password: process.env.OBS_WEBSOCKET_PASSWORD || '',
    authRequired: true,
  };
}

export function crearClienteObsWebSocket({
  puerto = 4455,
  password = '',
  host = '127.0.0.1',
  onConectado = null,
  onDesconectado = null,
  onCambioEscena = null,
} = {}) {
  let ws = null;
  let conectado = false;
  let reintentoTimer = null;
  let cerradoManual = false;

  function conectar() {
    if (cerradoManual) return;
    try {
      ws = new WebSocket(`ws://${host}:${puerto}`);
    } catch (e) {
      programarReintento();
      return;
    }

    ws.on('open', () => {
      // Espera el op 0 (Hello)
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.op === 0) {
          // Hello
          const authObj = msg.d?.authentication;
          if (authObj && password) {
            const secret = createHash('sha256')
              .update(password + authObj.salt)
              .digest('base64');
            const auth = createHash('sha256')
              .update(secret + authObj.challenge)
              .digest('base64');
            ws.send(
              JSON.stringify({
                op: 1, // Identify
                d: { rpcVersion: 1, authentication: auth },
              })
            );
          } else {
            ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } }));
          }
        } else if (msg.op === 2) {
          // Identified
          conectado = true;
          onConectado?.();
        } else if (msg.op === 5) {
          // Event
          if (msg.d?.eventType === 'CurrentProgramSceneChanged') {
            onCambioEscena?.(msg.d.eventData?.sceneName);
          }
        }
      } catch (_) {}
    });

    ws.on('close', () => {
      conectado = false;
      onDesconectado?.();
      programarReintento();
    });

    ws.on('error', () => {
      conectado = false;
    });
  }

  function programarReintento() {
    if (cerradoManual || reintentoTimer) return;
    reintentoTimer = setTimeout(() => {
      reintentoTimer = null;
      conectar();
    }, 5000);
  }

  function cambiarEscena(sceneName) {
    if (!conectado || !ws || ws.readyState !== 1) return false;
    try {
      ws.send(
        JSON.stringify({
          op: 6,
          d: {
            requestType: 'SetCurrentProgramScene',
            requestId: `scene-${Date.now()}`,
            requestData: { sceneName },
          },
        })
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function cerrar() {
    cerradoManual = true;
    if (reintentoTimer) clearTimeout(reintentoTimer);
    try {
      ws?.close();
    } catch (_) {}
  }

  conectar();

  return {
    cambiarEscena,
    estaConectado: () => conectado,
    cerrar,
  };
}

export function iniciarObsBridge({
  busWsUrl = `ws://127.0.0.1:${process.env.PORT || 7979}/ws`,
  configObs = null,
} = {}) {
  const cfg = configObs || obtenerConfiguracionObsLocal();
  const obsClient = crearClienteObsWebSocket({
    puerto: cfg.puerto,
    password: cfg.password,
    onConectado: () => {
      console.log(`[OBS-Bridge] Conectado a OBS Studio en puerto ${cfg.puerto}`);
    },
    onDesconectado: () => {
      console.log('[OBS-Bridge] OBS Studio desconectado, reintentando...');
    },
    onCambioEscena: (nuevaEscena) => {
      console.log(`[OBS-Bridge] Escena actual de OBS → ${nuevaEscena}`);
    },
  });

  let busWs = null;
  let busReintentoTimer = null;
  let cerrado = false;

  function conectarBus() {
    if (cerrado) return;
    try {
      busWs = new WebSocket(busWsUrl);
    } catch (e) {
      programarReintentoBus();
      return;
    }

    busWs.on('open', () => {
      console.log(`[OBS-Bridge] Conectado al bus local en ${busWsUrl}`);
    });

    busWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'obs_cambiar_escena' && msg.escena) {
          console.log(`[OBS-Bridge] Petición de cambio de escena OBS → ${msg.escena}`);
          obsClient.cambiarEscena(msg.escena);
        } else if (msg.type === 'comando_chat' && msg.comando) {
          const cmd = String(msg.comando).trim().toLowerCase();
          if (cmd === '!pausa' || cmd === '!brb') {
            obsClient.cambiarEscena('PAUSA');
          } else if (cmd === '!volver' || cmd === '!plano') {
            obsClient.cambiarEscena('PLANO-INTERACTIVO');
          } else if (cmd === '!calca' || cmd === '!arte') {
            obsClient.cambiarEscena('Solo_Calca');
          } else if (cmd === '!cam') {
            obsClient.cambiarEscena('CON_CAMARA');
          }
        }
      } catch (_) {}
    });

    busWs.on('close', () => {
      programarReintentoBus();
    });

    busWs.on('error', () => {});
  }

  function programarReintentoBus() {
    if (cerrado || busReintentoTimer) return;
    busReintentoTimer = setTimeout(() => {
      busReintentoTimer = null;
      conectarBus();
    }, 5000);
  }

  conectarBus();

  return {
    obsClient,
    cerrar: () => {
      cerrado = true;
      if (busReintentoTimer) clearTimeout(busReintentoTimer);
      try { busWs?.close(); } catch (_) {}
      obsClient.cerrar();
    },
  };
}
