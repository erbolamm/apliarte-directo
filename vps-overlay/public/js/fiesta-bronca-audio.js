// Controlador de audio para las animaciones colectivas !fiesta y !bronca
// en la Oficina 3D. Observa window.Oficina3D.runtime.fiestaState y broncaState.
(() => {
  const FIESTA_SRC = '/sonidos/fiesta.mp3?v=20261010';
  const BRONCA_SRC = '/sonidos/bronca.mp3?v=20261010';

  const audioFiesta = typeof Audio !== 'undefined' ? new Audio(FIESTA_SRC) : null;
  const audioBronca = typeof Audio !== 'undefined' ? new Audio(BRONCA_SRC) : null;

  if (audioFiesta) {
    audioFiesta.preload = 'auto';
    audioFiesta.volume = 0.8;
  }
  if (audioBronca) {
    audioBronca.preload = 'auto';
    audioBronca.volume = 0.8;
  }

  let baseVolume = 0.8;
  let muted = false;
  let fiestaPlaying = false;
  let broncaPlaying = false;
  let fadeFiestaTimer = null;
  let fadeBroncaTimer = null;

  function cancelFade(which) {
    if (which === 'fiesta' && fadeFiestaTimer) {
      clearInterval(fadeFiestaTimer);
      fadeFiestaTimer = null;
    }
    if (which === 'bronca' && fadeBroncaTimer) {
      clearInterval(fadeBroncaTimer);
      fadeBroncaTimer = null;
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

  function setVolume(v) {
    baseVolume = Math.max(0, Math.min(1, v));
    if (!muted) {
      if (fiestaPlaying && audioFiesta) audioFiesta.volume = baseVolume;
      if (broncaPlaying && audioBronca) audioBronca.volume = baseVolume;
    }
  }

  function setMuted(m) {
    muted = Boolean(m);
    if (audioFiesta) audioFiesta.volume = muted ? 0 : baseVolume;
    if (audioBronca) audioBronca.volume = muted ? 0 : baseVolume;
  }

  const pollInterval = setInterval(() => {
    const rt = window.Oficina3D?.runtime;
    if (!rt) return;

    const congaActive = rt.congaState?.phase === 'dancing' || rt.congaState?.phase === 'countdown';
    if (congaActive) {
      if (fiestaPlaying) stopFiesta(true);
      if (broncaPlaying) stopBronca(true);
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
  }, 150);

  // Escuchar eventos directos personalizados
  window.addEventListener('erbolamm:fiesta-start', () => playFiesta());
  window.addEventListener('erbolamm:fiesta-stop', () => stopFiesta(false));
  window.addEventListener('erbolamm:bronca-start', () => playBronca());
  window.addEventListener('erbolamm:bronca-stop', () => stopBronca(false));
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
    setVolume,
    setMuted,
    getStatus: () => ({
      fiestaPlaying,
      broncaPlaying,
      baseVolume,
      muted,
      audioFiesta,
      audioBronca,
    }),
    _pollInterval: pollInterval,
  };
})();
