import { parsearComandoChat, sanearTextoComando } from './js/tts-fuentes.js';

// Same agent ids/names as the live overlay. Javier's avatar is not adoptable.
export const PRACTICE_AGENTS = Object.freeze({
  ge: 'Gemini', cl: 'Claude', pi: 'Pi', co: 'Codex',
  om: 'Ollama', gr: 'Groq', op: 'OpenAI', ex: 'Externo', be: 'Vigía'
});

const COUNTDOWN_SECONDS = 3;
const TARGET_OPTIONS = [-3, 3];
const OFFSET_MIN = -3;
const OFFSET_MAX = 3;

/**
 * Create an isolated browser-local practice session for the public demo.
 *
 * Capabilities used (all verified in the real Directo):
 *  - parsearComandoChat: parses !juego, !carrera, !trofeo, !w/a/s/d, !r, etc.
 *  - sanearTextoComando: sanitizes free-form text
 *  - AGENTES_OFICINA catalog: same agent ids as the live overlay
 *
 * Capabilities NOT used (proves isolation):
 *  - No browser outbound transport (verified by test/demo-race.test.js)
 *  - No API calls, Twitch IRC, OBS, or other visitors
 *  - Race state is per-session (two createPracticeSession() calls do not share)
 *
 * @param {Object} [opts]
 * @param {Function} [opts.rng] - seeded random for tests; default Math.random
 * @param {Function} [opts.setTimeoutImpl] - injectable timer; default global setTimeout
 * @param {Function} [opts.clearTimeoutImpl] - injectable clear; default global clearTimeout
 */
