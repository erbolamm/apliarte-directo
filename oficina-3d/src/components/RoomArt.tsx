import { AGENT_BY_ID } from "../office/agents";
import {
  CORRIDOR,
  DOORS,
  JUNCTION,
  ROOMS,
  ZONE_META,
  type ZoneId,
} from "../office/layout";
import { ERBOLAMM_LOGO_DATA_URI } from "../office/logo";

const INK = "#3a332c";

/* ------------------------------------------------------------------ */
/* Patrones y edificio                                                 */
/* ------------------------------------------------------------------ */

export function Defs() {
  return (
    <defs>
      <pattern
        id="floor-lounge"
        width="72"
        height="24"
        patternUnits="userSpaceOnUse"
      >
        <rect width="72" height="24" fill="var(--floor-lounge)" />
        <path
          d="M0,0.5 H72 M0,23.5 H72"
          stroke="var(--floor-line)"
          strokeWidth="1"
          opacity="0.6"
        />
      </pattern>
      <pattern
        id="floor-orch"
        width="72"
        height="24"
        patternUnits="userSpaceOnUse"
      >
        <rect width="72" height="24" fill="var(--floor-orch)" />
        <path
          d="M0,0.5 H72 M0,23.5 H72"
          stroke="var(--floor-line)"
          strokeWidth="1"
          opacity="0.6"
        />
      </pattern>
      <pattern
        id="floor-work"
        width="40"
        height="40"
        patternUnits="userSpaceOnUse"
      >
        <rect width="40" height="40" fill="var(--floor-work)" />
        <path
          d="M0,0.5 H40 M0.5,0 V40"
          stroke="var(--floor-line)"
          strokeWidth="1"
          opacity="0.5"
        />
      </pattern>
      <pattern
        id="floor-deliv"
        width="34"
        height="34"
        patternUnits="userSpaceOnUse"
      >
        <rect width="34" height="34" fill="var(--floor-deliv)" />
        <path
          d="M0,0.5 H34 M0.5,0 V34"
          stroke="var(--floor-line)"
          strokeWidth="1"
          opacity="0.5"
        />
        <circle cx="17" cy="17" r="1.1" fill="var(--floor-line)" />
      </pattern>
      <pattern
        id="floor-hall"
        width="36"
        height="36"
        patternUnits="userSpaceOnUse"
      >
        <rect width="36" height="36" fill="var(--floor-hall)" />
        <path
          d="M0,0.5 H36 M0.5,0 V36"
          stroke="var(--floor-line)"
          strokeWidth="1"
          opacity="0.45"
        />
      </pattern>
      <marker
        id="arrow"
        viewBox="0 0 10 10"
        refX="6"
        refY="5"
        markerWidth="5"
        markerHeight="5"
        orient="auto"
      >
        <path d="M0,1 L9,5 L0,9 z" fill="var(--route)" />
      </marker>
      <radialGradient id="glow" cx="50%" cy="50%">
        <stop offset="0%" stopColor="var(--accent-2)" stopOpacity="0.35" />
        <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--screen)" />
        <stop offset="100%" stopColor="var(--screen-dark)" />
      </linearGradient>
    </defs>
  );
}

const FLOOR: Record<ZoneId, string> = {
  lounge: "url(#floor-lounge)",
  orch: "url(#floor-orch)",
  work: "url(#floor-work)",
  deliv: "url(#floor-deliv)",
};

