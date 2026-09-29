/**
 * Listas del panel de comandos Twitch (usuarios, canales, mensajes guardados
 * y comandos del bot), persistidas en `directo/data/panel/` en vez de
 * localStorage (paso 8 de la cadena directo/tts-apliarte): así se comparten
 * entre cualquier navegador/dispositivo que abra el panel, no solo el que
 * las guardó.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const TIPOS_LISTA_SIMPLE = Object.freeze(['usuario', 'canal', 'mensaje']);

function rutaLista(raizDatos, tipo) {
  return join(raizDatos, 'panel', `${tipo}.json`);
}

function leerJson(ruta, porDefecto) {
  if (!existsSync(ruta)) return porDefecto;
  try {
    const datos = JSON.parse(readFileSync(ruta, 'utf8'));
    return Array.isArray(datos) ? datos : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribirJson(ruta, datos) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(datos));
}

export function esTipoSimpleValido(tipo) {
  return TIPOS_LISTA_SIMPLE.includes(tipo);
}

export function leerListaSimple(raizDatos, tipo) {
  return leerJson(rutaLista(raizDatos, tipo), []);
}

/** Añade `valor` si no estaba ya (comparación exacta). Devuelve la lista resultante. */
export function agregarAListaSimple(raizDatos, tipo, valor) {
  const ruta = rutaLista(raizDatos, tipo);
  const lista = leerJson(ruta, []);
  if (!lista.includes(valor)) {
    lista.push(valor);
    escribirJson(ruta, lista);
  }
  return lista;
}

export function quitarDeListaSimple(raizDatos, tipo, valor) {
  const ruta = rutaLista(raizDatos, tipo);
  const lista = leerJson(ruta, []);
  const indice = lista.indexOf(valor);
  if (indice !== -1) {
    lista.splice(indice, 1);
    escribirJson(ruta, lista);
  }
  return lista;
}

function rutaComandosBot(raizDatos) {
  return join(raizDatos, 'panel', 'comandos-bot.json');
}

// Función, no constante: leerJson devuelve esta referencia tal cual cuando no
// hay fichero, y agregarComandoBot/quitarComandoBot la mutan con push/splice.
// Con un array compartido a nivel de módulo, el primer push contaminaba la
// semilla para siempre (bug real, encontrado por el propio test de abajo).
function comandoBotSemilla() {
  return [['!so [usuario]', 'Destacar o recomendar a otro streamer (shoutout) promo']];
}

export function leerComandosBot(raizDatos) {
  return leerJson(rutaComandosBot(raizDatos), comandoBotSemilla());
}

export function agregarComandoBot(raizDatos, comando, descripcion) {
  const ruta = rutaComandosBot(raizDatos);
  const lista = leerJson(ruta, comandoBotSemilla());
  lista.push([comando, descripcion]);
  escribirJson(ruta, lista);
  return lista;
}

export function quitarComandoBot(raizDatos, comando) {
  const ruta = rutaComandosBot(raizDatos);
  const lista = leerJson(ruta, comandoBotSemilla());
  const indice = lista.findIndex(item => (Array.isArray(item) ? item[0] : item) === comando);
  if (indice !== -1) {
    lista.splice(indice, 1);
    escribirJson(ruta, lista);
  }
  return lista;
}

export function vaciarComandosBot(raizDatos) {
  const ruta = rutaComandosBot(raizDatos);
  escribirJson(ruta, []);
  return [];
}

/**
 * Une `valores` (lo que el navegador tenía en localStorage) con lo guardado en
 * disco: añade al final lo que falte, sin duplicar ni reordenar lo que ya
 * había. Sustituye a la migración «solo si el servidor está vacío», que dejaba
 * fuera todo lo añadido en el navegador mientras el servidor no respondía.
 */
export function fusionarEnListaSimple(raizDatos, tipo, valores) {
  const ruta = rutaLista(raizDatos, tipo);
  const lista = leerJson(ruta, []);
  let cambiado = false;
  for (const bruto of valores) {
    if (typeof bruto !== 'string') continue;
    const valor = bruto.trim();
    if (!valor || lista.includes(valor)) continue;
    lista.push(valor);
    cambiado = true;
  }
  if (cambiado) escribirJson(ruta, lista);
  return lista;
}

/** Igual que fusionarEnListaSimple, por el texto del comando: la descripción guardada no se pisa. */
export function fusionarComandosBot(raizDatos, comandos) {
  const ruta = rutaComandosBot(raizDatos);
  const lista = leerJson(ruta, comandoBotSemilla());
  let cambiado = false;
  for (const par of comandos) {
    if (!Array.isArray(par) || typeof par[0] !== 'string') continue;
    const comando = par[0].trim();
    if (!comando || lista.some(([cmd]) => cmd === comando)) continue;
    const descripcion = typeof par[1] === 'string' && par[1].trim() ? par[1].trim() : '—';
    lista.push([comando, descripcion]);
    cambiado = true;
  }
  if (cambiado) escribirJson(ruta, lista);
  return lista;
}

