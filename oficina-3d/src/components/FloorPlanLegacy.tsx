import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AGENT_BY_ID, type AgentId } from '../office/agents';
import { ROOMS, ZONE_META, type ZoneId } from '../office/layout';
import { furniture, walls, type Box } from '../office/geometry';
import type { Person } from '../office/runtime';
import Character from './Character';
import { DEFAULT_CAMERA, boundCamera, gestureCamera, wheelCamera, type Camera, type TouchPoint } from '../office/camera';
export const CHAR_SCALE=.62;
type Props={fill?:boolean;visitor?:{id:AgentId;pos:{x:number;y:number};arrived:boolean}|null;agents:Person[];selected:AgentId|null;onSelect:(id:AgentId|null)=>void;hovered:AgentId|null;onHover:(id:AgentId|null)=>void;mailCount:number;motion:boolean;onMotionChange:(next:boolean)=>void;onMail:()=>void;onToggleView?:()=>void};
function Cuboid({box}:{box:Box}) {
 const {x,y,w,d,h,color,kind,label}=box;
 const table = ["desk","meeting","coffee"].includes(kind || "");
 const style={left:x,top:y,'--w':`${w}px`,'--d':`${d}px`,'--h':`${h}px`,'--material':color} as CSSProperties;
 return <div className={`solid ${kind}`} style={style} aria-hidden="true">
   <div className="solid-shadow"/>
   <div className="face top">
     {label&&<span>{label}</span>}
     {kind==='parcel'&&<><i className="package-tape"/><i className="package-label"/><i className="package-stamp"/></>}
     {kind==='desk'&&<><i className="desk-pad"/><i className="keyboard"/><i className="documents"/><i className="desk-mouse"/></>}
     {kind==='coffee'&&<><i className="coffee-maker"/><i className="coffee-mug"/></>}
     {kind==='plant'&&<i className="plant-top-leaf"/>}
   </div>
   {table ? <>
     <div className="table-apron"/>
     {kind === "desk" ? <div className="desk-legs">
       <span className="desk-leg leg-tl" style={{height:`${h-6}px`}}/>
       <span className="desk-leg leg-tr" style={{height:`${h-6}px`}}/>
       <span className="desk-leg leg-bl" style={{height:`${h-6}px`}}/>
       <span className="desk-leg leg-br" style={{height:`${h-6}px`}}/>
     </div> : <span className="pedestal-leg" style={{height:`${h-6}px`}}/>}
   </> : <>
     <div className="face front">
       {kind==='shelf'&&<><i/><i/><i/></>}
       {kind==='plant'&&<i className="pot-rim"/>}
     </div>
     <div className="face rear"/>
     <div className="face left"/>
     <div className="face right"/>
   </>}
   {kind==='glass'&&<><div className="glass-post"/><div className="glass-post far"/><div className="glass-rail"/></>}
   {kind==='desk'&&<><div className="monitor"><span className="monitor-screen">▰ ▰ ▰<br/>▱ ▰<br/>▰ ▱ ▰</span><i className="monitor-back"/></div><div className="monitor-foot"/></>}
   {kind==='sofa'&&<div className="cushions">▯　▯　▯</div>}
 </div>;
}
export default function FloorPlan({fill,visitor,agents,selected,onSelect,hovered,onHover,mailCount,motion,onMotionChange,onMail,onToggleView}:Props) {
 const host=useRef<HTMLDivElement>(null); const [scale,setScale]=useState(.58);const [camera,setCamera]=useState<Camera>({...DEFAULT_CAMERA});const [routes,setRoutes]=useState(false);const [locked,setLocked]=useState(false);const [dragging,setDragging]=useState(false);
 // En modo relleno el alto lo pone el CSS (100 % del marco) y la escala se
 // calcula también con el alto disponible, sin el tope de .67: así el plano
 // ocupa todo el recuadro, que es lo que necesita un overlay de OBS.
 useEffect(()=>{const node=host.current;if(!node)return;const ro=new ResizeObserver(([e])=>setScale(fill?Math.min(e.contentRect.width/1650,e.contentRect.height/970):Math.min(e.contentRect.width/1650,.67)));ro.observe(node);return()=>ro.disconnect();},[fill]);
 const cameraRef=useRef(camera),points=useRef(new Map<number,TouchPoint>()),startPoints=useRef<TouchPoint[]>([]),baseCamera=useRef(camera),panGesture=useRef(false),dragged=useRef(false),lockedRef=useRef(locked);
 const apply=(c:Camera)=>{cameraRef.current=c;setCamera(c);};
 const rebase=()=>{baseCamera.current={...cameraRef.current};startPoints.current=[...points.current.values()].map(p=>({...p}));};
 const toggleLock=()=>setLocked(value=>{lockedRef.current=!value;if(!value){points.current.clear();setDragging(false);rebase();}return !value;});
 useEffect(()=>{
  const node=host.current;if(!node)return;
  const onWheel=(e:WheelEvent)=>{if(lockedRef.current)return;e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?300:1);apply(wheelCamera(cameraRef.current,delta));};
  node.addEventListener('wheel',onWheel,{passive:false});return()=>node.removeEventListener('wheel',onWheel);
 },[]);
 const people=agents.map(r=>visitor?.id===r.id?{...r,pos:visitor.pos,pose:visitor.arrived?'sit' as const:'walk' as const}:r);
 return <div className="office-volume">
  <div ref={host} className={`volume-viewport ${dragging?'is-dragging':''} ${locked?'is-locked':''}`} style={fill?undefined:{height:Math.max(280,scale*970)}} tabIndex={0} aria-label="Plano 3D interactivo"
   onContextMenu={e=>e.preventDefault()}
   onPointerDown={e=>{if(lockedRef.current)return;if(e.pointerType==='mouse'&&e.button!==0&&e.button!==2)return;if(points.current.size>=2)return;if(!points.current.size){dragged.current=false;panGesture.current=e.pointerType==='mouse'&&e.button===2;}points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});rebase();}}
   onPointerMove={e=>{if(lockedRef.current||!points.current.has(e.pointerId))return;points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const current=[...points.current.values()];const distance=current.reduce((n,p,i)=>n+Math.hypot(p.x-startPoints.current[i].x,p.y-startPoints.current[i].y),0);if(distance>6&&!dragged.current){dragged.current=true;setDragging(true);}if(dragged.current){e.preventDefault();if(!e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.setPointerCapture(e.pointerId);apply(gestureCamera(baseCamera.current,startPoints.current,current,panGesture.current));}}}
   onPointerUp={e=>{if(lockedRef.current)return;points.current.delete(e.pointerId);if(!points.current.size)setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);rebase();}}
   onPointerCancel={e=>{if(lockedRef.current)return;points.current.delete(e.pointerId);if(!points.current.size)setDragging(false);rebase();}}
   onPointerLeave={e=>{if(lockedRef.current)return;if(e.pointerType==='mouse'&&!e.currentTarget.hasPointerCapture(e.pointerId)){points.current.delete(e.pointerId);if(!points.current.size)setDragging(false);rebase();}}}
   onClickCapture={e=>{if(dragged.current&&e.detail!==0){e.preventDefault();e.stopPropagation();}}}
   onKeyDown={e=>{if(lockedRef.current||e.target!==e.currentTarget)return;let c={...cameraRef.current};const pan=e.shiftKey;if(e.key==='ArrowLeft')c=pan?{...c,panX:c.panX-30}:{...c,turn:c.turn-5};else if(e.key==='ArrowRight')c=pan?{...c,panX:c.panX+30}:{...c,turn:c.turn+5};else if(e.key==='ArrowUp')c=pan?{...c,panY:c.panY-30}:{...c,tilt:c.tilt+4};else if(e.key==='ArrowDown')c=pan?{...c,panY:c.panY+30}:{...c,tilt:c.tilt-4};else if(e.key==='+'||e.key==='=')c.zoom*=1.2;else if(e.key==='-')c.zoom/=1.2;else if(e.key==='Home')c={...DEFAULT_CAMERA};else return;e.preventDefault();apply(boundCamera(c));}}
  >
    <div className="camera-tools" aria-label="Controles del plano 3D">
     <p className="gesture-help">Arrastra para rotar · dos dedos o botón derecho para mover</p>
     <div className="camera-actions">
      <button className="icon-tool" type="button" aria-label="Acercar plano" title="Acercar plano" onClick={()=>apply(boundCamera({...cameraRef.current,zoom:cameraRef.current.zoom*1.2}))}><span aria-hidden="true">+</span></button>
      <button className="icon-tool" type="button" aria-label="Alejar plano" title="Alejar plano" onClick={()=>apply(boundCamera({...cameraRef.current,zoom:cameraRef.current.zoom/1.2}))}><span aria-hidden="true">−</span></button>
      <button className="icon-tool mail-tool" type="button" aria-label={`Abrir buzón${mailCount?`, ${mailCount} pendientes`:''}`} title="Abrir buzón" onClick={onMail}><span aria-hidden="true">✉</span>{mailCount>0&&<b className="mail-count" aria-hidden="true">{mailCount>99?'99+':mailCount}</b>}</button>
      <button className="icon-tool" type="button" aria-label="Buscar tareas · todas las fechas" title="Buscar tareas" onClick={()=>window.open('/vista/buscar.html','oficina-buscar','popup=yes,width=650,height=850,resizable=yes,scrollbars=yes')?.focus()}><span aria-hidden="true">🔍</span></button>
      <button className="icon-tool" type="button" aria-pressed={locked} aria-label={locked?'Desbloquear gestos del plano':'Bloquear gestos del plano'} title={locked?'Desbloquear gestos':'Bloquear gestos'} onClick={toggleLock}><span aria-hidden="true">{locked?'🔒':'🔓'}</span></button>
      <button className="icon-tool" type="button" aria-pressed={motion} aria-label={motion?'Pausar movimiento visual':'Activar movimiento visual'} title={motion?'Pausar movimiento':'Activar movimiento'} onClick={()=>onMotionChange(!motion)}><span aria-hidden="true">{motion?'▶':'⏸'}</span></button>
      <button className="icon-tool" type="button" aria-pressed={routes} aria-label={routes?'Ocultar recorridos':'Mostrar recorridos'} title={routes?'Ocultar recorridos':'Mostrar recorridos'} onClick={()=>setRoutes(!routes)}><span aria-hidden="true">⌁</span></button>
      {onToggleView && (
       <button className="icon-tool" type="button" aria-label="Cambiar a vista diorama" data-tip="Cambiar a vista diorama" onClick={onToggleView}><span aria-hidden="true">🗺️</span></button>
      )}
      <button className="icon-tool" type="button" aria-label="Restablecer cámara" title="Restablecer cámara" onClick={()=>apply({...DEFAULT_CAMERA})}><span aria-hidden="true">⟲</span></button>
     </div>
    </div>
   <div className="world-anchor" style={{transform:`translate(${camera.panX}px,${camera.panY}px)`}}><div className="world" style={{transform:`scale(${scale*camera.zoom}) rotateX(${camera.tilt}deg) rotateZ(${camera.turn}deg)`}}>
    <div className="foundation"/>
     {(Object.keys(ROOMS) as ZoneId[]).map(z=>{const r=ROOMS[z];return <div key={z} className={`room-floor floor-${z}`} style={{left:r.x,top:r.y,width:r.w,height:r.h}}><strong style={{background:ZONE_META[z].tone,...(z==='work'?{top:'auto',bottom:8}:{})}}>{ZONE_META[z].step} · {r.name}</strong><span style={z==='work'?{bottom:52}:undefined}>{r.sub}</span></div>;})}
     <div className="office-rug lounge-rug" style={{left:70,top:90,width:280,height:180}} aria-hidden="true"/>
     <div className="office-rug owner-rug" style={{left:1080,top:230,width:145,height:165}} aria-hidden="true"/>
     <div className="whiteboard-wall" style={{left:885,top:26,width:125,height:6}} aria-hidden="true"><div className="wb-frame"><div className="wb-notes"><i className="note-c"/><i className="note-o"/><i className="note-b"/></div></div></div>
     <div className="hallway">DESCANSO → BRIEFING → TRABAJO → ENTREGA</div>
    {[310,950].flatMap(x=>[414,498].map(y=><div key={`${x}-${y}`} className="door-mat" style={{left:x-28,top:y-13}}>↕</div>))}
    <svg className="route-map" width="1280" height="860" aria-hidden="true">{routes&&agents.filter(a=>a.path).map(a=><polyline key={a.id} points={a.path!.map(p=>`${p.x},${p.y}`).join(' ')} stroke={AGENT_BY_ID[a.id].color} strokeWidth="4" strokeDasharray="8 8" fill="none"/>)}</svg>
    {walls.map((box,i)=><Cuboid key={`wall-${i}`} box={box}/>)}
    {furniture.map((box,i)=><Cuboid key={`furniture-${i}`} box={box}/>)}
    {(Object.keys(ROOMS) as ZoneId[]).map(z=>{const r=ROOMS[z];return <div key={`fan-${z}`} className="fan-anchor" style={{left:r.x+r.w/2,top:r.y+r.h/2}} aria-label={`Ventilador de ${r.name}`}><div className="fan-shadow"/><div className="ceiling-fan"><div className="fan-rod"/><div className="fan-light"/><div className="fan-rotor">{[0,120,240].map(angle=><i key={angle} style={{transform:`rotate(${angle}deg)`}}/>)}<b/></div></div></div>;})}
    {people.map(r=>{const a=AGENT_BY_ID[r.id],focus=selected===r.id||hovered===r.id;return <div className="person-anchor" key={r.id} style={{left:r.pos.x,top:r.pos.y}}>
      <div className="foot-shadow"/>
      <button className={`person-upright ${focus?'focused':''} ${r.pose==='work'?'working-north':''}`} onClick={()=>onSelect(r.id)} onMouseEnter={()=>onHover(r.id)} onMouseLeave={()=>onHover(null)} aria-label={`Abrir ficha de ${a.name}: ${r.status}`} style={{'--agent-color':a.color} as CSSProperties}>
       <div className="person-sprite"><svg className="sprite-front" width="54" height="84" viewBox="-27 -76 54 84"><Character agent={a} pose={r.pose} flip={r.facing===-1} selected={focus}/></svg>{<svg className="sprite-rear" width="54" height="84" viewBox="-27 -76 54 84"><Character agent={a} pose={r.pose} rear selected={focus}/></svg>}</div>
       <span className="person-name">{a.name}</span>
      </button>
    </div>;})}
   </div></div>
  </div>
 </div>;
}
