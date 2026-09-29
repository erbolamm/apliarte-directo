/**
 * Rutas HTTP de las listas del panel de comandos (usuarios, canales, mensajes
 * y comandos del bot). Viven en su propio módulo, con test de rutas, porque
 * escritas a mano dentro de server.js se perdieron en una edición concurrente
 * (2026-09-17/18) sin que ningún test lo detectara.
 *
 * El panel se abre desde la Oficina (:8791), otro origen: estas rutas ponen
 * su propio CORS para no depender del middleware global de server.js.
 */

import express from 'express';
import { corsPanelLocal } from './panel-origin.js';

import {
  esTipoSimpleValido,
  leerListaSimple,
  agregarAListaSimple,
  quitarDeListaSimple,
  fusionarEnListaSimple,
  leerComandosBot,
  agregarComandoBot,
  quitarComandoBot,
  vaciarComandosBot,
  fusionarComandosBot,
  leerVocesUsuarios,
  guardarVozUsuario,
  fusionarVocesUsuarios,
  leerUsuariosIgnorados,
  guardarUsuarioIgnorado,
  quitarUsuarioIgnorado,
  fusionarUsuariosIgnorados,
  reemplazarUsuariosIgnorados,
} from './panel-listas.js';

/** `raizDatos` es la carpeta `data/` de directo (en los tests, una temporal). */
export function crearRutasPanel(raizDatos) {
  const rutas = express.Router();
  rutas.use('/api/panel', corsPanelLocal);

  rutas.get('/api/panel/lista', (req, res) => {
    const tipo = req.query.tipo;
    if (!esTipoSimpleValido(tipo)) {
      res.status(400).json({ error: `Tipo no válido: ${tipo}` });
      return;
    }
    res.json({ valores: leerListaSimple(raizDatos, tipo) });
  });

  rutas.post('/api/panel/lista', (req, res) => {
    const { tipo, accion, valor, valores } = req.body ?? {};
    if (!esTipoSimpleValido(tipo)) {
      res.status(400).json({ error: `Tipo no válido: ${tipo}` });
      return;
    }
    if (accion === 'agregar') {
      if (typeof valor !== 'string' || !valor.trim()) {
        res.status(400).json({ error: 'Valor requerido' });
        return;
      }
      res.json({ valores: agregarAListaSimple(raizDatos, tipo, valor.trim()) });
    } else if (accion === 'quitar') {
      res.json({ valores: quitarDeListaSimple(raizDatos, tipo, valor) });
    } else if (accion === 'fusionar') {
      if (!Array.isArray(valores)) {
        res.status(400).json({ error: 'valores debe ser una lista' });
        return;
      }
      res.json({ valores: fusionarEnListaSimple(raizDatos, tipo, valores) });
    } else {
      res.status(400).json({ error: `Acción desconocida: ${accion}` });
    }
  });

  rutas.get('/api/panel/comandos-bot', (_req, res) => {
    res.json({ comandos: leerComandosBot(raizDatos) });
  });

  rutas.post('/api/panel/comandos-bot', (req, res) => {
    const { accion, comando, descripcion, comandos } = req.body ?? {};
    if (accion === 'agregar') {
      let cmd = comando;
      let texto = typeof descripcion === 'string' && descripcion.trim() ? descripcion.trim() : '—';
      if (Array.isArray(comando)) {
        cmd = comando[0];
        if (typeof comando[1] === 'string' && comando[1].trim()) texto = comando[1].trim();
      }
      if (typeof cmd !== 'string' || !cmd.trim()) {
        res.status(400).json({ error: 'Comando requerido' });
        return;
      }
      res.json({ comandos: agregarComandoBot(raizDatos, cmd.trim(), texto) });
    } else if (accion === 'quitar') {
      res.json({ comandos: quitarComandoBot(raizDatos, comando) });
    } else if (accion === 'vaciar' || accion === 'limpiar') {
      res.json({ comandos: vaciarComandosBot(raizDatos) });
    } else if (accion === 'fusionar') {
      if (!Array.isArray(comandos)) {
        res.status(400).json({ error: 'comandos debe ser una lista' });
        return;
      }
      res.json({ comandos: fusionarComandosBot(raizDatos, comandos) });
    } else {
      res.status(400).json({ error: `Acción desconocida: ${accion}` });
    }
  });

  rutas.get('/api/panel/voces', (_req, res) => {
    res.json({ voces: leerVocesUsuarios(raizDatos) });
  });

  rutas.post('/api/panel/voces', (req, res) => {
    const { accion, usuario, voz, voces } = req.body ?? {};
    if (accion === 'guardar' || (usuario && voz)) {
      if (!usuario || typeof usuario !== 'string' || !usuario.trim()) {
        res.status(400).json({ error: 'Usuario requerido' });
        return;
      }
      res.json({ voces: guardarVozUsuario(raizDatos, usuario.trim(), voz) });
    } else if (accion === 'fusionar' || voces) {
      if (!voces || typeof voces !== 'object') {
        res.status(400).json({ error: 'voces debe ser un objeto' });
        return;
      }
      res.json({ voces: fusionarVocesUsuarios(raizDatos, voces) });
    } else {
      res.status(400).json({ error: `Acción desconocida` });
    }
  });

  rutas.get('/api/panel/usuarios-ignorados', (_req, res) => {
    res.json({ usuarios: leerUsuariosIgnorados(raizDatos) });
  });

  rutas.post('/api/panel/usuarios-ignorados', (req, res) => {
    const { accion, usuario, usuarios } = req.body ?? {};
    if (accion === 'agregar' || (usuario && !accion)) {
      if (!usuario || typeof usuario !== 'string' || !usuario.trim()) {
        res.status(400).json({ error: 'Usuario requerido' });
        return;
      }
      res.json({ usuarios: guardarUsuarioIgnorado(raizDatos, usuario.trim()) });
    } else if (accion === 'quitar') {
      if (!usuario || typeof usuario !== 'string' || !usuario.trim()) {
        res.status(400).json({ error: 'Usuario requerido' });
        return;
      }
      res.json({ usuarios: quitarUsuarioIgnorado(raizDatos, usuario.trim()) });
    } else if (accion === 'reemplazar' || accion === 'sobrescribir') {
      if (!Array.isArray(usuarios)) {
        res.status(400).json({ error: 'usuarios debe ser un array' });
        return;
      }
      res.json({ usuarios: reemplazarUsuariosIgnorados(raizDatos, usuarios) });
    } else if (accion === 'fusionar' || usuarios) {
      if (!Array.isArray(usuarios)) {
        res.status(400).json({ error: 'usuarios debe ser un array' });
        return;
      }
      res.json({ usuarios: fusionarUsuariosIgnorados(raizDatos, usuarios) });
    } else {
      res.status(400).json({ error: 'Acción desconocida' });
    }
  });

  return rutas;
}
