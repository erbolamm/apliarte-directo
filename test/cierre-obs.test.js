import test from 'node:test';
import assert from 'node:assert/strict';
import { esParadaDeliberada, hayEmisionQueCerrar } from '../src/cierre-obs.js';
import { CentroEstado, ESTADOS } from '../src/estado.js';

test('STOPPING y STOPPED son una parada deliberada de OBS', () => {
  assert.equal(esParadaDeliberada({ outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPING' }), true);
  assert.equal(esParadaDeliberada({ outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' }), true);
});

test('reconectar o arrancar no es una parada deliberada', () => {
  for (const outputState of [
    'OBS_WEBSOCKET_OUTPUT_RECONNECTING',
    'OBS_WEBSOCKET_OUTPUT_RECONNECTED',
    'OBS_WEBSOCKET_OUTPUT_STARTING',
    'OBS_WEBSOCKET_OUTPUT_STARTED',
  ]) {
    assert.equal(esParadaDeliberada({ outputActive: true, outputState }), false, outputState);
  }
});

test('datos ausentes o mal formados no son una parada deliberada', () => {
  for (const datos of [
    undefined,
    null,
    {},
    'OBS_WEBSOCKET_OUTPUT_STOPPED',
    { outputActive: false },
    { outputState: null },
    { outputState: 42 },
    { outputState: ['OBS_WEBSOCKET_OUTPUT_STOPPED'] },
    { outputState: 'obs_websocket_output_stopped' },
    { outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED_EXTRA' },
  ]) {
    assert.equal(esParadaDeliberada(datos), false, JSON.stringify(datos));
  }
});

test('hay emisión que cerrar mientras OBS publica', () => {
  assert.equal(hayEmisionQueCerrar({ obsActivo: true, estado: ESTADOS.REENVIANDO, relevoEnMarcha: false }), true);
  assert.equal(hayEmisionQueCerrar({ obsActivo: true, estado: ESTADOS.RECIBIENDO, relevoEnMarcha: false }), true);
  assert.equal(hayEmisionQueCerrar({ obsActivo: true, estado: ESTADOS.MANUAL, relevoEnMarcha: false }), true);
});

test('hay emisión que cerrar si el respaldo ya arrancó o está arrancando', () => {
  assert.equal(hayEmisionQueCerrar({ obsActivo: false, estado: ESTADOS.FALLBACK, relevoEnMarcha: false }), true);
  assert.equal(hayEmisionQueCerrar({ obsActivo: false, estado: ESTADOS.REENVIANDO, relevoEnMarcha: true }), true);
});

test('sin emisión no hay nada que cerrar', () => {
  assert.equal(hayEmisionQueCerrar({ obsActivo: false, estado: ESTADOS.DETENIDO, relevoEnMarcha: false }), false);
  assert.equal(hayEmisionQueCerrar({ obsActivo: false, estado: ESTADOS.ERROR, relevoEnMarcha: false }), false);
  // Un vídeo manual sin OBS publicando no lo ha arrancado OBS: no se toca.
  assert.equal(hayEmisionQueCerrar({ obsActivo: false, estado: ESTADOS.MANUAL, relevoEnMarcha: false }), false);
  assert.equal(hayEmisionQueCerrar(), false);
});

test('tras finalizar la emisión, el segundo aviso de OBS (STOPPED) ya no encuentra nada que cerrar', () => {
  const centro = new CentroEstado({ destinos: [{ nombre: 'youtube', url: 'rtmp://ejemplo/live2' }], tieneRespaldo: true });
  centro.obsPublica();
  centro.relayArrancado('youtube', 100);
  const vista = () => ({ obsActivo: centro.obsActivo, estado: centro.estado, relevoEnMarcha: false });
  assert.equal(hayEmisionQueCerrar(vista()), true);
  centro.finalizarEmision();
  assert.equal(hayEmisionQueCerrar(vista()), false);
});
