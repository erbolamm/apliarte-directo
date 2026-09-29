import type { AgentId } from './agents';
export const DEFAULT_METHOD='none';
export const METHODS=[
 {id:'six-hats',label:'Seis sombreros · diagnóstico inicial',source:'AGENTS.md · método, no skill instalada'},
 {id:'auto',label:'Automático · el agente evalúa y selecciona la skill',source:'Evaluación autónoma de skills disponibles'},
 {id:'sdd-explore',label:'sdd-explore · exploración',source:'Skill de Codex · comprobar disponibilidad en el ejecutor'},
 {id:'sdd-propose',label:'sdd-propose · propuesta de cambio',source:'Skill de Codex · comprobar disponibilidad en el ejecutor'},
 {id:'judgment-day',label:'judgment-day · dos jueces independientes',source:'Skill de Codex · no concede autoridad de entrega'},
 {id:'sdd-design',label:'sdd-design · diseño técnico',source:'Skill de Codex · comprobar disponibilidad en el ejecutor'},
 {id:'sdd-verify',label:'sdd-verify · verificación',source:'Skill de Codex · exige pruebas y evidencia reales'},
 {id:'none',label:'',source:'Reglas y contrato del repositorio destinatario'},
];
export const HATS=[
 ['Blanco','Separar hechos comprobables, información aportada por Javier y datos pendientes. No inventar evidencias.'],
 ['Rojo','Exponer emociones probables de Javier ante el objetivo, no emociones de la IA. No justificarlas.'],
 ['Negro','Identificar riesgos, fallos y condiciones de parada concretas.'],
 ['Amarillo','Identificar beneficios y oportunidades si el objetivo funciona.'],
 ['Verde','Generar alternativas sin evaluarlas todavía.'],
 ['Azul','Integrar las perspectivas anteriores y proponer la siguiente decisión consciente a Javier. No ejecutar cambios sin las autorizaciones correspondientes.'],
];
export type FormDraft={role:AgentId;project:string;priority:string;title:string;goal:string;context:string;method:string;source:string};
export type PanelDraft={role:string;project:string;priority:string;title:string;destination:string;text:string};
export function taskPayload(d:FormDraft):PanelDraft {
 if(!d.title.trim()||!d.goal.trim())throw new Error('Escribe el título y el fin que quieres alcanzar.');
 if(!['normal','urgente','no-urgente','futura'].includes(d.priority))throw new Error('Prioridad inválida.');
 const method=d.method==='six-hats'?HATS.map(([hat,prompt])=>`${hat}: ${prompt}`).join('\n'):
  d.method==='auto'?'Evaluar el fin y contexto frente a las skills disponibles (en skills/, catálogo del sistema o metodologías SDD/TDD/ODD). Elegir la skill más adecuada o ninguna (none). Es obligatorio consignar en el Recibo qué skill se utilizó y la justificación técnica de su elección.':
  d.method==='none'?'Diagnóstico inicial de alcance, datos, riesgos y comprobación antes de modificar nada.':`Leer y aplicar ${d.method}. Comprobar que esa skill está disponible en el ejecutor y en el destino; si no, devolver bloqueo al orquestador. No improvisar su contrato ni fingir su ejecución.`;
 const text=`## Fin al que quiere llegar Javier\n${d.goal.trim()}\n\n## Contexto y límites\n${d.context.trim()||'Sin contexto adicional: solicitar lo que falte al orquestador.'}\n\n## Método solicitado\n${d.method}\nFuente: ${d.source}\n\n## Primer paso al reclamar\nDiagnosticar antes de modificar nada. No inventar resultados ni sustituir la decisión de Javier. Mantener los seis roles separados y en secuencia si se solicita seis sombreros.\n${method}\n\n## Planificación\n${d.priority==='futura'?'Futura: no iniciar hasta que el orquestador confirme. Prioridad canónica no-urgente; no es un estado nuevo del motor.':'Cola de trabajo del responsable.'}\n\n## Límites y comprobación\nRespetar AGENTS.md del destino, alcance asignado y fronteras del responsable. Sin secretos, publicación, push ni acciones irreversibles sin autorización. Definir evidencia verificable del fin deseado y devolver recibo. Si el encargo rebasa el rol, devolver traspaso al orquestador.`;
 if(text.length>8000)throw new Error('Objetivo y contexto son demasiado largos: reduce el texto para conservar también las instrucciones del encargo (máximo total 8.000 caracteres).');
 const payload={role:d.role,project:d.project,priority:d.priority==='futura'?'no-urgente':d.priority,title:d.title.trim(),destination:d.project,text};
 // Create repeats the detail inside expectedBody; reserve 4KB for server metadata.
 const quoted=text.split('\n').map(line=>'> '+line).join('\n');
 const createBound={...payload,confirmed:true,expectedFileName:'x'.repeat(256),expectedBody:quoted};
 if(new TextEncoder().encode(JSON.stringify(createBound)).length>20000)throw new Error('El encargo es demasiado grande para la vista previa segura. Reduce el contexto.');
 return payload;
}
// Los seis campos del encargo, con el mismo contrato de cable que `taskPayload`.
// Los usan la ficha de tareas (crear y convertir) y el popup de agente.
export type TaskFormValue={role:string;project:string;priority:string;title:string;goal:string;context:string;method:string};
export type MethodOption={id:string;label:string;source:string};
export const DEFAULT_TASK_FORM:TaskFormValue={role:'co',project:'erbolamm-trabajo',priority:'normal',title:'',goal:'',context:'',method:DEFAULT_METHOD};
// Las skills instaladas se suman a los métodos fijos sin duplicar ninguno.
export function methodOptions(skills:MethodOption[]=[]):MethodOption[]{return [...METHODS,...skills.filter(skill=>!METHODS.some(m=>m.id===skill.id))];}
export function payloadFromTaskForm(v:TaskFormValue,skills:MethodOption[]=[]):PanelDraft {
 const chosen=methodOptions(skills).find(m=>m.id===v.method)??METHODS[METHODS.length-1];
 return taskPayload({role:v.role as AgentId,project:v.project,priority:v.priority,title:v.title,goal:v.goal,context:v.context,method:chosen.id,source:chosen.source});
}
// El título se convierte en el nombre del fichero y el servidor limita el slug a 80
// caracteres. El slug nunca sale más largo que el título, así que 80 es el tope que
// garantiza que la vista previa sea aceptable: por encima, no hay tarea y el formulario
// se queda con el botón apagado. Se corta por palabra para que el título se lea.
export const MAX_TITLE_CHARS=80;
export function taskTitleFromText(text:string):string {
 const line=text.split('\n').find(candidate=>candidate.trim())?.trim()??'';
 if(line.length<=MAX_TITLE_CHARS)return line;
 const cut=line.slice(0,MAX_TITLE_CHARS);
 const space=cut.lastIndexOf(' ');
 return (space>0?cut.slice(0,space):cut).trim();
}
