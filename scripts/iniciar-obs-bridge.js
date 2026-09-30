#!/usr/bin/env node
import { iniciarObsBridge } from '../src/obs-bridge.js';

const busWsUrl = process.env.OBS_BRIDGE_WS_URL || 'ws://127.0.0.1:8790/ws';
console.log(`[OBS-Daemon] Iniciando puente OBS WebSocket v5 hacia ${busWsUrl}...`);

const bridge = iniciarObsBridge({ busWsUrl });

process.on('SIGINT', () => {
  console.log('[OBS-Daemon] Deteniendo puente...');
  bridge.cerrar();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[OBS-Daemon] Deteniendo puente...');
  bridge.cerrar();
  process.exit(0);
});
