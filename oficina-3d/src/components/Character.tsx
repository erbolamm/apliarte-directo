import type { AgentDef } from "../office/agents";
import type { Pose } from "../office/layout";
import { cn } from "../utils/cn";

const INK = "#2f2620";

type Props = {
  agent: AgentDef;
  pose: Pose;
  flip?: boolean;
  selected?: boolean;
  faded?: boolean;
  rear?: boolean;
};

const SITTING: Pose[] = ["sit", "work", "read", "game", "watch", "sleep"];

/* ------------------------------------------------------------------ */
/* Cara                                                                */
/* ------------------------------------------------------------------ */

function Eyes({ agent, pose }: { agent: AgentDef; pose: Pose }) {
  const id = agent.id;
  if (pose === "sleep") {
    return (
      <g stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round">
        <path d="M-10,-66 q4,4 8,0" />
        <path d="M2,-66 q4,4 8,0" />
      </g>
    );
  }
  if (id === "gr") {
    return (
      <g>
        <rect x={-15} y={-71} width={30} height={13} rx={6} fill="#20252e" stroke={INK} strokeWidth={1.6} />
        <g className="a-flicker" fill="#a9f0e4">
          <rect x={-11} y={-67} width={7} height={4} rx={2} />
          <rect x={4} y={-67} width={7} height={4} rx={2} />
        </g>
      </g>
    );
  }
  if (id === "op") {
    return (
      <g>
        <rect x={-13} y={-73} width={26} height={18} rx={4} fill="#111820" stroke={INK} strokeWidth={1.5} />
        <g fill="#b8f2c9">
          <rect x={-8} y={-68} width={4} height={6} rx={1.4} className="a-blink" />
          <rect x={4} y={-68} width={4} height={6} rx={1.4} className="a-blink" />
          <rect x={-2} y={-59} width={8} height={2} rx={1} className="a-flicker" />
        </g>
      </g>
    );
  }
  if (pose === "brawl") {
    return (
      <g stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round">
        <path d="M-10,-69 L-3,-65" />
        <path d="M10,-69 L3,-65" />
        <circle cx={-6.2} cy={-65} r={2.6} fill={INK} />
        <circle cx={6.2} cy={-65} r={2.6} fill={INK} />
        <circle cx={-7.2} cy={-66} r={0.9} fill="#fff" />
        <circle cx={5.2} cy={-66} r={0.9} fill="#fff" />
      </g>
    );
  }
  if (pose === "fall") {
    return (
      <g stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round">
        <path d="M-9,-68 L-4,-63 M-4,-68 L-9,-63" />
        <path d="M4,-68 L9,-63 M9,-68 L4,-63" />
      </g>
    );
  }
  const big = pose === "watch" || pose === "game" || pose === "dance";
  const ry = big ? 4.6 : 3.9;
  return (
    <g className="a-blink" style={{ transformOrigin: "0px -66px" }}>
      <ellipse cx={-6.2} cy={-66} rx={3.2} ry={ry} fill={INK} />
      <ellipse cx={6.2} cy={-66} rx={3.2} ry={ry} fill={INK} />
      <circle cx={-7.3} cy={-67.6} r={1.15} fill="#fff" />
      <circle cx={5.1} cy={-67.6} r={1.15} fill="#fff" />
    </g>
  );
}

function Mouth({ agent, pose }: { agent: AgentDef; pose: Pose }) {
  if (agent.id === "op") return null;
  const y = -57.5;
  if (pose === "sleep") return <ellipse cx={0} cy={y + 1} rx={2.6} ry={3} fill={INK} opacity={0.75} />;
  if (pose === "brawl") {
    return (
      <g>
        <path d={`M-6,${y - 1} q6,6 12,0 q-6,-2 -12,0 z`} fill="#ffffff" stroke={INK} strokeWidth={1.6} />
        <path d={`M-3,${y} v3 M0,${y} v4 M3,${y} v3`} stroke={INK} strokeWidth={1.2} />
      </g>
    );
  }
  if (pose === "fall") return <ellipse cx={0} cy={y + 1} rx={3} ry={3.5} fill={INK} />;
  if (pose === "present" || pose === "game" || pose === "dance")
    return (
      <g>
        <path d={`M-4.5,${y - 1} q4.5,6 9,0 q-4.5,2.5 -9,0 z`} fill={INK} />
      </g>
    );
  if (pose === "work") return <path d={`M-3,${y} h6`} stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />;
  if (agent.id === "gr") return <path d={`M-4,${y} q5,3.5 9,-2`} stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />;
  return <path d={`M-4.5,${y - 1} q4.5,5 9,0`} stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />;
}

