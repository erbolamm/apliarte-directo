import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  esTipoSimpleValido,
  leerListaSimple,
  agregarAListaSimple,
  quitarDeListaSimple,
  leerComandosBot,
  agregarComandoBot,
  quitarComandoBot,
  fusionarEnListaSimple,
  fusionarComandosBot,
  leerVocesUsuarios,
  guardarVozUsuario,
  fusionarVocesUsuarios,
  leerUsuariosIgnorados,
  guardarUsuarioIgnorado,
  quitarUsuarioIgnorado,
  fusionarUsuariosIgnorados,
  reemplazarUsuariosIgnorados,
  USUARIOS_IGNORADOS_SEMILLA,
} from '../src/panel-listas.js';

// Cada test usa su propio directorio temporal: nada de tocar directo/data/ real.
function raizTemporal() {
  return mkdtempSync(join(tmpdir(), 'panel-listas-test-'));
}

test('esTipoSimpleValido acepta usuario/canal/mensaje y rechaza el resto', () => {
  assert.equal(esTipoSimpleValido('usuario'), true);
  assert.equal(esTipoSimpleValido('canal'), true);
  assert.equal(esTipoSimpleValido('mensaje'), true);
  assert.equal(esTipoSimpleValido('comando-bot'), false);
  assert.equal(esTipoSimpleValido(''), false);
});

test('leerListaSimple devuelve vacio si no existe el fichero', () => {
  const raiz = raizTemporal();
  assert.deepEqual(leerListaSimple(raiz, 'usuario'), []);
  rmSync(raiz, { recursive: true, force: true });
});

test('agregarAListaSimple crea el fichero y persiste entre lecturas', () => {
  const raiz = raizTemporal();
  agregarAListaSimple(raiz, 'canal', 'otroStreamer');
  assert.deepEqual(leerListaSimple(raiz, 'canal'), ['otroStreamer']);
  rmSync(raiz, { recursive: true, force: true });
});

test('agregarAListaSimple no duplica un valor ya presente', () => {
  const raiz = raizTemporal();
  agregarAListaSimple(raiz, 'usuario', 'pepe');
  agregarAListaSimple(raiz, 'usuario', 'pepe');
  assert.deepEqual(leerListaSimple(raiz, 'usuario'), ['pepe']);
  rmSync(raiz, { recursive: true, force: true });
});

test('quitarDeListaSimple elimina solo el valor indicado', () => {
  const raiz = raizTemporal();
  agregarAListaSimple(raiz, 'mensaje', 'hola');
  agregarAListaSimple(raiz, 'mensaje', 'adios');
  quitarDeListaSimple(raiz, 'mensaje', 'hola');
  assert.deepEqual(leerListaSimple(raiz, 'mensaje'), ['adios']);
  rmSync(raiz, { recursive: true, force: true });
});

test('quitarDeListaSimple no revienta si el valor no estaba', () => {
  const raiz = raizTemporal();
  assert.doesNotThrow(() => quitarDeListaSimple(raiz, 'canal', 'no-existe'));
  rmSync(raiz, { recursive: true, force: true });
});

test('las tres listas simples se guardan en ficheros independientes', () => {
  const raiz = raizTemporal();
  agregarAListaSimple(raiz, 'usuario', 'a');
  agregarAListaSimple(raiz, 'canal', 'b');
  agregarAListaSimple(raiz, 'mensaje', 'c');
  assert.deepEqual(leerListaSimple(raiz, 'usuario'), ['a']);
  assert.deepEqual(leerListaSimple(raiz, 'canal'), ['b']);
  assert.deepEqual(leerListaSimple(raiz, 'mensaje'), ['c']);
  rmSync(raiz, { recursive: true, force: true });
});

test('leerComandosBot devuelve la semilla del !so si no hay fichero', () => {
  const raiz = raizTemporal();
  assert.deepEqual(leerComandosBot(raiz), [['!so [usuario]', 'Destacar o recomendar a otro streamer (shoutout) promo']]);
  rmSync(raiz, { recursive: true, force: true });
});

test('agregarComandoBot añade un par [comando, descripcion] y persiste', () => {
  const raiz = raizTemporal();
  agregarComandoBot(raiz, '!discord', 'Enlace al Discord');
  const lista = leerComandosBot(raiz);
  assert.ok(lista.some(([cmd, desc]) => cmd === '!discord' && desc === 'Enlace al Discord'));
  rmSync(raiz, { recursive: true, force: true });
});

test('quitarComandoBot elimina por el texto exacto del comando', () => {
  const raiz = raizTemporal();
  agregarComandoBot(raiz, '!discord', 'Enlace al Discord');
  quitarComandoBot(raiz, '!discord');
  const lista = leerComandosBot(raiz);
  assert.equal(lista.some(([cmd]) => cmd === '!discord'), false);
  rmSync(raiz, { recursive: true, force: true });
});

test('fusionarEnListaSimple une lo local con lo del disco sin duplicar ni perder nada', () => {
  const raiz = raizTemporal();
  agregarAListaSimple(raiz, 'usuario', 'elesky');
  agregarAListaSimple(raiz, 'usuario', 'nMarulo');
  const resultado = fusionarEnListaSimple(raiz, 'usuario', ['nMarulo', 'nuevoLocal', '  conEspacios  ']);
  assert.deepEqual(resultado, ['elesky', 'nMarulo', 'nuevoLocal', 'conEspacios']);
  assert.deepEqual(leerListaSimple(raiz, 'usuario'), resultado);
  rmSync(raiz, { recursive: true, force: true });
});

