import test from 'node:test';
import assert from 'node:assert/strict';
import { CentroEstado, ESTADOS } from '../src/estado.js';

const destinos = [
  { nombre: 'twitch', url: 'rtmp://a/app', listo: true },
  { nombre: 'youtube', url: 'rtmp://b/app', listo: true },
];

test('arranca detenido y sin destinos activos', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  assert.equal(c.estado, ESTADOS.DETENIDO);
  assert.deepEqual(c.destinosActivos(), []);
});

test('cuando OBS publica pasa a recibiendo', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  assert.equal(c.estado, ESTADOS.RECIBIENDO);
});

test('con un relay arrancado pasa a reenviando', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  assert.equal(c.estado, ESTADOS.REENVIANDO);
  assert.deepEqual(c.destinosActivos(), [{ nombre: 'twitch', pid: 4321, modo: 'relay' }]);
});

test('si OBS deja de publicar y hay respaldo, pasa a fallback', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  c.obsDejaDePublicar();
  assert.equal(c.estado, ESTADOS.FALLBACK);
});

test('si OBS deja de publicar y NO hay respaldo, se detiene', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: false });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  c.obsDejaDePublicar();
  assert.equal(c.estado, ESTADOS.DETENIDO);
});

test('finalizarEmision detiene el centro y limpia destinos incluso con respaldo', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  c.finalizarEmision();
  assert.equal(c.estado, ESTADOS.DETENIDO);
  assert.equal(c.obsActivo, false);
  assert.deepEqual(c.destinosActivos(), []);
});

test('decidirTrasCorte pide matar los relays y arrancar el respaldo', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  c.relayArrancado('youtube', 4322);
  const plan = c.decidirTrasCorte();
  assert.deepEqual(plan.matar.sort(), [4321, 4322]);
  assert.deepEqual(plan.arrancarRespaldoEn.sort(), ['twitch', 'youtube']);
});

test('decidirTrasCorte no pide nada si no hay respaldo', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: false });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  const plan = c.decidirTrasCorte();
  assert.deepEqual(plan.matar, [4321]);
  assert.deepEqual(plan.arrancarRespaldoEn, []);
});

test('solo devuelve PIDs que registro este centro, nunca ajenos', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  const plan = c.decidirTrasCorte();
  assert.equal(plan.matar.includes(1), false, 'jamas debe incluir el PID 1');
  assert.equal(plan.matar.every((p) => Number.isInteger(p) && p > 1), true);
});

test('un destino desconocido no se registra', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  assert.throws(() => c.relayArrancado('vimeo', 9999), /desconocido/i);
});

test('un fallo de proceso deja el destino en error sin tumbar los demas', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  c.relayArrancado('youtube', 4322);
  c.procesoFallo('twitch', 'ffmpeg salio con codigo 1');
  assert.equal(c.estado, ESTADOS.REENVIANDO);
  assert.equal(c.destinos.get('twitch').error, 'ffmpeg salio con codigo 1');
  assert.deepEqual(c.destinosActivos(), [{ nombre: 'youtube', pid: 4322, modo: 'relay' }]);
});

test('si fallan todos los destinos, el centro queda en error', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  c.relayArrancado('youtube', 4322);
  c.procesoFallo('twitch', 'x');
  c.procesoFallo('youtube', 'y');
  assert.equal(c.estado, ESTADOS.ERROR);
});

test('la instantanea publica no filtra urls con clave', () => {
  const c = new CentroEstado({
    destinos: [{ nombre: 'twitch', url: 'rtmp://a/app/clave_secreta_999', listo: true }],
    tieneRespaldo: true,
  });
  const json = JSON.stringify(c.instantanea());
  assert.equal(json.includes('clave_secreta_999'), false);
});

test('el tiempo de emision se calcula desde el inicio real', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true, ahora: () => 1000 });
  c.obsPublica();
  c.ahora = () => 61000;
  assert.equal(c.segundosEmitiendo(), 60);
});

test('sin emision, el tiempo es cero', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true, ahora: () => 1000 });
  assert.equal(c.segundosEmitiendo(), 0);
});

