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
  onCambioMute = null,
} = {}) {
  let ws = null;
  let conectado = false;
  let reintentoTimer = null;
  let cerradoManual = false;
  const peticionesPendientes = new Map();
  let reqSeq = 1;

  function limpiarPeticionesPendientes(errorMsg = 'Conexión cerrada') {
    for (const [id, req] of peticionesPendientes.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error(errorMsg));
    }
    peticionesPendientes.clear();
  }

  function enviarPeticion(requestType, requestData = {}) {
    if (!conectado || !ws || ws.readyState !== 1) {
      return Promise.reject(new Error('OBS WebSocket no conectado'));
    }
    const requestId = `obs_${Date.now()}_${reqSeq++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        peticionesPendientes.delete(requestId);
        reject(new Error(`Timeout en petición OBS: ${requestType}`));
      }, 5000);

      peticionesPendientes.set(requestId, { resolve, reject, timer });

      try {
        ws.send(
          JSON.stringify({
            op: 6,
            d: { requestType, requestId, requestData },
          })
        );
      } catch (err) {
        clearTimeout(timer);
        peticionesPendientes.delete(requestId);
        reject(err);
      }
    });
  }

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
        } else if (msg.op === 7) {
          // RequestResponse
          const d = msg.d;
          if (d && peticionesPendientes.has(d.requestId)) {
            const { resolve, reject, timer } = peticionesPendientes.get(d.requestId);
            clearTimeout(timer);
            peticionesPendientes.delete(d.requestId);
            if (d.requestStatus?.result) {
              resolve(d.responseData || {});
            } else {
              reject(new Error(d.requestStatus?.comment || 'Error en petición OBS'));
            }
          }
        } else if (msg.op === 5) {
          // Event
          if (msg.d?.eventType === 'CurrentProgramSceneChanged') {
            onCambioEscena?.(msg.d.eventData?.sceneName);
          } else if (msg.d?.eventType === 'InputMuteStateChanged') {
            onCambioMute?.(msg.d.eventData);
          }
        }
      } catch (_) {}
    });

    ws.on('close', () => {
      conectado = false;
      limpiarPeticionesPendientes('OBS Studio desconectado');
      onDesconectado?.();
      programarReintento();
    });

    ws.on('error', () => {
      conectado = false;
      limpiarPeticionesPendientes('Error en conexión OBS WebSocket');
    });
  }

  function programarReintento() {
    if (cerradoManual || reintentoTimer) return;
    reintentoTimer = setTimeout(() => {
      reintentoTimer = null;
      conectar();
    }, 5000);
  }

  async function cambiarEscena(sceneName) {
    return enviarPeticion('SetCurrentProgramScene', { sceneName });
  }

  async function obtenerEscenas() {
    return enviarPeticion('GetSceneList');
  }

  async function obtenerMute(inputName = 'Mic/Aux') {
    return enviarPeticion('GetInputMute', { inputName });
  }

  async function toggleMute(inputName = 'Mic/Aux') {
    return enviarPeticion('ToggleInputMute', { inputName });
  }

  async function obtenerCaptura(sourceName, width = 640, height = 360) {
    return enviarPeticion('GetSourceScreenshot', {
      sourceName,
      imageFormat: 'jpeg',
      imageWidth: width,
      imageHeight: height,
      imageCompressionQuality: 40,
    });
  }

  function cerrar() {
    cerradoManual = true;
    if (reintentoTimer) clearTimeout(reintentoTimer);
    limpiarPeticionesPendientes('Cliente OBS cerrado manualmente');
    try {
      ws?.close();
    } catch (_) {}
  }

  conectar();

  return {
    cambiarEscena,
    obtenerEscenas,
    obtenerMute,
    toggleMute,
    obtenerCaptura,
    enviarPeticion,
    estaConectado: () => conectado,
    cerrar,
  };
}

export function iniciarObsBridge({
  busWsUrl = process.env.OBS_BRIDGE_WS_URL || `ws://127.0.0.1:${process.env.PORT || 8790}/ws`,
  configObs = null,
} = {}) {
  const cfg = configObs || obtenerConfiguracionObsLocal();
  let escenaActual = 'CON_CAMARA';

  let busWs = null;
  let busReintentoTimer = null;
  let cerrado = false;

  function enviarAlBus(payload) {
    if (busWs && busWs.readyState === 1) {
      try {
        busWs.send(JSON.stringify(payload));
      } catch (_) {}
    }
  }

  const obsClient = crearClienteObsWebSocket({
    puerto: cfg.puerto,
    password: cfg.password,
    onConectado: async () => {
      console.log(`[OBS-Bridge] Conectado a OBS Studio en puerto ${cfg.puerto}`);
      try {
        const estado = await obsClient.obtenerEscenas();
        if (estado?.currentProgramSceneName) {
          escenaActual = estado.currentProgramSceneName;
        }
        const muteInfo = await obsClient.obtenerMute('Mic/Aux').catch(() => ({ inputMuted: false }));
        enviarAlBus({
          type: 'obs_estado',
          escenaActual,
          escenas: (estado?.scenes || []).map((s) => s.sceneName),
          microMuteado: Boolean(muteInfo?.inputMuted),
        });
      } catch (_) {}
    },
    onDesconectado: () => {
      console.log('[OBS-Bridge] OBS Studio desconectado, reintentando...');
    },
    onCambioEscena: (nuevaEscena) => {
      escenaActual = nuevaEscena;
      console.log(`[OBS-Bridge] Escena actual de OBS → ${nuevaEscena}`);
      enviarAlBus({ type: 'obs_escena_cambiada', escena: nuevaEscena });
    },
    onCambioMute: (datosMute) => {
      enviarAlBus({
        type: 'obs_mute_cambiado',
        inputName: datosMute?.inputName,
        inputMuted: Boolean(datosMute?.inputMuted),
      });
    },
  });

  function conectarBus() {
    if (cerrado) return;
    try {
      busWs = new WebSocket(busWsUrl);
    } catch (e) {
      programarReintentoBus();
      return;
    }

    busWs.on('open', async () => {
      console.log(`[OBS-Bridge] Conectado al bus local en ${busWsUrl}`);
      if (obsClient.estaConectado()) {
        try {
          const estado = await obsClient.obtenerEscenas();
          if (estado?.currentProgramSceneName) {
            escenaActual = estado.currentProgramSceneName;
          }
          const muteInfo = await obsClient.obtenerMute('Mic/Aux').catch(() => ({ inputMuted: false }));
          enviarAlBus({
            type: 'obs_estado',
            escenaActual,
            escenas: (estado?.scenes || []).map((s) => s.sceneName),
            microMuteado: Boolean(muteInfo?.inputMuted),
          });
        } catch (_) {}
      }
    });

    busWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'obs_cambiar_escena' && msg.escena) {
          console.log(`[OBS-Bridge] Petición de cambio de escena OBS → ${msg.escena}`);
          await obsClient.cambiarEscena(msg.escena).catch(() => {});
        } else if (msg.type === 'obs_solicitar_estado') {
          if (obsClient.estaConectado()) {
            const estado = await obsClient.obtenerEscenas().catch(() => null);
            if (estado?.currentProgramSceneName) {
              escenaActual = estado.currentProgramSceneName;
            }
            const muteInfo = await obsClient.obtenerMute(msg.inputName || 'Mic/Aux').catch(() => ({ inputMuted: false }));
            enviarAlBus({
              type: 'obs_estado',
              escenaActual,
              escenas: (estado?.scenes || []).map((s) => s.sceneName),
              microMuteado: Boolean(muteInfo?.inputMuted),
            });
          }
        } else if (msg.type === 'obs_toggle_mute') {
          const inputName = msg.inputName || 'Mic/Aux';
          const res = await obsClient.toggleMute(inputName).catch(() => null);
          if (res) {
            enviarAlBus({
              type: 'obs_mute_cambiado',
              inputName,
              inputMuted: Boolean(res.inputMuted),
            });
          }
        } else if (msg.type === 'obs_solicitar_captura') {
          const fuente = msg.fuente || escenaActual;
          const snap = await obsClient.obtenerCaptura(fuente).catch(() => null);
          if (snap?.imageData) {
            enviarAlBus({
              type: 'obs_captura',
              fuente,
              data: snap.imageData,
            });
          }
        } else if (msg.type === 'comando_chat' && msg.comando) {
          const cmd = String(msg.comando).trim().toLowerCase();
          if (cmd === '!pausa' || cmd === '!brb') {
            obsClient.cambiarEscena('PAUSA').catch(() => {});
          } else if (cmd === '!volver' || cmd === '!plano') {
            obsClient.cambiarEscena('PLANO-INTERACTIVO').catch(() => {});
          } else if (cmd === '!calca' || cmd === '!arte') {
            obsClient.cambiarEscena('Solo_Calca').catch(() => {});
          } else if (cmd === '!cam') {
            obsClient.cambiarEscena('CON_CAMARA').catch(() => {});
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
