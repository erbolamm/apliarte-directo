import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AGENT_BY_ID, type AgentId } from '../office/agents';
import { ROOMS, WORK_SLOTS, type ZoneId, type Pose, VIEW } from '../office/layout';
import { BOARD, BOARD_COLUMNS, BOARD_WALLS, furniture, isBoardMode, walls, type Box } from '../office/geometry';
import { wrapSpeech, speechDuration, type ActiveGame, type OfficeCommand, type Person, type Speech } from '../office/runtime';
import Character from './Character';
import { DEFAULT_CAMERA, boundCamera, gestureCamera, wheelCamera, type Camera, type TouchPoint } from '../office/camera';
import {
  Defs,
  Shell,
  LoungeBack,
  loungeFront,
  OrchBack,
  orchFront,
  WorkBack,
  Desk,
  DelivBack,
  delivFront,
} from './RoomArt';
import { ERBOLAMM_LOGO_DATA_URI } from '../office/logo';
import type { FiestaState } from '../office/fiesta';
import type { BroncaState } from '../office/bronca';

export const CHAR_SCALE = 0.62;

type Props = {
  fill?: boolean;
  visitor?: { id: AgentId; pos: { x: number; y: number }; arrived: boolean } | null;
  agents: Person[];
  activeGame?: ActiveGame | null;
  fiesta?: FiestaState | null;
  bronca?: BroncaState | null;
  selected: AgentId | null;
  onSelect: (id: AgentId | null) => void;
  hovered: AgentId | null;
  onHover: (id: AgentId | null) => void;
  mailCount: number;
  motion: boolean;
  onMotionChange: (next: boolean) => void;
  onMail: () => void;
};

function Cuboid({ box }: { box: Box }) {
  const { x, y, w, d, h, color, kind, label } = box;
  const table = ['desk', 'meeting', 'coffee'].includes(kind || '');
  const style = { left: x, top: y, '--w': `${w}px`, '--d': `${d}px`, '--h': `${h}px`, '--material': color } as CSSProperties;
  return (
    <div className={`solid ${kind}`} style={style} aria-hidden="true">
      {!table && <div className="solid-shadow" />}
      <div className="face top">
        {label && <span>{label}</span>}
        {kind === 'parcel' && <><i className="package-tape" /><i className="package-label" /><i className="package-stamp" /></>}
        {kind === 'desk' && <><i className="keyboard" /><i className="desk-mouse" /></>}
        {kind === 'coffee' && <><i className="coffee-maker" /><i className="coffee-mug" /></>}
        {kind === 'plant' && <i className="plant-top-leaf" />}
      </div>
      {table ? (
        <>
          <div className="table-apron" />
          {kind === 'desk' ? (
            <div className="desk-legs">
              <span className="desk-leg leg-tl" style={{ height: `${h - 4}px` }} />
              <span className="desk-leg leg-tr" style={{ height: `${h - 4}px` }} />
              <span className="desk-leg leg-bl" style={{ height: `${h - 4}px` }} />
              <span className="desk-leg leg-br" style={{ height: `${h - 4}px` }} />
            </div>
          ) : (
            <span className="pedestal-leg" style={{ height: `${h - 6}px` }} />
          )}
        </>
      ) : (
        <>
          <div className="face front">
            {kind === 'shelf' && <><i /><i /><i /></>}
            {kind === 'plant' && <i className="pot-rim" />}
          </div>
          <div className="face rear" />
          <div className="face left" />
          <div className="face right" />
        </>
      )}
      {kind === 'glass' && (
        <>
          <div className="glass-post" />
          <div className="glass-post far" />
          <div className="glass-rail" />
          {box.x === 1040 && box.y === 24 && (
            <div className="glass-logo-badge" title="ErBolamm">
              <img src={ERBOLAMM_LOGO_DATA_URI} alt="ErBolamm" />
            </div>
          )}
        </>
      )}
      {kind === 'desk' && <><div className="monitor-foot" /><div className="monitor"><span className="monitor-screen">▰ ▰ ▰<br />▱ ▰<br />▰ ▱ ▰</span><i className="monitor-back" /></div></>}
      {kind === 'sofa' && <div className="cushions">▯　▯　▯</div>}
    </div>
  );
}

/** True when the status is something the avatar says aloud, not a pose label. */
export function isSpeechStatus(status?: string, speaking?: boolean): boolean {
  return Boolean(speaking || (status && (status.startsWith('¡') || status.startsWith('¿') || status === 'Preparando café...')));
}

