// Controlador de audio para las animaciones colectivas !fiesta, !bronca y !trabajar
// en la Oficina 3D. Observa window.Oficina3D.runtime.fiestaState, broncaState y trabajoState.
(() => {
  const FIESTA_SRC = '/sonidos/fiesta.mp3?v=20261010';
  const BRONCA_SRC = '/sonidos/bronca.mp3?v=20261010';
  const TRABAJO_SRC = '/sonidos/trabajo.mp3?v=20261012';

  const audioFiesta = typeof Audio !== 'undefined' ? new Audio(FIESTA_SRC) : null;
  const audioBronca = typeof Audio !== 'undefined' ? new Audio(BRONCA_SRC) : null;
  const audioTrabajo = typeof Audio !== 'undefined' ? new Audio(TRABAJO_SRC) : null;

  if (audioFiesta) {
    audioFiesta.preload = 'auto';
    audioFiesta.volume = 0.8;
  }
  if (audioBronca) {
    audioBronca.preload = 'auto';
    audioBronca.volume = 0.8;
  }
  if (audioTrabajo) {
    audioTrabajo.preload = 'auto';
    audioTrabajo.volume = 0.8;
  }

  let baseVolume = 0.8;
  let muted = false;
  let fiestaPlaying = false;
  let broncaPlaying = false;
  let trabajoPlaying = false;
  let fadeFiestaTimer = null;
  let fadeBroncaTimer = null;
  let fadeTrabajoTimer = null;

  function cancelFade(which) {
    if (which === 'fiesta' && fadeFiestaTimer) {
      clearInterval(fadeFiestaTimer);
      fadeFiestaTimer = null;
    }
    if (which === 'bronca' && fadeBroncaTimer) {
      clearInterval(fadeBroncaTimer);
      fadeBroncaTimer = null;
    }
    if (which === 'trabajo' && fadeTrabajoTimer) {
      clearInterval(fadeTrabajoTimer);
      fadeTrabajoTimer = null;
    }
  }

  function fadeAudio(audio, startVol, endVol, durationMs, onComplete) {
    if (!audio) return;
    const steps = 15;
    const stepTime = Math.max(16, Math.floor(durationMs / steps));
    let step = 0;
    audio.volume = Math.max(0, Math.min(1, startVol));
    const timer = setInterval(() => {
      step++;
      const current = startVol + (endVol - startVol) * (step / steps);
      audio.volume = Math.max(0, Math.min(1, current));
      if (step >= steps) {
        clearInterval(timer);
        if (typeof onComplete === 'function') onComplete();
      }
    }, stepTime);
    return timer;
  }

  function playFiesta() {
    if (!audioFiesta) return;
    if (broncaPlaying) stopBronca(true);
    if (trabajoPlaying) stopTrabajo(true);
    cancelFade('fiesta');
    fiestaPlaying = true;
    audioFiesta.currentTime = 0;
    const targetVol = muted ? 0 : baseVolume;
    fadeFiestaTimer = fadeAudio(audioFiesta, 0, targetVol, 300);
    audioFiesta.play().catch(err => {
      console.warn('[fiesta-audio] Reproducción bloqueada por navegador:', err?.message || err);
    });
  }

  function stopFiesta(immediate = false) {
    if (!audioFiesta || !fiestaPlaying) return;
    fiestaPlaying = false;
    cancelFade('fiesta');
    if (immediate) {
      audioFiesta.pause();
      audioFiesta.currentTime = 0;
      audioFiesta.volume = muted ? 0 : baseVolume;
    } else {
      fadeFiestaTimer = fadeAudio(audioFiesta, audioFiesta.volume, 0, 500, () => {
        audioFiesta.pause();
        audioFiesta.currentTime = 0;
        audioFiesta.volume = muted ? 0 : baseVolume;
        fadeFiestaTimer = null;
      });
    }
  }

  function playBronca() {
    if (!audioBronca) return;
    if (fiestaPlaying) stopFiesta(true);
    if (trabajoPlaying) stopTrabajo(true);
    cancelFade('bronca');
    broncaPlaying = true;
    audioBronca.currentTime = 0;
    const targetVol = muted ? 0 : baseVolume;
    fadeBroncaTimer = fadeAudio(audioBronca, 0, targetVol, 200);
    audioBronca.play().catch(err => {
      console.warn('[bronca-audio] Reproducción bloqueada por navegador:', err?.message || err);
    });
  }

  function stopBronca(immediate = false) {
    if (!audioBronca || !broncaPlaying) return;
    broncaPlaying = false;
    cancelFade('bronca');
    if (immediate) {
      audioBronca.pause();
      audioBronca.currentTime = 0;
      audioBronca.volume = muted ? 0 : baseVolume;
    } else {
      fadeBroncaTimer = fadeAudio(audioBronca, audioBronca.volume, 0, 500, () => {
        audioBronca.pause();
        audioBronca.currentTime = 0;
        audioBronca.volume = muted ? 0 : baseVolume;
        fadeBroncaTimer = null;
      });
    }
  }

  function playTrabajo() {
    if (!audioTrabajo) return;
    if (fiestaPlaying) stopFiesta(true);
    if (broncaPlaying) stopBronca(true);
    cancelFade('trabajo');
    trabajoPlaying = true;
    audioTrabajo.currentTime = 0;
    const targetVol = muted ? 0 : baseVolume;
    fadeTrabajoTimer = fadeAudio(audioTrabajo, 0, targetVol, 500);
    audioTrabajo.play().catch(err => {
      console.warn('[trabajo-audio] Reproducción bloqueada por navegador:', err?.message || err);
    });
  }

  function stopTrabajo(immediate = false) {
    if (!audioTrabajo || !trabajoPlaying) return;
    trabajoPlaying = false;
    cancelFade('trabajo');
    if (immediate) {
      audioTrabajo.pause();
      audioTrabajo.currentTime = 0;
      audioTrabajo.volume = muted ? 0 : baseVolume;
    } else {
      fadeTrabajoTimer = fadeAudio(audioTrabajo, audioTrabajo.volume, 0, 800, () => {
        audioTrabajo.pause();
        audioTrabajo.currentTime = 0;
        audioTrabajo.volume = muted ? 0 : baseVolume;
        fadeTrabajoTimer = null;
      });
    }
  }

  function setVolume(v) {
    baseVolume = Math.max(0, Math.min(1, v));
    if (!muted) {
      if (fiestaPlaying && audioFiesta) audioFiesta.volume = baseVolume;
      if (broncaPlaying && audioBronca) audioBronca.volume = baseVolume;
      if (trabajoPlaying && audioTrabajo) audioTrabajo.volume = baseVolume;
    }
  }

  function setMuted(m) {
    muted = Boolean(m);
    if (audioFiesta) audioFiesta.volume = muted ? 0 : baseVolume;
    if (audioBronca) audioBronca.volume = muted ? 0 : baseVolume;
    if (audioTrabajo) audioTrabajo.volume = muted ? 0 : baseVolume;
  }

  const pollInterval = setInterval(() => {
    const rt = window.Oficina3D?.runtime;
    if (!rt) return;

    const congaActive = rt.congaState?.phase === 'dancing' || rt.congaState?.phase === 'countdown';
    if (congaActive) {
      if (fiestaPlaying) stopFiesta(true);
      if (broncaPlaying) stopBronca(true);
      if (trabajoPlaying) stopTrabajo(true);
      return;
    }

    const fiestaFase = rt.fiestaState?.phase;
    if (fiestaFase === 'party' && !fiestaPlaying) {
      playFiesta();
    } else if (fiestaFase !== 'party' && fiestaPlaying) {
      stopFiesta(false);
    }

    const broncaFase = rt.broncaState?.phase;
    if (broncaFase === 'brawl' && !broncaPlaying) {
      playBronca();
    } else if (broncaFase !== 'brawl' && broncaPlaying) {
      stopBronca(false);
    }

    const trabajoFase = rt.trabajoState?.phase;
    if (trabajoFase === 'working' && !trabajoPlaying && !fiestaPlaying && !broncaPlaying) {
      playTrabajo();
    } else if (trabajoFase !== 'working' && trabajoPlaying) {
      stopTrabajo(false);
    }
  }, 150);

  // Escuchar eventos directos personalizados
  window.addEventListener('erbolamm:fiesta-start', () => playFiesta());
  window.addEventListener('erbolamm:fiesta-stop', () => stopFiesta(false));
  window.addEventListener('erbolamm:bronca-start', () => playBronca());
  window.addEventListener('erbolamm:bronca-stop', () => stopBronca(false));
  window.addEventListener('erbolamm:trabajo-start', () => playTrabajo());
  window.addEventListener('erbolamm:trabajo-stop', () => stopTrabajo(false));
  window.addEventListener('erbolamm:audio-mute', (e) => setMuted(e.detail?.muted));
  window.addEventListener('erbolamm:audio-volume', (e) => {
    if (typeof e.detail?.volume === 'number') setVolume(e.detail.volume);
  });

  // Exposición para inspección y tests
  window.FiestaBroncaAudio = {
    playFiesta,
    stopFiesta,
    playBronca,
    stopBronca,
    playTrabajo,
    stopTrabajo,
    setVolume,
    setMuted,
    getStatus: () => ({
      fiestaPlaying,
      broncaPlaying,
      trabajoPlaying,
      baseVolume,
      muted,
      audioFiesta,
      audioBronca,
      audioTrabajo,
    }),
    _pollInterval: pollInterval,
  };
})();
