import { AGENTS, ROTATING_IDS, type AgentId, normalizeLiveSnapshot, type LiveSnapshot } from './agents';
import { CHAT_ZONE_COMMANDS, COMMAND_SEAT, DELIV_SLOTS, EQUIPO1_SLOTS, JUNCTION, LOUNGE_SLOTS, OWNER_DESK, VIGIA_PATROL, VISITOR_SEAT, WAITING_SLOTS, WORK_SLOTS, WORKER_SLOTS, ZONE_ANCHORS, pathLength, pointAt, type Pose, type Pt, type ZoneId } from './layout';
import { isBoardMode, navigate, parseSquare, setBoardMode, squareCenter } from './geometry';
import {
  type CongaAgentId,
  type CongaState,
  emptyCongaState,
  applyCongaCommand as applyCongaCommandPure,
  tickConga as tickCongaPure,
  getCongaAgentPositions,
  getCreditText,
  getAdoptionSpeech,
  CONGA_CREDIT,
  CONGA_ADOPT_TEXT,
  countdownSecondsLeft,
} from './conga';
import {
  type FiestaState,
  emptyFiestaState,
  startFiesta,
  tickFiesta,
  isFiestaActive,
} from './fiesta';
import {
  type BroncaState,
  emptyBroncaState,
  startBronca,
  tickBronca,
  isBroncaActive,
} from './bronca';
export type Task={role:AgentId;project:string;title:string;fileName:string;priority:string};
export type Snapshot={valid:boolean;states:Record<string,Task[]>;orchestrator:AgentId|null};
export type Person={id:AgentId;pos:Pt;pose:Pose;facing:number;status:string;path:Pt[]|null;target:Pt;travelled:number;deliveringUntil:number;queued:number;speaking?:boolean;manualUntil?:number;isRear?:boolean;jumping?:boolean;speed?:number};
export type CinematicType = 'beso' | 'bronca' | 'trabajar';
export type CinematicTask = {
  type: CinematicType;
  actor1: AgentId;
  actor2: AgentId;
  text: string;
  speaker: AgentId;
};
export type ActiveCinematic = {
  task: CinematicTask;
  startTime: number;
  phase: 1 | 2 | 3;
  center1: Pt;
  center2: Pt;
};
export type GamePhase = 'countdown' | 'running' | 'won';
export interface ActiveGame {
  phase: GamePhase;
  target: Pt;
  startTime: number;
  countdownEnd: number;
  winner?: { id: AgentId; user?: string };
  winTime?: number;
  lastCountdownSec?: number;
}
export const GAME_TARGET_SPOTS: Pt[] = [
  { x: 628, y: 456 },
  { x: 310, y: 456 },
  { x: 950, y: 456 },
  { x: 470, y: 456 },
  { x: 790, y: 456 },
  { x: 200, y: 320 },
  { x: 800, y: 280 },
  { x: 310, y: 620 },
  { x: 950, y: 620 },
];
/** Minimum adopted viewers (Javier excluded) required to start any game. */
export const GAME_QUORUM = 3;
export const LOBBY_MS = 60000;
export const TRAITOR_DEBATE_MS = 300000;
export const TRAITOR_VOTE_MS = 45000;
/** Chalk outline spot in the meeting room: free floor below the meeting table. */
export const CHALK_CENTER: Pt = { x: 860, y: 307 };
export const CIRCLE_RADIUS = 78;
export type HubPhase = 'lobby_votacion' | 'traidor_intro' | 'traidor_debate' | 'traidor_votacion' | 'traidor_expulsion' | 'muerte_subita' | 'finalizado';
const HUB_PHASES: HubPhase[] = ['lobby_votacion', 'traidor_intro', 'traidor_debate', 'traidor_votacion', 'traidor_expulsion', 'muerte_subita', 'finalizado'];
/** Public game state (`GET /api/directo/juego/estado`). Never carries the traitor identity. */
export type PublicGameState = {
  fase: string;
  tiempoRestanteMs: number;
  quorumMinimo: number;
  espectadoresAdoptados: string[];
  juegoSeleccionado: string | null;
  votos: Record<string, number>;
  rondaTraidor: number;
  jugadoresVivos: AgentId[];
  ultimoExpulsado: AgentId | null;
  ganador: string | null;
};
export type HubState = {
  fase: HubPhase;
  endsAt: number;
  source: 'local' | 'server';
  votes: Record<string, number>;
  voters: Record<string, string>;
  players: AgentId[];
  expelled: AgentId | null;
  round: number;
  winner: string | null;
};
export type LobbyResult = { result: 'idle' | 'trofeo' | 'traidor'; reason?: 'quorum' | 'sin_votos'; votes: Record<string, number> };
/** Evenly spaced floor slots around the chalk outline, starting at the top. */
export function circleSlots(n: number, center: Pt = CHALK_CENTER, radius = CIRCLE_RADIUS): Pt[] {
  const count = Math.max(0, Math.floor(n));
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return { x: Math.round(center.x + radius * Math.cos(a)), y: Math.round(center.y + radius * Math.sin(a)) };
  });
}
/** Whitelists the public payload so unexpected keys (e.g. `traidorSecreto`) never reach the overlay. */
export function normalizeGameState(raw: unknown): PublicGameState {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ids = (v: unknown) => Array.isArray(v) ? v.filter((x): x is AgentId => typeof x === 'string' && roles.has(x as AgentId) && x !== 'ja') : [];
  const votos: Record<string, number> = {};
  if (p.votos && typeof p.votos === 'object') {
    for (const [k, v] of Object.entries(p.votos as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) votos[k] = Math.floor(n);
    }
  }
  const expelled = typeof p.ultimoExpulsado === 'string' && roles.has(p.ultimoExpulsado as AgentId) ? p.ultimoExpulsado as AgentId : null;
  const quorum = Number(p.quorumMinimo ?? p.quoromMinimo);
  return {
    fase: typeof p.fase === 'string' ? p.fase : 'idle',
    tiempoRestanteMs: Math.max(0, Number(p.tiempoRestanteMs) || 0),
    quorumMinimo: Number.isFinite(quorum) && quorum > 0 ? quorum : GAME_QUORUM,
    espectadoresAdoptados: Array.isArray(p.espectadoresAdoptados) ? p.espectadoresAdoptados.filter((u): u is string => typeof u === 'string') : [],
    juegoSeleccionado: typeof p.juegoSeleccionado === 'string' ? p.juegoSeleccionado : null,
    votos,
    rondaTraidor: Math.max(1, Math.floor(Number(p.rondaTraidor) || 1)),
    jugadoresVivos: ids(p.jugadoresVivos),
    ultimoExpulsado: expelled,
    ganador: typeof p.ganador === 'string' ? p.ganador : null,
  };
}
const emit = (name: string, detail?: unknown) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail }));
};
const JUNCTION_ACTOR1: Pt = { x: 605, y: 456 };
const JUNCTION_ACTOR2: Pt = { x: 651, y: 456 };
const roles=new Set(AGENTS.map(a=>a.id));
/** Poses que un agente idle puede mostrar al azar en la sala de descanso.
 * Equilibradas para que ninguna aparezca mucho más que las otras:
 * - read/sleep/watch: 2 (actividades tranquilas)
 * - idle/sit:        3 (actividades neutras)
 * - game:           1 (la menos probable, para no abusar)
 * Total 12 entradas, cada una con la misma probabilidad 1/12. */
