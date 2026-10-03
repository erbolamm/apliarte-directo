// Conga overlay layer for the office pages: music while dancing, a visible
// 10-second countdown and the alternating ManzDev / ApliArte credit sign.
// Watches window.Oficina3D.runtime.congaState; no changes to the 3D bundle.
(() => {
  const audio = new Audio('/sonidos/conga.mp3?v=20261003');
  audio.preload = 'auto';
  audio.volume = 0.8;
  let sonando = false;

  const estilo = document.createElement('style');
  estilo.textContent = `
    .conga-capa { position: fixed; left: 50%; transform: translateX(-50%); z-index: 2147483000;
      pointer-events: none; font-family: "Inter", system-ui, sans-serif; text-align: center; }
    .conga-cuenta { top: 12%; padding: 12px 28px; border-radius: 12px; background: rgba(0, 70, 123, 0.92);
      color: #fff; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35); }
    .conga-cuenta .num { display: block; font-size: 96px; font-weight: 800; line-height: 1; }
    .conga-cuenta .txt { display: block; margin-top: 6px; font-size: 24px; font-weight: 600; }
    .conga-credito { bottom: 4%; padding: 8px 22px; border-radius: 10px; background: rgba(0, 95, 169, 0.94);
      color: #fff; font-size: 26px; font-weight: 700; white-space: nowrap; transition: opacity 0.35s ease; }
    .conga-credito strong { color: #ffd166; }
  `;
  document.head.appendChild(estilo);

  const cuenta = document.createElement('div');
  cuenta.className = 'conga-capa conga-cuenta';
  cuenta.hidden = true;
  const num = document.createElement('span');
  num.className = 'num';
  const txt = document.createElement('span');
  txt.className = 'txt';
  txt.textContent = 'Conga: escribe !conga para unirte';
  cuenta.append(num, txt);

  const credito = document.createElement('div');
  credito.className = 'conga-capa conga-credito';
  credito.hidden = true;

  const montar = () => document.body.append(cuenta, credito);
  if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);

  const textos = [
    ['Idea: Conga de ', 'ManzDev', ' · manz.dev'],
    ['Conga en la oficina de ', 'ApliArte', ''],
  ];
  let textoActual = -1;
  function ponerCredito(i) {
    if (i === textoActual) return;
    textoActual = i;
    const [a, b, c] = textos[i];
    const fuerte = document.createElement('strong');
    fuerte.textContent = b;
    credito.replaceChildren(a, fuerte, c);
  }

  function pararMusica() {
    if (!sonando) return;
    sonando = false;
    audio.pause();
    audio.currentTime = 0;
  }

  setInterval(() => {
    const rt = window.Oficina3D?.runtime;
    const st = rt?.congaState;
    const fase = st?.phase;
    const ahora = performance.now();

    // The office render loop stops when nothing moves (App.tsx loop keeps
    // running only while tick() reports motion), which froze the conga at the
    // end of the countdown. Keep it awake while a conga is in progress.
    if (fase && fase !== 'idle' && typeof rt.triggerWake === 'function') rt.triggerWake();

    if (fase === 'countdown') {
      const quedan = Math.max(0, Math.ceil((st.countdownEndsAt - ahora) / 1000));
      num.textContent = String(quedan);
      cuenta.hidden = false;
    } else {
      cuenta.hidden = true;
    }

    if (fase === 'countdown' || fase === 'dancing') {
      ponerCredito(Math.floor(ahora / 3000) % 2);
      credito.hidden = false;
    } else {
      credito.hidden = true;
    }

    if (fase === 'dancing' && !sonando) {
      sonando = true;
      audio.currentTime = 0;
      audio.play().catch((err) => console.warn('[conga] audio bloqueado:', err?.message || err));
    } else if (fase !== 'dancing') {
      pararMusica();
    }
  }, 200);
})();