export function Shell() {
  return (
    <g>
      <rect
        x={CORRIDOR.x}
        y={CORRIDOR.y}
        width={CORRIDOR.w}
        height={CORRIDOR.h}
        fill="url(#floor-hall)"
      />

      {(Object.keys(ROOMS) as ZoneId[]).map((z) => {
        const r = ROOMS[z];
        return (
          <rect
            key={z}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={10}
            fill={FLOOR[z]}
          />
        );
      })}

      {(Object.keys(ROOMS) as ZoneId[]).map((z) => {
        const r = ROOMS[z];
        const d = DOORS[z];
        const gapStart = d.x - d.span / 2;
        const gapEnd = d.x + d.span / 2;
        const isTop = d.wall === "t";
        const wallY = isTop ? r.y : r.y + r.h;
        return (
          <g
            key={`wall-${z}`}
            stroke="var(--wall-line)"
            strokeWidth={10}
            strokeLinecap="butt"
          >
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={10}
              fill="none"
              stroke="var(--wall-line)"
              strokeWidth={10}
            />
            <rect
              x={r.x + 3}
              y={r.y + 3}
              width={r.w - 6}
              height={r.h - 6}
              rx={8}
              fill="none"
              stroke="var(--wall)"
              strokeWidth={6}
            />
            {/* hueco de la puerta hacia el pasillo */}
            <line
              x1={gapStart}
              y1={wallY}
              x2={gapEnd}
              y2={wallY}
              stroke="var(--floor-hall)"
              strokeWidth={12}
            />
            <circle
              cx={d.x}
              cy={wallY}
              r={4}
              fill="var(--route)"
              opacity={0.7}
            />
          </g>
        );
      })}

      <rect
        x={16}
        y={16}
        width={1248}
        height={828}
        rx={14}
        fill="none"
        stroke="var(--wall-line)"
        strokeWidth={3}
        opacity={0.5}
      />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Recorrido señalizado entre las 4 zonas                              */
/* ------------------------------------------------------------------ */

export function RouteLayer() {
  const lounge = DOORS.lounge.at;
  const orch = DOORS.orch.at;
  const work = DOORS.work.at;
  const deliv = DOORS.deliv.at;
  const j = JUNCTION;
  return (
    <g fill="none" stroke="var(--route)" opacity={0.85} strokeLinecap="round">
      <rect
        x={j.x - 320}
        y={j.y - 4}
        width={640}
        height={8}
        rx={4}
        fill="var(--rug)"
        opacity={0.5}
        stroke="none"
      />
      <g
        strokeWidth={4}
        strokeDasharray="8 12"
        markerEnd="url(#arrow)"
        className="a-dash"
      >
        <path
          d={`M${lounge.x},${lounge.y} L${j.x},${j.y} L${orch.x},${orch.y}`}
        />
        <path d={`M${j.x},${j.y} L${work.x},${work.y}`} />
        <path
          d={`M${orch.x},${orch.y} L${j.x},${j.y} L${deliv.x},${deliv.y}`}
        />
      </g>
    </g>
  );
}

function StepBadge({
  n,
  x,
  y,
  tone,
  label,
  labelOffset,
}: {
  n: number;
  x: number;
  y: number;
  tone: string;
  label: string;
  /** desplazamiento vertical de la etiqueta respecto al círculo — negativo
   * la coloca por encima, positivo por debajo. Cada pareja de paradas
   * (arriba/abajo del pasillo) apunta su etiqueta hacia su propia sala,
   * en sentido contrario a la otra pareja, para que nunca se solapen. */
  labelOffset: number;
}) {
  return (
    <g pointerEvents="none">
      <circle
        cx={x}
        cy={y}
        r={14}
        fill={tone}
        stroke="var(--panel)"
        strokeWidth={3}
      />
      <text
        x={x}
        y={y + 5}
        textAnchor="middle"
        fontSize={15}
        fontWeight={800}
        fill="#fff"
      >
        {n}
      </text>
      <text
        x={x}
        y={y + labelOffset}
        textAnchor="middle"
        fontSize={11.5}
        fontWeight={700}
        fill="var(--label)"
      >
        {label}
      </text>
    </g>
  );
}

/** Las 4 paradas numeradas se colocan en dos filas dentro del propio
 * pasillo (que solo mide 84 unidades de alto): "descanso" y "orquestador"
 * en la fila de arriba (cerca de sus puertas, en y=414), "trabajo" y
 * "entregas" en la fila de abajo (cerca de las suyas, en y=498). Antes las
 * dos filas se desplazaban una hacia la otra (+34 y -20) y acababan
 * exactamente superpuestas a mitad de pasillo; ahora cada fila se aleja de
 * la otra, con más de 20px de hueco libre entre círculos y etiquetas.  */
export function RouteBadges() {
  const topY = 430; // fila de arriba, dentro del pasillo, pegada a lounge/orch
  const bottomY = 482; // fila de abajo, dentro del pasillo, pegada a work/deliv
  return (
    <g>
      <StepBadge
        n={1}
        x={DOORS.lounge.x}
        y={topY}
        tone={ZONE_META.lounge.tone}
        label="descanso"
        labelOffset={-14}
      />
      <StepBadge
        n={2}
        x={DOORS.orch.x}
        y={topY}
        tone={ZONE_META.orch.tone}
        label="reuniones"
        labelOffset={-14}
      />
      <StepBadge
        n={3}
        x={DOORS.work.x}
        y={bottomY}
        tone={ZONE_META.work.tone}
        label="trabajo"
        labelOffset={20}
      />
      <StepBadge
        n={4}
        x={DOORS.deliv.x}
        y={bottomY}
        tone={ZONE_META.deliv.tone}
        label="entrega"
        labelOffset={20}
      />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Elementos compartidos                                                */
/* ------------------------------------------------------------------ */

export function Plant({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx={0} cy={2} rx={13} ry={4} fill="#2a1b0d" opacity={0.14} />
      <g className="a-float">
        <path
          d="M0,-6 q-16,-8 -11,-24 q11,3 11,24"
          fill="var(--plant)"
          stroke={INK}
          strokeWidth={1.4}
        />
        <path
          d="M0,-6 q16,-10 11,-26 q-12,5 -11,26"
          fill="var(--plant-dark)"
          stroke={INK}
          strokeWidth={1.4}
        />
      </g>
      <path
        d="M-10,-8 h20 l-3,13 q-7,2.4 -14,0 z"
        fill="var(--wood)"
        stroke={INK}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </g>
  );
}

export function Desk({ x, y, tone }: { x: number; y: number; tone: string }) {
  return (
    <g>
      <rect
        x={x - 52}
        y={y - 12}
        width={104}
        height={11}
        rx={3.5}
        fill="var(--wood-light)"
        stroke={INK}
        strokeWidth={1.8}
      />
      <rect
        x={x - 48}
        y={y - 2}
        width={96}
        height={18}
        rx={3.5}
        fill="var(--wood)"
        stroke={INK}
        strokeWidth={1.8}
      />
      <path
        d={`M${x - 42},${y + 16} v8 M${x + 42},${y + 16} v8`}
        stroke="var(--wood-dark)"
        strokeWidth={3.4}
        strokeLinecap="round"
      />
      <g>
        <rect
          className="monitor-back"
          x={x + 10}
          y={y - 36}
          width={36}
          height={24}
          rx={3.5}
          fill="#4a5259"
          stroke={INK}
          strokeWidth={1.6}
        />
        <rect
          className="monitor-screen"
          x={x + 13}
          y={y - 33}
          width={30}
          height={17}
          rx={2}
          fill={tone}
          opacity={0.88}
        />
      </g>
      <rect
        x={x - 34}
        y={y - 9}
        width={30}
        height={8}
        rx={2}
        fill="#e6e0d4"
        stroke={INK}
        strokeWidth={1.2}
      />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* SALA DE DESCANSO                                                     */
/* ------------------------------------------------------------------ */

export function LoungeBack() {
  return (
    <g>
      <rect
        x={64}
        y={140}
        width={220}
        height={130}
        rx={14}
        fill="var(--rug)"
        opacity={0.55}
      />

      {/* estantería */}
      <g>
        <rect
          x={44}
          y={44}
          width={140}
          height={64}
          rx={4}
          fill="var(--wood-dark)"
          stroke={INK}
          strokeWidth={1.8}
        />
        {[
          [AGENT_BY_ID.cl.color, 52, 52],
          [AGENT_BY_ID.ge.color, 66, 55],
          [AGENT_BY_ID.co.color, 80, 50],
          [AGENT_BY_ID.pi.color, 96, 54],
          [AGENT_BY_ID.op.color, 110, 51],
          [AGENT_BY_ID.gr.color, 128, 53],
        ].map(([c, x, y], i) => (
          <rect
            key={i}
            x={x as number}
            y={y as number}
            width={7}
            height={20 - ((y as number) - 50)}
            rx={1.5}
            fill={c as string}
            stroke={INK}
            strokeWidth={0.8}
          />
        ))}
        <path d="M44,80 h140" stroke={INK} strokeWidth={1.6} />
      </g>

      {/* TV */}
      <g>
        <rect
          x={296}
          y={40}
          width={90}
          height={54}
          rx={5}
          fill="#39332c"
          stroke={INK}
          strokeWidth={1.8}
        />
        <rect
          x={301}
          y={45}
          width={80}
          height={44}
          rx={3}
          fill="url(#screen)"
          className="a-flicker"
        />
      </g>

      {/* ventana */}
      <g>
        <rect
          x={402}
          y={42}
          width={50}
          height={56}
          rx={4}
          fill="var(--accent-2)"
          opacity={0.35}
          stroke={INK}
          strokeWidth={1.6}
        />
        <path d="M427,42 v56 M402,70 h50" stroke={INK} strokeWidth={1.3} />
      </g>

      {/* respaldo de sofá */}
      <rect
        x={70}
        y={122}
        width={168}
        height={48}
        rx={16}
        fill="var(--sofa)"
        stroke={INK}
        strokeWidth={1.8}
      />
      <rect
        x={286}
        y={118}
        width={54}
        height={48}
        rx={16}
        fill="var(--sofa)"
        stroke={INK}
        strokeWidth={1.8}
      />

      {/* barra de café */}
      <g>
        <rect
          x={36}
          y={230}
          width={92}
          height={30}
          rx={5}
          fill="var(--wood)"
          stroke={INK}
          strokeWidth={1.8}
        />
        <rect
          x={48}
          y={202}
          width={24}
          height={28}
          rx={4}
          fill="#5c6570"
          stroke={INK}
          strokeWidth={1.6}
        />
      </g>

      <ellipse
        cx={290}
        cy={292}
        rx={30}
        ry={13}
        fill="var(--rug)"
        stroke={INK}
        strokeWidth={1.6}
      />
    </g>
  );
}

export function loungeFront() {
  return [
    {
      y: 155,
      key: "sofa-front",
      node: (
        <g>
          <rect
            x={68}
            y={156}
            width={176}
            height={22}
            rx={11}
            fill="var(--sofa)"
            stroke={INK}
            strokeWidth={1.8}
          />
          <rect
            x={286}
            y={152}
            width={54}
            height={22}
            rx={11}
            fill="var(--sofa)"
            stroke={INK}
            strokeWidth={1.8}
          />
        </g>
      ),
    },
    {
      y: 210,
      key: "coffee-table",
      node: (
        <ellipse
          cx={170}
          cy={222}
          rx={46}
          ry={18}
          fill="var(--wood-light)"
          stroke={INK}
          strokeWidth={1.8}
        />
      ),
    },
    {
      y: 280,
      key: "beanbag-front",
      node: (
        <path
          d="M260,285 q30,20 60,0 q-6,18 -30,18 q-24,0 -30,-18 z"
          fill="var(--rug)"
          stroke={INK}
          strokeWidth={1.8}
        />
      ),
    },
    { y: 250, key: "lounge-plant", node: <Plant x={478} y={264} s={1.05} /> },
    {
      y: 200,
      key: "window-stool",
      node: (
        <ellipse
          cx={478}
          cy={198}
          rx={14}
          ry={6}
          fill="var(--wood-light)"
          stroke={INK}
          strokeWidth={1.6}
        />
      ),
    },
    { y: 310, key: "lounge-plant2", node: <Plant x={58} y={318} s={0.8} /> },
  ];
}

/* ------------------------------------------------------------------ */
/* ZONA DEL ORQUESTADOR                                                 */
/* Puesto de mando fijo de Gentleman `pi` + mesa de reunión donde se    */
/* sienta quien traiga el encargo + despacho separado de Javier `ja`.   */
/* ------------------------------------------------------------------ */

export function OrchBack() {
  return (
    <g>
      <rect
        x={700}
        y={64}
        width={320}
        height={214}
        rx={16}
        fill="var(--rug)"
        opacity={0.4}
      />

      {/* pantalla grande del puesto de mando */}
      <g>
        <rect
          x={730}
          y={44}
          width={152}
          height={78}
          rx={7}
          fill="#3a332c"
          stroke={INK}
          strokeWidth={2}
        />
        <rect
          x={737}
          y={51}
          width={138}
          height={64}
          rx={4}
          fill="url(#screen)"
        />
        {/* líneas de consola en la pantalla de mando */}
        <path d="M745,62 h60 M745,72 h95 M745,82 h45 M745,92 h80 M745,102 h110" stroke="var(--accent-2)" strokeWidth={2} opacity={0.6} strokeLinecap="round" />
        <circle cx={850} cy={72} r={8} fill="none" stroke="var(--accent-2)" strokeWidth={1.5} opacity={0.7} />
        <circle cx={850} cy={72} r={3} fill="var(--accent-2)" opacity={0.8} />
      </g>

      {/* tablero kanban */}
      <g>
        <rect
          x={906}
          y={44}
          width={110}
          height={58}
          rx={5}
          fill="var(--paper)"
          stroke={INK}
          strokeWidth={1.8}
        />
        {[
          [AGENT_BY_ID.gr.color, 913, 51],
          [AGENT_BY_ID.op.color, 939, 51],
          [AGENT_BY_ID.ex.color, 965, 51],
          [AGENT_BY_ID.co.color, 913, 74],
          [AGENT_BY_ID.cl.color, 939, 74],
        ].map(([c, x, y], i) => (
          <rect
            key={i}
            x={x as number}
            y={y as number}
            width={20}
            height={17}
            rx={2}
            fill={c as string}
            stroke={INK}
            strokeWidth={1}
            opacity={0.85}
          />
        ))}
      </g>

      {/* Logo corporativo ErBolamm en el tabique acristalado entre reuniones y despacho */}
      <g className="room-logo-emblem" transform="translate(1016, 115)">
        <image
          href={ERBOLAMM_LOGO_DATA_URI}
          x={0}
          y={0}
          width={44}
          height={44}
          preserveAspectRatio="xMidYMid meet"
          style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))" }}
        />
      </g>

      {/* despacho de Javier — separado, con tabique acristalado */}
      <g>
        <rect
          x={1032}
          y={230}
          width={190}
          height={150}
          rx={10}
          fill="var(--panel)"
          stroke="var(--accent-2)"
          strokeWidth={2.5}
          opacity={0.9}
        />
        <rect
          x={1032}
          y={230}
          width={190}
          height={150}
          rx={10}
          fill="none"
          stroke={INK}
          strokeWidth={1.4}
          opacity={0.5}
        />
        {/* reflejo sutil del tabique acristalado */}
        <line x1={1050} y1={250} x2={1200} y2={360} stroke="#ffffff" strokeWidth={2} opacity={0.35} strokeLinecap="round" />
        {/* nameplate en la puerta del despacho */}
        <rect
          x={1032}
          y={296}
          width={12}
          height={40}
          fill="var(--wood)"
          stroke={INK}
          strokeWidth={1.2}
        />
      </g>

      {[880, 940].map((x) => (
        <g key={x}>
          <path d={`M${x},44 v20`} stroke={INK} strokeWidth={1.6} />
        </g>
      ))}
    </g>
  );
}

export function orchFront() {
  return [
    {
      y: 110,
      key: "command-desk",
      node: (
        <g>
          <path
            d="M736,110 q70,-20 140,0 l0,18 q-70,-18 -140,0 z"
            fill="var(--wood)"
            stroke={INK}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <path
            d="M736,110 q70,-20 140,0"
            fill="none"
            stroke="var(--wood-light)"
            strokeWidth={3}
          />
        </g>
      ),
    },
    {
      y: 240,
      key: "meeting-table",
      node: (
        <g>
          <ellipse
            cx={806}
            cy={246}
            rx={92}
            ry={34}
            fill="var(--wood-light)"
            stroke={INK}
            strokeWidth={2}
          />
          <ellipse
            cx={806}
            cy={242}
            rx={92}
            ry={34}
            fill="var(--wood)"
            stroke={INK}
            strokeWidth={2}
          />
          <g transform="translate(806,236)">
            <rect
              x={-14}
              y={-8}
              width={28}
              height={16}
              rx={2.5}
              fill="#4f5a63"
              stroke={INK}
              strokeWidth={1.4}
            />
            <rect
              x={-11}
              y={-5.5}
              width={22}
              height={11}
              rx={1.6}
              fill="var(--screen)"
            />
          </g>
        </g>
      ),
    },
    { y: 220, key: "orch-plant", node: <Plant x={712} y={232} s={1} /> },
    { y: 300, key: "orch-plant2", node: <Plant x={1000} y={310} s={0.85} /> },
    {
      y: 290,
      key: "owner-desk",
      node: (
        <g>
          <rect
            x={1078}
            y={280}
            width={90}
            height={44}
            rx={5}
            fill="var(--wood)"
            stroke={INK}
            strokeWidth={1.8}
          />
          <rect
            x={1088}
            y={268}
            width={26}
            height={18}
            rx={3}
            fill="#4a5259"
            stroke={INK}
            strokeWidth={1.4}
          />
        </g>
      ),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* SALA DE TRABAJO                                                      */
/* ------------------------------------------------------------------ */

export function WorkBack() {
  return (
    <g>
      <rect
        x={40}
        y={520}
        width={520}
        height={70}
        rx={14}
        fill="var(--rug)"
        opacity={0.3}
      />
      <rect
        x={40}
        y={654}
        width={520}
        height={70}
        rx={14}
        fill="var(--rug)"
        opacity={0.3}
      />

      <g>
        <rect
          x={230}
          y={506}
          width={100}
          height={34}
          rx={5}
          fill="var(--paper)"
          stroke={INK}
          strokeWidth={1.8}
        />
        <path
          d="M262,522 l9,9 l16,-18"
          stroke="var(--accent)"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
      </g>

      {Object.values({
        co: [96, 590],
        cl: [266, 590],
        ge: [436, 590],
        gr: [96, 760],
        op: [266, 760],
        ex: [436, 760],
      }).map(([x, y], i) => (
        <rect
          key={i}
          x={(x as number) - 20}
          y={(y as number) - 52}
          width={40}
          height={40}
          rx={12}
          fill="var(--wood-dark)"
          stroke={INK}
          strokeWidth={1.8}
          opacity={0.85}
        />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* ZONA DE ENTREGAS                                                     */
/* ------------------------------------------------------------------ */

export function DelivBack() {
  // Six modular worker desks (tra-1..tra-6) arranged in two rows of three
  // to match the WORKER_SLOTS coordinates in layout.ts.
  const rows: Array<[number, number, string]> = [
    [736, 555, "tra-1"],
    [862, 555, "tra-2"],
    [988, 555, "tra-3"],
    [736, 695, "tra-4"],
    [862, 695, "tra-5"],
    [988, 695, "tra-6"],
  ];
  return (
    <g>
      {/* Alfombra de zona ejecutora — dos filas */}
      <rect x={700} y={520} width={480} height={70} rx={5} fill="var(--wood-dark)" stroke={INK} strokeWidth={1.8} />
      <rect x={700} y={660} width={480} height={70} rx={5} fill="var(--wood-dark)" stroke={INK} strokeWidth={1.8} />

      {/* Mesas de trabajo modulares tra-N */}
      {rows.map(([x, y, label]) => (
        <g key={label}>
          {/* Superficie de la mesa */}
          <rect
            x={x - 28}
            y={y - 14}
            width={56}
            height={10}
            rx={3}
            fill="var(--wood-light)"
            stroke={INK}
            strokeWidth={1.6}
          />
          {/* Frente de la mesa */}
          <rect
            x={x - 24}
            y={y - 5}
            width={48}
            height={16}
            rx={3}
            fill="var(--wood)"
            stroke={INK}
            strokeWidth={1.6}
          />
          {/* Patas */}
          <path
            d={`M${x - 18},${y + 11} v7 M${x + 18},${y + 11} v7`}
            stroke="var(--wood-dark)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          {/* Monitor compacto */}
          <rect
            x={x + 4}
            y={y - 36}
            width={20}
            height={14}
            rx={2.5}
            fill="#4a5259"
            stroke={INK}
            strokeWidth={1.4}
          />
          <rect
            x={x + 6}
            y={y - 34}
            width={16}
            height={9}
            rx={1.5}
            fill="var(--screen)"
            opacity={0.88}
          />
          {/* Punto de estado activo (verde) */}
          <circle cx={x + 18} cy={y - 38} r={2.5} fill="#22c55e" opacity={0.9} />
          {/* Etiqueta tra-N */}
          <text
            x={x}
            y={y + 28}
            textAnchor="middle"
            fontSize={8}
            fontWeight={700}
            fill="var(--label)"
            fontFamily="JetBrains Mono, monospace"
            opacity={0.75}
          >
            {label}
          </text>
        </g>
      ))}
    </g>
  );
}


export function delivFront() {
  return [
    {
      y: 560,
      key: "packing-bench",
      node: (
        <g>
          {/* mesa lateral de empaquetado */}
          <rect
            x={1080}
            y={548}
            width={120}
            height={14}
            rx={3.5}
            fill="var(--wood-light)"
            stroke={INK}
            strokeWidth={1.8}
          />
          <rect
            x={1084}
            y={560}
            width={112}
            height={22}
            rx={3}
            fill="var(--wood)"
            stroke={INK}
            strokeWidth={1.8}
          />
          <path d="M1092,582 v10 M1188,582 v10" stroke="var(--wood-dark)" strokeWidth={3} strokeLinecap="round" />
          {/* cinta de embalar y caja pequeña sobre la mesa */}
          <circle cx={1110} cy={542} r={6} fill="var(--badge)" stroke={INK} strokeWidth={1.2} />
          <rect x={1135} y={536} width={18} height={14} rx={2} fill="#e0b27f" stroke={INK} strokeWidth={1.2} />
        </g>
      ),
    },
    { y: 700, key: "deliv-plant", node: <Plant x={720} y={712} s={0.9} /> },
    {
      y: 720,
      key: "pallet",
      node: (
        <g transform="translate(1180,716)">
          <rect
            x={-38}
            y={-6}
            width={76}
            height={12}
            rx={2}
            fill="var(--wood-dark)"
            stroke={INK}
            strokeWidth={1.6}
          />
          <rect
            x={-32}
            y={-30}
            width={30}
            height={24}
            rx={2.5}
            fill="#e0b27f"
            stroke={INK}
            strokeWidth={1.6}
          />
          <rect
            x={2}
            y={-26}
            width={26}
            height={20}
            rx={2.5}
            fill="#cf9f6d"
            stroke={INK}
            strokeWidth={1.6}
          />
        </g>
      ),
    },
  ];
}