function Blush({ agent }: { agent: AgentDef }) {
  if (agent.id === "op" || agent.id === "gr") return null;
  return (
    <g fill={agent.color} opacity={0.3}>
      <ellipse cx={-12} cy={-60} rx={3.6} ry={2.2} />
      <ellipse cx={12} cy={-60} rx={3.6} ry={2.2} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Cabeza + guiño de proveedor                                        */
/* ------------------------------------------------------------------ */

function Head({ agent, pose }: { agent: AgentDef; pose: Pose }) {
  const id = agent.id;
  const shell = agent.shell;
  const dashed = id === "ex";
  const headShape =
    id === "op" ? (
      <rect x={-17} y={-81} width={34} height={34} rx={9} fill={shell} stroke={INK} strokeWidth={2} />
    ) : id === "gr" ? (
      <rect x={-17} y={-81} width={34} height={34} rx={11} fill={shell} stroke={INK} strokeWidth={2} />
    ) : id === "cl" ? (
      <rect x={-17.5} y={-81} width={35} height={34} rx={13} fill={shell} stroke={INK} strokeWidth={2} />
    ) : (
      <ellipse
        cx={0}
        cy={-64}
        rx={17.5}
        ry={16.5}
        fill={shell}
        stroke={INK}
        strokeWidth={2}
        strokeDasharray={dashed ? "6 4" : undefined}
      />
    );

  return (
    <g>
      {id === "co" && (
        <path d="M-21,-58 a21,20 0 0 1 42,0 q-21,-9 -42,0 z" fill={agent.dark} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      )}
      {headShape}

      {(id === "co" || id === "ge" || id === "ex") && (
        <g fill={agent.light} stroke={INK} strokeWidth={1.6}>
          <rect x={-21.5} y={-68} width={5} height={9} rx={2.4} />
          <rect x={16.5} y={-68} width={5} height={9} rx={2.4} />
        </g>
      )}

      <Blush agent={agent} />
      <Eyes agent={agent} pose={pose} />
      <Mouth agent={agent} pose={pose} />

      {id === "cl" && (
        <>
          <path d="M-9,-79 q6,-8 14,-2" stroke={agent.dark} strokeWidth={3.4} fill="none" strokeLinecap="round" />
          <g stroke={INK} strokeWidth={1.7} fill="none">
            <circle cx={-6.2} cy={-66} r={6.6} />
            <circle cx={6.2} cy={-66} r={6.6} />
            <path d="M0.4,-66 h-1.2" />
            <path d="M-12.8,-67 l-4,-2" />
            <path d="M12.8,-67 l4,-2" />
          </g>
        </>
      )}

      {id === "pi" && (
        <>
          <g stroke={INK} strokeWidth={2} strokeLinejoin="round">
            <ellipse cx={0} cy={-80} rx={22} ry={5} fill="#3b3540" />
            <path d="M-12,-80 q0,-14 12,-14 q12,0 12,14 z" fill="#4a4350" />
            <path d="M-12.4,-83.5 q12,3.5 24.8,0 l0,3 q-12.4,3.6 -24.8,0 z" fill={agent.color} />
          </g>
          <g stroke={INK} strokeWidth={1.8} fill="none">
            <circle cx={6.4} cy={-66} r={7.4} fill="#ffffff" fillOpacity={0.22} />
            <path d="M12,-61 q3,7 -1,12" strokeWidth={1.3} />
          </g>
          <path
            d="M0,-60.5 q-4.5,-3.6 -8.5,0.6 q4.5,2.4 8.5,-0.6 q4,3 8.5,0.6 q-4,-4.2 -8.5,-0.6 z"
            fill={INK}
          />
        </>
      )}

      {id === "ja" && (
        <>
          <path
            d="M-17,-70 q2,-14 17,-13.5 q15,-0.5 17,13.5 q-6,-7 -17,-6.5 q-11,-0.5 -17,6.5 z"
            fill="#4a3527"
            stroke={INK}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <path
            d="M-15,-62 q1,15 15,15.5 q14,-0.5 15,-15.5 q-4,6 -15,6 q-11,0 -15,-6 z"
            fill="#5b4130"
            stroke={INK}
            strokeWidth={1.6}
          />
          <path d={`M-4.2,-57.4 q4.2,4.4 8.4,0`} stroke="#2b201a" strokeWidth={2} strokeLinecap="round" fill="none" />
          <g stroke={INK} strokeWidth={1.6} fill="none">
            <rect x={-13} y={-71.5} width={13} height={10} rx={3} />
            <rect x={0} y={-71.5} width={13} height={10} rx={3} />
            <path d="M-13,-68 l-4,-1.5" />
            <path d="M13,-68 l4,-1.5" />
          </g>
        </>
      )}

      {id === "ge" && (
        <g className="a-float">
          <path d="M0,-80 v-8" stroke={INK} strokeWidth={2} strokeLinecap="round" />
          <path
            d="M0,-99 q2.2,7.4 8,9.4 q-5.8,2 -8,9.4 q-2.2,-7.4 -8,-9.4 q5.8,-2 8,-9.4 z"
            fill={agent.color}
            stroke={INK}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        </g>
      )}

      {id === "gr" && (
        <path d="M-17,-74 q17,-9 34,0 l0,-4 q-17,-8 -34,0 z" fill={agent.dark} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      )}

      {id === "op" && (
        <>
          <path d="M-18,-78 q3,-11 18,-11 q15,0 18,11 z" fill={agent.color} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M-18,-78 q-9,1 -11,5 q6,2 11,-1 z" fill={agent.dark} stroke={INK} strokeWidth={1.8} />
          <circle cx={0} cy={-88} r={2.2} fill={agent.light} stroke={INK} strokeWidth={1.2} />
        </>
      )}

      {id === "ex" && (
        <path d="M-15,-77 q15,-10 30,0 q-6,-3 -15,-3 q-9,0 -15,3 z" fill={agent.dark} stroke={INK} strokeWidth={1.5} opacity={0.9} />
      )}

      {id === "be" && (
        <>
          <path d="M-18,-78 q3,-11 18,-11 q15,0 18,11 z" fill={agent.color} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M-5,-78 q14,-2 22,2 q-6,4 -22,1 z" fill={agent.dark} stroke={INK} strokeWidth={1.6} />
        </>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Torso + guiño de proveedor en el pecho                              */
/* ------------------------------------------------------------------ */

function Torso({ agent }: { agent: AgentDef }) {
  const id = agent.id;
  return (
    <g>
      <rect
        x={-17}
        y={-48}
        width={34}
        height={37}
        rx={13}
        fill={agent.color}
        stroke={INK}
        strokeWidth={2}
        strokeDasharray={id === "ex" ? "7 4" : undefined}
      />

      {id === "co" && (
        <>
          <path d="M-12,-24 q12,6 24,0" stroke={agent.dark} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <g stroke={agent.shell} strokeWidth={2} strokeLinecap="round">
            <path d="M-5,-46 v9" />
            <path d="M5,-46 v9" />
          </g>
          <g transform="translate(0,-35)">
            <path d="M0,-7 L6,-3.5 L6,3.5 L0,7 L-6,3.5 L-6,-3.5 Z" fill={agent.shell} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
            <path d="M-2.6,-2.4 q5.2,-1.4 5.2,2.4 q0,3.6 -5.2,2.4 q5.2,1.4 5.2,-2.4" fill="none" stroke={agent.dark} strokeWidth={1.4} />
          </g>
        </>
      )}

      {id === "cl" && (
        <>
          <g stroke={agent.light} strokeWidth={2.4} strokeLinecap="round" opacity={0.85}>
            <path d="M-15,-40 q15,4 30,0" />
            <path d="M-16,-18 q16,4 32,0" />
          </g>
          <g transform="translate(0,-30)" stroke={agent.shell} strokeWidth={2.1} strokeLinecap="round">
            <path d="M0,-6.5 V6.5" />
            <path d="M-5.6,-3.3 L5.6,3.3" />
            <path d="M-5.6,3.3 L5.6,-3.3" />
          </g>
        </>
      )}

      {id === "pi" && (
        <>
          <path d="M-9,-48 L0,-31 L9,-48 Z" fill="#fff8f5" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          <g fill={agent.dark}>
            <circle cx={0} cy={-27} r={1.7} />
            <circle cx={0} cy={-19} r={1.7} />
          </g>
          <g stroke={INK} strokeWidth={1.6} strokeLinejoin="round" fill={agent.light}>
            <path d="M-2,-43 L-11,-48 L-11,-38 Z" />
            <path d="M2,-43 L11,-48 L11,-38 Z" />
            <circle cx={0} cy={-43} r={2.8} fill={agent.dark} />
          </g>
        </>
      )}

      {id === "ja" && (
        <>
          <path d="M-9,-48 L0,-38 L9,-48 Z" fill="#f4f7fb" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          <g stroke="#d9534f" strokeWidth={2} fill="none">
            <path d="M-9,-47 L-2,-30" />
            <path d="M9,-47 L2,-30" />
          </g>
          <g>
            <rect x={-7} y={-30} width={14} height={11} rx={2.4} fill="#fdfcf7" stroke={INK} strokeWidth={1.5} />
            <rect x={-4.6} y={-27.4} width={9} height={2} rx={1} fill={agent.color} />
            <rect x={-4.6} y={-24} width={6} height={1.6} rx={0.8} fill="#b9c3cd" />
          </g>
        </>
      )}

      {id === "ge" && (
        <>
          <rect x={-17} y={-32} width={34} height={12} fill="#ffffff" opacity={0.92} />
          <g>
            <circle cx={-10.5} cy={-26} r={3} fill="#ea4335" />
            <circle cx={-3.5} cy={-26} r={3} fill="#fbbc05" />
            <circle cx={3.5} cy={-26} r={3} fill="#34a853" />
            <circle cx={10.5} cy={-26} r={3} fill="#4285f4" />
          </g>
          <path d="M-17,-32 h34 M-17,-20 h34" stroke={INK} strokeWidth={1.6} />
        </>
      )}

      {id === "gr" && (
        <>
          <path d="M0,-48 V-11" stroke={agent.dark} strokeWidth={2.4} />
          <path d="M-11,-47 L-3,-40 M11,-47 L3,-40" stroke={agent.dark} strokeWidth={2.4} strokeLinecap="round" />
          <g transform="translate(0,-28)" stroke={agent.light} strokeWidth={2.6} strokeLinecap="round">
            <path d="M-5.5,-5.5 L5.5,5.5" />
            <path d="M5.5,-5.5 L-5.5,5.5" />
          </g>
        </>
      )}

      {id === "op" && (
        <>
          <rect x={-12} y={-38} width={24} height={16} rx={4} fill="#1d252e" stroke={INK} strokeWidth={1.5} />
          <g fill={agent.light} fontFamily="ui-monospace, monospace" fontSize={10} fontWeight={700}>
            <text x={-8} y={-26}>{">_"}</text>
          </g>
        </>
      )}

      {id === "ex" && (
        <g>
          <rect x={-9} y={-34} width={18} height={14} rx={2.5} fill="#fffdf6" stroke={INK} strokeWidth={1.5} />
          <text x={0} y={-23.5} textAnchor="middle" fontSize={11} fontWeight={800} fill={agent.dark} fontFamily="inherit">
            ?
          </text>
          <path d="M-3,-34 l3,-4 l3,4" fill="none" stroke={INK} strokeWidth={1.4} />
        </g>
      )}

      {id === "be" && (
        <>
          <path d="M-10,-48 v30" stroke={agent.dark} strokeWidth={3} strokeLinecap="round" />
          <path d="M10,-48 v30" stroke={agent.dark} strokeWidth={3} strokeLinecap="round" />
          <circle cx={-10} cy={-24} r={2} fill="#ffdd55" stroke={INK} strokeWidth={1} />
          <circle cx={10} cy={-24} r={2} fill="#ffdd55" stroke={INK} strokeWidth={1} />
          <rect x={-6} y={-36} width={12} height={10} rx={2} fill={agent.dark} stroke={INK} strokeWidth={1.2} />
        </>
      )}
    </g>
  );
}

/* Back views are drawn, not mirrored faces. Visible supplier cues belong to
 * the silhouette/headgear; badges, eyes and chest details stay on the front. */
function RearHead({ agent }: { agent: AgentDef }) {
  const id = agent.id;
  return <g data-rear-part="head" data-agent={id}>
    {(id === "co" || id === "ge" || id === "ex") && <g fill={agent.light} stroke={INK} strokeWidth={1.6}>
      <rect x={-21.5} y={-68} width={5} height={9} rx={2.4}/><rect x={16.5} y={-68} width={5} height={9} rx={2.4}/>
    </g>}
    {id === "ja" ? <>
      <g fill={agent.shell} stroke={INK} strokeWidth={1.5}><ellipse cx={-17} cy={-63} rx={3.5} ry={5}/><ellipse cx={17} cy={-63} rx={3.5} ry={5}/></g>
      <ellipse cx={0} cy={-64} rx={17.5} ry={17} fill="#4a3527" stroke={INK} strokeWidth={2}/>
      <path d="M-9,-52 q9,5 18,0 l-2,5 h-14 z" fill={agent.shell} stroke={INK} strokeWidth={1.4}/>
      <path d="M-10,-76 q10,-5 20,0 M-12,-69 q12,-4 24,0" fill="none" stroke="#6f5039" strokeWidth={2} strokeLinecap="round"/>
    </> : id === "co" ? <>
      <path d="M-21,-59 q0,-24 21,-25 q21,1 21,25 q-1,13 -21,13 q-20,0 -21,-13 z" fill={agent.dark} stroke={INK} strokeWidth={2}/>
      <path d="M0,-80 v27 M-13,-52 q13,5 26,0" fill="none" stroke={agent.color} strokeWidth={2.4} strokeLinecap="round"/>
    </> : <>
      <rect x={-17.5} y={-81} width={35} height={34} rx={id === "op" ? 9 : id === "gr" ? 11 : 13} fill={agent.shell} stroke={INK} strokeWidth={2} strokeDasharray={id === "ex" ? "6 4" : undefined}/>
      <path d="M-12,-53 h24" stroke={id === "op" ? agent.dark : agent.light} strokeWidth={2} strokeLinecap="round"/>
      {id === "cl" && <>
        <path d="M-9,-79 q6,-8 14,-2" fill="none" stroke={agent.dark} strokeWidth={3.4} strokeLinecap="round"/>
        <path d="M-17,-67 q17,5 34,0" fill="none" stroke={INK} strokeWidth={1.8}/>
      </>}
      {id === "pi" && <g stroke={INK} strokeWidth={2} strokeLinejoin="round">
        <ellipse cx={0} cy={-80} rx={22} ry={5} fill="#3b3540"/>
        <path d="M-12,-80 q0,-14 12,-14 q12,0 12,14 z" fill="#4a4350"/>
        <path d="M-12.4,-83.5 q12,3.5 24.8,0 v3 q-12.4,3.6 -24.8,0 z" fill={agent.color}/>
      </g>}
      {id === "ge" && <g className="a-float">
        <path d="M0,-80 v-8" stroke={INK} strokeWidth={2} strokeLinecap="round"/>
        <path d="M0,-99 q2.2,7.4 8,9.4 q-5.8,2 -8,9.4 q-2.2,-7.4 -8,-9.4 q5.8,-2 8,-9.4 z" fill={agent.color} stroke={INK} strokeWidth={1.6}/>
        <path d="M-5,-72 h10 M-5,-68 h10" stroke={agent.light} strokeWidth={2} strokeLinecap="round"/>
      </g>}
      {id === "gr" && <>
        <path d="M-17,-74 q17,-9 34,0 v-4 q-17,-8 -34,0 z" fill={agent.dark} stroke={INK} strokeWidth={1.6}/>
        <path d="M-8,-66 h16 M-8,-61 h16" stroke={agent.dark} strokeWidth={2.5} strokeLinecap="round"/>
      </>}
      {id === "op" && <>
        <path d="M-18,-78 q3,-11 18,-11 q15,0 18,11 z" fill={agent.color} stroke={INK} strokeWidth={2}/>
        <ellipse cx={0} cy={-77} rx={21} ry={4} fill={agent.dark} stroke={INK} strokeWidth={1.8}/>
        <path d="M-6,-67 h12 M-6,-63 h12 M-6,-59 h12" stroke={agent.dark} strokeWidth={2} strokeLinecap="round"/>
      </>}
      {id === "ex" && <path d="M-15,-77 q15,-10 30,0 q-6,-3 -15,-3 q-9,0 -15,3 z" fill={agent.dark} stroke={INK} strokeWidth={1.5} opacity={.9}/>}
      {id === "be" && <path d="M-18,-78 q3,-11 18,-11 q15,0 18,11 z" fill={agent.color} stroke={INK} strokeWidth={2}/>}
    </>}
  </g>;
}

function RearTorso({ agent }: { agent: AgentDef }) {
  return <g data-rear-part="torso">
    <rect x={-17} y={-48} width={34} height={37} rx={13} fill={agent.color} stroke={INK} strokeWidth={2} strokeDasharray={agent.id === "ex" ? "7 4" : undefined}/>
    <path d="M-12,-17 q12,3 24,0" fill="none" stroke={agent.dark} strokeWidth={2} strokeLinecap="round"/>
    {agent.id === "co" ? <path d="M-12,-45 q12,17 24,0 q-12,-5 -24,0 z" fill={agent.dark} stroke={INK} strokeWidth={1.6}/> : <path d="M0,-43 v23" stroke={agent.dark} strokeWidth={1.6} opacity={.65}/>}
    {agent.id === "cl" && <path d="M-15,-40 q15,4 30,0 M-16,-18 q16,4 32,0" fill="none" stroke={agent.light} strokeWidth={2.4} opacity={.85}/>}
    {(agent.id === "pi" || agent.id === "ja") && <path d="M-8,-46 q8,3 16,0" fill="none" stroke={agent.light} strokeWidth={2}/>}
    {agent.id === "be" && <>
      <path d="M-10,-48 v30" stroke={agent.dark} strokeWidth={3} strokeLinecap="round"/>
      <path d="M10,-48 v30" stroke={agent.dark} strokeWidth={3} strokeLinecap="round"/>
    </>}</g>;
}

function RearWorkArms({ agent }: { agent: AgentDef }) {
  // Forearms point away/up to the desktop and are occluded by the back torso.
  return <g data-rear-part="work-arms">{([-1, 1] as const).map(side => <g key={side}>
    <path d={`M${side*15},-41 L${side*22},-28`} stroke={INK} strokeWidth={10} fill="none" strokeLinecap="round"/>
    <path d={`M${side*15},-41 L${side*22},-28`} stroke={agent.color} strokeWidth={7} fill="none" strokeLinecap="round"/>
    <g className={side === -1 ? "a-typeA" : "a-typeB"}>
      <path d={`M${side*22},-28 L${side*16},-36`} stroke={INK} strokeWidth={8} fill="none" strokeLinecap="round"/>
      <path d={`M${side*22},-28 L${side*16},-36`} stroke={agent.color} strokeWidth={5} fill="none" strokeLinecap="round"/>
      <Hand x={side*16} y={-36} agent={agent}/>
    </g>
  </g>)}</g>;
}

/* ------------------------------------------------------------------ */
/* Extremidades                                                        */
/* ------------------------------------------------------------------ */

function Legs({ agent, pose }: { agent: AgentDef; pose: Pose }) {
  const sit = SITTING.includes(pose);
  const leg = (x: number, cls?: string) => (
    <g className={cls} style={{ transformOrigin: `${x}px -16px` }}>
      <rect x={x - 4.5} y={-18} width={9} height={18} rx={4.2} fill={agent.dark} stroke={INK} strokeWidth={1.8} />
      <ellipse cx={x} cy={0} rx={6} ry={3.4} fill={INK} opacity={0.9} />
    </g>
  );
  if (sit) {
    return (
      <g>
        <rect x={-13} y={-15} width={26} height={10} rx={5} fill={agent.dark} stroke={INK} strokeWidth={1.8} />
        <g>
          <rect x={-12} y={-8} width={9} height={9} rx={4} fill={agent.dark} stroke={INK} strokeWidth={1.6} />
          <rect x={3} y={-8} width={9} height={9} rx={4} fill={agent.dark} stroke={INK} strokeWidth={1.6} />
          <ellipse cx={-7.5} cy={1.5} rx={5.4} ry={3} fill={INK} opacity={0.9} />
          <ellipse cx={7.5} cy={1.5} rx={5.4} ry={3} fill={INK} opacity={0.9} />
        </g>
      </g>
    );
  }
  if (pose === "walk") {
    return (
      <g>
        {leg(-6, "a-legA")}
        {leg(6, "a-legB")}
      </g>
    );
  }
  return (
    <g>
      {leg(-6)}
      {leg(6)}
    </g>
  );
}

function Hand({ x, y, agent }: { x: number; y: number; agent: AgentDef }) {
  return <circle cx={x} cy={y} r={5} fill={agent.shell === "#2b3440" ? agent.light : agent.shell} stroke={INK} strokeWidth={1.7} />;
}

function Arm({
  agent,
  side,
  angle,
  cls,
  length = 22,
}: {
  agent: AgentDef;
  side: -1 | 1;
  angle: number;
  cls?: string;
  length?: number;
}) {
  const sx = side * 15;
  const sy = -42;
  // Static attachment and rotation are separate from animated transforms.
  return (
    <g transform={`translate(${sx},${sy})`}>
      <g transform={`rotate(${angle})`}>
        <g className={cls} style={{ transformOrigin: "0px 0px" }}>
          <rect x={-4.2} y={0} width={8.4} height={length} rx={4.2} fill={agent.color} stroke={INK} strokeWidth={1.8} />
          <Hand x={0} y={length} agent={agent} />
        </g>
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Accesorios según la pose                                            */
/* ------------------------------------------------------------------ */

function AgentProps({ agent, pose }: { agent: AgentDef; pose: Pose }) {
  switch (pose) {
    case "read":
      return (
        <g transform="translate(0,-26)">
          <path
            d="M-15,0 q7,-4 14,0 q7,-4 14,0 l0,11 q-7,-4 -14,0 q-7,-4 -14,0 z"
            fill="#fffaf0"
            stroke={INK}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <path d="M-1,0 v11" stroke={INK} strokeWidth={1.4} />
          <g stroke="#c2b39c" strokeWidth={1} strokeLinecap="round">
            <path d="M-11,3.5 h7 M-11,6.5 h6 M4,3.5 h7 M4,6.5 h6" />
          </g>
          <path d="M-16,11 q16,5 32,0 l0,2.5 q-16,5 -32,0 z" fill={agent.dark} stroke={INK} strokeWidth={1.5} />
        </g>
      );
    case "game":
      return (
        <g transform="translate(0,-24)">
          <rect x={-13} y={-4} width={26} height={11} rx={5.5} fill="#41474f" stroke={INK} strokeWidth={1.8} />
          <circle cx={-7} cy={1.5} r={2.4} fill="#cdd4dc" />
          <circle cx={6.5} cy={1.5} r={2} fill="#ff6f7d" />
          <circle cx={10} cy={-1} r={1.7} fill="#8fd6a0" />
        </g>
      );
    case "coffee":
      return (
        <g transform="translate(19,-24)">
          <rect x={-5} y={-6} width={11} height={12} rx={2.6} fill="#fffaf0" stroke={INK} strokeWidth={1.7} />
          <path d="M6,-3 q5,3 0,6" fill="none" stroke={INK} strokeWidth={1.7} />
          <rect x={-5} y={-6} width={11} height={3.4} fill={agent.color} opacity={0.65} />
          <g className="a-zzz" opacity={0.5}>
            <path d="M0,-9 q3,-4 0,-8" stroke="#b9a68d" strokeWidth={1.6} fill="none" strokeLinecap="round" />
          </g>
        </g>
      );
    case "deliver":
      return (
        <g transform="translate(0,-24)">
          <rect x={-14} y={-8} width={28} height={19} rx={2.5} fill="#d9b27f" stroke={INK} strokeWidth={1.8} />
          <path d="M-14,-1 h28" stroke="#b58d5c" strokeWidth={2} />
          <path d="M0,-8 v19" stroke="#f0dcbe" strokeWidth={4} />
          <path d="M0,-8 v19" stroke={INK} strokeWidth={0.8} opacity={0.35} />
        </g>
      );
    case "sleep":
      return (
        <g>
          <g className="a-zzz" style={{ animationDelay: "0s" }}>
            <text x={16} y={-78} fontSize={13} fontWeight={800} fill={INK} opacity={0.55}>
              z
            </text>
          </g>
          <g className="a-zzz" style={{ animationDelay: "1s" }}>
            <text x={12} y={-72} fontSize={16} fontWeight={800} fill={INK} opacity={0.55}>
              Z
            </text>
          </g>
        </g>
      );
    case "fall":
      return (
        <g transform="translate(0,-86)">
          <path d="M-10,-4 L-8,0 L-12,2 L-8,3 L-10,7 L-6,4 L-4,8 L-3,4 L1,6 L-1,2 L3,0 L-1,-1 Z" fill="#ffd700" stroke={INK} strokeWidth={1} />
          <path d="M8,-2 L10,2 L6,4 L10,5 L8,9 L12,6 L14,10 L15,6 L19,8 L17,4 L21,2 L17,1 Z" fill="#ffd700" stroke={INK} strokeWidth={1} />
        </g>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Personaje                                                           */
/* ------------------------------------------------------------------ */

export default function Character({ agent, pose, flip, selected, faded, rear }: Props) {
  const sit = SITTING.includes(pose);

  let arms: React.ReactNode;
  switch (pose) {
    case "walk":
      arms = (
        <>
          <Arm agent={agent} side={-1} angle={0} cls="a-armA" />
          <Arm agent={agent} side={1} angle={0} cls="a-armB" />
        </>
      );
      break;
    case "work":
      arms = <>{([-1, 1] as const).map(side => (
        <g key={side}>
          <path d={`M${side*15},-41 L${side*20},-29`} stroke={INK} strokeWidth={10} fill="none" strokeLinecap="round" />
          <path d={`M${side*15},-41 L${side*20},-29`} stroke={agent.color} strokeWidth={7} fill="none" strokeLinecap="round" />
          <g className={side === -1 ? "a-typeA" : "a-typeB"}>
            <path d={`M${side*20},-29 L${side*8},-24`} stroke={INK} strokeWidth={8} fill="none" strokeLinecap="round" />
            <path d={`M${side*20},-29 L${side*8},-24`} stroke={agent.color} strokeWidth={5} fill="none" strokeLinecap="round" />
            <Hand x={side*8} y={-24} agent={agent}/>
          </g>
        </g>
      ))}</>;
      break;
    case "read":
    case "game":
      arms = (
        <>
          <Arm agent={agent} side={-1} angle={-42} length={18} />
          <Arm agent={agent} side={1} angle={42} length={18} />
        </>
      );
      break;
    case "deliver":
      arms = (
        <>
          <Arm agent={agent} side={-1} angle={-52} length={18} />
          <Arm agent={agent} side={1} angle={52} length={18} />
        </>
      );
      break;
    case "present":
      arms = <>
        <Arm agent={agent} side={-1} angle={14} />
        <path d="M15,-42 L22,-46" stroke={INK} strokeWidth={10} fill="none" strokeLinecap="round"/>
        <path d="M15,-42 L22,-46" stroke={agent.color} strokeWidth={7} fill="none" strokeLinecap="round"/>
        <g transform="translate(22,-46)">
          <g className="a-wave" style={{transformOrigin:"0px 0px"}}>
            <path d="M0,0 L3,-16" stroke={INK} strokeWidth={9} fill="none" strokeLinecap="round"/>
            <path d="M0,0 L3,-16" stroke={agent.color} strokeWidth={6} fill="none" strokeLinecap="round"/>
            <Hand x={3} y={-16} agent={agent}/>
          </g>
        </g>
      </>;
      break;
    case "coffee":
      arms = (
        <>
          <Arm agent={agent} side={-1} angle={10} />
          <Arm agent={agent} side={1} angle={-48} length={18} />
        </>
      );
      break;
    case "sleep":
      arms = (
        <>
          <Arm agent={agent} side={-1} angle={22} length={18} />
          <Arm agent={agent} side={1} angle={-22} length={18} />
        </>
      );
      break;
    case "dance":
      arms = (
        <>
          <Arm agent={agent} side={-1} angle={-130} length={17} />
          <Arm agent={agent} side={1} angle={130} length={17} />
        </>
      );
      break;
    case "brawl":
      arms = (
        <>
          <g className="a-punchA" style={{ transformOrigin: "-15px -42px" }}>
            <Arm agent={agent} side={-1} angle={-55} length={20} />
          </g>
          <g className="a-punchB" style={{ transformOrigin: "15px -42px" }}>
            <Arm agent={agent} side={1} angle={55} length={20} />
          </g>
        </>
      );
      break;
    case "fall":
      arms = (
        <>
          <Arm agent={agent} side={-1} angle={-110} length={16} />
          <Arm agent={agent} side={1} angle={110} length={16} />
        </>
      );
      break;
    default:
      arms = (
        <>
          <Arm agent={agent} side={-1} angle={8} />
          <Arm agent={agent} side={1} angle={-8} />
        </>
      );
  }

  const bodyAnim = pose === "brawl" ? "a-brawl-shake" : (pose === "walk" || pose === "dance") ? "a-bob-fast" : pose === "game" ? "a-bob" : "a-breathe";
  const headTilt = pose === "sleep" ? 13 : pose === "work" ? 4 : pose === "read" ? 8 : pose === "brawl" ? -6 : pose === "fall" ? 18 : 0;

  return (
    <g
      className={cn("charBody", selected && "charBody-selected")}
      data-view={rear ? "rear" : "front"}
      transform={`${flip ? "scale(-1,1)" : ""}`}
      opacity={faded ? 0.42 : 1}
      style={{ transition: "opacity .25s" }}
    >
      <ellipse cx={0} cy={1.5} rx={17} ry={4.6} fill="#2a1b0d" opacity={0.17} />
      {selected && (
        <g>
          <ellipse cx={0} cy={1.5} rx={20} ry={6} fill="none" stroke={agent.color} strokeWidth={2.5} opacity={0.9} />
          <ellipse cx={0} cy={1.5} rx={20} ry={6} fill="none" stroke={agent.color} strokeWidth={2} className="a-ring" style={{ transformOrigin: "0px 1.5px" }} />
        </g>
      )}
      <g transform={sit ? "translate(0,5)" : pose === "fall" ? "translate(0,10) rotate(70)" : undefined}><g className={bodyAnim}>
        <Legs agent={agent} pose={pose} />
        {rear && pose === "work" && <RearWorkArms agent={agent}/>}
        {rear ? <RearTorso agent={agent}/> : <Torso agent={agent} />}
        {(!rear || pose !== "work") && arms}
        <g transform={`rotate(${headTilt} 0 -48)`}>
          {rear ? <RearHead agent={agent}/> : <Head agent={agent} pose={pose} />}
        </g>
        {!rear && <AgentProps agent={agent} pose={pose} />}
      </g></g>
    </g>
  );
}