const IDLE_POSES:Pose[]=['idle','idle','idle','sit','sit','sit','read','read','sleep','sleep','watch','game'];
const randomFrom=<T>(arr:T[]):T=>arr[Math.floor(Math.random()*arr.length)];
export function normalizeSnapshot(raw:unknown):Snapshot {
 const p=raw as Record<string,unknown>|null;
 const result:Snapshot={valid:p?.valid===true,states:{'por-hacer':[],haciendo:[],hecho:[]},orchestrator:null};
 if(!p||typeof p!=='object')return result;
 const office=p.office as Record<string,unknown>|undefined;
 if(office?.valid===true&&roles.has(office.orchestrator as AgentId))result.orchestrator=office.orchestrator as AgentId;
 const states=p.states as Record<string,unknown>|undefined;
 if(result.valid&&(!states||typeof states!=='object'||Object.keys(result.states).some(k=>!Array.isArray(states[k]))))result.valid=false;
 if(result.valid&&states&&typeof states==='object')for(const key of Object.keys(result.states)) {
  const entries=states[key];if(!Array.isArray(entries))continue;
  result.states[key]=entries.filter(t=>t&&typeof t==='object'&&roles.has(t.role)&&typeof (t.fileName||t.file)==='string'&&(t.fileName||t.file).trim()).map(t=>({role:t.role,project:String(t.project||''),title:String(t.title||t.task||'Tarea sin título'),fileName:String(t.fileName||t.file),priority:String(t.priority||'normal')}));
 }
 return result;
}
const equal=(a:Pt,b:Pt)=>Math.hypot(a.x-b.x,a.y-b.y)<.1;
const lounge=(id:AgentId)=>{
 const idx=AGENTS.filter(a=>a.id!=='ja').findIndex(a=>a.id===id);
 return LOUNGE_SLOTS[Math.max(0,idx)%LOUNGE_SLOTS.length];
};
const COFFEE_STATION: Pt = { x: 96, y: 320 };
/** Live chat command forwarded by `/api/directo/comando` (Twitch `!` commands). */
export type OfficeCommand={comando:string;agente?:string|null;texto?:string|null;usuario?:string|null;seq?:number;zona?:string|null};
export type Speech={text:string;until:number};
export const SPEECH_MAX=120;
/** Bubble lifetime grows with the text: 5 s minimum, 15 s maximum. */
export function speechDuration(_text?: string): number {
  return 5000;
}
/** Splits spoken text into at most `maxLines` lines of about `width` characters. */
export function wrapSpeech(text:string,width=30,maxLines=4):string[]{
 const lines:string[]=[];let line='';
 for(const word of text.split(/\s+/).filter(Boolean)){
  const chunks=Array.from(word).length>width?word.match(new RegExp(`.{1,${width}}`,'gu'))??[word]:[word];
  for(const chunk of chunks){
   if(!line)line=chunk;
   else if(Array.from(line).length+1+Array.from(chunk).length<=width)line+=` ${chunk}`;
   else{lines.push(line);line=chunk;}
  }
 }
 if(line)lines.push(line);
 if(lines.length>maxLines){const kept=lines.slice(0,maxLines);kept[maxLines-1]=`${Array.from(kept[maxLines-1]).slice(0,width-1).join('')}…`;return kept;}
 return lines;
}
const cleanSpeech=(text:unknown)=>Array.from(String(text??'').replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim()).slice(0,SPEECH_MAX).join('').trim();
export class OfficeRuntime {
  coffeeRun: { agentId: AgentId; phase: 1 | 2 | 3 | 4 | 5; phaseEnd: number } | null = null;
  cinematicQueue: CinematicTask[] = [];
  activeCinematic: ActiveCinematic | null = null;
  activeGame: ActiveGame | null = null;
  lastGameEndTime = -Infinity;
  /** Game hub (`!juego` lobby and `!traidor` phases). `null` means idle. */
  hub: HubState | null = null;
  /** Twitch users that adopted an avatar, Javier excluded. Feeds the quorum guard. */
  adoptedViewers: string[] = [];
  /** avatar id → twitch login. Used to walk the writer's avatar on `!oficina` and the other room commands. */
  avatarOwners: Record<string, string> = {};
  /** The quorum guard applies once the live overlay reports its viewers; the plain office has none. */
  quorumEnforced = false;
  /** !conga circuit state. Pure state machine in `./conga`. */
  congaState: CongaState = emptyCongaState('apliarte');
  /** !fiesta celebration state. Pure state machine in `./fiesta`. */
  fiestaState: FiestaState = emptyFiestaState();
  /** !bronca comedic brawl state. Pure state machine in `./bronca`. */
  broncaState: BroncaState = emptyBroncaState();
  /** Cached dancer positions, recomputed each tick. */
  private congaPositions: Map<CongaAgentId, Pt> = new Map();
  /** Last announced countdown second (0..10). */
  private lastCongaCountdownSec: number = -1;

  /** Records who adopted which avatar. Keys are agent ids, values are twitch logins. */
  setAvatarOwners(owners: Record<string, string> | null | undefined) {
    const next: Record<string, string> = {};
    if (owners && typeof owners === 'object') {
      for (const [avatar, owner] of Object.entries(owners)) {
        if (!roles.has(avatar as AgentId)) continue;
        const name = String(owner ?? '').trim();
        if (name) next[avatar] = name;
      }
    }
    this.avatarOwners = next;
  }