test('fusionarEnListaSimple ignora valores que no son texto o están vacíos', () => {
  const raiz = raizTemporal();
  const resultado = fusionarEnListaSimple(raiz, 'canal', ['ok', '', '   ', null, 42, { x: 1 }]);
  assert.deepEqual(resultado, ['ok']);
  rmSync(raiz, { recursive: true, force: true });
});

test('fusionarEnListaSimple con lista vacía no crea fichero', () => {
  const raiz = raizTemporal();
  assert.deepEqual(fusionarEnListaSimple(raiz, 'mensaje', []), []);
  assert.equal(existsSync(join(raiz, 'panel', 'mensaje.json')), false);
  rmSync(raiz, { recursive: true, force: true });
});

test('fusionarComandosBot añade solo los comandos que el servidor no tiene', () => {
  const raiz = raizTemporal();
  agregarComandoBot(raiz, '!discord', 'Enlace al Discord');
  const resultado = fusionarComandosBot(raiz, [
    ['!discord', 'otra descripción que no pisa la guardada'],
    ['!redes', 'Mis redes'],
    ['sin-descripcion'],
    'basura',
  ]);
  assert.deepEqual(resultado.map(([cmd]) => cmd), ['!so [usuario]', '!discord', '!redes', 'sin-descripcion']);
  assert.equal(resultado.find(([cmd]) => cmd === '!discord')[1], 'Enlace al Discord');
  assert.equal(resultado.find(([cmd]) => cmd === 'sin-descripcion')[1], '—');
  assert.deepEqual(leerComandosBot(raiz), resultado);
  rmSync(raiz, { recursive: true, force: true });
});

test('leerVocesUsuarios devuelve objeto vacío si no existe el fichero', () => {
  const raiz = raizTemporal();
  assert.deepEqual(leerVocesUsuarios(raiz), {});
  rmSync(raiz, { recursive: true, force: true });
});

test('guardarVozUsuario persiste la voz asociada al usuario en minúsculas', () => {
  const raiz = raizTemporal();
  const config = { lang: 'es-ES', slot: 1, name: 'Monica' };
  guardarVozUsuario(raiz, 'PepeChat', config);
  assert.deepEqual(leerVocesUsuarios(raiz), { pepechat: config });
  rmSync(raiz, { recursive: true, force: true });
});

test('fusionarVocesUsuarios une sin sobrescribir lo ya existente en disco', () => {
  const raiz = raizTemporal();
  guardarVozUsuario(raiz, 'juan', { lang: 'es-ES', slot: 2 });
  const nuevas = {
    juan: { lang: 'es-MX', slot: 1 },
    maria: { lang: 'es-ES', slot: 1 },
  };
  const res = fusionarVocesUsuarios(raiz, nuevas);
  assert.deepEqual(res.juan, { lang: 'es-ES', slot: 2 });
  assert.deepEqual(res.maria, { lang: 'es-ES', slot: 1 });
  rmSync(raiz, { recursive: true, force: true });
});

test('leerUsuariosIgnorados devuelve semilla si no existe el fichero', () => {
  const raiz = raizTemporal();
  assert.deepEqual(leerUsuariosIgnorados(raiz), [...USUARIOS_IGNORADOS_SEMILLA]);
  rmSync(raiz, { recursive: true, force: true });
});

test('guardarUsuarioIgnorado persiste en minúsculas y no duplica', () => {
  const raiz = raizTemporal();
  const res = guardarUsuarioIgnorado(raiz, 'PepitoElPapas');
  assert.ok(res.includes('pepitoelpapas'));
  assert.equal(res.filter(u => u === 'pepitoelpapas').length, 1);
  assert.deepEqual(leerUsuariosIgnorados(raiz), res);
  rmSync(raiz, { recursive: true, force: true });
});

test('quitarUsuarioIgnorado elimina el usuario de la lista', () => {
  const raiz = raizTemporal();
  guardarUsuarioIgnorado(raiz, 'pepitoelpapas');
  const res = quitarUsuarioIgnorado(raiz, 'pepitoelpapas');
  assert.equal(res.includes('pepitoelpapas'), false);
  rmSync(raiz, { recursive: true, force: true });
});

test('fusionarUsuariosIgnorados une nuevos usuarios sin duplicar', () => {
  const raiz = raizTemporal();
  const res = fusionarUsuariosIgnorados(raiz, ['PepitoElPapas', 'OtroBot', 'streamelements']);
  assert.ok(res.includes('pepitoelpapas'));
  assert.ok(res.includes('otrobot'));
  assert.ok(res.includes('streamelements'));
  assert.equal(res.filter(u => u === 'streamelements').length, 1);
  rmSync(raiz, { recursive: true, force: true });
});

test('reemplazarUsuariosIgnorados sobrescribe completamente la lista permitiendo vaciar o quitar', () => {
  const raiz = raizTemporal();
  const res = reemplazarUsuariosIgnorados(raiz, ['pepitoelpapas']);
  assert.deepEqual(res, ['pepitoelpapas']);
  assert.deepEqual(leerUsuariosIgnorados(raiz), ['pepitoelpapas']);

  const vacio = reemplazarUsuariosIgnorados(raiz, []);
  assert.deepEqual(vacio, []);
  assert.deepEqual(leerUsuariosIgnorados(raiz), []);
  rmSync(raiz, { recursive: true, force: true });
});
