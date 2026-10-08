#!/usr/bin/env node
// One-click launcher: installs what is missing, starts the overlay/panel and the restream
// centre together, opens the right page in the browser and stops everything on exit.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comandoAbrir, extraerEnlaceReclamacion, lineaSegura, resumenOBS, versionNodeValida } from './lanzador.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.env.PORT || 7979);
const hijos = [];

const decir = (texto) => console.log(texto);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function salir(codigo, mensaje) {
  if (mensaje) decir(`\n${mensaje}`);
  for (const h of hijos) { try { h.kill(); } catch (_) {} }
  process.exit(codigo);
}

function puertoLibre(puerto) {
  return new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
    s.listen(puerto, '127.0.0.1');
  });
}

function abrir(url) {
  if (process.env.DIRECTO_NO_ABRIR === '1') return; // servers and automated checks
  const [cmd, args] = comandoAbrir(process.platform, url);
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch (_) {
    decir(`Abre esta dirección en tu navegador: ${url.includes('/claim') ? '(la de reclamación no se muestra por seguridad)' : url}`);
  }
}

function arrancar(nombre, args, env, alSalirLinea) {
  const hijo = spawn(process.execPath, args, { cwd: RAIZ, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  hijos.push(hijo);
  const leer = (flujo) => {
    let resto = '';
    flujo.on('data', (d) => {
      resto += d;
      const lineas = resto.split(/\r?\n/);
      resto = lineas.pop();
      for (const l of lineas) { if (l.trim()) { alSalirLinea?.(l); decir(`[${nombre}] ${lineaSegura(l)}`); } }
    });
  };
  leer(hijo.stdout); leer(hijo.stderr);
  hijo.on('exit', (code) => salir(code || 1, `❌ «${nombre}» se ha parado. Se apaga todo. Revisa los mensajes de arriba.`));
  return hijo;
}

async function main() {
  decir('▶ Iniciando ApliArte Directo…');
  if (!versionNodeValida()) {
    salir(1, `❌ Tu Node.js es demasiado antiguo (${process.version}). Instala la versión LTS desde https://nodejs.org y vuelve a abrir el lanzador.`);
  }
  if (!existsSync(join(RAIZ, 'node_modules'))) {
    if (!existsSync(join(RAIZ, 'package-lock.json'))) {
      salir(1, '❌ Falta el archivo package-lock.json. Vuelve a descargar el proyecto completo (botón «Descargar ZIP»).');
    }
    decir('📦 Primera vez: instalando lo necesario (puede tardar un par de minutos)…');
    // Exact reviewed versions from the lockfile, and no package install scripts (blocks the usual malware path).
    const r = spawnSync(npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: RAIZ, stdio: 'inherit' });
    if (r.status !== 0) {
      salir(1, '❌ No se pudo instalar. Revisa el mensaje de arriba. Lo más habitual: no hay conexión a Internet, '
        + 'o el antivirus o la empresa bloquean npm. Si lo copias en una incidencia, podremos ayudarte.');
    }
  }
  for (const [p, que] of [[PUERTO, 'la capa y el panel'], [1935, 'la entrada de OBS'], [8790, 'el centro de emisión']]) {
    if (!(await puertoLibre(p))) {
      salir(1, `❌ El puerto ${p} (${que}) ya está en uso. Seguramente ApliArte Directo ya está abierto en otra ventana: ciérrala y vuelve a intentarlo.`);
    }
  }
  const hayFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

  let abierto = false;
  arrancar('capa', ['server.js'], { PORT: String(PUERTO), HOST: process.env.HOST || '0.0.0.0' }, (linea) => {
    const enlace = extraerEnlaceReclamacion(linea);
    if (enlace && !abierto) { abierto = true; abrir(`http://127.0.0.1:${PUERTO}${enlace}`); }
  });
  if (hayFfmpeg) {
    // Hide Node's English "module type" notice; older Node versions lack the flag.
    const silencio = process.allowedNodeEnvironmentFlags.has('--disable-warning')
      ? ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON'] : [];
    arrancar('centro', [...silencio, 'src/server.js'], { OBS_BRIDGE_WS_URL: `ws://127.0.0.1:${PUERTO}/ws` });
  }
  setTimeout(() => {
    if (!abierto) { abierto = true; abrir(`http://127.0.0.1:${PUERTO}/estudio`); }
    decir(resumenOBS(PUERTO, { centro: hayFfmpeg }));
  }, 3000);
}

process.on('SIGINT', () => salir(0, '👋 Apagando ApliArte Directo…'));
process.on('SIGTERM', () => salir(0));
main().catch((e) => salir(1, `❌ Error inesperado: ${e.message}`));
