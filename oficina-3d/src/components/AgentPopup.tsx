import { useEffect, useState } from 'react';
import TaskBrief, { type Catalog } from './TaskBrief';
import { type AgentId } from '../office/agents';
import { normalizeSnapshot, type Snapshot, type Person } from '../office/runtime';

// Ficha de agente en ventana propia del navegador: movible, no bloqueante y
// coordinada con el plano original a través de `window.opener.Oficina3D`
// (misma-origin, sin postMessage). Cada ventana mantiene su propio sondeo de
// /api/tasks y /api/office/catalog, así que sobrevive aunque la ventana
// principal esté oculta o tarde en refrescar.
export default function AgentPopup({initialId}:{initialId:AgentId}) {
 const [id,setId]=useState(initialId);
 const [snapshot,setSnapshot]=useState<Snapshot>(()=>normalizeSnapshot(null));
 const [arrived,setArrived]=useState(initialId==='ja');
 const [catalog,setCatalog]=useState<Catalog>({projects:['erbolamm-trabajo'],skills:[]});
 const [catalogStatus,setCatalogStatus]=useState('Cargando catálogo local de proyectos y skills…');

 useEffect(()=>{
  const receive=(raw:unknown)=>{
   const normalized=normalizeSnapshot(raw);
   setSnapshot(normalized);
   setCatalog(c=>({...c,projects:[...new Set([...c.projects,...Object.values(normalized.states).flatMap(tasks=>tasks.map(t=>t.project)).filter(p=>/^[a-z0-9][a-z0-9-]*$/.test(p))])].sort((a,b)=>a==='erbolamm-trabajo'?-1:b==='erbolamm-trabajo'?1:a.localeCompare(b))}));
  };
  const onSnapshot=(event:Event)=>receive((event as CustomEvent).detail);
  window.addEventListener('erbolamm:snapshot',onSnapshot);
  if(window.Oficina?.lastSnapshot)receive(window.Oficina.lastSnapshot);
  return()=>window.removeEventListener('erbolamm:snapshot',onSnapshot);
 },[]);

 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/office/catalog',{cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);const data=await r.json();
   const projects=Array.isArray(data.projects)?data.projects.filter((p:unknown)=>typeof p==='string'&&/^[a-z0-9][a-z0-9-]*$/.test(p)):[];
   const skills=Array.isArray(data.skills)?data.skills.filter((s:Record<string,unknown>)=>s&&typeof s.id==='string'&&/^[a-z0-9][a-z0-9-]*$/.test(s.id)&&typeof s.label==='string'&&typeof s.source==='string'):[];
   setCatalog(c=>({...c,projects:[...new Set(['erbolamm-trabajo',...projects,...c.projects])],skills}));setCatalogStatus('Catálogo leído del servidor local: clones presentes, proyectos del tablero y skills de la central. Las skills de Codex se distinguen por fuente.');
  }).catch(e=>{if(e.name!=='AbortError')setCatalogStatus('Catálogo ampliado no disponible; se muestran la central y proyectos observados en el tablero.');});
  return()=>controller.abort();
 },[]);

 // La llegada visual la decide el runtime de la ventana original: no se
 // duplica la simulación de movimiento aquí, solo se sondea su resultado.
 useEffect(()=>{
  if(id==='ja'){setArrived(true);return;}
  const opener=window.opener;
  if(!opener||opener.closed){setArrived(true);return;}
  const check=()=>{
   const person=opener.Oficina3D?.runtime.people.find((p:Person)=>p.id===id);
   setArrived(person?!person.path:true);
  };
  check();
  const timer=window.setInterval(check,200);
  return()=>window.clearInterval(timer);
 },[id]);

 useEffect(()=>{
  const notifyFocus=()=>{
   const opener=window.opener;
   if(!opener||opener.closed||!opener.Oficina3D)return;
   opener.Oficina3D.focusFromPopup(id);
  };
  window.addEventListener('focus',notifyFocus);
  notifyFocus();
  return()=>window.removeEventListener('focus',notifyFocus);
 },[id]);

 // Cierre por cualquier vía (X propia, cierre nativo del navegador): este
 // agente deja de visitar. Las demás fichas abiertas, si las hay, no se
 // tocan — cada una solo se va cuando cierra la suya.
 useEffect(()=>{
  const notifyClose=()=>{
   const opener=window.opener;
   if(!opener||opener.closed||!opener.Oficina3D)return;
   opener.Oficina3D.leaveFromPopup(id);
   opener.Oficina3D.unregisterPopup(id);
  };
  window.addEventListener('pagehide',notifyClose);
  return()=>window.removeEventListener('pagehide',notifyClose);
 },[id]);

 function changeAgent(next:AgentId){
  const opener=window.opener;
  if(opener&&!opener.closed&&opener.Oficina3D){
   opener.Oficina3D.rekeyPopup(id,next);
   opener.Oficina3D.leaveFromPopup(id);
   opener.Oficina3D.visitFromPopup(next);
  }
  setId(next);
 }

 // `.office-brief-dialog` y el resto de clases de TaskBrief están definidas
 // en interface.css bajo el scope `.real-office`, porque nacieron dentro de
 // la oficina completa. Sin ese envoltorio la ficha se ve sin ningún estilo.
 return <div className="real-office"><TaskBrief id={id} onAgentChange={changeAgent} onClose={()=>window.close()} snapshot={snapshot} arrived={arrived} catalog={catalog} catalogStatus={catalogStatus}/></div>;
}
