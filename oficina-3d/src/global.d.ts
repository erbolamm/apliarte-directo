import type { PanelDraft } from './office/workflow';
import type { AgentId } from './office/agents';
import type { OfficeRuntime } from './office/runtime';
declare global {
 interface Window {
  Oficina: {office:{actionToken?:string}|null;lastSnapshot?:unknown;refresh:()=>Promise<void>;taskRequest:(path:string,payload:PanelDraft|Record<string,unknown>)=>Promise<any>};
  Oficina3D?: {
   runtime: OfficeRuntime;
   visitFromPopup: (id: AgentId) => void;
   focusFromPopup: (id: AgentId) => void;
   leaveFromPopup: (id: AgentId) => void;
   registerPopup: (id: AgentId, win: Window) => void;
   unregisterPopup: (id: AgentId) => void;
   rekeyPopup: (oldId: AgentId, newId: AgentId) => void;
   traerCafe?: (id?: AgentId) => void;
   setViewMode?: (mode: '3d' | 'diorama') => void;
   getViewMode?: () => '3d' | 'diorama';
   focusAgent?: (id: AgentId, durationMs?: number) => void;
   focusCenter?: (durationMs?: number) => void;
   resetCamera?: () => void;
   isCinematicActive?: () => boolean;
   ejecutarBeso?: (senderId: AgentId, targetId: AgentId, customText?: string) => void;
   ejecutarBronca?: () => void;
   ejecutarTrabajar?: (agentId?: AgentId) => void;
   moverAvatar?: (id: AgentId, dx: number, dy: number, facing: number, isRear: boolean) => void;
   saltarAvatar?: (id: AgentId) => void;
   resetAvatar?: (id: AgentId) => void;
   iniciarJuego?: (caller?: AgentId) => { ok: boolean; reason?: string; segundosRestantes?: number };
   isGameActive?: () => boolean;
   setBoard?: (on: boolean) => void;
   isBoard?: () => boolean;
   irACasilla?: (id: AgentId, casilla: string) => boolean;
  };
 }
}
export {};
