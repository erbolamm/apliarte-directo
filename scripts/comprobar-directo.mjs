#!/usr/bin/env node
// Morning check before going live: verifies the pieces that used to "undo"
// themselves (Pizarra Plus, conga, crystal walls, music) on the running servers.
// Read-only: only HTTP GETs to 127.0.0.1. Exit code 0 = all green.
import net from 'node:net';

const PANEL = 'http://127.0.0.1:7979';

const puertoAbierto = (port) => new Promise((ok) => {
  const s = net.connect(port, '127.0.0.1');
  s.setTimeout(1500);
  s.once('connect', () => { s.destroy(); ok(true); });
  s.once('error', () => ok(false));
  s.once('timeout', () => { s.destroy(); ok(false); });
});

async function get(path) {
  try {
    const r = await fetch(PANEL + path, { signal: AbortSignal.timeout(4000) });
    return { status: r.status, text: r.ok ? await r.text() : '' };
  } catch {
    return { status: 0, text: '' };
  }
}

const comprobaciones = [
  ['Panel y overlay (:7979) escuchando', async () => puertoAbierto(7979)],
  ['Centro de emisión (:8790) escuchando', async () => puertoAbierto(8790)],
  ['Entrada OBS RTMP (:1935) escuchando', async () => puertoAbierto(1935)],
  ['Pizarra Plus activa (/pizarra-plus responde 200)', async () => (await get('/pizarra-plus')).status === 200],
  ['Oficina 3D con la conga (office-3d.js)', async () => (await get('/office-3d.js')).text.includes('Idea: Conga de ManzDev')],
  ['Muros de cristal (office-3d.css)', async () => (await get('/office-3d.css')).text.includes('Muros exteriores y murete frontal')],
  ['Chat reconoce !conga (tts-fuentes.js)', async () => (await get('/js/tts-fuentes.js')).text.includes('comando: "conga"')],
  ['Cuenta atrás, cartel y música (conga-musica.js)', async () => (await get('/js/conga-musica.js')).text.includes('triggerWake')],
  ['Canción de la conga (sonidos/conga.mp3)', async () => (await get('/sonidos/conga.mp3')).status === 200],
];

let fallos = 0;
for (const [nombre, prueba] of comprobaciones) {
  let ok = false;
  try { ok = await prueba(); } catch { ok = false; }
  if (!ok) fallos += 1;
  console.log(`${ok ? '[ OK ]' : '[FALLA]'} ${nombre}`);
}
console.log(fallos === 0
  ? '\nTodo en verde: puedes entrar en directo.'
  : `\n${fallos} comprobación(es) en rojo: revísalas antes de entrar en directo.`);
process.exit(fallos === 0 ? 0 : 1);