function rutaVocesUsuarios(raizDatos) {
  return join(raizDatos, 'panel', 'voces-usuarios.json');
}

function leerObjetoJson(ruta, porDefecto) {
  if (!existsSync(ruta)) return porDefecto;
  try {
    const datos = JSON.parse(readFileSync(ruta, 'utf8'));
    return datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function leerVocesUsuarios(raizDatos) {
  return leerObjetoJson(rutaVocesUsuarios(raizDatos), {});
}

export function guardarVozUsuario(raizDatos, usuario, config) {
  const ruta = rutaVocesUsuarios(raizDatos);
  const mapa = leerObjetoJson(ruta, {});
  mapa[usuario.toLowerCase()] = config;
  escribirJson(ruta, mapa);
  return mapa;
}

export function fusionarVocesUsuarios(raizDatos, nuevasVoces) {
  const ruta = rutaVocesUsuarios(raizDatos);
  const mapa = leerObjetoJson(ruta, {});
  let cambiado = false;
  for (const [usuario, config] of Object.entries(nuevasVoces || {})) {
    const key = usuario.toLowerCase();
    if (!mapa[key] && config && typeof config === 'object') {
      mapa[key] = config;
      cambiado = true;
    }
  }
  if (cambiado) escribirJson(ruta, mapa);
  return mapa;
}

function rutaUsuariosIgnorados(raizDatos) {
  return join(raizDatos, 'panel', 'usuarios-ignorados.json');
}

export const USUARIOS_IGNORADOS_SEMILLA = Object.freeze([
  'streamelements',
  'nightbot',
  'streamlabs',
  'streamlabsbot',
  'botrix',
  'wizebot',
  'moobot',
  'pepitoelpapas',
  'soundalerts',
  'kofistreambot',
  'pretzelrocks',
  'fossabot',
]);

export function leerUsuariosIgnorados(raizDatos) {
  const ruta = rutaUsuariosIgnorados(raizDatos);
  return leerJson(ruta, [...USUARIOS_IGNORADOS_SEMILLA]);
}

export function guardarUsuarioIgnorado(raizDatos, usuario) {
  if (!usuario || typeof usuario !== 'string') return leerUsuariosIgnorados(raizDatos);
  const uNorm = usuario.trim().toLowerCase();
  if (!uNorm) return leerUsuariosIgnorados(raizDatos);

  const ruta = rutaUsuariosIgnorados(raizDatos);
  const lista = leerJson(ruta, [...USUARIOS_IGNORADOS_SEMILLA]);
  if (!lista.includes(uNorm)) {
    lista.push(uNorm);
    escribirJson(ruta, lista);
  }
  return lista;
}

export function quitarUsuarioIgnorado(raizDatos, usuario) {
  if (!usuario || typeof usuario !== 'string') return leerUsuariosIgnorados(raizDatos);
  const uNorm = usuario.trim().toLowerCase();
  const ruta = rutaUsuariosIgnorados(raizDatos);
  const lista = leerJson(ruta, [...USUARIOS_IGNORADOS_SEMILLA]);
  const idx = lista.indexOf(uNorm);
  if (idx !== -1) {
    lista.splice(idx, 1);
    escribirJson(ruta, lista);
  }
  return lista;
}

export function fusionarUsuariosIgnorados(raizDatos, nuevos) {
  const ruta = rutaUsuariosIgnorados(raizDatos);
  const lista = leerJson(ruta, [...USUARIOS_IGNORADOS_SEMILLA]);
  let cambiado = false;
  if (Array.isArray(nuevos)) {
    for (const u of nuevos) {
      if (typeof u !== 'string') continue;
      const uNorm = u.trim().toLowerCase();
      if (uNorm && !lista.includes(uNorm)) {
        lista.push(uNorm);
        cambiado = true;
      }
    }
  }
  if (cambiado) escribirJson(ruta, lista);
  return lista;
}

export function reemplazarUsuariosIgnorados(raizDatos, usuarios) {
  const ruta = rutaUsuariosIgnorados(raizDatos);
  const unicos = [];
  if (Array.isArray(usuarios)) {
    for (const u of usuarios) {
      if (typeof u !== 'string') continue;
      const uNorm = u.trim().toLowerCase();
      if (uNorm && !unicos.includes(uNorm)) {
        unicos.push(uNorm);
      }
    }
  }
  escribirJson(ruta, unicos);
  return unicos;
}