  setAdoptedViewers(users: string[]) {
    this.quorumEnforced = true;
    const seen = new Set<string>();
    this.adoptedViewers = users.map(u => String(u || '').trim()).filter(u => {
      const key = u.toLowerCase();
      if (!key || key === 'apliarte' || key === 'erbolamm' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  hasQuorum(): boolean {
    return !this.quorumEnforced || this.adoptedViewers.length >= GAME_QUORUM;
  }

  /** The office stands still while the `!juego` poster is on screen. */
  isFrozen(): boolean {
    return this.hub?.fase === 'lobby_votacion';
  }

  isTraitorActive(): boolean {
    return Boolean(this.hub && this.hub.fase !== 'lobby_votacion');
  }

  private traitorSlot(id: AgentId): Pt | null {
    if (!this.hub || this.hub.fase === 'lobby_votacion') return null;
    if (this.hub.fase === 'traidor_expulsion' && this.hub.expelled === id) return { ...JUNCTION };
    const idx = this.hub.players.indexOf(id);
    if (idx === -1) return null;
    return circleSlots(this.hub.players.length)[idx];
  }

  /** Opens the 60 s voting poster driven locally by the overlay. */
  openLobby(now: number): { ok: boolean; reason?: string } {
    if (this.hub) return { ok: false, reason: 'running' };
    if (this.activeGame) return { ok: false, reason: 'running' };
    if (this.isCinematicActive()) return { ok: false, reason: 'cinematic' };
    this.hub = { fase: 'lobby_votacion', endsAt: now + LOBBY_MS, source: 'local', votes: { '1': 0, '2': 0 }, voters: {}, players: [], expelled: null, round: 1, winner: null };
    this.say('ja', '🎮 ¡Hora de jugar! Votad 1 (!trofeo) o 2 (!traidor). Tenéis 1 minuto.', now);
    emit('erbolamm:hub-open', { endsAt: this.hub.endsAt, lobbyMs: LOBBY_MS });
    this.triggerWake();
    return { ok: true };
  }

  /** One vote per adopted viewer during the lobby; the last vote counts. */
  castLobbyVote(user: string, option: number): boolean {
    if (!this.hub || this.hub.fase !== 'lobby_votacion' || this.hub.source !== 'local') return false;
    if (option !== 1 && option !== 2) return false;
    const key = String(user || '').trim().toLowerCase();
    if (!this.adoptedViewers.some(u => u.toLowerCase() === key)) return false;
    const previous = this.hub.voters[key];
    if (previous) this.hub.votes[previous] = Math.max(0, (this.hub.votes[previous] || 0) - 1);
    this.hub.voters[key] = String(option);
    this.hub.votes[String(option)] = (this.hub.votes[String(option)] || 0) + 1;
    emit('erbolamm:hub-update', { votes: { ...this.hub.votes } });
    this.triggerWake();
    return true;
  }

  /** Ends a local lobby: without quorum or votes the office thaws back to idle. */
  closeLobby(now: number): LobbyResult {
    const votes = { ...(this.hub?.votes ?? {}) };
    if (!this.hub || this.hub.fase !== 'lobby_votacion') return { result: 'idle', votes };
    this.hub = null;
    let outcome: LobbyResult;
    if (!this.hasQuorum()) outcome = { result: 'idle', reason: 'quorum', votes };
    else if (!votes['1'] && !votes['2']) outcome = { result: 'idle', reason: 'sin_votos', votes };
    else outcome = { result: (votes['2'] || 0) > (votes['1'] || 0) ? 'traidor' : 'trofeo', votes };
    if (outcome.reason === 'quorum') this.say('ja', `😴 No hay quórum: hacen falta ${GAME_QUORUM} espectadores con avatar adoptado.`, now);
    else if (outcome.reason === 'sin_votos') this.say('ja', '😴 Nadie ha votado. ¡Otra vez será!', now);
    emit('erbolamm:hub-close', outcome);
    if (outcome.result === 'trofeo') this.iniciarJuego(now, 'ja');
    this.triggerWake();
    return outcome;
  }

  /** Applies the public server state. Server phases override a local lobby. */
  applyGameState(raw: unknown, now: number) {
    const state = normalizeGameState(raw);
    const fase = HUB_PHASES.includes(state.fase as HubPhase) ? state.fase as HubPhase : null;
    if (!fase) {
      if (this.hub?.source === 'server') {
        this.hub = null;
        emit('erbolamm:hub-close', { result: state.fase.startsWith('trofeo') ? 'trofeo' : 'idle', votes: state.votos, ganador: state.ganador });
        this.triggerWake();
      }
      if (state.fase === 'trofeo_countdown' && !this.activeGame) this.iniciarJuego(now, 'ja');
      return;
    }
    const prev = this.hub;
    const expelledChanged = fase === 'traidor_expulsion' && (prev?.fase !== 'traidor_expulsion' || prev.expelled !== state.ultimoExpulsado);
    const players = (fase === 'traidor_expulsion' || fase === 'muerte_subita' || fase === 'finalizado') && state.ultimoExpulsado && !state.jugadoresVivos.includes(state.ultimoExpulsado)
      ? [...state.jugadoresVivos, state.ultimoExpulsado]
      : state.jugadoresVivos;
    this.hub = {
      fase,
      endsAt: now + state.tiempoRestanteMs,
      source: 'server',
      votes: state.votos,
      voters: {},
      players,
      expelled: (fase === 'traidor_expulsion' || fase === 'muerte_subita' || fase === 'finalizado') ? state.ultimoExpulsado : null,
      round: state.rondaTraidor,
      winner: state.ganador,
    };
    if (prev?.fase !== fase || expelledChanged) {
      if (fase === 'lobby_votacion' && prev?.fase !== 'lobby_votacion') emit('erbolamm:hub-open', { endsAt: this.hub.endsAt, lobbyMs: LOBBY_MS });
      if (fase === 'traidor_intro') this.say('ja', '🔪 ¡Han asesinado a alguien en la sala de reuniones! Hay un traidor entre nosotros...', now);
      if (fase === 'traidor_debate') this.say('ja', '🗣️ ¡Debate abierto! 5 minutos para señalar al traidor.', now);
      if (fase === 'traidor_votacion') this.say('ja', '🗳️ ¡A votar! Escribid el número del sospechoso.', now);
      if (fase === 'muerte_subita') this.say('ja', '⚡ ¡Muerte súbita! Quedan 3 supervivientes y la votación es decisiva.', now);
      if (fase === 'finalizado') {
        if (state.ganador === 'inocentes') this.say('ja', '🎉 ¡El traidor ha sido descubierto! ¡Ganan los inocentes!', now);
        else if (state.ganador === 'traidor') this.say('ja', '😈 ¡El traidor ha eliminado a los inocentes! ¡Gana el traidor!', now);
      }
      if (fase === 'traidor_expulsion' && state.ultimoExpulsado) {
        const p = this.people.find(person => person.id === state.ultimoExpulsado);
        if (p) { p.manualUntil = 0; p.isRear = false; }
        this.say(state.ultimoExpulsado, '😱 ¡Nooo! ¡Soy expulsado de la reunión!', now);
      }
      for (const p of this.people) {
        if (!players.includes(p.id)) continue;
        p.manualUntil = 0;
        p.isRear = false;
        this.move(p, this.destination(p, now));
      }
    }
    emit('erbolamm:hub-state', { ...state, fase });
    this.triggerWake();
  }

  isCinematicActive(): boolean {
    return this.activeCinematic !== null;
  }

  isGameActive(): boolean {
    return this.activeGame !== null;
  }

  /** Starts the `!trofeo` race. Requires quorum of adopted viewers (Javier excluded). */
  iniciarJuego(now: number, caller?: AgentId): { ok: boolean; reason?: string; segundosRestantes?: number; faltan?: number } {
    if (this.hub) {
      return { ok: false, reason: 'running' };
    }
    if (this.isCinematicActive()) {
      return { ok: false, reason: 'cinematic' };
    }
    if (this.activeGame) {
      return { ok: false, reason: 'running' };
    }
    if (now - this.lastGameEndTime < 45000) {
      const rem = Math.ceil((45000 - (now - this.lastGameEndTime)) / 1000);
      return { ok: false, reason: 'cooldown', segundosRestantes: rem };
    }
    if (!this.hasQuorum()) {
      return { ok: false, reason: 'quorum', faltan: GAME_QUORUM - this.adoptedViewers.length };
    }

    const target = GAME_TARGET_SPOTS[Math.floor(Math.random() * GAME_TARGET_SPOTS.length)];
    this.activeGame = {
      phase: 'countdown',
      target: { ...target },
      startTime: now,
      countdownEnd: now + 5000,
      lastCountdownSec: 5,
    };

    this.say('ja', '🏁 ¡¡ATENCIÓN!! ¡Arranca !trofeo! Objetivo marcado en el mapa 🏆. ¡Empieza en 5s...!', now);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erbolamm:game-start', {
        detail: { target, countdownSec: 5 }
      }));
    }
    this.triggerWake();
    return { ok: true };
  }

  private wakeListeners = new Set<() => void>();
  onWake(cb: () => void) { this.wakeListeners.add(cb); return () => { this.wakeListeners.delete(cb); }; }
  triggerWake() {
    for (const cb of this.wakeListeners) {
      try { cb(); } catch (_) {}
    }
  }

  enqueueCinematic(task: CinematicTask, now: number) {
    this.cinematicQueue.push(task);
    if (!this.activeCinematic) {
      this.startNextCinematic(now);
    }
    this.triggerWake();
  }

  private startNextCinematic(now: number) {
    if (this.cinematicQueue.length === 0) {
      this.activeCinematic = null;
      return;
    }
    const task = this.cinematicQueue.shift()!;
    const isSolo = task.actor1 === task.actor2;
    const center1 = isSolo ? { ...JUNCTION } : { ...JUNCTION_ACTOR1 };
    const center2 = isSolo ? { ...JUNCTION } : { ...JUNCTION_ACTOR2 };

    this.activeCinematic = {
      task,
      startTime: now,
      phase: 1,
      center1,
      center2,
    };

    const p1 = this.people.find(p => p.id === task.actor1);
    const p2 = isSolo ? null : this.people.find(p => p.id === task.actor2);

    if (p1) {
      p1.manualUntil = 0;
      p1.isRear = false;
      this.move(p1, center1);
      const len = p1.path ? pathLength(p1.path) : 0;
      p1.speed = Math.max(90, Math.min(260, len / 4.4));
    }
    if (p2) {
      p2.manualUntil = 0;
      p2.isRear = false;
      this.move(p2, center2);
      const len = p2.path ? pathLength(p2.path) : 0;
      p2.speed = Math.max(90, Math.min(260, len / 4.4));
    }
    this.triggerWake();
  }

