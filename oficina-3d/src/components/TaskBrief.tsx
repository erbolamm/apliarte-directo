import { useEffect, useRef, useState } from 'react';
import { AGENTS, type AgentId } from '../office/agents';
import { DEFAULT_TASK_FORM, DEFAULT_METHOD, payloadFromTaskForm, type PanelDraft, type TaskFormValue } from '../office/workflow';
import TaskForm from './TaskForm';
import type { Snapshot } from '../office/runtime';
export type Catalog={projects:string[];skills:{id:string;label:string;source:string}[]};
type DeskPanel='chat'|'propose'|null;
/** Window that hosts the office scene: the opener when this brief is a popup. */
const officeWindow=():Window=>(window.opener&&!window.opener.closed)?window.opener:window;
/** Compact icon button with a help bubble after 1 s hover/focus or a long press on touch. */
function DeskButton({icon,label,tip,disabled,active,onClick}:{icon:string;label:string;tip:string;disabled?:boolean;active?:boolean;onClick:()=>void}){
 const [tipOpen,setTipOpen]=useState(false);
 const press=useRef<number|undefined>(undefined),longPressed=useRef(false);
 useEffect(()=>()=>window.clearTimeout(press.current),[]);
 return <button type="button" className={`brief-desk-btn${active?' active':''}${tipOpen?' tip-open':''}`} data-tip={tip} aria-label={label} aria-pressed={active===undefined?undefined:active} disabled={disabled}
  onTouchStart={()=>{longPressed.current=false;window.clearTimeout(press.current);press.current=window.setTimeout(()=>{longPressed.current=true;setTipOpen(true);},600);}}
  onTouchEnd={()=>{window.clearTimeout(press.current);press.current=window.setTimeout(()=>setTipOpen(false),1800);}}
  onTouchMove={()=>window.clearTimeout(press.current)}
  onContextMenu={e=>{if(longPressed.current)e.preventDefault();}}
  onClick={()=>{if(longPressed.current){longPressed.current=false;return;}onClick();}}>
  <span aria-hidden="true">{icon}</span>
 </button>;
}
export default function TaskBrief({id,onAgentChange,onClose,snapshot,arrived,catalog,catalogStatus}:{id:AgentId;onAgentChange:(id:AgentId)=>void;onClose:()=>void;snapshot:Snapshot;arrived:boolean;catalog:Catalog;catalogStatus:string}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const agent = AGENTS.find((a) => a.id === id)!;
  const [form, setForm] = useState<TaskFormValue>(() => ({
    ...DEFAULT_TASK_FORM,
    role: id,
    method: agent.defaultSkill || DEFAULT_METHOD,
  }));
  const [preview, setPreview] = useState<{
    fileName: string;
    body: string;
    payload: PanelDraft;
  } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [created, setCreated] = useState(''),
    [deskBusy, setDeskBusy] = useState<string | null>(null),
    [deskReply, setDeskReply] = useState(''),
    [deskPanel, setDeskPanel] = useState<DeskPanel>(null),
    [deskText, setDeskText] = useState('');
  const mounted = useRef(true),
    version = useRef(0),
    busyRef = useRef(false),
    createdRef = useRef(false);
  const hasActionToken = Boolean(window.Oficina?.office?.actionToken),
    connected = snapshot.valid && hasActionToken;
  const tasks = snapshot.states.haciendo.filter((t) => t.role === id),
    queued = snapshot.states['por-hacer'].filter((t) => t.role === id).length;
  const invalidate = () => {
    version.current++;
    setPreview(null);
    setError('');
  };
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    return () => {
      mounted.current = false;
      version.current++;
    };
  }, []);
  // El agente del selector manda: la visita del popup carga su rol y su skill por defecto
  useEffect(() => {
    const nextAgent = AGENTS.find((a) => a.id === id);
    setForm((current) => ({
      ...current,
      role: id,
      method: nextAgent?.defaultSkill || current.method || DEFAULT_METHOD,
    }));
    invalidate();
  }, [id]);
 // A connection failure invalidates prepared work: never enable creation on stale data.
 useEffect(()=>{if(!connected){version.current++;setPreview(null);}},[connected]);
 async function prepare(){
  if(busyRef.current)return;busyRef.current=true;const v=version.current;setBusy(true);setError('');setCreated('');createdRef.current=false;
  try {
   const payload=payloadFromTaskForm(form,catalog.skills);
   const result=await window.Oficina.taskRequest('/api/tasks/preview',payload);
   if(mounted.current&&v===version.current){setPreview({...result.preview,payload});}
  }catch(e){if(mounted.current)setError((e as Error).message);}finally{busyRef.current=false;if(mounted.current)setBusy(false);}
 }
 async function create(){
  if(!preview||busyRef.current||createdRef.current||!connected)return;
  busyRef.current=true;const v=version.current;setBusy(true);setError('');
  try {
   const result=await window.Oficina.taskRequest('/api/tasks/create',{...preview.payload,confirmed:true,expectedFileName:preview.fileName,expectedBody:preview.body});
   createdRef.current=true;
   if(mounted.current){setCreated(result.preview.fileName);if(v===version.current)setPreview(null);}
   await window.Oficina.refresh();
  }catch(e){if(mounted.current)setError((e as Error).message);}finally{busyRef.current=false;if(mounted.current)setBusy(false);}
 }
 /** Projects a message into the avatar's bubble in the office scene without touching camera or zoom. */
 function project(text:string){
  setDeskReply(text);
  const win=officeWindow(),office=win.Oficina3D;
  if(!office?.runtime?.say)return;
  office.runtime.say(id,text,win.performance.now());
  office.focusFromPopup(id);
 }
 async function deskAction(name:string,path:string,payload:Record<string,unknown>,after?:(result:any)=>void){
  if(deskBusy)return;
  setDeskBusy(name);
  try{
   const result=await window.Oficina.taskRequest(path,payload);
   project(String(result.message||'Hecho.'));
   after?.(result);
  }catch(e){
   project(`😕 ${(e as Error).message||'No he podido completar la acción.'}`);
  }finally{if(mounted.current)setDeskBusy(null);}
 }
 const greeting=id==='ja'?'¡Hola, Tito! Bienvenido a tu despacho.':`¡Hola, Tito! Soy ${agent.name}. ¿En qué te ayudo?`;
 function playVoice(){
  void deskAction('voice','/api/minimax/tts',{text:greeting},result=>{
   if(typeof result.url!=='string')return;
   const audio=new Audio(result.url);
   audio.play().catch(()=>project('😕 El navegador no ha dejado reproducir el audio.'));
  });
 }
 function sendChat(){
  const message=deskText.trim();if(!message)return;
  void deskAction('chat','/api/minimax/chat',{message},()=>{setDeskText('');setDeskPanel(null);});
 }
 function sendProposal(){
  const idea=deskText.trim();if(!idea||!hasActionToken)return;
  const text=`Propuesta de botón nuevo para el despacho de ${agent.name} [${id}]: ${idea}`;
  void fetch('/api/chat?agent=interprete',{method:'POST',keepalive:true,cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json','X-ErBolamm-Action':String(window.Oficina.office?.actionToken)},body:JSON.stringify({text})}).catch(()=>{});
  const target=officeWindow();
  const chat=target.open('/vista/aplichat','erbolamm-aplichat');
  chat?.focus();
  dialog.current?.close();
  onClose();
  if(window.opener&&!window.opener.closed){try{window.close();}catch{/* El navegador puede bloquear window.close() */}}
 }
 function togglePanel(panel:Exclude<DeskPanel,null>){setDeskPanel(current=>current===panel?null:panel);setDeskText('');}
 function handlePedirCafe() {
  const targetWin = (window.opener && !window.opener.closed) ? window.opener : window;
  const targetAgentId = id !== 'ja' ? id : undefined;
  targetWin.Oficina3D?.traerCafe?.(targetAgentId);
  try {
   targetWin.dispatchEvent(
    new CustomEvent('erbolamm:traer-cafe', { detail: { agentId: targetAgentId } })
   );
  } catch {
   // Ignorar si el contexto no permite dispatchEvent cruzado
  }
  dialog.current?.close();
  onClose();
  if (window.opener && !window.opener.closed) {
   try {
    window.close();
   } catch {
    // Ignorar si el navegador bloquea window.close()
   }
  }
 }
 return <dialog ref={dialog} className="office-brief-dialog" aria-labelledby="office-brief-title" onCancel={e=>{e.preventDefault();}}>
  <div className="office-brief-content">
   <header className="brief-heading">
    <div>
     <h2 id="office-brief-title">Encargo en tu despacho</h2>
     <p>Crear una tarea real requiere tu confirmación.</p>
    </div>
    <div className="brief-heading-actions">
     <button
      type="button"
      className="brief-coffee-btn"
      disabled={busy}
      onClick={handlePedirCafe}
      title={id === 'ja' ? 'Pedir que traigan un café a tu despacho' : `Pedir que ${agent.name} traiga un café`}
      aria-label="Pedir café"
     >
      ☕ Traer café
     </button>
     <button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar ficha">✕</button>
    </div>
   </header>
   <div className="brief-desk-actions" role="toolbar" aria-label="Acciones rápidas del despacho">
    <DeskButton icon="🔀" label="Estado de Git" tip="Consulta el estado de Git de la central y lo dice en el bocadillo del avatar, sin mover la cámara." disabled={!hasActionToken||Boolean(deskBusy)} onClick={()=>void deskAction('git','/api/git/status',{})}/>
    <DeskButton icon="💬" label="Chat MiniMax" tip="Abre una pregunta rápida a MiniMax; la respuesta aparece en el bocadillo del avatar." active={deskPanel==='chat'} disabled={!hasActionToken||Boolean(deskBusy)} onClick={()=>togglePanel('chat')}/>
    <DeskButton icon="🔊" label="Voz y saludo" tip="Saluda en voz alta con MiniMax. Si el audio ya existe se reproduce desde la caché local, sin gastar cuota." disabled={!hasActionToken||Boolean(deskBusy)} onClick={playVoice}/>
    <DeskButton icon="📱" label="Pantalla del teléfono" tip="Abre la pantalla del teléfono Android conectado con scrcpy en una ventana nueva." disabled={!hasActionToken||Boolean(deskBusy)} onClick={()=>void deskAction('scrcpy','/api/system/scrcpy',{})}/>
    <DeskButton icon="➕" label="Proponer botón nuevo" tip="Escribe la idea de un botón nuevo y se envía a ApliChat; esta ficha se cierra." active={deskPanel==='propose'} disabled={!hasActionToken||Boolean(deskBusy)} onClick={()=>togglePanel('propose')}/>
    {deskBusy&&<span className="brief-desk-busy" role="status">Trabajando…</span>}
   </div>
   {deskPanel&&<form className="brief-desk-form" onSubmit={e=>{e.preventDefault();if(deskPanel==='chat')sendChat();else sendProposal();}}>
    <input type="text" value={deskText} maxLength={deskPanel==='chat'?500:300} autoFocus disabled={Boolean(deskBusy)} onChange={e=>setDeskText(e.target.value)} aria-label={deskPanel==='chat'?'Pregunta para MiniMax':'Idea de botón nuevo'} placeholder={deskPanel==='chat'?'Pregunta rápida para MiniMax…':'¿Qué botón quieres añadir?'}/>
    <button type="submit" className="primary" disabled={!deskText.trim()||Boolean(deskBusy)}>{deskPanel==='chat'?'Preguntar':'Enviar a ApliChat'}</button>
   </form>}
   {deskReply&&<p className="brief-desk-reply" role="status">{deskReply}</p>}
   <label className="brief-agent-label">Agente<select aria-label="Cambiar agente del encargo" value={id} disabled={busy} onChange={e=>onAgentChange(e.target.value as AgentId)}>{AGENTS.map(a=><option key={a.id} value={a.id}>{a.name} [{a.id}]</option>)}</select></label>
   <p className="brief-role">{agent.role}. Cambiar agente solo cambia el nuevo encargo, no reasigna tareas existentes.</p>
   <div className="brief-visit" role="status">{id==='ja'?'Tu despacho · Javier':arrived?`${agent.name} está en tu despacho`:`${agent.name} viene a tu despacho…`}<small>Visita visual: no mueve archivos ni abandona su tarea real.</small></div>
   <p className="brief-state">{!snapshot.valid?'Sin datos del tablero':tasks.length?`${tasks.length} tarea(s) en curso · ${tasks.map(t=>t.title).join(' · ')}`:`${queued} tarea(s) en cola · sin tarea en curso`}</p>
   <button type="button" onClick={()=>{const popup=window.open(`/vista/buscar.html?q=${encodeURIComponent(form.title)}`, '_blank', 'popup=yes,width=950,height=850,resizable=yes,scrollbars=yes');popup?.focus();}}>Buscar tareas relacionadas · todo el historial</button>
   <form onSubmit={e=>{e.preventDefault();void prepare();}} onChange={invalidate}>
    <TaskForm value={form} onChange={setForm} disabled={busy||Boolean(created)} projects={catalog.projects} skills={catalog.skills} idPrefix="brief"/>
    <button className="primary" type="submit" disabled={!connected||busy||Boolean(created)}>Preparar vista previa</button>
   </form>
   {preview&&<section className="brief-preview" aria-label="Confirmación del encargo"><h3>Confirma el archivo y el contenido exactos</h3><code>{preview.fileName}</code><pre>{preview.body}</pre><p>Solo este botón crea el archivo. Autoría: Javier. No inicia ningún agente.</p><div className="brief-confirm-actions"><button disabled={busy} onClick={()=>setPreview(null)}>Cancelar vista previa</button><button className="primary" disabled={busy||!connected} onClick={()=>void create()}>Crear tarea real</button></div></section>}
   {created&&<p className="brief-success" role="status">Creada en por-hacer: <b>{created}</b>. El responsable diagnosticará al reclamarla siguiendo el método solicitado; no se ha lanzado una sesión automáticamente.</p>}
   {error&&<p className="brief-error" role="alert">{error}</p>}
   {!connected&&<p className="brief-error">{!hasActionToken?'Sin conexión con el servidor local: creación deshabilitada.':'Tablero inválido: creación deshabilitada. Corrige los errores del tablero antes de crear.'}</p>}
   <p className="brief-note">{catalogStatus}</p>
  </div>
 </dialog>;
}
