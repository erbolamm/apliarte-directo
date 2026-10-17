'use strict';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { server, comunidadDb } = require('../server');

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (_) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

test('Comunidad API - Rutas HTTP de gestión de usuarios y chat', async (t) => {
  // Asegurar servidor escuchando en puerto efímero
  if (!server.listening) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  }

  t.after(() => {
    if (server.listening) server.close();
    if (comunidadDb) comunidadDb.close();
  });

  // 1. Ingestar mensajes a través de comunidadDb
  comunidadDb.registrarMensaje({
    id: 'msg_api_1',
    plataforma: 'twitch',
    usuario: 'espectador1',
    nombreVisible: 'Espectador1',
    texto: 'Mensaje de prueba para la API',
    timestamp: 1729000000000
  });

  comunidadDb.registrarMensaje({
    id: 'msg_api_2',
    plataforma: 'youtube',
    usuario: 'espectador2',
    nombreVisible: 'EspectadorDos',
    texto: 'Saludos desde YouTube Live',
    timestamp: 1729000060000
  });

  // 2. GET /api/directo/comunidad/usuarios
  const resUsuarios = await makeRequest('GET', '/api/directo/comunidad/usuarios');
  assert.equal(resUsuarios.status, 200);
  assert.equal(resUsuarios.data.ok, true);
  assert.ok(resUsuarios.data.total >= 2);
  const u1 = resUsuarios.data.usuarios.find(u => u.usuario === 'espectador1');
  assert.ok(u1);
  assert.equal(u1.nombreVisible, 'Espectador1');

  // 3. GET /api/directo/comunidad/usuario?id=twitch:espectador1
  const resDetalle = await makeRequest('GET', '/api/directo/comunidad/usuario?id=twitch:espectador1');
  assert.equal(resDetalle.status, 200);
  assert.equal(resDetalle.data.ok, true);
  assert.equal(resDetalle.data.usuario.usuario, 'espectador1');
  assert.equal(resDetalle.data.mensajes.length, 1);
  assert.ok(resDetalle.data.agrupadosPorDia);

  // 4. POST /api/directo/comunidad/usuario (actualizar Ficha Técnica)
  const resUpdate = await makeRequest('POST', '/api/directo/comunidad/usuario', {
    id: 'twitch:espectador1',
    rol: 'mod',
    esSuscriptor: true,
    notasContexto: 'Moderador del chat de programación',
    sugerenciaSaludo: '¿Qué tal va el compilador?',
    vozConfig: { lang: 'es-ES', name: 'Jorge', slot: 2 }
  });
  assert.equal(resUpdate.status, 200);
  assert.equal(resUpdate.data.ok, true);
  assert.equal(resUpdate.data.usuario.rol, 'mod');
  assert.equal(resUpdate.data.usuario.esSuscriptor, true);
  assert.equal(resUpdate.data.usuario.notasContexto, 'Moderador del chat de programación');
  assert.equal(resUpdate.data.usuario.sugerenciaSaludo, '¿Qué tal va el compilador?');
  assert.equal(resUpdate.data.usuario.vozConfig.name, 'Jorge');

  // 5. GET /api/directo/comunidad/buscar?q=Live
  const resBuscar = await makeRequest('GET', '/api/directo/comunidad/buscar?q=Live');
  assert.equal(resBuscar.status, 200);
  assert.equal(resBuscar.data.ok, true);
  assert.equal(resBuscar.data.total, 1);
  assert.equal(resBuscar.data.mensajes[0].usuario, 'espectador2');

  // 6. GET /api/directo/comunidad/estadisticas
  const resStats = await makeRequest('GET', '/api/directo/comunidad/estadisticas');
  assert.equal(resStats.status, 200);
  assert.equal(resStats.data.ok, true);
  assert.ok(resStats.data.estadisticas.totalUsuarios >= 2);
  assert.ok(resStats.data.estadisticas.totalMods >= 1);

  // 7. POST /api/directo/comunidad/enviar-mencion
  const resMencion = await makeRequest('POST', '/api/directo/comunidad/enviar-mencion', {
    usuario: 'espectador1',
    plataforma: 'twitch',
    mensaje: 'Muchas gracias por estar en el directo'
  });
  assert.equal(resMencion.status, 200);
  assert.equal(resMencion.data.ok, true);
  assert.equal(resMencion.data.enviado, true);
  assert.equal(resMencion.data.overlay, true);
});