  /** Pose actual en el lounge cuando el agente está idle. Aleatoria al
   * inicializar y rotada por `tick` cada cierto intervalo. */
  private idlePose=new Map<AgentId,Pose>();
 people:Person[]=AGENTS.map(a=>{const s=a.id==='ja'?OWNER_DESK:lounge(a.id);const initialPose:Pose=a.id==='ja'?'coffee':randomFrom(IDLE_POSES);return{id:a.id,pos:{x:s.x,y:s.y},target:{x:s.x,y:s.y},pose:initialPose,facing:1,status:'Sin datos',path:null,travelled:0,deliveringUntil:0,queued:0};});
 snapshot:Snapshot=normalizeSnapshot(null);
 /** Agentes con ficha abierta ahora mismo, por orden de llegada. Varios
  * pueden visitar el despacho a la vez; cada uno solo se va cuando cierra
  * su propia ficha, nunca porque se abra otra. */
 visiting:AgentId[]=[];
 focusedVisitor:AgentId|null=null;
 private initialized=false;
 private delivered=new Set<string>();
 private reduced=false;
 setReduced(value:boolean){this.reduced=value;if(value)for(const p of this.people)if(p.path){p.pos={...p.target};p.path=null;}}
 private baseTarget(id:AgentId):Pt {
  if(id==='ja'){
   const working=this.snapshot.states.haciendo.some(t=>t.role==='ja');
   return working?COMMAND_SEAT:OWNER_DESK;
  }
  if(this.snapshot.orchestrator&&this.snapshot.orchestrator!=='ja'&&id===this.snapshot.orchestrator)return COMMAND_SEAT;
  if(this.snapshot.states.haciendo.some(t=>t.role===id)){
   if(WORK_SLOTS[id] && WORK_SLOTS[id].x > 0) return WORK_SLOTS[id];
   const seat=ROTATING_IDS.find(s=>!this.snapshot.states.haciendo.some(t=>t.role===s)&&s!==this.snapshot.orchestrator);
   return seat?WORK_SLOTS[seat]:lounge(id);
  }
  return lounge(id);
 }
 homeTarget(id:AgentId):Pt {
  if(this.liveSnapshot.valid) return this.liveTarget(id);
  return this.baseTarget(id);
 }
 private destination(p:Person,now:number):Pt {
  const slot=this.traitorSlot(p.id);
  if(slot)return slot;
  if (this.activeCinematic) {
   if (p.id === this.activeCinematic.task.actor1) {
    if (this.activeCinematic.phase === 1 || this.activeCinematic.phase === 2) {
     return this.activeCinematic.center1;
    }
    if (this.activeCinematic.phase === 3) {
     return this.homeTarget(p.id);
    }
   }
   if (this.activeCinematic.task.actor2 !== this.activeCinematic.task.actor1 && p.id === this.activeCinematic.task.actor2) {
    if (this.activeCinematic.phase === 1 || this.activeCinematic.phase === 2) {
     return this.activeCinematic.center2;
    }
    if (this.activeCinematic.phase === 3) {
     return this.homeTarget(p.id);
    }
   }
  }
  if (this.coffeeRun && this.coffeeRun.agentId === p.id) {
   if (this.coffeeRun.phase === 1 || this.coffeeRun.phase === 2) return COFFEE_STATION;
   if (this.coffeeRun.phase === 3 || this.coffeeRun.phase === 4) return VISITOR_SEAT;
   if (this.coffeeRun.phase === 5) return this.homeTarget(p.id);
  }
  if(p.id==='ja'){
   if(this.visiting.length>0)return OWNER_DESK;
   return this.homeTarget(p.id);
  }
  if(this.visiting.includes(p.id)){
   const activeId=this.focusedVisitor||this.visiting[this.visiting.length-1];
   if(p.id===activeId)return VISITOR_SEAT;
   const other=this.visiting.filter(id=>id!==activeId);
   const idx=other.indexOf(p.id);
   return WAITING_SLOTS[Math.min(Math.max(0,idx),WAITING_SLOTS.length-1)];
  }
  if(p.deliveringUntil>now)return DELIV_SLOTS[p.id];
  return this.homeTarget(p.id);
 }
 private move(p:Person,end:Pt,snap=false) {
  if(equal(p.target,end))return;
  p.target={...end};p.travelled=0;
  if(snap||this.reduced){p.pos={...end};p.path=null;}else {
   try {
    p.path=navigate(p.pos,end);
   } catch (_) {
    p.path=null;
   }
  }
 }
 update(raw:unknown,now:number) {
  const next=normalizeSnapshot(raw);
  if(next.valid){
   const done=new Set(next.states.hecho.map(t=>t.fileName).filter(Boolean));
   if(this.initialized)for(const p of this.people)if(!this.visiting.includes(p.id)&&p.id!=='pi'&&p.id!=='ja'&&!next.states.haciendo.some(t=>t.role===p.id)&&next.states.hecho.some(t=>t.role===p.id&&t.fileName&&!this.delivered.has(t.fileName)))p.deliveringUntil=Infinity;
   for(const file of done)this.delivered.add(file);
  }
  this.snapshot=next;
  for(const p of this.people){
   p.queued=next.valid?next.states['por-hacer'].filter(t=>t.role===p.id).length:0;
   if(!next.valid||next.states.haciendo.some(t=>t.role===p.id))p.deliveringUntil=0;
   this.move(p,this.destination(p,now),!this.initialized||!next.valid);
  }
  this.initialized=next.valid;
  this.tick(now,0);
 }
 /** El agente abre su ficha: se suma a los que ya están de visita, sin
  * desplazar a ninguno. No hace nada para `ja` (su propio despacho) ni si
  * ya estaba visitando. */
 visit(id:AgentId,now:number){
  if(id==='ja')return;
  if(!this.visiting.includes(id))this.visiting.push(id);
  this.focusedVisitor=id;
  const p=this.people.find(p=>p.id===id);if(p)p.deliveringUntil=0;
  for(const person of this.people)this.move(person,this.destination(person,now));
  this.tick(now,0);
 }
 focus(id:AgentId,now:number){
  if(id==='ja')return;
  if(!this.visiting.includes(id))this.visiting.push(id);
  if(this.focusedVisitor===id)return;
  this.focusedVisitor=id;
  for(const person of this.people)this.move(person,this.destination(person,now));
  this.tick(now,0);
 }
 leave(id:AgentId,now:number){
  const i=this.visiting.indexOf(id);
  if(i===-1)return;
  this.visiting.splice(i,1);
  if(this.focusedVisitor===id){
   this.focusedVisitor=this.visiting[this.visiting.length-1]??null;
  }
  for(const person of this.people)this.move(person,this.destination(person,now));
  this.tick(now,0);
 }
 tick(now:number,dt:number) {
  let moving=false;
  if(this.hub&&this.hub.source==='local'&&this.hub.fase==='lobby_votacion'&&now>=this.hub.endsAt)this.closeLobby(now);
  const frozen=this.isFrozen();
  if(frozen)dt=0;
  // Conga tick: advance state, emit phase transitions, countdown announcements
  const prevCongaPhase = this.congaState.phase;
  this.congaState = tickCongaPure(this.congaState, now);
  if (prevCongaPhase !== this.congaState.phase) {
    if (this.congaState.phase === 'dancing') {
      this.say('ja', '¡A bailar! La conga arranca por la oficina.', now);
    } else if (this.congaState.phase === 'ended') {
      // Adoption request bubbles for free-assigned dancers
      for (const d of this.congaState.dancers) {
        if (d.freeAssignment) this.say(d.agentId as AgentId, CONGA_ADOPT_TEXT, now);
      }
    } else if (this.congaState.phase === 'idle' && prevCongaPhase === 'ended') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erbolamm:conga-credit', { detail: { text: null } }));
      }
    }
  }
  if (this.congaState.phase === 'countdown') {
    const sec = countdownSecondsLeft(this.congaState, now);
    if (sec !== this.lastCongaCountdownSec && sec > 0 && sec <= 3) {
      this.say('ja', String(sec), now);
    }
    this.lastCongaCountdownSec = sec;
  }
  // Cache dancer positions for the per-person loop (only while dancing)
  this.congaPositions = this.congaState.phase === 'dancing'
    ? getCongaAgentPositions(this.congaState, now) as Map<CongaAgentId, Pt>
    : new Map();

  // Fiesta tick: advance party state, handle ending transitions
  const prevFiestaPhase = this.fiestaState.phase;
  this.fiestaState = tickFiesta(this.fiestaState, now, dt);
  if (prevFiestaPhase !== this.fiestaState.phase) {
    if (this.fiestaState.phase === 'ended' || (prevFiestaPhase === 'party' && this.fiestaState.phase === 'idle')) {
      for (const p of this.people) {
        p.manualUntil = 0;
        p.jumping = false;
        p.speed = 240;
        this.move(p, this.destination(p, now));
      }
    }
  }

  // Bronca tick: advance brawl state, handle ending transitions
  const prevBroncaPhase = this.broncaState.phase;
  this.broncaState = tickBronca(this.broncaState, now, dt);
  if (prevBroncaPhase !== this.broncaState.phase) {
    if (this.broncaState.phase === 'ended' || (prevBroncaPhase === 'brawl' && this.broncaState.phase === 'idle')) {
      for (const p of this.people) {
        p.manualUntil = 0;
        p.jumping = false;
        p.speed = 240;
        this.move(p, this.destination(p, now));
      }
    }
  }

  for(const p of this.people){
   // Conga dancers: teleport to conga position, set walk pose, apply dance bob
   if (this.congaPositions.has(p.id as CongaAgentId) && this.congaState.phase === 'dancing') {
    const congaPos = this.congaPositions.get(p.id as CongaAgentId)!;
    const bobMs = 400;
    const bobAmp = 3;
    const bobPhase = (now % bobMs) / bobMs;
    const bob = Math.sin(bobPhase * 2 * Math.PI) * bobAmp;
    p.pos = { x: congaPos.x, y: congaPos.y + bob };
    p.path = null;
    p.target = { x: congaPos.x, y: congaPos.y };
    p.travelled = 0;
    p.pose = 'walk';
    p.status = 'Bailando conga';
    moving = true;
    continue;
   }
   // Fiesta celebration: avatars run fast, alternate dancing/gaming/walking poses, and jump
   if (this.fiestaState.phase === 'party') {
    const fav = this.fiestaState.avatars[p.id];
    if (fav) {
     p.status = 'De fiesta';
     p.jumping = fav.jumping;
     p.speed = fav.speed;
     if (!p.path || equal(p.pos, p.target)) {
      this.move(p, fav.target);
     }
     if (p.path) {
      p.travelled += (p.speed || 300) * dt;
      const step = pointAt(p.path, p.travelled);
      p.pos = step.p;
      if (step.dir) p.facing = step.dir;
      if (step.done) {
       p.path = null;
      } else {
       moving = true;
      }
     }
     p.pose = p.path ? 'walk' : fav.pose;
     moving = true;
     continue;
    }
   }
   // Bronca brawl: avatars stampede, collide, flail and brawl
   if (this.broncaState.phase === 'brawl') {
    const bav = this.broncaState.avatars[p.id];
    if (bav) {
     p.status = 'En la bronca';
     p.speed = bav.speed;
     if (!p.path || equal(p.pos, p.target)) {
      this.move(p, bav.target);
     }
     if (p.path) {
      p.travelled += (p.speed || 380) * dt;
      const step = pointAt(p.path, p.travelled);
      p.pos = step.p;
      if (step.dir) p.facing = step.dir;
      if (step.done) {
       p.path = null;
      } else {
       moving = true;
      }
     }
     p.jumping = bav.pose === 'brawl' || bav.pose === 'fall';
     p.pose = p.path ? (bav.pose === 'fall' ? 'fall' : 'brawl') : bav.pose;
     moving = true;
     continue;
    }
   }
   if(p.manualUntil&&p.manualUntil>now){
    if(p.path){
     p.travelled+=(p.speed||160)*dt;
     const step=pointAt(p.path,p.travelled);
     p.pos=step.p;
     if(step.dir)p.facing=step.dir;
     if(step.done){
      p.path=null;
      p.pose=p.isRear?'work':'idle';
     }else{
      moving=true;
      p.pose=p.isRear?'work':'walk';
     }
    }else{
     p.pose=p.isRear?'work':'idle';
    }
    moving=moving||Boolean(p.path);
   }else{
    if(p.manualUntil){p.manualUntil=0;p.isRear=false;}
    this.move(p,this.destination(p,now));
    if(p.path){p.travelled+=(p.speed||240)*dt;const step=pointAt(p.path,p.travelled);p.pos=step.p;if(step.dir)p.facing=step.dir;if(step.done){p.path=null;}else moving=true;}
    if(p.deliveringUntil===Infinity&&equal(p.pos,DELIV_SLOTS[p.id])&&!p.path)p.deliveringUntil=now+3500;
    const working=this.snapshot.states.haciendo.some(t=>t.role===p.id);
    p.status=!this.snapshot.valid?'Sin datos':working?'Trabajando':p.id===this.snapshot.orchestrator?'Coordinando':p.queued?`${p.queued} en cola`:'Descansando';
    if(p.deliveringUntil>now&&this.snapshot.valid)p.status='Entregando · tarea aceptada';
    if(p.id==='ja')p.status=working?'Trabajando':'Javier · dueño';
    p.pose=p.path?'walk':p.id!=='ja'&&this.visiting.includes(p.id)?'sit':p.id==='ja'?(working?'work':'coffee'):working?'work':p.deliveringUntil>now?'deliver':p.id===this.snapshot.orchestrator?'present':this.idlePose.get(p.id)??lounge(p.id).pose;
   }
    if(this.coffeeRun&&this.coffeeRun.agentId===p.id){
     if(this.coffeeRun.phase===1){
      if(!p.path&&equal(p.pos,COFFEE_STATION)){this.coffeeRun.phase=2;this.coffeeRun.phaseEnd=now+2500;p.facing=-1;}
     }else if(this.coffeeRun.phase===2){
      if(now>=this.coffeeRun.phaseEnd){this.coffeeRun.phase=3;this.move(p,VISITOR_SEAT);}
     }else if(this.coffeeRun.phase===3){
      if(!p.path&&equal(p.pos,VISITOR_SEAT)){
       this.coffeeRun.phase=4;
       this.coffeeRun.phaseEnd=now+4000;
       p.facing=1;
       const ja=this.people.find(person=>person.id==='ja');
       if(ja){ja.status='¡Muchas gracias!';ja.pose='coffee';}
      }
     }else if(this.coffeeRun.phase===4){
      if(now>=this.coffeeRun.phaseEnd){
       this.coffeeRun.phase=5;
       this.move(p,this.baseTarget(p.id));
       const ja=this.people.find(person=>person.id==='ja');
       if(ja){
        const jaWorking=this.snapshot.states.haciendo.some(t=>t.role==='ja');
        ja.status=jaWorking?'Trabajando':'Javier · dueño';
        ja.pose=jaWorking?'work':'coffee';
       }
      }
     }else if(this.coffeeRun.phase===5){
      if(!p.path&&equal(p.pos,this.baseTarget(p.id))){this.coffeeRun=null;}
     }
     if(this.coffeeRun&&this.coffeeRun.agentId===p.id){
      if(this.coffeeRun.phase===1){p.status='Yendo a por café...';p.pose='walk';}
      else if(this.coffeeRun.phase===2){p.status='Preparando café...';p.pose='coffee';}
      else if(this.coffeeRun.phase===3){p.status='Llevando café al despacho...';p.pose='coffee';}
      else if(this.coffeeRun.phase===4){p.status='¡Aquí tienes el café, Tito!';p.pose='coffee';p.facing=1;}
      else if(this.coffeeRun.phase===5){p.status='Volviendo al puesto...';p.pose='walk';}
     }
    }
    if(p.id==='ja'&&this.coffeeRun&&this.coffeeRun.phase===4){
     p.status='¡Muchas gracias!';
     p.pose='coffee';
    }
    if(this.activeCinematic&&this.activeCinematic.phase===2){
     if(p.id===this.activeCinematic.task.actor1){
      p.facing=1;
      p.pose=this.activeCinematic.task.type==='bronca'?'present':'idle';
     }else if(p.id===this.activeCinematic.task.actor2){
      p.facing=-1;
      p.pose=this.activeCinematic.task.type==='bronca'?'sit':'idle';
     }
    }
    if(frozen){p.pose=p.path?'idle':p.pose;}
    if(this.isTraitorActive()&&this.hub!.players.includes(p.id)&&!p.path){
     const expelled=this.hub!.fase==='traidor_expulsion'&&this.hub!.expelled===p.id;
     p.pose='idle';
     p.facing=expelled?-1:(CHALK_CENTER.x>=p.pos.x?1:-1);
     p.status=expelled?'Expulsado de la reunión':this.hub!.fase==='traidor_votacion'?'Votando…':'Sospechando…';
    }
    const spoken=this.speech.get(p.id);
    if(spoken&&spoken.until<=now)this.speech.delete(p.id);
    p.speaking=Boolean(spoken&&spoken.until>now);
    if(p.speaking)p.status=spoken!.text;
   }
   if(this.activeCinematic){
    moving=true;
    const elapsed=now-this.activeCinematic.startTime;
    if(this.activeCinematic.phase===1&&elapsed>=5000){
     this.activeCinematic.phase=2;
     const p1=this.people.find(p=>p.id===this.activeCinematic!.task.actor1);
     const p2=this.activeCinematic.task.actor1===this.activeCinematic.task.actor2
      ?null
      :this.people.find(p=>p.id===this.activeCinematic!.task.actor2);
     if(p1){
      p1.pos={...this.activeCinematic.center1};
      p1.target={...this.activeCinematic.center1};
      p1.path=null;
      p1.facing=1;
      p1.pose=this.activeCinematic.task.type==='bronca'?'present':this.activeCinematic.task.type==='trabajar'?'present':'idle';
     }
     if(p2){
      p2.pos={...this.activeCinematic.center2};
      p2.target={...this.activeCinematic.center2};
      p2.path=null;
      p2.facing=-1;
      p2.pose=this.activeCinematic.task.type==='bronca'?'sit':this.activeCinematic.task.type==='trabajar'?'work':'idle';
     }
     if(this.activeCinematic.task.text){
      this.say(this.activeCinematic.task.speaker,this.activeCinematic.task.text,now);
     }
     if(typeof window!=='undefined'){
      window.dispatchEvent(new CustomEvent('erbolamm:focus-center',{detail:{durationMs:5000}}));
     }
     this.triggerWake();
    }else if(this.activeCinematic.phase===2&&elapsed>=10000){
     this.activeCinematic.phase=3;
     if(typeof window!=='undefined'){
      window.dispatchEvent(new CustomEvent('erbolamm:reset-camera'));
     }
     const p1=this.people.find(p=>p.id===this.activeCinematic!.task.actor1);
     const p2=this.activeCinematic.task.actor1===this.activeCinematic.task.actor2
      ?null
      :this.people.find(p=>p.id===this.activeCinematic!.task.actor2);
     if(p1){
      this.move(p1,this.homeTarget(p1.id));
      const len=p1.path?pathLength(p1.path):0;
      p1.speed=Math.max(90,Math.min(260,len/4.5));
     }
     if(p2){
      this.move(p2,this.homeTarget(p2.id));
      const len=p2.path?pathLength(p2.path):0;
      p2.speed=Math.max(90,Math.min(260,len/4.5));
     }
     this.triggerWake();
    }else if(this.activeCinematic.phase===3&&elapsed>=15000){
     const p1=this.people.find(p=>p.id===this.activeCinematic!.task.actor1);
     const p2=this.activeCinematic.task.actor1===this.activeCinematic.task.actor2
      ?null
      :this.people.find(p=>p.id===this.activeCinematic!.task.actor2);
     if(p1)p1.speed=240;
     if(p2)p2.speed=240;
     this.startNextCinematic(now);
     this.triggerWake();
    }
   }
   if (this.activeGame) {
    moving = true;
    if (this.activeGame.phase === 'countdown') {
     const sec = Math.max(1, Math.ceil((this.activeGame.countdownEnd - now) / 1000));
     if (sec !== this.activeGame.lastCountdownSec) {
      this.activeGame.lastCountdownSec = sec;
      if (sec <= 3) {
       this.say('ja', `🏁 ¡Preparados... ${sec}!`, now);
      }
     }
     if (now >= this.activeGame.countdownEnd) {
      this.activeGame.phase = 'running';
      this.say('ja', '🏁 ¡¡YA, A POR LA COPA!! 🏆 ¡El primero que llegue gana!', now);
      if (typeof window !== 'undefined') {
       window.dispatchEvent(new CustomEvent('erbolamm:game-go', {
        detail: { target: this.activeGame.target }
       }));
      }
      this.triggerWake();
     }
    } else if (this.activeGame.phase === 'running') {
     const target = this.activeGame.target;
     for (const p of this.people) {
      if (!p.manualUntil || p.manualUntil <= now) continue;
      const d = Math.hypot(p.pos.x - target.x, p.pos.y - target.y);
      if (d <= 68) {
       this.activeGame.phase = 'won';
       this.activeGame.winner = { id: p.id };
       this.activeGame.winTime = now;
       p.jumping = true;
       p.path = null;
       if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erbolamm:game-won', {
         detail: { winnerId: p.id, target }
        }));
       }
       this.triggerWake();
       break;
      }
     }
    } else if (this.activeGame.phase === 'won') {
     const winElapsed = now - (this.activeGame.winTime || now);
     if (winElapsed >= 8000) {
      if (this.activeGame.winner) {
       const wp = this.people.find(p => p.id === this.activeGame!.winner!.id);
       if (wp) {
        wp.jumping = false;
       }
      }
      this.lastGameEndTime = now;
      this.activeGame = null;
      if (typeof window !== 'undefined') {
       window.dispatchEvent(new CustomEvent('erbolamm:game-end'));
       window.dispatchEvent(new CustomEvent('erbolamm:reset-camera'));
      }
      this.triggerWake();
     }
    }
   }
   return moving||this.fiestaState.phase==='party'||this.broncaState.phase==='brawl'||this.broncaState.phase==='ended'||this.people.some(p=>p.deliveringUntil>now)||Boolean(this.coffeeRun)||Boolean(this.activeCinematic)||this.cinematicQueue.length>0||this.speech.size>0||Boolean(this.activeGame)||Boolean(this.hub);
  }
 traerCafe(agentId?: AgentId) {
   const target = (agentId && agentId !== 'ja') ? agentId : undefined;
   const idlePeople = this.people.filter(p => p.id !== 'ja' && p.id !== this.snapshot.orchestrator && !this.snapshot.states.haciendo.some(t => t.role === p.id) && !this.visiting.includes(p.id));
   const randomIdle = idlePeople.length > 0 ? idlePeople[Math.floor(Math.random() * idlePeople.length)]?.id : undefined;
   const id = target
    || randomIdle
    || this.people.find(p => p.id !== 'ja' && !this.snapshot.states.haciendo.some(t => t.role === p.id) && !this.visiting.includes(p.id))?.id
    || (this.snapshot.orchestrator && this.snapshot.orchestrator !== 'ja' ? this.snapshot.orchestrator : 'ge');
   if (this.coffeeRun && this.coffeeRun.agentId !== id) {
    const oldP = this.people.find(p => p.id === this.coffeeRun!.agentId);
    if (oldP) this.move(oldP, this.baseTarget(oldP.id));
   }
   this.coffeeRun = { agentId: id as AgentId, phase: 1, phaseEnd: 0 };
   const p = this.people.find(p => p.id === id);
   if (p) {
    p.deliveringUntil = 0;
    this.move(p, COFFEE_STATION);
   }
  }
 /** Spoken bubbles by agent. Kept apart from `status` so a chat line never
  * hides what the agent is really doing. */
 speech=new Map<AgentId,Speech>();
 private speechListeners=new Set<()=>void>();
 onSpeech(cb:()=>void){this.speechListeners.add(cb);return()=>{this.speechListeners.delete(cb);};}
 /** Makes `id` say `text` in a multi-line bubble for a time proportional to its length. */
 say(id:AgentId,text:string,now:number):boolean{
  if(!roles.has(id))return false;
  const clean=cleanSpeech(text);
  if(!clean){this.speech.delete(id);this.tick(now,0);return false;}
  this.speech.set(id,{text:clean,until:now+speechDuration(clean)});
  for(const cb of this.speechListeners){try{cb();}catch{/* a broken view must not stop the others */}}
  this.tick(now,0);
  return true;
 }
 speechFor(id:AgentId,now:number):Speech|null{const s=this.speech.get(id);if(!s)return null;if(s.until<=now){this.speech.delete(id);return null;}return s;}
 /** Default speaker for chat commands: the acting orchestrator, else `ge`. */
 speaker(agent?:string|null):AgentId{
  if(agent&&roles.has(agent as AgentId))return agent as AgentId;
  const orch=this.snapshot.orchestrator??(this.liveSnapshot.valid?this.liveSnapshot.orchestrator:null);
  return orch&&roles.has(orch)?orch:'ge';
 }
 /** How many agents (Javier excluded) are working or resting right now. */
 statusSummary():{working:number;resting:number}{
  const working=new Set<AgentId>();
  if(this.snapshot.valid)for(const t of this.snapshot.states.haciendo)if(t.role!=='ja')working.add(t.role);
  if(this.liveSnapshot.valid)for(const l of this.liveSnapshot.workerLeases)if(l.role!=='ja')working.add(l.role);
  const total=AGENTS.filter(a=>a.id!=='ja').length;
  return{working:working.size,resting:Math.max(0,total-working.size)};
 }
 /** Room id from a `!cafeteria` / `!entregas` / `!oficina` / `!reuniones` command. */
 private zoneFromCommand(cmd:OfficeCommand):ZoneId|null{
  const raw=String(cmd.zona||cmd.texto||'').trim().toLowerCase();
  if(raw==='lounge'||raw==='orch'||raw==='work'||raw==='deliv')return raw;
  return CHAT_ZONE_COMMANDS[raw]??null;
 }
 /** Avatar that should walk: explicit agent, the login's adopted avatar, or Javier himself. */
 private avatarForCommand(cmd:OfficeCommand):AgentId|null{
  if(cmd.agente&&roles.has(cmd.agente as AgentId))return cmd.agente as AgentId;
  const user=String(cmd.usuario??'').trim().toLowerCase();
  if(!user)return null;
  for(const [avatar,owner] of Object.entries(this.avatarOwners)){
   if(String(owner).trim().toLowerCase()===user&&roles.has(avatar as AgentId))return avatar as AgentId;
  }
  if(user==='ja'||user==='apliarte'||user==='erbolamm')return 'ja';
  if(roles.has(user as AgentId))return user as AgentId;
  return null;
 }
 /** Walks `id` to the room's open-floor anchor along the office nav mesh. */
 goToZone(id:AgentId,zone:ZoneId,now:number):boolean{
  if(!roles.has(id)||!ZONE_ANCHORS[zone])return false;
  if(this.isCinematicActive()||this.isFrozen())return false;
  if(this.isTraitorActive()&&this.hub!.players.includes(id))return false;
  const p=this.people.find(person=>person.id===id);
  if(!p)return false;
  const end=ZONE_ANCHORS[zone];
  try{p.path=navigate(p.pos,end);}catch(_){p.path=[p.pos,end];}
  p.target={...end};
  p.travelled=0;
  p.speed=160;
  p.deliveringUntil=0;
  if(end.x!==p.pos.x)p.facing=end.x>p.pos.x?1:-1;
  p.isRear=end.y<p.pos.y;
  p.pose=p.isRear?'work':'walk';
  p.manualUntil=isBoardMode()?Infinity:now+45000;
  this.triggerWake();
  return true;
 }
 /** Applies a live chat command. Returns false when it was not recognised. */
 applyCommand(cmd:OfficeCommand,now:number):boolean{
  switch(cmd?.comando){
   case 'cafe':{const id=cmd.agente&&cmd.agente!=='ja'&&roles.has(cmd.agente as AgentId)?cmd.agente as AgentId:undefined;this.traerCafe(id);return true;}
   case 'zona':{
    const zone=this.zoneFromCommand(cmd);
    const id=this.avatarForCommand(cmd);
    if(!zone||!id)return false;
    return this.goToZone(id,zone,now);
   }
   case 'git':return this.say(this.speaker(cmd.agente),cmd.texto||'Git: sin datos',now);
   case 'say':return this.say(this.speaker(cmd.agente),cmd.texto??'',now);
   case 'estado':{const{working,resting}=this.statusSummary();return this.say(this.speaker(cmd.agente),`Agentes: ${working} trabajando · ${resting} en reposo`,now);}
   case 'adoptar':return this.say(this.speaker(cmd.agente),cmd.texto||'¡He sido adoptado!',now);
   case 'liberar':return this.say(this.speaker(cmd.agente),cmd.texto||'¡He quedado libre!',now);
   case 'fiesta':this.fiesta(now);return true;
   case 'trabajar':this.trabajar(now,cmd.agente as AgentId);return true;
   case 'bronca':this.bronca(now);return true;
   case 'beso':this.beso((cmd as any).sender || this.speaker(cmd.agente), (cmd.agente as AgentId) || 'ja', now);return true;
   case 'conga':{
    const next = applyCongaCommandPure(this.congaState, cmd, now, { broadcaster: 'apliarte', avatarOwners: this.avatarOwners });
    if (next !== this.congaState) {
      this.congaState = next;
      this.lastCongaCountdownSec = -1;
      if (this.congaState.phase === 'countdown') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('erbolamm:conga-credit', { detail: { text: CONGA_CREDIT } }));
        }
      } else if (this.congaState.phase === 'idle') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('erbolamm:conga-credit', { detail: { text: null } }));
        }
      }
    }
    this.triggerWake();
    return true;
   }
   case 'salta':if(cmd.agente&&roles.has(cmd.agente as AgentId)){this.jumpAgent(cmd.agente as AgentId,now);return true;}return false;
   case 'reset':if(cmd.agente&&roles.has(cmd.agente as AgentId)){this.resetAgent(cmd.agente as AgentId,now);return true;}return false;
   case 'juego':{if(this.isFrozen()&&this.hub?.source==='local')return false;this.openLobby(now);return true;}
   case 'trofeo':
   case 'carrera':{if(this.isFrozen())return this.castLobbyVote(cmd.usuario??'',1);this.iniciarJuego(now, cmd.agente as AgentId);return true;}
   case 'traidor':{if(this.isFrozen())return this.castLobbyVote(cmd.usuario??'',2);return false;}
   default:return false;
  }
 }
 stepAgent(id:AgentId,dx:number,dy:number,facing:number,isRear:boolean,now:number){
  if(this.isCinematicActive())return;
  if(this.isFrozen()){this.say(id,'🧊 ¡Oficina congelada! Votad primero.',now);return;}
  if(this.isTraitorActive()&&this.hub!.players.includes(id)){this.say(id,'🔍 ¡Nadie sale del círculo!',now);return;}
  if(this.activeGame&&this.activeGame.phase==='countdown'){
   this.say(id,'¡Espera a la salida! 🛑',now);
   return;
  }
  const p=this.people.find(person=>person.id===id);
  if(!p)return;
  const targetX=Math.max(40,Math.min(1240,p.pos.x+dx));
  const targetY=Math.max(40,Math.min(820,p.pos.y+dy));
  const end:Pt={x:targetX,y:targetY};
  try {
    p.path=navigate(p.pos,end);
  } catch (_) {
    p.path=[p.pos,end];
  }
  p.target={...end};
  p.travelled=0;
  p.speed=(this.activeGame&&this.activeGame.phase==='running')?220:160;
  p.facing=facing;
  p.isRear=isRear;
  p.pose=isRear?'work':'walk';
  // On the !damas board avatars stay where they are moved until released.
  p.manualUntil=isBoardMode()?Infinity:now+25000;
  this.triggerWake();
 }
 /** !damas board: moves an avatar to the centre of a square such as "c3". */
 goToSquare(id:AgentId,name:string,now:number):boolean{
  if(!isBoardMode()||this.isCinematicActive()||this.isFrozen())return false;
  if(this.isTraitorActive()&&this.hub!.players.includes(id))return false;
  const square=parseSquare(name);
  const p=this.people.find(person=>person.id===id);
  if(!square||!p)return false;
  const end=squareCenter(square.col,square.row);
  try{p.path=navigate(p.pos,end);}catch(_){p.path=[p.pos,end];}
  p.target={...end};
  p.travelled=0;
  p.speed=160;
  if(end.x!==p.pos.x)p.facing=end.x>p.pos.x?1:-1;
  p.isRear=end.y<p.pos.y;
  p.pose=p.isRear?'work':'walk';
  p.manualUntil=Infinity;
  this.triggerWake();
  return true;
 }
 /** Turns the !damas board on or off. Leaving it sends every avatar home at once,
  * so nobody is left standing inside furniture that reappears. */
 setBoard(on:boolean,now:number){
  setBoardMode(on);
  if(!on){
   for(const p of this.people){
    p.manualUntil=0;
    p.isRear=false;
    p.target={...p.pos};
    this.move(p,this.destination(p,now),true);
   }
  }
  this.tick(now,0);
  this.triggerWake();
 }
 jumpAgent(id:AgentId,now:number){
  if(this.isCinematicActive())return;
  const p=this.people.find(person=>person.id===id);
  if(!p)return;
  p.jumping=true;
  this.say(id,'¡Boing!',now);
  setTimeout(()=>{p.jumping=false;},900);
 }
 resetAgent(id:AgentId,now:number){
  if(this.isCinematicActive()||this.isFrozen())return;
  if(this.isTraitorActive()&&this.hub!.players.includes(id))return;
  const p=this.people.find(person=>person.id===id);
  if(!p)return;
  p.manualUntil=0;
  p.isRear=false;
  this.move(p,this.baseTarget(id));
  this.say(id,'¡De vuelta a mi puesto!',now);
 }
 fiesta(now:number){
  if(this.hub)return;
  this.fiestaState=startFiesta(this.fiestaState,now,this.people.map(p=>p.id));
  this.say('ja','¡Fiesta en la oficina!',now);
  this.triggerWake();
 }
 isFiestaActive():boolean{
  return isFiestaActive(this.fiestaState);
 }
 trabajar(now:number,agentId?:AgentId){
  if(agentId&&roles.has(agentId)){
   this.enqueueCinematic({
    type:'trabajar',
    actor1:'ja',
    actor2:agentId,
    text:`¡A picar código con foco, ${agentId}! 💻⚡`,
    speaker:'ja',
   },now);
   return;
  }
  this.enqueueCinematic({
   type:'trabajar',
   actor1:'ja',
   actor2:'ja',
   text:'¡Todos a sus puestos a trabajar! 💼⚡',
   speaker:'ja',
  },now);
 }
 bronca(now:number){
  if(this.hub)return;
  this.broncaState=startBronca(this.broncaState,now,this.people.map(p=>p.id));
  this.say('ja','¡Batalla campal en la oficina!',now);
  this.triggerWake();
 }
 isBroncaActive():boolean{
  return isBroncaActive(this.broncaState);
 }
 beso(senderId:AgentId,targetId:AgentId,now:number,customText?:string){
  const target=targetId&&roles.has(targetId)?targetId:'ja';
  const sender=senderId&&roles.has(senderId)?senderId:'ge';
  const finalTarget=(sender===target)?(sender==='ja'?'ge':'ja'):target;
  this.enqueueCinematic({
   type:'beso',
   actor1:sender,
   actor2:finalTarget,
   text:customText || `¡Muak! 💋 Un beso para ${finalTarget}`,
   speaker:sender,
  },now);
 }
 rotateIdlePose(now:number):boolean {
  if(this.hub)return false;
  const candidates=this.people.filter(p=>!p.path&&p.deliveringUntil<=now&&p.id!=='ja'&&!this.visiting.includes(p.id)&&!this.snapshot.states.haciendo.some(t=>t.role===p.id));
  if(candidates.length===0)return false;
  const pick=randomFrom(candidates);
  this.idlePose.set(pick.id,randomFrom(IDLE_POSES));
  pick.pose=this.idlePose.get(pick.id)!;
  return true;
 }
 distance(id:AgentId){const p=this.people.find(p=>p.id===id)!;return p.path?pathLength(p.path)-p.travelled:0;}

 /* ------------------------------------------------------------------ */
 /* Live-agent feed — posicionado por Herdr + leases del Vigía          */
 /* ------------------------------------------------------------------ */

 /** Snapshot del feed de agentes vivos; puede ser inválido si el endpoint no responde. */
 liveSnapshot: LiveSnapshot = normalizeLiveSnapshot(null);
 /** Índice del waypoint de patrulla actual del Vigía. */
 private vigiaPatrolIndex = 0;

 /** Calcula la posición base de un agente a partir del snapshot de agentes vivos.
  *  Prioridad:
  *  1. `ja` → siempre en OWNER_DESK.
  *  2. Worker con lease activo del Vigía → mesa tra-N en deliv.
  *  3. Agente activo en equipo-1 sin lease → slot de planificación en work.
  *  4. `pi` → waypoint de patrulla actual (VIGIA_PATROL).
  *  5. Orquestador activo (si no es `ja`) → COMMAND_SEAT.
  *  6. Sin proceso activo → lounge descansando.
  */
 private liveTarget(id: AgentId): Pt {
  if (id === 'ja') return OWNER_DESK;
  const snap = this.liveSnapshot;
  if (!snap.valid) return lounge(id);

  // Worker con lease activo → mesa tra-N
  const lease = snap.workerLeases.find(l => l.role === id);
  if (lease) {
   const slotIdx = Math.max(0, (lease.slot - 1)) % WORKER_SLOTS.length;
   return WORKER_SLOTS[slotIdx];
  }

  // Agente en equipo-1 o equipo-N sin lease → sala de trabajo (work planning)
  const agent = snap.agents.find(a => a.role === id);
  if (agent && agent.workspace.startsWith('equipo')) {
   const plannerIdx = snap.agents
    .filter(a => a.workspace.startsWith('equipo') && !snap.workerLeases.some(l => l.role === a.role))
    .findIndex(a => a.role === id);
   if (plannerIdx >= 0) return EQUIPO1_SLOTS[plannerIdx % EQUIPO1_SLOTS.length];
  }

  // Orquestador activo
  if (snap.orchestrator && snap.orchestrator !== 'ja' && id === snap.orchestrator) {
   return COMMAND_SEAT;
  }
  if (agent && agent.workspace === 'orquestador') {
   return COMMAND_SEAT;
  }

  // Vigía itinerante (patrullando o auditando)
  if ((snap.vigiaStatus === 'patrolling' || snap.vigiaStatus === 'auditing') && id === 'be') {
   return VIGIA_PATROL[this.vigiaPatrolIndex % VIGIA_PATROL.length];
  }

  // Sin proceso → lounge
  return lounge(id);
 }

 /** Status string para el feed en vivo. */
 private liveStatus(id: AgentId): string {
  if (!this.liveSnapshot.valid) return 'Sin datos';
  if (id === 'ja') return 'Javier · dueño';
  const snap = this.liveSnapshot;
  const lease = snap.workerLeases.find(l => l.role === id);
  if (lease) return `tra-${lease.slot} · ${lease.taskCard || 'ejecutando'}`;
  const agent = snap.agents.find(a => a.role === id);
  if (agent) {
   if (agent.workspace.startsWith('equipo')) return `${agent.workspace} · planificando`;
   if (agent.workspace === 'orquestador') return 'Coordinando';
   return `${agent.workspace} · ${agent.herdrStatus}`;
  }
  if (snap.orchestrator === id) return 'Coordinando';
  if ((snap.vigiaStatus === 'patrolling' || snap.vigiaStatus === 'auditing') && id === 'be') {
   return `Vigía · ${snap.vigiaStatus}`;
  }
  return 'Descansando';
 }

 /** Actualiza posiciones y estados desde el feed de agentes vivos.
  *  No depende de `snapshot.states['por-hacer/haciendo/hecho']`.
  *  Avanza el waypoint del Vigía si su estado es "patrolling". */
 updateFromLive(raw: unknown, now: number) {
  const next = normalizeLiveSnapshot(raw);
  this.liveSnapshot = next;

  // Avanzar patrulla del Vigía si está activamente patrullando
  if (next.valid && next.vigiaStatus === 'patrolling') {
   this.vigiaPatrolIndex = (this.vigiaPatrolIndex + 1) % VIGIA_PATROL.length;
  }

  for (const p of this.people) {
   if (this.activeCinematic && (p.id === this.activeCinematic.task.actor1 || p.id === this.activeCinematic.task.actor2)) continue;
   if (p.manualUntil && p.manualUntil > now) continue;
   if (this.isFrozen()) { p.status = this.liveStatus(p.id); continue; }
   if (this.traitorSlot(p.id)) continue;
   if (this.coffeeRun && this.coffeeRun.agentId === p.id) continue;
   const end = this.visiting.includes(p.id)
    ? (() => {
       const activeId = this.focusedVisitor || this.visiting[this.visiting.length - 1];
       if (p.id === activeId) return VISITOR_SEAT;
       const other = this.visiting.filter(id => id !== activeId);
       const idx = other.indexOf(p.id);
       return WAITING_SLOTS[Math.min(Math.max(0, idx), WAITING_SLOTS.length - 1)];
      })()
    : this.liveTarget(p.id);
   this.move(p, end, !next.valid);
   p.status = this.liveStatus(p.id);
  }
  this.tick(now, 0);
 }
}