export function createPracticeSession({
  rng = Math.random,
  setTimeoutImpl = typeof setTimeout !== 'undefined' ? setTimeout : () => 0,
  clearTimeoutImpl = typeof clearTimeout !== 'undefined' ? clearTimeout : () => {},
} = {}) {
  let selected = null;
  let board = false;
  const offsets = Object.create(null);
  const race = { phase: 'idle', secondsLeft: 0, target: 0, winner: null, countdownTimer: null };
  const state = () => ({
    selected,
    board,
    offsets: { ...offsets },
    race: { phase: race.phase, secondsLeft: race.secondsLeft, target: race.target, winner: race.winner },
  });
  const speech = (agent, text, effect = null) => ({ type: 'speech', agent, text, effect });

  function clearRaceTimer() {
    if (race.countdownTimer) {
      clearTimeoutImpl(race.countdownTimer);
      race.countdownTimer = null;
    }
  }

  function tickCountdown() {
    race.countdownTimer = null;
    if (race.phase !== 'countdown') return;
    race.secondsLeft -= 1;
    if (race.secondsLeft > 0) {
      race.countdownTimer = setTimeoutImpl(() => tickCountdown(), 1000);
    } else {
      race.phase = 'racing';
    }
  }

  function startRace() {
    clearRaceTimer();
    race.phase = 'countdown';
    race.secondsLeft = COUNTDOWN_SECONDS;
    // Reset position so the race is winnable
    offsets[selected] = 0;
    race.target = rng() < 0.5 ? TARGET_OPTIONS[0] : TARGET_OPTIONS[1];
    race.winner = null;
    const events = [
      { type: 'race_start', agent: selected, text: `¡${COUNTDOWN_SECONDS} segundos! Llega a la posición ${race.target}.`, target: race.target },
    ];
    race.countdownTimer = setTimeoutImpl(() => tickCountdown(), 1000);
    return { state: state(), events };
  }

  function choose(agent) {
    if (!Object.hasOwn(PRACTICE_AGENTS, agent)) return { state: state(), events: [{ type: 'notice', text: 'Elige un avatar disponible.' }] };
    selected = agent;
    // Changing agent cancels any in-flight race (visitor-local isolation)
    if (race.phase !== 'idle') {
      clearRaceTimer();
      race.phase = 'idle';
      race.secondsLeft = 0;
      race.winner = null;
    }
    return { state: state(), events: [speech(agent, `¡Hola! Soy ${PRACTICE_AGENTS[agent]}. Escribe para practicar en esta demo.`)] };
  }

  function submit(raw) {
    const text = sanearTextoComando(raw);
    if (!text) return { state: state(), events: [] };
    const command = parsearComandoChat(text);
    if (command?.comando === 'adoptar') return choose(command.agente);
    if (!selected) return { state: state(), events: [{ type: 'notice', text: 'Primero elige un avatar (por ejemplo, !co o !cl).' }] };

    if (/^!damas$/i.test(text)) {
      board = !board;
      return { state: state(), events: [{ type: 'board', enabled: board }] };
    }
    const square = text.match(/^!([a-l][1-8])$/i);
    if (square) return board
      ? { state: state(), events: [{ type: 'square', agent: selected, square: square[1].toLowerCase() }] }
      : { state: state(), events: [{ type: 'notice', text: 'Activa primero el tablero con !damas.' }] };

    // !juego / !carrera / !trofeo → start a local race simulation.
    // !traidor stays as a notice (social deduction game, out of scope for this local sim).
    if (command?.comando === 'juego' && command.variante !== 'traidor') {
      return startRace();
    }

    let events;
    if (!command) events = [speech(selected, text)];
    else if (command.comando === 'say') {
      const target = Object.hasOwn(PRACTICE_AGENTS, command.agente) ? command.agente : selected;
      events = [speech(target, command.texto)];
    } else if (command.comando === 'cafe') {
      const target = Object.hasOwn(PRACTICE_AGENTS, command.agente) ? command.agente : selected;
      events = [speech(target, 'Voy por un café ☕', 'cafe')];
    } else if (command.comando === 'mover') {
      if (race.phase === 'countdown') {
        events = [{ type: 'notice', text: 'Espera a que termine la cuenta atrás.' }];
      } else {
        const steps = command.ruta || [{ dir: command.dir, pasos: command.pasos }];
        const delta = steps.reduce((sum, part) => sum + (part.dir === 'd' ? 1 : part.dir === 'a' ? -1 : 0) * part.pasos, 0);
        offsets[selected] = Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, (offsets[selected] || 0) + delta));
        events = [{ type: 'move', agent: selected, steps }, speech(selected, 'Me muevo por el escenario.', 'mover')];
        if (race.phase === 'racing' && offsets[selected] === race.target) {
          race.phase = 'finished';
          race.winner = selected;
          clearRaceTimer();
          events.push({ type: 'race_win', agent: selected, text: `¡${PRACTICE_AGENTS[selected]} gana la carrera!` });
        }
      }
    } else if (command.comando === 'salta') events = [speech(selected, '¡Salto!', 'salta')];
    else if (command.comando === 'beso') {
      const target = command.agente && command.agente !== selected && Object.hasOwn(PRACTICE_AGENTS, command.agente) ? command.agente : null;
      events = target ? [{ type: 'kiss', agent: selected, target }] : [{ type: 'notice', text: 'Indica otro avatar: !beso cl, por ejemplo.' }];
    } else if (command.comando === 'bronca') events = [{ type: 'scold' }];
    else if (command.comando === 'trabajar') events = [{ type: 'work', agent: selected }];
    else if (command.comando === 'reset') {
      offsets[selected] = 0;
      events = [speech(selected, 'Vuelvo a mi sitio.', 'reset')];
    } else if (command.comando === 'git' || command.comando === 'estado') {
      events = [speech(selected, 'Aquí simulo la reacción; no consulto el Git ni los agentes de tu equipo.')];
    } else if (command?.comando === 'juego' && command.variante === 'traidor') {
      events = [{ type: 'notice', text: 'En el directo real solo Javier inicia !traidor y se exige quórum. La práctica del juego social aún no está disponible aquí.' }];
    } else {
      events = [{ type: 'notice', text: 'Ese comando existe en el directo real, pero todavía no tiene simulación segura en esta demo.' }];
    }
    return { state: state(), events };
  }

  return { choose, submit, getState: state, _tickCountdown: tickCountdown };
}

if (typeof window !== 'undefined') window.DirectoPractice = createPracticeSession();
