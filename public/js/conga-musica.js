// Plays the conga track while the office conga is dancing.
// Watches window.Oficina3D.runtime.congaState.phase; no changes to the 3D bundle.
(() => {
  const audio = new Audio('/sonidos/conga.mp3?v=20261003');
  audio.preload = 'auto';
  audio.volume = 0.8;
  let sonando = false;

  function parar() {
    if (!sonando) return;
    sonando = false;
    audio.pause();
    audio.currentTime = 0;
  }

  setInterval(() => {
    const fase = window.Oficina3D?.runtime?.congaState?.phase;
    if (fase === 'dancing' && !sonando) {
      sonando = true;
      audio.currentTime = 0;
      audio.play().catch((err) => console.warn('[conga] audio bloqueado:', err?.message || err));
    } else if (fase !== 'dancing') {
      parar();
    }
  }, 250);
})();
