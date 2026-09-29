// Defensa best-effort: ni el silencio ni un Worker impiden que el navegador
// suspenda el proceso. No confundir recursos activos con audio audible verificado.
export function crearTtsBackground({ bombear, estado, aviso = () => {}, env = globalThis }) {
  let activo = false, actual = null, audio = null, worker = null, timer = null;
  let generacion = 0, audioOk = false;
  const urls = [];
  const synth = env.speechSynthesis;
  const ahora = () => env.performance.now();
  const url = (blob) => {
    const value = env.URL.createObjectURL(blob);
    urls.push(value);
    return value;
  };
  const pintar = () => estado(!activo ? 'Detenido' :
    audioOk && worker ? '🟢 Apoyo en segundo plano activo (sin garantía)' :
      '🟠 Apoyo en segundo plano limitado');

  function finalizar(turno, cancelar = false) {
    if (actual !== turno) return;
    actual = null; // invalidar ANTES de cancel(): puede emitir eventos síncronos
    turno.u.onend = turno.u.onerror = null;
    if (cancelar) { try { synth.cancel(); } catch (_) {} }
    // El siguiente tick bombea; evita recursión si speak() falla síncronamente.
  }

  function tick() {
    if (!activo) return;
    const turno = actual;
    if (turno) {
      const t = ahora();
      if (t - turno.inicio >= turno.limite) {
        finalizar(turno, true);
        aviso('⚠️ Voz sin finalizar: mensaje descartado por timeout; continúa la cola.');
      } else if (t - turno.ultimoDespertar >= 12000) {
        turno.ultimoDespertar = t;
        try { synth.pause(); synth.resume(); } catch (_) {}
      }
    }
    if (!actual) bombear();
  }

  function fallback() {
    if (worker) worker.terminate();
    worker = null;
    if (timer === null) timer = env.setInterval(tick, 250);
    pintar();
  }

  function iniciar() {
    if (activo) return;
    activo = true;
    const sesion = ++generacion;
    try {
      worker = new env.Worker(url(new env.Blob([
        "setInterval(() => postMessage('tick'), 250);",
      ], { type: 'application/javascript' })));
      worker.onmessage = () => { if (sesion === generacion) tick(); };
      worker.onerror = () => { if (activo && sesion === generacion) fallback(); };
    } catch (_) { fallback(); }
    try {
      // WAV PCM mono, 8 kHz, 16 bits, un segundo de ceros (silencio real).
      const buffer = new ArrayBuffer(16044);
      const view = new DataView(buffer);
      const texto = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
      texto(0, 'RIFF'); view.setUint32(4, 16036, true); texto(8, 'WAVE');
      texto(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, 8000, true);
      view.setUint32(28, 16000, true); view.setUint16(32, 2, true);
      view.setUint16(34, 16, true); texto(36, 'data'); view.setUint32(40, 16000, true);
      audio = new env.Audio(url(new env.Blob([buffer], { type: 'audio/wav' })));
      audio.loop = true;
      audio.volume = 0.01;
      const media = audio;
      const limitado = () => {
        if (sesion !== generacion || !activo) return;
        audioOk = false; pintar();
      };
      media.onerror = media.onpause = limitado;
      media.onplaying = () => {
        if (sesion !== generacion || !activo) return;
        audioOk = true; pintar();
      };
      // Se ejecuta durante el gesto de Activar, nunca desde un timer.
      Promise.resolve(media.play()).catch(limitado);
    } catch (_) { audioOk = false; }
    pintar();
  }

  function detener() {
    activo = false;
    ++generacion;
    if (actual) finalizar(actual);
    try { synth.cancel(); } catch (_) {}
    if (worker) worker.terminate();
    worker = null;
    if (timer !== null) env.clearInterval(timer);
    timer = null;
    if (audio) {
      audio.onplaying = audio.onpause = audio.onerror = null;
      audio.pause(); audio.removeAttribute('src'); audio.load();
    }
    audio = null; audioOk = false;
    urls.splice(0).forEach(value => env.URL.revokeObjectURL(value));
    pintar();
  }

  function hablar(u) {
    if (!activo || actual) return false;
    const inicio = ahora();
    // Presupuesto proporcional para no cortar a los 12 s una lectura legítima.
    // Tope absoluto 5 minutos: una voz rota nunca retiene la cola indefinidamente.
    const limite = Math.min(300000, Math.max(45000,
      u.text.length * 200 / Math.max(0.5, Number(u.rate) || 1) + 15000));
    const turno = { u, inicio, ultimoDespertar: inicio, limite };
    actual = turno; // referencia fuerte mientras habla
    u.onend = u.onerror = () => finalizar(turno);
    try { synth.speak(u); } catch (_) { finalizar(turno, true); }
    return true;
  }

  return { iniciar, detener, hablar, tick, get ocupado() { return actual !== null; } };
}
