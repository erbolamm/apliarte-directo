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

// ── Destino en preparación ───────────────────────────────────────────────────
// YouTube espera unos segundos a su emisión antes de recibir el reenvío. Mientras espera no tiene
// proceso, pero para el centro cuenta como un reenvío a punto de salir: si no, la caída de otro
// destino en esa espera pondría el vídeo de respaldo con OBS en directo.

test('con un destino en preparacion, la caida del unico relay no pide el respaldo', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  const ficha = c.relayEnPreparacion('youtube');
  c.relayArrancado('twitch', 4321);
  c.procesoFallo('twitch', 'ffmpeg salio con codigo 1');
  assert.equal(c.debePasarARespaldo(), false);
  assert.equal(c.estado, ESTADOS.REENVIANDO, 'tampoco se da el centro por caido');
  assert.equal(c.obsActivo, true);
  assert.equal(c.preparacionVigente('youtube', ficha), true);
  assert.deepEqual(c.destinosEnPreparacion(), ['youtube']);
  assert.deepEqual(c.destinosActivos(), [], 'en preparacion no hay proceso que contar ni que matar');
});

test('terminada la preparacion sin relay, la decision vuelve a ser la de siempre', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  const ficha = c.relayEnPreparacion('youtube');
  c.relayArrancado('twitch', 4321);
  c.procesoFallo('twitch', 'x');
  assert.equal(c.preparacionTerminada('youtube', ficha), true);
  assert.equal(c.preparacionVigente('youtube', ficha), false);
  assert.equal(c.debePasarARespaldo(), true);
  assert.equal(c.preparacionTerminada('youtube', ficha), false, 'soltarla dos veces no hace nada');
});

test('terminada la preparacion con el relay arrancado, el otro destino sigue cubierto', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  const ficha = c.relayEnPreparacion('youtube');
  c.relayArrancado('twitch', 4321);
  c.procesoFallo('twitch', 'x');
  c.relayArrancado('youtube', 4322);
  c.preparacionTerminada('youtube', ficha);
  assert.equal(c.debePasarARespaldo(), false);
  assert.equal(c.estado, ESTADOS.REENVIANDO);
  c.procesoFallo('youtube', 'y');
  assert.equal(c.debePasarARespaldo(), true);
});

test('un destino en preparacion recibe el respaldo cuando OBS corta', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  c.relayEnPreparacion('youtube');
  c.relayArrancado('twitch', 4321);
  const plan = c.decidirTrasCorte();
  assert.deepEqual(plan.matar, [4321], 'solo se mata lo que tiene proceso');
  assert.deepEqual(plan.arrancarRespaldoEn, ['twitch', 'youtube']);

  const sinRespaldo = new CentroEstado({ destinos, tieneRespaldo: false });
  sinRespaldo.obsPublica();
  sinRespaldo.relayEnPreparacion('youtube');
  assert.deepEqual(sinRespaldo.decidirTrasCorte().arrancarRespaldoEn, []);
});

test('si la publicacion se corta antes de que salga el relay, el destino cuenta como relay cortado', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  const ficha = c.relayEnPreparacion('youtube');
  assert.equal(c.preparacionCortada('youtube', ficha), true);
  assert.equal(c.preparacionVigente('youtube', ficha), false);
  assert.equal(c.destinos.get('youtube').ultimoModo, 'relay');
  assert.deepEqual(c.destinosEnPreparacion(), []);
  assert.equal(c.preparacionCortada('youtube', ficha), false);
});

test('el corte de OBS, el cierre, el video manual y la parada a mano terminan la preparacion', () => {
  const salidas = {
    'OBS deja de publicar': (c) => c.obsDejaDePublicar(),
    'cierre voluntario': (c) => c.finalizarEmision(),
    'video manual': (c) => c.activarManual('anuncios.mp4'),
    'parada a mano del destino': (c) => assert.equal(c.cancelarPreparacion('youtube'), true),
    'apagado del centro': (c) => c.cancelarPreparaciones(),
  };
  for (const [nombre, salir] of Object.entries(salidas)) {
    const c = new CentroEstado({ destinos, tieneRespaldo: true });
    c.obsPublica();
    const ficha = c.relayEnPreparacion('youtube');
    salir(c);
    assert.equal(c.preparacionVigente('youtube', ficha), false, nombre);
    assert.deepEqual(c.destinosEnPreparacion(), [], nombre);
    assert.equal(c.preparacionCortada('youtube', ficha), false, `${nombre}: la ficha vieja ya no cambia nada`);
    assert.notEqual(c.destinos.get('youtube').ultimoModo, 'relay', nombre);
  }
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  assert.equal(c.cancelarPreparacion('youtube'), false, 'sin preparacion no hay nada que cancelar');
});

test('el video manual puesto y quitado durante la espera no deja salir el relay pendiente', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  const ficha = c.relayEnPreparacion('youtube');
  c.activarManual('anuncios.mp4');
  assert.equal(c.preparacionVigente('youtube', ficha), false);
  c.salirDeManual();
  assert.equal(c.estado, ESTADOS.RECIBIENDO);
  assert.equal(c.preparacionVigente('youtube', ficha), false, 'volver de manual no la recupera');
});

test('la ficha de una publicacion anterior no toca la preparacion de la nueva', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  c.obsPublica();
  const vieja = c.relayEnPreparacion('youtube');
  c.obsPublica();
  assert.equal(c.preparacionVigente('youtube', vieja), false, 'una publicacion nueva empieza sin esperas heredadas');
  const nueva = c.relayEnPreparacion('youtube');
  assert.equal(c.preparacionTerminada('youtube', vieja), false);
  assert.equal(c.preparacionCortada('youtube', vieja), false);
  assert.equal(c.preparacionVigente('youtube', nueva), true);
  assert.equal(c.preparacionVigente('youtube', undefined), false);
  assert.equal(c.preparacionVigente('twitch', nueva), false);
});

test('solo se prepara un destino conocido', () => {
  const c = new CentroEstado({ destinos, tieneRespaldo: true });
  assert.throws(() => c.relayEnPreparacion('vimeo'), /desconocido/i);
});
