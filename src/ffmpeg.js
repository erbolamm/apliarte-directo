/**
 * Construcción de las líneas de FFmpeg.
 *
 * Se devuelve siempre un array de argumentos, nunca una cadena de shell: así no hay forma de que
 * una URL o un nombre de archivo se interpreten como comando.
 */

/** Reenvío puro: copia los flujos tal cual llegan de OBS, sin recodificar (coste de CPU ~0). */
export function argumentosRelay({ entrada, salida }) {
  if (!entrada) throw new Error('argumentosRelay: falta la «entrada».');
  if (!salida) throw new Error('argumentosRelay: falta la «salida».');

  return [
    '-hide_banner',
    '-loglevel', 'warning',
    '-i', entrada,
    '-c', 'copy',
    '-f', 'flv',
    salida,
  ];
}

/**
 * Respaldo: emite un archivo local en bucle infinito.
 *
 * `-re` y `-stream_loop` deben ir ANTES de `-i`: son opciones de entrada. Detrás, FFmpeg las
 * ignora en silencio y el vídeo se emitiría de una sola pasada y a toda velocidad.
 */
export function argumentosRespaldo({ archivo, salida, duracion = null }) {
  if (!archivo) throw new Error('argumentosRespaldo: falta el «archivo» de respaldo.');
  if (!salida) throw new Error('argumentosRespaldo: falta la «salida».');

  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-re',
    '-stream_loop', '-1',
    '-i', archivo,
  ];

  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    // Fotograma clave cada 2 s sea cual sea el fps del archivo: YouTube rechaza intervalos > 4 s
    // y libx264 usa 250 fotogramas por defecto (8,3 s a 30 fps).
    '-force_key_frames', 'expr:gte(t,n_forced*2)',
    '-c:a', 'aac',
  );

  const dur = Number(duracion);
  if (Number.isFinite(dur) && dur > 0) {
    args.push('-t', String(dur));
  }

  args.push('-f', 'flv', salida);
  return args;
}