// ── Corte rapido, descubierto probando en vivo el 2026-09-11 ─────────────────
// node-media-server v4 tarda 30 s en emitir donePublish (PUBLISH_GRACE_MS).
// Para un directo eso son 30 s de negro, asi que el corte se detecta tambien
// por la muerte del relay, que llega en cuanto OBS deja de mandar.

test('si muere el ultimo relay sin que lo hayamos parado, hay que pasar a respaldo', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  c.procesoFallo('twitch', 'fin de la entrada');
  assert.equal(c.debePasarARespaldo(), true);
});

test('si aun queda otro relay vivo, no se pasa a respaldo', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  c.relayArrancado('youtube', 4322);
  c.procesoFallo('twitch', 'fin de la entrada');
  assert.equal(c.debePasarARespaldo(), false);
});

test('sin respaldo configurado nunca se pasa a respaldo', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: false });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  c.procesoFallo('twitch', 'fin de la entrada');
  assert.equal(c.debePasarARespaldo(), false);
});

test('si ya se esta emitiendo el respaldo, no se vuelve a arrancar', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.relayArrancado('twitch', 4321);
  c.obsDejaDePublicar();
  c.respaldoArrancado('twitch', 5555);
  c.procesoFallo('twitch', 'el respaldo tambien fallo');
  assert.equal(c.debePasarARespaldo(), false,
    'un respaldo caido no debe relanzarse en bucle');
});

// ── Modo manual: reproducir un vídeo elegido a mano (2026-09-17) ─────────────
// Javier quiere poder emitir un vídeo suyo (fin de directo, anuncios...) sin
// depender de que OBS este conectado o no, y sin que ese vaiven interrumpa lo
// que ha elegido a mano.

test('activarManual pasa a MANUAL y guarda el archivo elegido', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.activarManual('fin-de-directo.mp4');
  assert.equal(c.estado, ESTADOS.MANUAL);
  assert.equal(c.archivoManual, 'fin-de-directo.mp4');
});

test('manualArrancado registra el destino sin tocar el estado', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.activarManual('fin-de-directo.mp4');
  c.manualArrancado('twitch', 777);
  assert.equal(c.estado, ESTADOS.MANUAL);
  assert.deepEqual(c.destinosActivos(), [{ nombre: 'twitch', pid: 777, modo: 'manual' }]);
});

test('si OBS publica durante el modo manual, no lo interrumpe', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.activarManual('fin-de-directo.mp4');
  c.obsPublica();
  assert.equal(c.estado, ESTADOS.MANUAL, 'el vídeo elegido a mano no se corta solo');
  assert.equal(c.obsActivo, true, 'pero se entera de que OBS sigue ahí, para cuando se pare el manual');
});

test('si OBS se cae durante el modo manual, no salta a respaldo por su cuenta', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.activarManual('anuncios.mp4');
  c.obsDejaDePublicar();
  assert.equal(c.estado, ESTADOS.MANUAL);
  assert.equal(c.obsActivo, false);
});

test('desactivarManual limpia el archivo pero no decide el siguiente estado', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.activarManual('fin-de-directo.mp4');
  c.desactivarManual();
  assert.equal(c.archivoManual, null);
  assert.equal(c.estado, ESTADOS.MANUAL, 'quien llama decide a que estado pasar, no este metodo');
});

test('salirDeManual vuelve a RECIBIENDO si OBS seguia activo por debajo', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.activarManual('anuncios.mp4');
  c.salirDeManual();
  assert.equal(c.estado, ESTADOS.RECIBIENDO);
  assert.equal(c.archivoManual, null);
});

test('salirDeManual vuelve a FALLBACK si OBS no estaba activo y hay respaldo', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.activarManual('fin-de-directo.mp4');
  c.salirDeManual();
  assert.equal(c.estado, ESTADOS.FALLBACK);
});

test('salirDeManual vuelve a DETENIDO si OBS no estaba activo y no hay respaldo', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: false });
  c.activarManual('fin-de-directo.mp4');
  c.salirDeManual();
  assert.equal(c.estado, ESTADOS.DETENIDO);
});

test('la instantanea expone obsActivo y archivoManual', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.activarManual('anuncios.mp4');
  const foto = c.instantanea();
  assert.equal(foto.obsActivo, true);
  assert.equal(foto.archivoManual, 'anuncios.mp4');
});