/** Word-wraps a spoken message into at most `maxLines` bubble lines. */
export function wrapSpeech(text: string, maxChars = 38, maxLines = 5): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const piece = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    if (line && line.length + 1 + piece.length > maxChars) {
      lines.push(line);
      line = piece;
    } else {
      line = line ? `${line} ${piece}` : piece;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, maxChars - 1)}…`;
    return kept;
  }
  return lines;
}

/** Burbuja viva flotante sobre cada agente indicando qué hace en tiempo real o qué dice */
export function ActivityBubble({ pose, tone, walking, delivering, status, speech, speaking }: { pose: Pose; tone: string; walking: boolean; delivering: boolean; status?: string; speech?: string; speaking?: boolean }) {
  // Multi-line bubble for text said from the live chat (`!say`, `!git`, `!estado`) or desk toolbar
  const bubbleSpeech = speech || (speaking && status ? status : undefined);
  if (bubbleSpeech) {
    const lines = wrapSpeech(bubbleSpeech);
    const longest = Math.max(...lines.map((l) => Array.from(l).length));
    const width = Math.max(90, Math.min(250, longest * 6.4 + 28));
    const lineHeight = 13;
    const height = 12 + lines.length * lineHeight;
    const halfW = width / 2;
    const top = 12 - height;
    const duration = speechDuration(bubbleSpeech);
    return (
      <g
        transform="translate(0, -96)"
        pointerEvents="none"
        className="activity-bubble activity-bubble-speech activity-bubble-chat"
        style={{ animationDuration: `${duration}ms` }}
      >
        <rect
          x={-halfW}
          y={top}
          width={width}
          height={height}
          rx={10}
          fill="#ffffff"
          stroke={tone}
          strokeWidth={1.8}
          style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.22))' }}
        />
        <path d="M-4,12 L0,18 L4,12 Z" fill="#ffffff" stroke={tone} strokeWidth={1.4} />
        <rect x={-3} y={9} width={6} height={4} fill="#ffffff" />
        <text textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#1c1c1c" fontFamily="Inter, system-ui, sans-serif" dominantBaseline="central">
          {lines.map((line, i) => (
            <tspan key={i} x={0} y={top + 6 + lineHeight / 2 + i * lineHeight}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  }
  let icon = '🙂';
  if (walking) {
    icon = '🚶';
  } else if (delivering) {
    icon = '📦';
  } else {
    switch (pose) {
      case 'coffee': icon = '☕'; break;
      case 'work': icon = '💻'; break;
      case 'read': icon = '📖'; break;
      case 'sleep': icon = '💤'; break;
      case 'game': icon = '🎮'; break;
      case 'watch': icon = '📺'; break;
      case 'deliver': icon = '📦'; break;
      case 'present': icon = '📋'; break;
      case 'sit': icon = '🪑'; break;
      default: icon = '✨'; break;
    }
  }

  // Bocadillo de diálogo con texto visible para mensajes hablados o estados de acción interactiva
  const speechText = isSpeechStatus(status, speaking) ? status! : null;

  if (speechText) {
    if (speaking) icon = '💬';
    const lines = wrapSpeech(`${icon} ${speechText}`);
    const longest = Math.max(...lines.map((l) => l.length));
    const width = Math.max(70, Math.min(270, longest * 6.8 + 34));
    const height = 24 + (lines.length - 1) * 13;
    const halfW = width / 2;
    const top = 12 - height;
    const duration = speechDuration(speechText);
    return (
      <g
        transform="translate(0, -96)"
        pointerEvents="none"
        className="activity-bubble activity-bubble-speech"
        style={{ animationDuration: `${duration}ms` }}
      >
        <rect
          x={-halfW}
          y={top}
          width={width}
          height={height}
          rx={12}
          fill="#ffffff"
          stroke={tone}
          strokeWidth={1.8}
          style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.22))' }}
        />
        <path d="M-4,12 L0,18 L4,12 Z" fill="#ffffff" stroke={tone} strokeWidth={1.4} />
        <rect x={-3} y={9} width={6} height={4} fill="#ffffff" />
        <text
          x={0}
          y={top + 13}
          textAnchor="middle"
          fontSize={10.5}
          fontWeight={700}
          fill="#1c1c1c"
          fontFamily="Inter, system-ui, sans-serif"
          dominantBaseline="central"
        >
          {lines.map((line, index) => (
            <tspan key={index} x={0} dy={index === 0 ? 0 : 13}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  }

  return (
    <g transform="translate(0, -90)" pointerEvents="none" className="activity-bubble">
      <rect
        x={-12}
        y={-10}
        width={24}
        height={18}
        rx={9}
        fill="#ffffff"
        stroke={tone}
        strokeWidth={1.5}
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.18))' }}
      />
      <path d="M-3,8 L0,12 L3,8 Z" fill="#ffffff" stroke={tone} strokeWidth={1.2} />
      <rect x={-2} y={6} width={4} height={3} fill="#ffffff" />
      <text x={0} y={0.5} textAnchor="middle" fontSize={11} dominantBaseline="central">
        {icon}
      </text>
    </g>
  );
}

/** Pastilla identificativa con nombre y punto de color corporativo flotando sobre la cabeza */
function AgentPillTag({ name, color, focus }: { name: string; color: string; focus: boolean }) {
  const w = Math.max(50, name.length * 6.5 + 16);
  return (
    <g transform="translate(0, -50)" pointerEvents="none">
      <rect
        x={-w / 2}
        y={-8}
        width={w}
        height={16}
        rx={8}
        fill={focus ? color : 'rgba(255,255,255,0.95)'}
        stroke={focus ? '#202020' : color}
        strokeWidth={focus ? 1.6 : 1.2}
        style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.18))' }}
      />
      <circle cx={-w / 2 + 7} cy={0} r={3} fill={focus ? '#ffffff' : color} />
      <text
        x={-w / 2 + 14}
        y={3.2}
        fontSize={9}
        fontWeight={800}
        fill={focus ? '#ffffff' : '#222222'}
        fontFamily="Inter, system-ui, sans-serif"
      >
        {name}
      </text>
    </g>
  );
}

const BOARD_LIGHT = '#ead7b4';
const BOARD_DARK = '#7a5230';
const BOARD_FRAME = '#efe9df';
const boardRows = Array.from({ length: BOARD.rows }, (_, i) => BOARD.rows - i);
const boardWidth = BOARD.cols * BOARD.cell;
const boardHeight = BOARD.rows * BOARD.cell;

/** !damas floor for the 3D view: checkered squares with chess-style labels. */
function DamasBoard3D() {
  return (
    <div className="damas-board" style={{ left: BOARD.x, top: BOARD.y, width: boardWidth, height: boardHeight }} aria-label="Tablero de damas">
      {boardRows.flatMap((row) =>
        Array.from({ length: BOARD.cols }, (_, col) => (
          <i
            key={`${col}-${row}`}
            className="damas-square"
            style={{ background: (col + row) % 2 === 0 ? BOARD_DARK : BOARD_LIGHT }}
          />
        ))
      )}
      {Array.from(BOARD_COLUMNS).map((letter, col) => (
        <b key={letter} className="damas-label damas-col" style={{ left: col * BOARD.cell + BOARD.cell / 2 }}>{letter}</b>
      ))}
      {boardRows.map((row, i) => (
        <b key={row} className="damas-label damas-row" style={{ top: i * BOARD.cell + BOARD.cell / 2 }}>{row}</b>
      ))}
    </div>
  );
}

/** !damas floor for the 2D diorama, drawn in the same 1280x860 coordinates. */
function DamasBoardSvg() {
  return (
    <g aria-label="Tablero de damas">
      <rect x={BOARD.x - BOARD.frame} y={BOARD.y - BOARD.frame} width={boardWidth + BOARD.frame * 2} height={boardHeight + BOARD.frame * 2} rx={10} fill={BOARD_FRAME} />
      {boardRows.flatMap((row, i) =>
        Array.from({ length: BOARD.cols }, (_, col) => (
          <rect
            key={`${col}-${row}`}
            x={BOARD.x + col * BOARD.cell}
            y={BOARD.y + i * BOARD.cell}
            width={BOARD.cell}
            height={BOARD.cell}
            fill={(col + row) % 2 === 0 ? BOARD_DARK : BOARD_LIGHT}
          />
        ))
      )}
      {Array.from(BOARD_COLUMNS).map((letter, col) => (
        <text key={letter} x={BOARD.x + col * BOARD.cell + BOARD.cell / 2} y={BOARD.y - BOARD.frame / 2} fontSize={22} fontWeight={800} fill="#111" textAnchor="middle" dominantBaseline="middle">{letter}</text>
      ))}
      {boardRows.map((row, i) => (
        <text key={row} x={BOARD.x - BOARD.frame / 2} y={BOARD.y + i * BOARD.cell + BOARD.cell / 2} fontSize={22} fontWeight={800} fill="#111" textAnchor="middle" dominantBaseline="middle">{row}</text>
      ))}
    </g>
  );
}

function FiestaLayer({ fiesta }: { fiesta: FiestaState }) {
  const { particles, discoHue } = fiesta;
  const hue1 = discoHue;
  const hue2 = (discoHue + 90) % 360;
  const hue3 = (discoHue + 180) % 360;
  const hue4 = (discoHue + 270) % 360;

  return (
    <div
      className="fiesta-layer"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 50,
      }}
      aria-hidden="true"
    >
      <div
        className="fiesta-disco-wash"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.18,
          mixBlendMode: 'screen',
          background: `radial-gradient(circle at 18% 25%, hsl(${hue1}, 95%, 60%) 0%, transparent 45%), radial-gradient(circle at 82% 25%, hsl(${hue2}, 95%, 60%) 0%, transparent 45%), radial-gradient(circle at 25% 80%, hsl(${hue3}, 95%, 60%) 0%, transparent 45%), radial-gradient(circle at 75% 80%, hsl(${hue4}, 95%, 60%) 0%, transparent 45%), radial-gradient(circle at 50% 50%, hsl(${(hue1 + 45) % 360}, 90%, 65%) 0%, transparent 55%)`,
          transition: 'background 0.08s linear',
        }}
      />
      <svg
        className="fiesta-particles-svg"
        viewBox="0 0 1280 860"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
        }}
      >
        {particles.map((p) => {
          if (p.kind === 'confetti') {
            return (
              <rect
                key={p.id}
                x={-p.width / 2}
                y={-p.height / 2}
                width={p.width}
                height={p.height}
                rx={1.5}
                fill={p.color}
                opacity={0.92}
                transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation})`}
              />
            );
          }
          const sway = Math.sin(p.wobblePhase) * 14;
          const h = p.height;
          const d = `M 0,0 Q ${sway},${h * 0.25} 0,${h * 0.5} Q ${-sway},${h * 0.75} 0,${h}`;
          return (
            <path
              key={p.id}
              d={d}
              stroke={p.color}
              strokeWidth={p.width}
              strokeLinecap="round"
              fill="none"
              opacity={0.88}
              transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation})`}
            />
          );
        })}
      </svg>
    </div>
  );
}

function starPath(size: number, points = 5): string {
  const inner = size * 0.42;
  const step = Math.PI / points;
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? size : inner;
    const angle = i * step - Math.PI / 2;
    const x = Math.round(r * Math.cos(angle) * 10) / 10;
    const y = Math.round(r * Math.sin(angle) * 10) / 10;
    d += `${i === 0 ? 'M' : 'L'} ${x},${y} `;
  }
  return d + 'Z';
}

function BroncaLayer({ bronca }: { bronca: BroncaState }) {
  const { particles } = bronca;

  return (
    <div
      className="bronca-layer"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 55,
      }}
      aria-hidden="true"
    >
      <svg
        className="bronca-particles-svg"
        viewBox="0 0 1280 860"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
        }}
      >
        <defs>
          <filter id="bronca-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        {particles.map((p) => {
          if (p.opacity <= 0.01) return null;
          if (p.kind === 'smoke') {
            return (
              <g
                key={p.id}
                transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation}) scale(${p.scale})`}
                opacity={p.opacity}
              >
                <ellipse cx={0} cy={0} rx={p.size} ry={p.size * 0.82} fill={p.color} stroke="#2f2620" strokeWidth={2.4} />
                <circle cx={-p.size * 0.35} cy={-p.size * 0.25} r={p.size * 0.45} fill={p.color} />
                <circle cx={p.size * 0.35} cy={-p.size * 0.2} r={p.size * 0.42} fill={p.color} />
                <circle cx={0} cy={-p.size * 0.4} r={p.size * 0.45} fill={p.color} />
                <path
                  d={`M ${-p.size * 0.22},0 Q 0,${p.size * 0.32} ${p.size * 0.26},${-p.size * 0.1}`}
                  stroke="#2f2620"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.65}
                />
              </g>
            );
          }
          if (p.kind === 'star') {
            return (
              <g
                key={p.id}
                transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation}) scale(${p.scale})`}
                opacity={p.opacity}
              >
                <path
                  d={starPath(p.size, 5)}
                  fill={p.color}
                  stroke="#2f2620"
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                />
              </g>
            );
          }
          if (p.kind === 'fire') {
            return (
              <g
                key={p.id}
                transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation}) scale(${p.scale})`}
                opacity={p.opacity}
                filter="url(#bronca-glow)"
              >
                <path
                  d={`M 0,${p.size} Q ${-p.size * 0.75},0 0,${-p.size} Q ${p.size * 0.75},0 0,${p.size} Z`}
                  fill={p.color}
                  stroke="#ff2200"
                  strokeWidth={1.2}
                />
                <circle cx={0} cy={p.size * 0.25} r={p.size * 0.36} fill="#ffffbb" opacity={0.85} />
              </g>
            );
          }
          if (p.kind === 'spark') {
            return (
              <g
                key={p.id}
                transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation}) scale(${p.scale})`}
                opacity={p.opacity}
              >
                <polygon
                  points={`0,${-p.size} ${p.size * 0.4},0 0,${p.size} ${-p.size * 0.4},0`}
                  fill={p.color}
                />
              </g>
            );
          }
          if (p.kind === 'line') {
            const rad = (p.rotation * Math.PI) / 180;
            return (
              <line
                key={p.id}
                x1={p.x}
                y1={p.y}
                x2={p.x + Math.cos(rad) * p.size}
                y2={p.y + Math.sin(rad) * p.size}
                stroke={p.color}
                strokeWidth={2.4}
                strokeLinecap="round"
                opacity={p.opacity}
              />
            );
          }
          return null;
        })}
      </svg>
    </div>
  );
}

export default function FloorPlan(props: Props) {
  const { fill, visitor, agents, activeGame, fiesta, bronca, selected, onSelect, hovered, onHover, mailCount = 0, motion = true, onMail } = props;

  useEffect(() => {
    let disposed = false;
    const pollLive = async () => {
      if (disposed) return;
      try {
        const res = await fetch('/api/oficina/agentes-vivos');
        if (res.ok) {
          const raw = await res.json();
          const w = window as any;
          if (w.Oficina3D?.runtime) {
            w.Oficina3D.runtime.updateFromLive(raw, performance.now());
            // Provocar re-render y wake sin afectar el estado seleccionado
            w.Oficina3D.leaveFromPopup('ping' as any); 
          }
        }
      } catch (e) {
        // Ignorar errores de red
      }
      if (!disposed) {
        setTimeout(pollLive, 2000);
      }
    };
    pollLive();
    return () => { disposed = true; };
  }, []);


  // Estado de vista: 3D por defecto, conmutable a diorama 2D
  const [viewMode, setViewMode] = useState<'3d' | 'diorama'>(() => {
    if (typeof window === 'undefined') return '3d';
    const params = new URLSearchParams(window.location.search);
    if (params.get('vista') === 'diorama' || params.get('diorama') === '1') return 'diorama';
    if (params.get('vista') === '3d' || params.get('legacy') === '1' || params.get('css3d') === '1') return '3d';
    const saved = localStorage.getItem('erbolamm-office-view');
    return saved === 'diorama' ? 'diorama' : '3d';
  });

  // !damas board: furniture, rooms and inner walls give way to a 12x8 board.
  const [board, setBoard] = useState<boolean>(() => isBoardMode());
  useEffect(() => {
    const onBoard = (e: Event) => setBoard(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener('erbolamm:board-changed', onBoard);
    return () => window.removeEventListener('erbolamm:board-changed', onBoard);
  }, []);

  const changeViewMode = (mode: '3d' | 'diorama') => {
    setViewMode(mode);
    try {
      localStorage.setItem('erbolamm-office-view', mode);
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('erbolamm:view-changed', { detail: mode }));
  };

  useEffect(() => {
    const onSetView = (e: Event) => {
      const mode = (e as CustomEvent<string>).detail;
      if (mode === '3d' || mode === 'diorama') {
        setViewMode(mode);
        try {
          localStorage.setItem('erbolamm-office-view', mode);
        } catch (_) {}
      }
    };
    window.addEventListener('erbolamm:set-view', onSetView);
    if (window.Oficina3D) {
      window.Oficina3D.setViewMode = changeViewMode;
      window.Oficina3D.getViewMode = () => viewMode;
    }
    window.dispatchEvent(new CustomEvent('erbolamm:view-changed', { detail: viewMode }));
    return () => {
      window.removeEventListener('erbolamm:set-view', onSetView);
    };
  }, [viewMode]);

  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.58);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const [camera, setCamera] = useState<Camera>({ ...DEFAULT_CAMERA });
  const routes = false;
  const locked = false;
  const [dragging, setDragging] = useState(false);

  // Bocadillos efímeros: mapa de agentId -> timestamp de expiración (en ms)
  const [ephemeralBubbles, setEphemeralBubbles] = useState<Record<string, number>>({});
  const prevActivities = useRef<Record<string, string>>({});
  const hasInitialized = useRef(false);
  // Bocadillos hablados desde el chat del directo; la fuente de verdad es `OfficeRuntime.speech`
  const [speeches, setSpeeches] = useState<Partial<Record<AgentId, Speech>>>({});
  // Dueños de avatares adoptados en Twitch chat (agente -> usuario)
  const [avatarOwners, setAvatarOwners] = useState<Record<string, string>>({});

  const cameraRef = useRef(camera);
  const points = useRef(new Map<number, TouchPoint>());
  const startPoints = useRef<TouchPoint[]>([]);
  const baseCamera = useRef(camera);
  const panGesture = useRef(false);
  const dragged = useRef(false);
  const lockedRef = useRef(locked);

  const apply = (c: Camera) => {
    cameraRef.current = c;
    setCamera(c);
  };
  const rebase = () => {
    baseCamera.current = { ...cameraRef.current };
    startPoints.current = [...points.current.values()].map((p) => ({ ...p }));
  };

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const updateScale = (w: number, h: number) => {
      if (viewMode === '3d') {
        setScale(fill ? Math.min(w / 1650, h / 970) : Math.min(w / 1650, 0.67));
      } else {
        setScale(fill ? Math.min(w / VIEW.w, h / VIEW.h) : Math.min(w / VIEW.w, 0.82));
      }
    };
    const ro = new ResizeObserver(([e]) => updateScale(e.contentRect.width, e.contentRect.height));
    ro.observe(node);
    if (node.clientWidth > 0) updateScale(node.clientWidth, node.clientHeight);
    return () => ro.disconnect();
  }, [fill, viewMode]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (lockedRef.current) return;
      if (autoCameraTimer.current !== null) {
        window.clearTimeout(autoCameraTimer.current);
        autoCameraTimer.current = null;
      }
      e.preventDefault();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1);
      apply(wheelCamera(cameraRef.current, delta));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [viewMode]);

  const people = agents.map((r) =>
    visitor?.id === r.id
      ? { ...r, pos: visitor.pos, pose: visitor.arrived ? ('sit' as const) : ('walk' as const) }
      : r
  );

  // Foco activo / Spotlight sobre un agente (Twitch commands, café, selección)
  const [spotlightAgent, setSpotlightAgent] = useState<AgentId | null>(null);
  const autoCameraTimer = useRef<number | null>(null);

  const focusOnAgent = useCallback(
    (id: AgentId, durationMs = 5000) => {
      if (window.Oficina3D?.isCinematicActive?.()) {
        return;
      }
      setSpotlightAgent(id);
      const agent = people.find((p) => p.id === id);
      if (!agent) return;

      if (autoCameraTimer.current !== null) {
        window.clearTimeout(autoCameraTimer.current);
      }

      const targetX = agent.pos.x;
      const targetY = agent.pos.y;
      const dx = targetX - 640;
      const dy = targetY - 430;
      const currentScale = scaleRef.current;

      if (viewMode === '3d') {
        const turnRad = (DEFAULT_CAMERA.turn * Math.PI) / 180;
        const tiltRad = (DEFAULT_CAMERA.tilt * Math.PI) / 180;
        const rx = dx * Math.cos(turnRad) - dy * Math.sin(turnRad);
        const ry = dx * Math.sin(turnRad) + dy * Math.cos(turnRad);
        // El personaje está en el plano del suelo con altura de ~84px y bocadillo a ~110px.
        // Compensamos con targetZ = 50 para centrar el cuerpo y bocadillo exactamente en pantalla.
        const targetZ = 50;
        const targetZoom = 2.1;
        const screenX = rx * (currentScale * targetZoom);
        const screenY = (ry * Math.cos(tiltRad) - targetZ * Math.sin(tiltRad)) * (currentScale * targetZoom);
        apply({
          ...DEFAULT_CAMERA,
          zoom: targetZoom,
          panX: Math.round(-screenX),
          panY: Math.round(-screenY),
        });
      } else {
        const targetZoom = 1.75;
        const screenX = dx * currentScale * targetZoom;
        const screenY = (dy - 45) * currentScale * targetZoom;
        apply({
          ...DEFAULT_CAMERA,
          zoom: targetZoom,
          panX: Math.round(-screenX),
          panY: Math.round(-screenY),
        });
      }

      autoCameraTimer.current = window.setTimeout(() => {
        setSpotlightAgent(null);
        apply({ ...DEFAULT_CAMERA });
        autoCameraTimer.current = null;
      }, durationMs);
    },
    [people, viewMode]
  );

  const resetCamera = useCallback(() => {
    if (autoCameraTimer.current !== null) {
      window.clearTimeout(autoCameraTimer.current);
      autoCameraTimer.current = null;
    }
    setSpotlightAgent(null);
    apply({ ...DEFAULT_CAMERA });
  }, []);

  const focusCenter = useCallback(
    (durationMs = 5000) => {
      if (autoCameraTimer.current !== null) {
        window.clearTimeout(autoCameraTimer.current);
      }
      setSpotlightAgent(null);
      const dx = 628 - 640;
      const dy = 456 - 430;
      const currentScale = scaleRef.current;

      if (viewMode === '3d') {
        const turnRad = (DEFAULT_CAMERA.turn * Math.PI) / 180;
        const tiltRad = (DEFAULT_CAMERA.tilt * Math.PI) / 180;
        const rx = dx * Math.cos(turnRad) - dy * Math.sin(turnRad);
        const ry = dx * Math.sin(turnRad) + dy * Math.cos(turnRad);
        const targetZ = 50;
        const targetZoom = 2.1;
        const screenX = rx * (currentScale * targetZoom);
        const screenY = (ry * Math.cos(tiltRad) - targetZ * Math.sin(tiltRad)) * (currentScale * targetZoom);
        apply({
          ...DEFAULT_CAMERA,
          zoom: targetZoom,
          panX: Math.round(-screenX),
          panY: Math.round(-screenY),
        });
      } else {
        const targetZoom = 1.75;
        const screenX = dx * currentScale * targetZoom;
        const screenY = (dy - 45) * currentScale * targetZoom;
        apply({
          ...DEFAULT_CAMERA,
          zoom: targetZoom,
          panX: Math.round(-screenX),
          panY: Math.round(-screenY),
        });
      }

      autoCameraTimer.current = window.setTimeout(() => {
        apply({ ...DEFAULT_CAMERA });
        autoCameraTimer.current = null;
      }, durationMs);
    },
    [viewMode]
  );

  const focusOnAgentRef = useRef(focusOnAgent);
  focusOnAgentRef.current = focusOnAgent;
  const focusCenterRef = useRef(focusCenter);
  focusCenterRef.current = focusCenter;
  const resetCameraRef = useRef(resetCamera);
  resetCameraRef.current = resetCamera;

  useEffect(() => {
    const onFocusCenter = (e: Event) => {
      const ms = (e as CustomEvent<{ durationMs?: number }>).detail?.durationMs ?? 5000;
      focusCenterRef.current(ms);
    };
    const onResetCamera = () => {
      resetCameraRef.current();
    };
    window.addEventListener('erbolamm:focus-center', onFocusCenter);
    window.addEventListener('erbolamm:reset-camera', onResetCamera);
    return () => {
      window.removeEventListener('erbolamm:focus-center', onFocusCenter);
      window.removeEventListener('erbolamm:reset-camera', onResetCamera);
    };
  }, []);

  useEffect(() => {
    if (window.Oficina3D) {
      window.Oficina3D.focusAgent = (id, ms) => focusOnAgentRef.current(id, ms);
      window.Oficina3D.focusCenter = (ms) => focusCenterRef.current(ms);
      window.Oficina3D.resetCamera = () => resetCameraRef.current();
    }
  });

  // Detección de cambios de estado/actividad para activar bocadillos efímeros de ~3 segundos
  useEffect(() => {
    const now = performance.now();
    const currentActivities: Record<string, string> = {};
    const triggered: Record<string, number> = {};
    let hasChanges = false;

    for (const r of people) {
      const isDelivering = r.deliveringUntil > now;
      const isSpeech = isSpeechStatus(r.status, r.speaking);
      const key = `${r.pose}|${r.status || ''}|${Boolean(r.path)}|${isDelivering}|${Boolean(r.speaking)}`;
      currentActivities[r.id] = key;

      const prevKey = prevActivities.current[r.id];
      if (hasInitialized.current && prevKey !== undefined && prevKey !== key) {
        triggered[r.id] = now + (r.speaking ? speechDuration(r.status) : isSpeech ? Math.max(5000, speechDuration(r.status || '')) : 5000);
        hasChanges = true;
      }
    }

    prevActivities.current = currentActivities;
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      return;
    }

    if (hasChanges) {
      setEphemeralBubbles((prev) => ({ ...prev, ...triggered }));
    }
  }, [people]);

  // Suscripción a `OfficeRuntime.say()`: App publica `window.Oficina3D` después de montar este componente
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let unsubscribe: (() => void) | null = null;
    let retry = 0;
    const attach = () => {
      const rt = window.Oficina3D?.runtime;
      if (!rt) {
        retry = window.setTimeout(attach, 500);
        return;
      }
      const sync = () => {
        const now = performance.now();
        const next: Partial<Record<AgentId, Speech>> = {};
        for (const [id, speech] of rt.speech) {
          if (speech.until > now) {
            next[id] = speech;
          }
        }
        setSpeeches(next);
      };
      unsubscribe = rt.onSpeech(sync);
      sync();
    };
    attach();
    return () => {
      unsubscribe?.();
      window.clearTimeout(retry);
    };
  }, []);

  // Oculta cada bocadillo hablado al acabar su duración (proporcional al texto)
  useEffect(() => {
    const pending = Object.values(speeches).filter((s): s is Speech => Boolean(s));
    if (pending.length === 0) return;
    const delay = Math.max(60, Math.ceil(Math.min(...pending.map((s) => s.until)) - performance.now()));
    const timeoutId = window.setTimeout(() => {
      const now = performance.now();
      setSpeeches((prev) => {
        const next: Partial<Record<AgentId, Speech>> = {};
        for (const [id, speech] of Object.entries(prev) as [AgentId, Speech | undefined][]) if (speech && speech.until > now) next[id] = speech;
        return next;
      });
    }, delay);
    return () => window.clearTimeout(timeoutId);
  }, [speeches]);

  // Comandos del chat de Twitch (`!cafe`, `!git`, `!say`, `!estado`) vía `/api/directo/comando`.
  // Solo se aplican eventos nuevos: la primera consulta únicamente fija el cursor.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    let cursor = -1;
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      if (!document.hidden) {
        try {
          const response = await fetch(`/api/directo/comando?desde=${cursor}`, { cache: 'no-store' });
          if (response.ok) {
            const body = (await response.json()) as { seq?: number; eventos?: OfficeCommand[]; duenos?: Record<string, string> };
            if (body.duenos) {
              setAvatarOwners(body.duenos);
            }
            const office = window.Oficina3D;
            if (cursor >= 0 && office) {
              for (const event of body.eventos ?? []) {
                if (event.comando === 'cafe' && office.traerCafe) {
                  const id = event.agente && event.agente !== 'ja' && event.agente in AGENT_BY_ID ? (event.agente as AgentId) : undefined;
                  office.traerCafe(id);
                  const runnerId = office.runtime?.coffeeRun?.agentId ?? id ?? 'ge';
                  focusOnAgentRef.current(runnerId, 5000);
                } else {
                  office.runtime.applyCommand(event, performance.now());
                  const speaker = office.runtime.speaker(event.agente);
                  focusOnAgentRef.current(speaker, 5000);
                }
              }
            }
            if (typeof body.seq === 'number') cursor = body.seq;
          }
        } catch {
          // La oficina sigue funcionando aunque el panel no exponga el canal del directo
        }
      }
      if (!stopped) timer = window.setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Temporizador para desvanecer y ocultar los bocadillos cuando expiran los 3 segundos
  useEffect(() => {
    const entries = Object.entries(ephemeralBubbles);
    if (entries.length === 0) return;

    const now = performance.now();
    const activeTimes = entries.map(([, exp]) => exp).filter((exp) => exp > now);

    if (activeTimes.length === 0) {
      setEphemeralBubbles({});
      return;
    }

    const nextExpire = Math.min(...activeTimes);
    const delay = Math.max(60, Math.ceil(nextExpire - now));

    const timeoutId = window.setTimeout(() => {
      const curNow = performance.now();
      setEphemeralBubbles((prev) => {
        const updated: Record<string, number> = {};
        let hasActive = false;
        for (const [id, exp] of Object.entries(prev)) {
          if (exp > curNow) {
            updated[id] = exp;
            hasActive = true;
          }
        }
        return hasActive ? updated : {};
      });
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [ephemeralBubbles]);

  // Nodos frontales para la vista diorama 2D
  const frontNodes: { y: number; key: string; node: ReactNode }[] =
    viewMode === 'diorama' && !board
      ? [
          ...loungeFront(),
          ...orchFront(),
          ...delivFront(),
          ...Object.entries(WORK_SLOTS)
            .filter(([id, s]) => id !== 'pi' && id !== 'ja' && s.x > 0 && s.y > 0)
            .map(([id, s]) => ({
              y: s.y - 25,
              key: `desk-${id}`,
              node: <Desk key={`desk-${id}`} x={s.x} y={s.y - 25} tone={AGENT_BY_ID[id as AgentId].color} />,
            })),
        ]
      : [];

  if (viewMode === 'diorama') {
    for (const r of people) {
      const a = AGENT_BY_ID[r.id];
      const focus = selected === r.id || hovered === r.id;
      const isWalking = Boolean(r.path);
      const isDelivering = r.deliveringUntil > performance.now();
      const isBubbleActive = Boolean(
        (motion || r.speaking) && ephemeralBubbles[r.id] && ephemeralBubbles[r.id] > performance.now()
      );
      const spoken = speeches[r.id] && speeches[r.id]!.until > performance.now() ? speeches[r.id]!.text : undefined;

      frontNodes.push({
        y: r.pos.y,
        key: `ag-${r.id}`,
        node: (
          <g
            key={`ag-${r.id}`}
            className={`charHit ${r.pose === 'work' ? 'working-north' : ''}`}
            transform={`translate(${r.pos.x},${r.pos.y})`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(r.id);
            }}
            onMouseEnter={() => onHover(r.id)}
            onMouseLeave={() => onHover(null)}
            cursor="pointer"
          >
            <ellipse cx={0} cy={2} rx={14} ry={5} fill="rgba(0,0,0,0.14)" />
            <g transform={`scale(${CHAR_SCALE}) ${r.jumping ? 'translate(0, -38)' : ''}`}>
              <g className="person-sprite">
                <svg
                  className="sprite-front"
                  width="54"
                  height="84"
                  viewBox="-27 -76 54 84"
                  style={{ overflow: 'visible', display: (r.pose === 'work' || r.isRear) ? 'none' : undefined }}
                >
                  <Character agent={a} pose={r.pose} flip={r.facing === -1} selected={focus} />
                </svg>
                <svg
                  className="sprite-rear"
                  width="54"
                  height="84"
                  viewBox="-27 -76 54 84"
                  style={{ overflow: 'visible', display: (r.pose === 'work' || r.isRear) ? undefined : 'none' }}
                >
                  <Character agent={a} pose={r.pose} rear selected={focus} />
                </svg>
              </g>
            </g>
            {(isBubbleActive || spoken) && (
              <ActivityBubble
                key={`bubble-2d-${r.id}-${spoken ? speeches[r.id]!.until : ephemeralBubbles[r.id]}`}
                pose={r.pose}
                tone={a.color}
                walking={isWalking}
                delivering={isDelivering}
                status={r.status}
                speech={spoken}
                speaking={r.speaking}
              />
            )}
            <AgentPillTag
              name={avatarOwners[r.id] ? `${a.name} · @${avatarOwners[r.id]}` : a.name}
              color={a.color}
              focus={focus}
            />
          </g>
        ),
      });
    }
    if (activeGame) {
      frontNodes.push({
        y: activeGame.target.y,
        key: 'game-target-2d',
        node: (
          <g key="game-target-2d" className={`game-target-svg ${activeGame.phase}`} transform={`translate(${activeGame.target.x}, ${activeGame.target.y})`}>
            <ellipse cx={0} cy={2} rx={28} ry={12} fill="rgba(94, 206, 245, 0.25)" />
            <circle r={24} fill="none" stroke="#5ecef5" strokeWidth={2.5} strokeDasharray="5 3" />
            <circle r={14} fill="#005fa9" opacity={0.7} />
            <text y={-16} textAnchor="middle" fontSize={26}>
              {activeGame.phase === 'won' ? '🎉' : '🏆'}
            </text>
            {activeGame.phase === 'countdown' && (
              <text y={10} textAnchor="middle" fontSize={16} fill="#ffffff" fontWeight="bold">
                {Math.max(1, Math.ceil((activeGame.countdownEnd - performance.now()) / 1000))}
              </text>
            )}
          </g>
        ),
      });
    }
    frontNodes.sort((a, b) => a.y - b.y);
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lockedRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    if (points.current.size >= 2) return;
    if (autoCameraTimer.current !== null) {
      window.clearTimeout(autoCameraTimer.current);
      autoCameraTimer.current = null;
    }
    if (!points.current.size) {
      dragged.current = false;
      panGesture.current = viewMode === '3d' ? (e.pointerType === 'mouse' && e.button === 2) : true;
    }
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    rebase();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lockedRef.current || !points.current.has(e.pointerId)) return;
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const current = [...points.current.values()];
    const distance = current.reduce((n, p, i) => n + Math.hypot(p.x - startPoints.current[i].x, p.y - startPoints.current[i].y), 0);
    if (distance > 3 && !dragged.current) {
      dragged.current = true;
      setDragging(true);
    }
    if (dragged.current) {
      e.preventDefault();
      try {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      } catch (_) {}
      apply(gestureCamera(baseCamera.current, startPoints.current, current, panGesture.current));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lockedRef.current) return;
    points.current.delete(e.pointerId);
    if (!points.current.size) setDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}
    rebase();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lockedRef.current) return;
    points.current.delete(e.pointerId);
    if (!points.current.size) setDragging(false);
    rebase();
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lockedRef.current) return;
    if (e.pointerType === 'mouse' && !e.currentTarget.hasPointerCapture(e.pointerId)) {
      points.current.delete(e.pointerId);
      if (!points.current.size) setDragging(false);
      rebase();
    }
  };

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragged.current && e.detail !== 0) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (lockedRef.current || e.target !== e.currentTarget) return;
    let c = { ...cameraRef.current };
    const pan = e.shiftKey;
    if (e.key === 'ArrowLeft') c = pan ? { ...c, panX: c.panX - 30 } : { ...c, turn: c.turn - 5 };
    else if (e.key === 'ArrowRight') c = pan ? { ...c, panX: c.panX + 30 } : { ...c, turn: c.turn + 5 };
    else if (e.key === 'ArrowUp') c = pan ? { ...c, panY: c.panY - 30 } : { ...c, tilt: c.tilt + 4 };
    else if (e.key === 'ArrowDown') c = pan ? { ...c, panY: c.panY + 30 } : { ...c, tilt: c.tilt - 4 };
    else if (e.key === '+' || e.key === '=') c.zoom *= 1.2;
    else if (e.key === '-') c.zoom /= 1.2;
    else if (e.key === 'Home') c = { ...DEFAULT_CAMERA };
    else return;
    e.preventDefault();
    apply(boundCamera(c));
  };

  return (
    <div className="office-volume">
      {/* Barra de herramientas estilo nav-card, FUERA del world-anchor y del volume-viewport */}
      <div className="camera-tools" aria-label="Controles del plano">
        <div className="camera-hint live-chat-banner" role="status" aria-label="Comandos de chat de Twitch en vivo">
          <span className="live-chat-badge">
            <span className="live-dot" aria-hidden="true" /> EN VIVO
          </span>
          <span className="live-chat-item">
            <strong>Twitch:</strong> <code>!&lt;agente&gt;</code> (adoptar) · <code>!liberar</code> · <code>!cafe [agente]</code> · <code>!tema &lt;color&gt;</code> · <code>!git</code> · <code>!estado</code>
          </span>
          <span className="live-chat-sep" aria-hidden="true">|</span>
          <span className="live-chat-item">
            <strong>Avatares:</strong> <code>co</code> <code>cl</code> <code>pi</code> <code>ge</code> <code>gr</code> <code>op</code> <code>om</code> <code>ex</code> <code>be</code> (<code>ja</code> reservado)
          </span>
          <span className="live-chat-subhint">
            ({viewMode === '3d' ? 'Arrastra para rotar · dos dedos o botón derecho para mover' : 'Arrastra para explorar'})
          </span>
        </div>
        <div className="camera-actions">
          <div className="view-mode-selector" role="group" aria-label="Tipo de plano">
            <button
              className={`icon-tool view-tool ${viewMode === '3d' ? 'active' : ''}`}
              type="button"
              aria-label="Plano 3D (isométrico)"
              data-tip="Plano 3D (isométrico)"
              onClick={() => changeViewMode('3d')}
            >
              <span aria-hidden="true">🧊</span>
            </button>
            <button
              className={`icon-tool view-tool ${viewMode === 'diorama' ? 'active' : ''}`}
              type="button"
              aria-label="Plano 2D (diorama)"
              data-tip="Plano 2D (diorama)"
              onClick={() => changeViewMode('diorama')}
            >
              <span aria-hidden="true">🗺️</span>
            </button>
          </div>
          <button
            className="icon-tool mail-tool"
            type="button"
            aria-label={`Abrir buzón${mailCount ? `, ${mailCount} pendientes` : ''}`}
            data-tip={`Buzón${mailCount ? ` (${mailCount} pendientes)` : ''}`}
            onClick={onMail}
          >
            <span aria-hidden="true">✉</span>
            {mailCount > 0 && <b className="mail-count" aria-hidden="true">{mailCount > 99 ? '99+' : mailCount}</b>}
          </button>
          <button
            className="icon-tool"
            type="button"
            aria-label="Buscar tareas"
            data-tip="Buscar tareas · todas las fechas"
            onClick={() => window.open('/vista/buscar.html', 'oficina-buscar', 'popup=yes,width=650,height=850,resizable=yes,scrollbars=yes')?.focus()}
          >
            <span aria-hidden="true">🔍</span>
          </button>
        </div>
      </div>

      {/* Viewport interactivo del plano */}
      <div
        ref={host}
        className={`volume-viewport ${viewMode === '3d' ? 'office-3d-viewport' : 'diorama-viewport'} ${dragging ? 'is-dragging' : ''} ${locked ? 'is-locked' : ''}`}
        style={{
          ...(fill ? undefined : { height: Math.max(280, scale * (viewMode === '3d' ? 970 : 860)) }),
          ...(bronca && motion && (bronca.shakeX || bronca.shakeY)
            ? { transform: `translate(${Math.round(bronca.shakeX)}px, ${Math.round(bronca.shakeY)}px)` }
            : {}),
        }}
        tabIndex={0}
        aria-label={viewMode === '3d' ? 'Plano 3D interactivo' : 'Plano 2D diorama'}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        onClickCapture={handleClickCapture}
        onKeyDown={handleKeyDown}
      >
        {viewMode === '3d' ? (
          <div className="world-anchor" style={{ transform: `translate(${camera.panX}px,${camera.panY}px)` }}>
            <div
              className="world"
              style={{
                transform: `scale(${scale * camera.zoom}) rotateX(${camera.tilt}deg) rotateZ(${camera.turn}deg)`,
              }}
            >
              <div className="foundation" />
              {board && <DamasBoard3D />}
              {!board && (Object.keys(ROOMS) as ZoneId[]).map((z) => {
                const r = ROOMS[z];
                return <div key={z} className={`room-floor floor-${z}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />;
              })}
              {!board && <div className="office-rug lounge-rug" style={{ left: 70, top: 90, width: 280, height: 180 }} aria-hidden="true" />}
              {!board && <div className="office-rug owner-rug" style={{ left: 1080, top: 230, width: 145, height: 165 }} aria-hidden="true" />}
              {!board && <div className="whiteboard-wall" style={{ left: 885, top: 26, width: 125, height: 6 }} aria-hidden="true">
                <div className="wb-frame">
                  <div className="wb-notes">
                    <i className="note-c" />
                    <i className="note-o" />
                    <i className="note-b" />
                  </div>
                </div>
              </div>}
              {!board && <div className="hallway">DESCANSO → BRIEFING → TRABAJO → ENTREGA</div>}
              {!board && [310, 950].flatMap((x) =>
                [414, 498].map((y) => (
                  <div key={`${x}-${y}`} className="door-mat" style={{ left: x - 28, top: y - 13 }}>
                    ↕
                  </div>
                ))
              )}
              <svg className="route-map" width="1280" height="860" aria-hidden="true">
                {routes &&
                  agents
                    .filter((a) => a.path)
                    .map((a) => (
                      <polyline
                        key={a.id}
                        points={a.path!.map((p) => `${p.x},${p.y}`).join(' ')}
                        stroke={AGENT_BY_ID[a.id].color}
                        strokeWidth="4"
                        strokeDasharray="8 8"
                        fill="none"
                      />
                    ))}
              </svg>
              {(board ? BOARD_WALLS : walls).map((box, i) => (
                <Cuboid key={`wall-${i}`} box={box} />
              ))}
              {!board && furniture.map((box, i) => (
                <Cuboid key={`furniture-${i}`} box={box} />
              ))}
              {!board && (Object.keys(ROOMS) as ZoneId[]).map((z) => {
                const r = ROOMS[z];
                return (
                  <div key={`lamp-${z}`} className="fan-anchor" style={{ left: r.x + r.w / 2, top: r.y + r.h / 2 }} aria-label={`Luz cenital de ${r.name}`}>
                    <div className="ceiling-fan">
                      <div className="fan-rod" />
                      <div className="fan-light" />
                    </div>
                  </div>
                );
              })}
              {activeGame && (
                <div
                  className={`game-target-marker ${activeGame.phase}`}
                  style={{ left: activeGame.target.x, top: activeGame.target.y }}
                  aria-label="Meta de la carrera"
                >
                  <div className="game-target-glow" />
                  <div className="game-target-ring" />
                  <div className="game-target-ring inner" />
                  <div className="game-target-trophy">
                    {activeGame.phase === 'won' ? '🎉' : '🏆'}
                  </div>
                  {activeGame.phase === 'countdown' && (
                    <div className="game-target-countdown">
                      {Math.max(1, Math.ceil((activeGame.countdownEnd - performance.now()) / 1000))}
                    </div>
                  )}
                </div>
              )}
              {people.map((r) => {
                const a = AGENT_BY_ID[r.id];
                const focus = selected === r.id || hovered === r.id;
                const isWalking = Boolean(r.path);
                const isDelivering = r.deliveringUntil > performance.now();
                const speechText = isSpeechStatus(r.status, r.speaking) ? r.status : null;
                const isBubbleActive = Boolean(
                  (motion || r.speaking) && ephemeralBubbles[r.id] && ephemeralBubbles[r.id] > performance.now()
                );
                const spoken = speeches[r.id] && speeches[r.id]!.until > performance.now() ? speeches[r.id]!.text : undefined;
                const hasSpeech = Boolean((speechText && isBubbleActive) || spoken);
                return (
                  <div className={`person-anchor ${r.jumping ? 'jumping' : ''}`} key={r.id} style={{ left: r.pos.x, top: r.pos.y }}>
                    <div className="foot-shadow" />
                    <button
                      className={`person-upright ${focus ? 'focused' : ''} ${(r.pose === 'work' || r.isRear) ? 'working-north' : ''} ${hasSpeech ? 'has-speech' : ''} ${r.jumping ? 'jumping' : ''}`}
                      onClick={() => onSelect(r.id)}
                      onMouseEnter={() => onHover(r.id)}
                      onMouseLeave={() => onHover(null)}
                      aria-label={`Abrir ficha de ${a.name}: ${r.status}`}
                      style={{ '--agent-color': a.color } as CSSProperties}
                    >
                      <div className="person-sprite">
                        <svg className="sprite-front" width="54" height="84" viewBox="-27 -76 54 84">
                          <Character agent={a} pose={r.pose} flip={r.facing === -1} selected={focus} />
                        </svg>
                        <svg className="sprite-rear" width="54" height="84" viewBox="-27 -76 54 84">
                          <Character agent={a} pose={r.pose} rear selected={focus} />
                        </svg>
                      </div>
                      <span className="person-name">
                        {a.name}{avatarOwners[r.id] ? ` · @${avatarOwners[r.id]}` : ''}
                      </span>
                      {(isBubbleActive || spoken) && (
                        <svg
                          className="person-bubble-svg-3d"
                          width="300"
                          height="120"
                          viewBox="-150 -120 300 120"
                          style={{ overflow: 'visible', pointerEvents: 'none' }}
                        >
                          <ActivityBubble
                            key={`bubble-3d-${r.id}-${spoken ? speeches[r.id]!.until : ephemeralBubbles[r.id]}`}
                            pose={r.pose}
                            tone={a.color}
                            walking={isWalking}
                            delivering={isDelivering}
                            status={r.status}
                            speech={spoken}
                            speaking={r.speaking}
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="diorama-anchor" style={{ transform: `translate(${camera.panX}px, ${camera.panY}px)` }}>
            <div
              className="diorama-stage"
              style={{
                transform: `scale(${scale * camera.zoom})`,
                transition: dragging ? 'none' : 'transform 0.12s ease-out',
              }}
            >
              <svg viewBox="0 0 1280 860" width="1280" height="860" className="diorama-svg" style={{ overflow: 'visible' }}>
                <Defs />
                {board ? (
                  <DamasBoardSvg />
                ) : (
                  <>
                    <Shell />
                    <circle className="fan-light" cx={310} cy={210} r={7} fill="#fdfdfd" stroke="#3a332c" strokeWidth={1.5} opacity={0.85} />
                    <circle className="fan-light" cx={950} cy={210} r={7} fill="#fdfdfd" stroke="#3a332c" strokeWidth={1.5} opacity={0.85} />
                    <circle className="fan-light" cx={310} cy={660} r={7} fill="#fdfdfd" stroke="#3a332c" strokeWidth={1.5} opacity={0.85} />
                    <circle className="fan-light" cx={950} cy={660} r={7} fill="#fdfdfd" stroke="#3a332c" strokeWidth={1.5} opacity={0.85} />
                    <LoungeBack />
                    <OrchBack />
                    <WorkBack />
                    <DelivBack />
                  </>
                )}
                {routes &&
                  agents
                    .filter((a) => a.path)
                    .map((a) => (
                      <polyline
                        key={`route-${a.id}`}
                        points={a.path!.map((p) => `${p.x},${p.y}`).join(' ')}
                        stroke={AGENT_BY_ID[a.id].color}
                        strokeWidth="3.5"
                        strokeDasharray="6 8"
                        fill="none"
                        opacity={0.85}
                      />
                    ))}
                {frontNodes.map((item) => (
                  <g key={item.key}>{item.node}</g>
                ))}
              </svg>
            </div>
          </div>
        )}
        {fiesta && fiesta.phase === 'party' && <FiestaLayer fiesta={fiesta} />}
        {bronca && (bronca.phase === 'brawl' || bronca.phase === 'ended') && <BroncaLayer bronca={bronca} />}
      </div>
    </div>
  );
}
