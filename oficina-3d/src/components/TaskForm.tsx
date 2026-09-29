import { useState, useRef, useEffect } from 'react';
import { methodOptions, type MethodOption, type TaskFormValue } from '../office/workflow';
import { AGENTS, AGENT_BY_ID, type AgentId } from '../office/agents';

import {
  type AttachedFile,
  formatBytes,
  parseAttachmentsFromContext,
  syncAttachmentsToContext,
  uploadAttachmentApi,
} from '../office/attachments';

export type { AttachedFile };

const ATTACHMENTS_HEADER = '### 📎 Archivos adjuntos y referencias';
const REFERENCES_HEADER = 'Tareas de referencia (historial):';
const REFERENCE_LINE = /^-\s+`([^`]+\.md)`\s*$/;

// Accepts a task file name, a bare task id, a path or a ficha/search URL and
// returns the task file name, or '' when nothing usable is found.
export function normalizeTaskReference(raw: string): string {
  let text = raw.trim();
  if (!text) return '';
  const fileParam = /[?&]file=([^&#\s]+)/.exec(text);
  if (fileParam) {
    try {
      text = decodeURIComponent(fileParam[1]);
    } catch {
      text = fileParam[1];
    }
  }
  const name = (text.split(/[\\/]/).pop() ?? '').replace(/^`|`$/g, '').trim();
  if (!/^[\w.-]+$/.test(name) || /^\.+$/.test(name)) return '';
  return name.endsWith('.md') ? name : `${name}.md`;
}

// References live as plain lines in the free-text part of the context, before
// the attachments block: syncAttachmentsToContext rewrites everything after its
// header and parses any "- [x](y)" line as an attachment.
export function parseReferencesFromContext(context: string): string[] {
  const headerIndex = context.indexOf(ATTACHMENTS_HEADER);
  const base = headerIndex !== -1 ? context.slice(0, headerIndex) : context;
  const lines = base.split('\n');
  const start = lines.findIndex((line) => line.trim() === REFERENCES_HEADER);
  if (start === -1) return [];
  const refs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = REFERENCE_LINE.exec(line.trim());
    if (!match) break;
    refs.push(match[1]);
  }
  return refs;
}

export function syncReferencesToContext(context: string, refs: string[]): string {
  const headerIndex = context.indexOf(ATTACHMENTS_HEADER);
  const base = headerIndex !== -1 ? context.slice(0, headerIndex) : context;
  const tail = headerIndex !== -1 ? context.slice(headerIndex) : '';
  const lines = base.split('\n');
  const start = lines.findIndex((line) => line.trim() === REFERENCES_HEADER);
  if (start !== -1) {
    let end = start + 1;
    while (end < lines.length && REFERENCE_LINE.test(lines[end].trim())) end++;
    lines.splice(start, end - start);
  }
  const cleaned = lines.join('\n').trim();
  const block = refs.length ? `${REFERENCES_HEADER}\n${refs.map((r) => `- \`${r}\``).join('\n')}` : '';
  return [cleaned, block, tail.trim()].filter(Boolean).join('\n\n');
}

// Los seis campos del encargo, una sola vez para toda la oficina: la ficha los
// usa para crear y convertir, y el popup de agente para su encargo con visita.
// El responsable/agente lo pinta quien lo usa: aquí solo vive el contenido.
export default function TaskForm({
  value,
  onChange,
  disabled,
  projects,
  skills,
  idPrefix,
  referenceSearch,
}: {
  value: TaskFormValue;
  onChange: (value: TaskFormValue) => void;
  disabled?: boolean;
  projects?: string[];
  skills?: MethodOption[];
  idPrefix: string;
  // The agent popup (TaskBrief) already renders its own history search button.
  referenceSearch?: boolean;
}) {
  const methods = methodOptions(skills);
  const chosen = methods.find((m) => m.id === value.method) ?? methods[0];
  const set = (patch: Partial<TaskFormValue>) => onChange({ ...value, ...patch });

  const [attachments, setAttachments] = useState<AttachedFile[]>(() =>
    parseAttachmentsFromContext(value.context),
  );
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [compressImages, setCompressImages] = useState(true);
  const [showManualPath, setShowManualPath] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [referenceInput, setReferenceInput] = useState('');
  const [referenceError, setReferenceError] = useState('');
  const references = parseReferencesFromContext(value.context);

  function openHistorySearch() {
    const query = value.title.trim() || value.goal.trim().slice(0, 120);
    const popup = window.open(
      `/vista/buscar.html?q=${encodeURIComponent(query)}`,
      '_blank',
      'popup=yes,width=950,height=850,resizable=yes,scrollbars=yes',
    );
    popup?.focus();
  }

  function addReference() {
    const ref = normalizeTaskReference(referenceInput);
    if (!ref) {
      setReferenceError('Pega un ID de tarea, un nombre de archivo .md o el enlace de su ficha.');
      return;
    }
    setReferenceError('');
    setReferenceInput('');
    if (references.includes(ref)) return;
    set({ context: syncReferencesToContext(value.context, [...references, ref]) });
  }

  function removeReference(ref: string) {
    set({ context: syncReferencesToContext(value.context, references.filter((r) => r !== ref)) });
  }

  // Sincronizar estado local si el contexto cambia externamente (ej. reset o carga inicial)
  useEffect(() => {
    const parsed = parseAttachmentsFromContext(value.context);
    if (parsed.length !== attachments.length || parsed.some((p, i) => p.path !== attachments[i]?.path)) {
      setAttachments(parsed);
    }
  }, [value.context]);

  async function uploadFiles(fileList: FileList | File[]) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadProgress('');
    setUploadError('');
    try {
      const newFiles: AttachedFile[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const res = await uploadAttachmentApi(file, {
          compress: compressImages,
          onProgress: (msg) => setUploadProgress(`${msg} (${i + 1}/${fileList.length})`),
        });
        newFiles.push(res);
      }

      setAttachments((current) => {
        const updated = [...current, ...newFiles];
        set({ context: syncAttachmentsToContext(value.context, updated) });
        return updated;
      });
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      await uploadFiles(fileList);
    }
  }

  // Pegar imágenes directamente desde el portapapeles con Cmd+V / Ctrl+V
  useEffect(() => {
    function handleWindowPaste(e: ClipboardEvent) {
      if (disabled) return;
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        void uploadFiles(pastedFiles);
      }
    }

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [disabled, value.context]);

  function handleDragOver(e: React.DragEvent) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      void uploadFiles(files);
    }
  }

  function addManualPath() {
    const p = manualPath.trim();
    if (!p) return;
    const name = p.split('/').pop() || p;
    const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
    const updated = [
      ...attachments,
      {
        name,
        path: p,
        isImage: isImg,
      },
    ];
    setAttachments(updated);
    set({ context: syncAttachmentsToContext(value.context, updated) });
    setManualPath('');
    setShowManualPath(false);
  }

  function removeAttachment(index: number) {
    const updated = attachments.filter((_, i) => i !== index);
    setAttachments(updated);
    set({ context: syncAttachmentsToContext(value.context, updated) });
  }

  // Agente asignado actualmente (o predeterminado)
  const agent = (value.role && AGENT_BY_ID[value.role as AgentId]) || AGENT_BY_ID['co'];

  // Si la skill elegida coincide con la default de algún agente, usamos sus detalles
  const matchedAgent = AGENTS.find((a) => a.defaultSkill === value.method) || agent;

  return (
    <fieldset
      className={`brief-fields ${isDragOver ? 'task-drag-over' : ''}`}
      disabled={disabled}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="brief-grid">
        <label>
          Proyecto
          {projects && projects.length ? (
            <select
              id={`${idPrefix}-project`}
              value={value.project}
              onChange={(e) => set({ project: e.target.value })}
            >
              {projects.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          ) : (
            <input
              id={`${idPrefix}-project`}
              maxLength={64}
              value={value.project}
              placeholder="erbolamm-trabajo"
              onChange={(e) => set({ project: e.target.value })}
            />
          )}
        </label>
        <label>
          Prioridad
          <select
            id={`${idPrefix}-priority`}
            value={value.priority}
            onChange={(e) => set({ priority: e.target.value })}
          >
            <option value="normal">Normal</option>
            <option value="urgente">Urgente</option>
            <option value="futura">Futura · planificar más adelante</option>
            <option value="no-urgente">No urgente</option>
          </select>
        </label>
      </div>
      {value.priority === 'futura' && (
        <p className="brief-note">
          Futura es planificación. Se crea en por-hacer con prioridad no-urgente y la instrucción de
          esperar confirmación del orquestador; no se inventa un nuevo estado.
        </p>
      )}
      <label>
        Título del encargo
        <input
          id={`${idPrefix}-title`}
          required
          maxLength={160}
          value={value.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Qué entrega debe preparar"
        />
      </label>
      <label>
        Fin al que quieres llegar
        <textarea
          id={`${idPrefix}-goal`}
          required
          rows={3}
          maxLength={3500}
          value={value.goal}
          onChange={(e) => set({ goal: e.target.value })}
          placeholder="Qué debe existir o funcionar al terminar y cómo lo comprobarás."
        />
      </label>
      <label>
        Contexto y límites
        <textarea
          id={`${idPrefix}-context`}
          rows={3}
          maxLength={4500}
          value={value.context}
          onChange={(e) => set({ context: e.target.value })}
          placeholder="Situación actual, decisiones, referencias y qué no debe tocar. Sin secretos."
        />
      </label>

      {/* Sección de Imágenes y Archivos Adjuntos */}
      <div className="task-attachments-section">
        <div className="task-attachments-head">
          <span><b>Imágenes y archivos de referencia</b> <small>(enlazados localmente)</small></span>
          <div className="task-attachments-actions">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,application/pdf,text/*,.doc,.docx,.zip,*/*"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
              disabled={disabled || uploading}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
              disabled={disabled || uploading}
            />
            <button
              type="button"
              className="task-attach-btn"
              disabled={disabled || uploading}
              onClick={() => fileInputRef.current?.click()}
              title="Seleccionar archivos, fotos de la galería o documentos"
            >
              {uploading ? (uploadProgress || 'Subiendo…') : '📎 Adjuntar archivos'}
            </button>
            <button
              type="button"
              className="task-attach-btn secondary"
              disabled={disabled || uploading}
              onClick={() => cameraInputRef.current?.click()}
              title="Hacer foto directamente con la cámara del móvil"
            >
              📷 Cámara
            </button>
            <button
              type="button"
              className="task-attach-btn secondary"
              disabled={disabled || uploading}
              onClick={() => setShowManualPath((v) => !v)}
              title="Vincular archivo por ruta local en el Mac"
            >
              Ruta local…
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, margin: '4px 0 6px 0' }}>
          <p className="task-attachments-hint" style={{ fontSize: 12, color: 'var(--text-soft, #666)', margin: 0 }}>
            💡 En móvil abre galería o cámara. En ordenador puedes pegar capturas con <b>Cmd+V</b> o arrastrar archivos.
          </p>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text, #333)', cursor: 'pointer', margin: 0 }}>
            <input
              type="checkbox"
              checked={compressImages}
              onChange={(e) => setCompressImages(e.target.checked)}
              disabled={disabled || uploading}
              style={{ margin: 0 }}
            />
            <span>Comprimir fotos para móvil</span>
          </label>
        </div>

        {uploadError && <p className="brief-error" style={{ margin: '6px 0' }}>{uploadError}</p>}

        {showManualPath && (
          <div className="task-manual-path-bar">
            <input
              type="text"
              placeholder="/ruta/al/archivo.png"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addManualPath();
                }
              }}
            />
            <button type="button" onClick={addManualPath} disabled={!manualPath.trim()}>
              Añadir
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <ul className="task-attachments-list">
            {attachments.map((file, i) => (
              <li key={i} className="task-attachment-item">
                <span className="task-attachment-icon">{file.isImage ? '🖼️' : '📄'}</span>
                <span className="task-attachment-name" title={file.path}>
                  <strong>{file.name}</strong>
                  <small>
                    {file.size ? formatBytes(file.size) : file.path}
                    {file.compressedNote ? ` · ${file.compressedNote}` : ''}
                  </small>
                </span>
                <button
                  type="button"
                  className="task-attachment-remove"
                  onClick={() => removeAttachment(i)}
                  title="Quitar adjunto"
                  aria-label={`Quitar adjunto ${file.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {referenceSearch && (
        <div className="task-attachments-section">
          <div className="task-attachments-head">
            <span><b>Referencias a otras tareas</b> <small>(todo el historial)</small></span>
            <div className="task-attachments-actions">
              <button
                type="button"
                className="task-attach-btn"
                disabled={disabled}
                onClick={openHistorySearch}
                title="Abrir el buscador con el título del encargo"
              >
                🔍 Buscar referencias a otras tareas · todo el historial
              </button>
            </div>
          </div>
          <div className="task-manual-path-bar">
            <input
              id={`${idPrefix}-reference`}
              type="text"
              aria-label="ID, archivo o enlace de una tarea anterior"
              placeholder="ID de tarea, archivo .md o enlace de su ficha"
              value={referenceInput}
              onChange={(e) => setReferenceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addReference();
                }
              }}
            />
            <button type="button" onClick={addReference} disabled={!referenceInput.trim()}>
              Añadir referencia
            </button>
          </div>
          {referenceError && <p className="brief-error" style={{ margin: '6px 0' }}>{referenceError}</p>}
          {references.length > 0 && (
            <ul className="task-attachments-list">
              {references.map((ref) => (
                <li key={ref} className="task-attachment-item">
                  <span className="task-attachment-icon">🔗</span>
                  <span className="task-attachment-name" title={ref}>
                    <a
                      href={`/vista/tarea-ficha.html?file=${encodeURIComponent(ref)}`}
                      target="_blank"
                      rel="noopener"
                    >
                      <strong>{ref}</strong>
                    </a>
                  </span>
                  <button
                    type="button"
                    className="task-attachment-remove"
                    onClick={() => removeReference(ref)}
                    title="Quitar referencia"
                    aria-label={`Quitar referencia ${ref}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label>
        Habilidad o Skill principal
        <select
          id={`${idPrefix}-method`}
          value={value.method}
          onChange={(e) => set({ method: e.target.value })}
        >
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label || 'Reglas y contrato del repositorio destinatario'}
            </option>
          ))}
        </select>
      </label>

      {/* Tarjeta explicativa de Personalidad y Habilidad */}
      <div className="task-skill-card" style={{ borderColor: matchedAgent.color }}>
        <div className="task-skill-card-head">
          <span className="task-skill-avatar" style={{ background: matchedAgent.color }}>
            {value.method === 'auto' ? '⚡' : matchedAgent.id.toUpperCase()}
          </span>
          <div>
            <strong>
              {value.method === 'auto'
                ? `${matchedAgent.name} · Selección autónoma de skill`
                : `${matchedAgent.name} · ${matchedAgent.role}`}
            </strong>
            <small>{chosen.label || matchedAgent.skillTitle}</small>
          </div>
        </div>
        <p className="task-skill-personality">
          <b>{value.method === 'auto' ? 'Comportamiento:' : 'Personalidad:'}</b>{' '}
          {value.method === 'auto'
            ? 'El agente explorará todas las skills disponibles al reclamar la tarjeta, seleccionará la más adecuada para el encargo (o ninguna si no aplica) y consignará en su recibo la justificación.'
            : matchedAgent.personality}
        </p>
        <p className="task-skill-example">
          <b>{value.method === 'auto' ? 'Criterio:' : 'Ejemplo práctico:'}</b>{' '}
          {value.method === 'auto'
            ? 'Ideal cuando no sabes qué skill especializada elegir (SDD, auditoría, contenidos, etc.). El agente decide con la base de código real.'
            : matchedAgent.example}
        </p>
        <span className="task-skill-source">
          Fuente: {chosen.source}. Modificable libremente en el desplegable superior.
        </span>
      </div>
    </fieldset>
  );
}
