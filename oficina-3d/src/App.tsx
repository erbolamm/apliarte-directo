import { useEffect, useRef, useState } from 'react';
import FloorPlan from './components/FloorPlan';
import Character from './components/Character';
import { AGENTS, type AgentId } from './office/agents';
import { OfficeRuntime, normalizeSnapshot, type ActiveGame } from './office/runtime';
import { isBoardMode } from './office/geometry';

export default function App({fill}:{fill?:boolean}={}){
 const runtime=useRef(new OfficeRuntime());
 const initialAgent=(()=>{const value=new URLSearchParams(window.location.search).get('agent');return AGENTS.some(agent=>agent.id===value)?value as AgentId:null;})();
 const [people,setPeople]=useState(()=>runtime.current.people.map(p=>({...p}))),[selected,setSelected]=useState<AgentId|null>(initialAgent),[hovered,setHovered]=useState<AgentId|null>(null);
 const [activeGame,setActiveGame]=useState<ActiveGame|null>(()=>runtime.current.activeGame?{...runtime.current.activeGame}:null);
 const [motion,setMotion]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches),[visible,setVisible]=useState(!document.hidden),[mailCount,setMailCount]=useState(0);
 const wake=useRef<()=>void>(()=>{});
 const openWindows=useRef(new Map<AgentId,Window>());
 useEffect(()=>{
  const rt=runtime.current;let frame=0,last=performance.now(),previous='',disposed=false;
  const publish=()=>{setPeople(rt.people.map(p=>({...p})));setActiveGame(rt.activeGame?{...rt.activeGame}:null);};
  const loop=(now:number)=>{frame=0;if(document.hidden||disposed)return;const dt=Math.min(.1,(now-last)/1000);if(dt<1/30){frame=requestAnimationFrame(loop);return;}last=now;const keep=rt.tick(now,dt);publish();if(keep)frame=requestAnimationFrame(loop);};
  const start=()=>{if(!frame&&!document.hidden){last=performance.now();frame=requestAnimationFrame(loop);}};wake.current=start;
  const receive=(raw:unknown)=>{
   const normalized=normalizeSnapshot(raw),signature=JSON.stringify(normalized);
   if(signature===previous)return;previous=signature;
   rt.update(raw,performance.now());publish();
   start();
  };
  const onSnapshot=(event:Event)=>receive((event as CustomEvent).detail);
  const onTraerCafe=(e:Event)=>{
   const detail=(e as CustomEvent<{agentId?:AgentId}>).detail;
   rt.traerCafe(detail?.agentId);
   publish();
   wake.current();
   const runnerId = rt.coffeeRun?.agentId ?? detail?.agentId;
   if (runnerId && window.Oficina3D?.focusAgent) {
     window.Oficina3D.focusAgent(runnerId, 5000);
   }
  };
  const onVisibility=()=>{setVisible(!document.hidden);if(document.hidden){cancelAnimationFrame(frame);frame=0;}else start();};
  window.addEventListener('erbolamm:snapshot',onSnapshot);
  window.addEventListener('erbolamm:traer-cafe',onTraerCafe);
  document.addEventListener('visibilitychange',onVisibility);
  if(window.Oficina?.lastSnapshot)receive(window.Oficina.lastSnapshot);
  const unsubWake=rt.onWake(()=>{publish();wake.current();});
  window.Oficina3D={
   runtime:rt,
   visitFromPopup:(id)=>{rt.visit(id,performance.now());publish();wake.current();},
   focusFromPopup:(id)=>{rt.focus(id,performance.now());publish();wake.current();},
   leaveFromPopup:(id)=>{rt.leave(id,performance.now());publish();wake.current();},
   registerPopup:(id,win)=>{openWindows.current.set(id,win);},
   unregisterPopup:(id)=>{openWindows.current.delete(id);},
   rekeyPopup:(oldId,newId)=>{const win=openWindows.current.get(oldId);if(win){openWindows.current.delete(oldId);openWindows.current.set(newId,win);}},
   traerCafe:(id?:AgentId)=>{
     rt.traerCafe(id);
     publish();
     wake.current();
     const runnerId = rt.coffeeRun?.agentId ?? id;
     if (runnerId && window.Oficina3D?.focusAgent) {
       window.Oficina3D.focusAgent(runnerId, 5000);
     }
   },
   ejecutarBeso:(senderId:AgentId,targetId:AgentId,customText?:string)=>{
     rt.beso(senderId,targetId,performance.now(),customText);
     publish();
     wake.current();
   },
   ejecutarBronca:()=>{
     rt.bronca(performance.now());
     publish();
     wake.current();
   },
   ejecutarTrabajar:(agentId?:AgentId)=>{
     rt.trabajar(performance.now(),agentId);
     publish();
     wake.current();
   },
   moverAvatar:(id:AgentId,dx:number,dy:number,facing:number,isRear:boolean)=>{
     rt.stepAgent(id,dx,dy,facing,isRear,performance.now());
     publish();
     wake.current();
   },
   saltarAvatar:(id:AgentId)=>{
     rt.jumpAgent(id,performance.now());
     publish();
     wake.current();
   },
   resetAvatar:(id:AgentId)=>{
     rt.resetAgent(id,performance.now());
     publish();
     wake.current();
   },
   iniciarJuego:(caller?:AgentId)=>{
     const res=rt.iniciarJuego(performance.now(),caller);
     publish();
     wake.current();
     return res;
   },
   setBoard:(on:boolean)=>{
     rt.setBoard(on,performance.now());
     window.dispatchEvent(new CustomEvent('erbolamm:board-changed',{detail:on}));
     publish();
     wake.current();
   },
   isBoard:()=>isBoardMode(),
   irACasilla:(id:AgentId,casilla:string)=>{
     const ok=rt.goToSquare(id,casilla,performance.now());
     publish();
     wake.current();
     return ok;
   },
   isGameActive:()=>rt.isGameActive(),
   isCinematicActive:()=>rt.isCinematicActive(),
  };
   const idleTimer=window.setInterval(()=>{if(document.hidden||disposed)return;if(rt.rotateIdlePose(performance.now()))publish();},150000);
   return()=>{disposed=true;cancelAnimationFrame(frame);unsubWake();window.clearInterval(idleTimer);window.removeEventListener('erbolamm:snapshot',onSnapshot);window.removeEventListener('erbolamm:traer-cafe',onTraerCafe);document.removeEventListener('visibilitychange',onVisibility);delete window.Oficina3D;};
 },[]);
 useEffect(()=>{
  const receiveInbox=(event:Event)=>{
   const detail=(event as CustomEvent<{pendingForOrchestrator?:number}>).detail;
   setMailCount(Math.max(0,Number(detail?.pendingForOrchestrator)||0));
  };
  window.addEventListener('erbolamm:inbox',receiveInbox);
  return()=>window.removeEventListener('erbolamm:inbox',receiveInbox);
 },[]);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const apply=()=>{runtime.current.setReduced(media.matches||!motion);runtime.current.tick(performance.now(),0);setPeople(runtime.current.people.map(p=>({...p})));wake.current();};apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);},[motion]);
  function openAgentWindow(id: AgentId) {
    const existing = openWindows.current.get(id);
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }
    const width = 640;
    const height = 820;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
    const win = window.open(`/vista/agente.html?agent=${id}`, `oficina-agente-${id}`, features);
    if (win) {
      win.focus();
      openWindows.current.set(id, win);
    }
  }
 function select(id:AgentId){
  runtime.current.visit(id,performance.now());runtime.current.focus(id,performance.now());setSelected(id);setPeople(runtime.current.people.map(p=>({...p})));wake.current();
  openAgentWindow(id);
 }
 return <div className={`real-office ${!motion?'scene-still':''} ${!visible?'scene-paused':''}`}>
  <FloorPlan fill={fill} agents={people} activeGame={activeGame} selected={selected} onSelect={id=>{if(id)select(id);}} hovered={hovered} onHover={setHovered} mailCount={mailCount} motion={motion} onMotionChange={setMotion} onMail={()=>window.dispatchEvent(new CustomEvent('erbolamm:open-inbox'))}/>
  <div className="office-roster" aria-label="Personajes de la oficina">{AGENTS.map(a=>{const p=people.find(p=>p.id===a.id)!;return <button key={a.id} type="button" className="roster-person" onClick={()=>select(a.id)} style={{borderColor:a.color}} aria-label={`Abrir ficha de ${a.name}: ${p.status}`} title={`${a.name} · ${p.status}`}><svg className="roster-avatar" width="36" height="36" viewBox="-24 -70 48 76"><g transform="scale(.8)"><Character agent={a} pose={p.pose} flip={p.facing===-1} selected={selected===a.id}/></g></svg></button>;})}</div>
 </div>;
}
