import { useEffect, useRef, useState } from 'react';
import MarkdownView from './MarkdownView';
import { checklistItems, extractSpeechBlocks, type SpeechBlockItem } from '../office/markdown';
import TaskForm from './TaskForm';
import { uploadAttachmentApi } from '../office/attachments';
import { AGENTS, type AgentId } from '../office/agents';
import {
  DEFAULT_TASK_FORM,
  payloadFromTaskForm,
  taskTitleFromText,
  DEFAULT_METHOD,
  methodOptions,
  type PanelDraft,
  type TaskFormValue,
  type MethodOption,
} from '../office/workflow';

type TaskMeta = {
  fileName: string;
  title: string;
  role: string;
  priority: string;
  state: string;
  responsible: string;
  project: string;
};
type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; body: string; expectedBody: string; task: TaskMeta };
type Kind = 'comentario' | 'correccion' | 'aprobacion';
const KIND_TO_API: Record<Kind, string> = {
  comentario: 'comment',
  correccion: 'correction',
  aprobacion: 'approval',
};
const ROLES: [string, string][] = [
  ['co', 'Codex'],
  ['cl', 'Claude'],
  ['pi', 'Gentleman'],
  ['ja', 'Javier'],
  ['ge', 'agy'],
  ['gr', 'grok'],
  ['op', 'opencode'],
  ['ex', 'Agente externo'],
];
const STATES: [string, string][] = [
  ['por-hacer', 'Por hacer'],
  ['haciendo', 'Haciendo'],
  ['hecho', 'Hecho'],
];
const PRIORITIES: [string, string][] = [
  ['urgente', 'Urgente'],
  ['normal', 'Normal'],
  ['no-urgente', 'No urgente'],
];
const SPEECH_RATES = [1, 1.25, 1.5, 2] as const;
type SpeechQueue = {
  items: SpeechBlockItem[];
  index: number;
  stopped: boolean;
  restarting: boolean;
  rate: number;
  revision: number;
};
function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function taskFrom(data: unknown): TaskMeta {
  const task = data as Record<string, unknown>;
  return {
    fileName: String(task.fileName || ''),
    title: String(task.title || 'Tarea'),
    role: String(task.role || ''),
    priority: String(task.priority || ''),
    state: String(task.state || ''),
    responsible: String(task.responsible || ''),
    project: String(task.project || 'erbolamm-trabajo'),
  };
}

function extractGoalFromBody(body: string): string {
  const finMatch = /## Fin al que quiere llegar Javier\s*\n([\s\S]*?)(?=\n## |$)/i.exec(body);
  if (finMatch) return finMatch[1].trim();
  const objCtxMatch = /## (?:🎯 )?Objetivo y Contexto\s*\n([\s\S]*?)(?=\n## |$)/i.exec(body);
  if (objCtxMatch) return objCtxMatch[1].trim();
  const objMatch = /## Objetivo\s*\n([\s\S]*?)(?=\n## |$)/i.exec(body);
  if (objMatch) return objMatch[1].trim();
  return '';
}

function extractContextFromBody(body: string): string {
  const parts: string[] = [];
  const ctxMatch = /## Contexto y l[íi]mites\s*\n([\s\S]*?)(?=\n## |$)/i.exec(body);
  if (ctxMatch) parts.push(ctxMatch[1].trim());
  const detMatch = /### Detalle de Javier\s*\n([\s\S]*?)(?=\n## |$)/i.exec(body);
  if (detMatch) parts.push(detMatch[1].trim());

  const attMatch = /### 📎 Archivos adjuntos y referencias[\s\S]*?(?=\n## |$)/i.exec(body);
  if (attMatch) {
    parts.push(attMatch[0].trim());
  }

  const lines = body.split('\n');
  const standalone: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      (/^-\s+!\[.*?\]\(.*?\)/.test(trimmed) || /^-\s+\[.*?\]\(file:\/\/.*?\)/.test(trimmed)) &&
      !parts.some(p => p.includes(trimmed))
    ) {
      standalone.push(trimmed);
    }
  }
  if (standalone.length > 0 && !parts.some(p => p.includes('📎 Archivos adjuntos'))) {
    parts.push(`### 📎 Archivos adjuntos y referencias\n${standalone.join('\n')}`);
  }

  return parts.join('\n\n').trim();
}

function extractMethodFromBody(body: string): string {
  const match = /## M[eé]todo solicitado\s*\n([^\n]+)/i.exec(body);
  return match ? match[1].trim() : DEFAULT_METHOD;
}

export default function TaskFicha({
  fileName = '',
  noteStamp,
  author = 'javier',
  nueva = false,
}: {
  fileName?: string;
  noteStamp?: string;
  author?: string;
  nueva?: boolean;
}) {
  const [currentFile, setCurrentFile] = useState(fileName);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [text, setText] = useState('');
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [created, setCreated] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [role, setRole] = useState('');
  const [priority, setPriority] = useState('');
  const [targetState, setTargetState] = useState('');
  const [reason, setReason] = useState('');

  // Estados para modo nota y modo nueva tarea (formulario único)
  const [catalog, setCatalog] = useState<{ projects: string[]; skills: MethodOption[] }>({
    projects: ['erbolamm-trabajo'],
    skills: [],
  });
  const [form, setForm] = useState<TaskFormValue>(DEFAULT_TASK_FORM);
  const [preview, setPreview] = useState<{ fileName: string; body: string; payload: PanelDraft } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [expectedNoteText, setExpectedNoteText] = useState('');
  const [noteDate, setNoteDate] = useState('');
  const [noteAuthor, setNoteAuthor] = useState(author);
  const [showConvert, setShowConvert] = useState(false);
  const [noteDiscarded, setNoteDiscarded] = useState(false);

  const mounted = useRef(true);
  const speechRef = useRef<SpeechQueue>({
    items: [],
    index: 0,
    stopped: true,
    restarting: false,
    rate: 1,
    revision: 0,
  });
  const [speaking, setSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1);
  const [activeParagraph, setActiveParagraph] = useState<number>(-1);
  const [activeCharIndex, setActiveCharIndex] = useState<number>(-1);
  const aportacionFileInputRef = useRef<HTMLInputElement>(null);
  const aportacionCameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    mounted.current = false;
    speechRef.current.stopped = true;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (text.trim() || reason.trim() || (noteStamp && noteText.trim() !== expectedNoteText)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [text, reason, noteStamp, noteText, expectedNoteText]);

  // Carga del catálogo local para el formulario compartido en todos los modos
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/office/catalog', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async r => {
        if (!r.ok) return;
        const data = await r.json();
        const projs = Array.isArray(data.projects)
          ? data.projects.filter((p: unknown) => typeof p === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(p))
          : [];
        const sks = Array.isArray(data.skills)
          ? data.skills.filter(
              (s: any) =>
                s &&
                typeof s.id === 'string' &&
                /^[a-z0-9][a-z0-9-]*$/.test(s.id) &&
                typeof s.label === 'string' &&
                typeof s.source === 'string',
            )
          : [];
        setCatalog({
          projects: [...new Set(['erbolamm-trabajo', ...projs])],
          skills: sks,
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const token = window.Oficina?.office?.actionToken;
      if (!token) {
        if (!cancelled) window.setTimeout(load, 200);
        return;
      }

      // Modo 1: Nota del buzón (Ideas y recordatorios)
      if (noteStamp) {
        try {
          const response = await fetch('/api/chat', {
            cache: 'no-store',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'X-ErBolamm-Action': String(token),
            },
          });
          const data = await response.json();
          if (!response.ok || !data.ok) {
            throw new Error(data.message || data.error || `HTTP ${response.status}`);
          }
          if (cancelled) return;
          const messages = Array.isArray(data.messages) ? data.messages : [];
          const found = messages.find(
            (m: any) =>
              (String(m.timestamp) === String(noteStamp) ||
                new Date(m.timestamp).getTime() === new Date(noteStamp).getTime()) &&
              (!author || m.author === author),
          );
          if (!found) {
            setState({ status: 'error', message: 'Esa nota ya no está en el buzón.' });
            return;
          }
          const raw = String(found.text || '');
          setNoteText(raw);
          setExpectedNoteText(raw);
          setNoteAuthor(String(found.author || 'javier'));
          const when = new Date(found.timestamp);
          setNoteDate(Number.isNaN(when.valueOf()) ? 'Fecha desconocida' : when.toLocaleString('es-ES'));
          setForm({
            ...DEFAULT_TASK_FORM,
            role: 'co',
            project: 'erbolamm-trabajo',
            priority: 'normal',
            title: taskTitleFromText(raw),
            goal: raw.trim(),
            context: '',
            method: DEFAULT_METHOD,
          });
          setState({
            status: 'ready',
            body: raw,
            expectedBody: raw,
            task: {
              fileName: '',
              title: `Nota: ${taskTitleFromText(raw) || 'Ideas y recordatorios'}`,
              role: String(found.author || 'javier'),
              priority: 'normal',
              state: 'buzon',
              responsible: String(found.author || 'javier'),
              project: 'erbolamm-trabajo',
            },
          });
        } catch (e) {
          if (!cancelled) setState({ status: 'error', message: (e as Error).message });
        }
        return;
      }

      // Modo 2: Nueva tarea desde cero
      if (nueva || !currentFile) {
        setState({
          status: 'ready',
          body: '',
          expectedBody: '',
          task: {
            fileName: '',
            title: 'Nueva tarea',
            role: 'co',
            priority: 'normal',
            state: 'por-hacer',
            responsible: 'co',
            project: 'erbolamm-trabajo',
          },
        });
        return;
      }

      // Modo 3: Tarea existente desde archivo
      try {
        const response = await fetch(`/api/tasks/edit?file=${encodeURIComponent(currentFile)}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json', 'X-ErBolamm-Action': String(token) },
        });
        const data = await response.json();
        if (!response.ok || !data.ok)
          throw new Error(data.message || data.error || `HTTP ${response.status}`);
        if (cancelled) return;
        const task = taskFrom(data.document.task);
        const rawBody = String(data.document.body || '');
        setState({
          status: 'ready',
          body: rawBody,
          expectedBody: rawBody,
          task,
        });
        setRole(task.role);
        setPriority(task.priority);
        setTargetState(task.state);
        setForm({
          role: task.role,
          project: task.project || 'erbolamm-trabajo',
          priority: task.priority || 'normal',
          title: task.title,
          goal: extractGoalFromBody(rawBody) || task.title,
          context: extractContextFromBody(rawBody),
          method: extractMethodFromBody(rawBody),
        });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: (e as Error).message });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [currentFile, noteStamp, author, nueva]);

  async function apiRequest(path: string, payload?: Record<string, unknown>, method: string = 'POST') {
    const token = window.Oficina?.office?.actionToken;
    if (!token) throw new Error('Sin conexión con la oficina local.');
    const response = await fetch(path, {
      method,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-ErBolamm-Action': String(token),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  }

  // Notificar al plano de la oficina que este agente entra en el despacho de Javier
  useEffect(() => {
    const rawRole = state.status === 'ready' ? state.task.role : form.role;
    const role = (rawRole || 'co') as AgentId;
    if (!role || role === 'ja') return;
    const opener = window.opener;
    if (!opener || opener.closed || !opener.Oficina3D) return;
    opener.Oficina3D.visitFromPopup?.(role);
    opener.Oficina3D.focusFromPopup?.(role);

    const onFocus = () => {
      const op = window.opener;
      if (!op || op.closed || !op.Oficina3D) return;
      op.Oficina3D.focusFromPopup?.(role);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      const op = window.opener;
      if (!op || op.closed || !op.Oficina3D) return;
      op.Oficina3D.leaveFromPopup?.(role);
    };
  }, [form.role, state.status, state.status === 'ready' ? state.task.role : '']);

  function stopSpeech() {
    const queue = speechRef.current;
    queue.stopped = true;
    queue.restarting = false;
    queue.revision += 1;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    setActiveParagraph(-1);
    setActiveCharIndex(-1);
  }

  function playSpeech(queue: SpeechQueue) {
    if (queue.stopped || queue.index < 0 || queue.index >= queue.items.length) {
      if (!queue.stopped) {
        setSpeaking(false);
        setActiveParagraph(-1);
        setActiveCharIndex(-1);
      }
      return;
    }
    const currentItem = queue.items[queue.index];
    setActiveParagraph(currentItem.blockIndex);
    setActiveCharIndex(-1);

    const utterance = new SpeechSynthesisUtterance(currentItem.text);
    utterance.lang = 'es-ES';
    utterance.rate = queue.rate;

    // Resaltado de palabra activa en tiempo real según la voz
    utterance.onboundary = (event) => {
      if (queue.stopped || queue.restarting) return;
      if (event.name === 'word' || typeof event.charIndex === 'number') {
        setActiveCharIndex(event.charIndex);
      }
    };

    utterance.onend = () => {
      if (queue.stopped || queue.restarting) return;
      queue.index += 1;
      playSpeech(queue);
    };

    utterance.onerror = (event) => {
      // Si el error fue por cancelación intencionada, no mostramos error
      if (queue.stopped || queue.restarting || event.error === 'canceled' || event.error === 'interrupted') return;
      setSpeaking(false);
      setActiveParagraph(-1);
      setActiveCharIndex(-1);
      setError('No se pudo completar la lectura.');
    };

    window.speechSynthesis.speak(utterance);
  }

  function restartSpeech(index: number, rate?: number) {
    const queue = speechRef.current;
    if (!speaking || queue.stopped || !queue.items.length) return;
    queue.index = Math.max(0, Math.min(queue.items.length - 1, index));
    if (rate !== undefined) queue.rate = rate;
    queue.restarting = true;
    const revision = ++queue.revision;
    window.speechSynthesis.cancel();

    // Pequeño retardo de 120ms para que Web Speech API en Chrome/Safari libere el sintetizador
    window.setTimeout(() => {
      if (queue.stopped || queue.revision !== revision) return;
      queue.restarting = false;
      playSpeech(queue);
    }, 120);
  }

  function speak() {
    if (state.status !== 'ready') return;
    if (!('speechSynthesis' in window)) {
      setError('Este navegador no puede leer texto en voz alta.');
      return;
    }
    if (speaking) {
      stopSpeech();
      return;
    }
    const items = extractSpeechBlocks(state.body);
    if (!items.length) return;
    const queue: SpeechQueue = {
      items,
      index: 0,
      stopped: false,
      restarting: false,
      rate: speechRate,
      revision: 0,
    };
    speechRef.current = queue;
    setError('');
    setSpeaking(true);
    window.speechSynthesis.cancel();
    window.setTimeout(() => playSpeech(queue), 50);
  }

  function decreaseSpeechRate() {
    const queue = speechRef.current;
    const current = speaking ? queue.rate : speechRate;
    const idx = SPEECH_RATES.indexOf(current as typeof SPEECH_RATES[number]);
    const nextIdx = Math.max(0, idx - 1);
    const next = SPEECH_RATES[nextIdx];
    setSpeechRate(next);
    if (speaking) restartSpeech(queue.index, next);
  }

  function increaseSpeechRate() {
    const queue = speechRef.current;
    const current = speaking ? queue.rate : speechRate;
    const idx = SPEECH_RATES.indexOf(current as typeof SPEECH_RATES[number]);
    const nextIdx = Math.min(SPEECH_RATES.length - 1, idx + 1);
    const next = SPEECH_RATES[nextIdx];
    setSpeechRate(next);
    if (speaking) restartSpeech(queue.index, next);
  }


  function previousParagraph() {
    restartSpeech(speechRef.current.index - 1);
  }

  function nextParagraph() {
    restartSpeech(speechRef.current.index + 1);
  }

  async function saveNoteCorrection() {
    if (busy || !noteText.trim()) return;
    setBusy(true);
    setError('');
    setSent('');
    try {
      await apiRequest(
        '/api/chat',
        {
          timestamp: noteStamp,
          author: noteAuthor,
          expectedText: expectedNoteText,
          text: noteText.trim(),
        },
        'PATCH',
      );
      setExpectedNoteText(noteText.trim());
      setSent('Nota corregida y actualizada en el buzón.');
      await window.Oficina?.refresh?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function discardNote() {
    if (busy) return;
    if (!window.confirm('¿Descartar esta nota del buzón?')) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(
        '/api/chat',
        {
          timestamp: noteStamp,
          author: noteAuthor,
        },
        'DELETE',
      );
      setNoteDiscarded(true);
      setSent('Nota retirada del buzón.');
      await window.Oficina?.refresh?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function preparePreview() {
    if (busy) return;
    setBusy(true);
    setError('');
    setSent('');
    try {
      const payload = payloadFromTaskForm(form, catalog.skills);
      const result = await window.Oficina.taskRequest('/api/tasks/preview', payload);
      setPreview({ ...result.preview, payload });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createTaskFromPreview() {
    if (!preview || busy) return;
    setBusy(true);
    setError('');
    setSent('');
    try {
      const result = await window.Oficina.taskRequest('/api/tasks/create', {
        ...preview.payload,
        confirmed: true,
        expectedFileName: preview.fileName,
        expectedBody: preview.body,
      });
      const createdFile = String(result.preview.fileName);
      setCreated(createdFile);
      setPreview(null);
      if (noteStamp && !noteDiscarded) {
        try {
          await apiRequest('/api/chat', { timestamp: noteStamp, author: noteAuthor }, 'DELETE');
          setNoteDiscarded(true);
        } catch (_) {}
      }
      setSent(`Tarea creada en por-hacer: ${createdFile}.`);
      await window.Oficina?.refresh?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send(kind: Kind) {
    if (state.status !== 'ready' || busy || !text.trim()) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiRequest('/api/tasks/append', {
        fileName: currentFile,
        expectedBody: state.expectedBody,
        id: newId(),
        author: 'javier',
        type: KIND_TO_API[kind],
        text: text.trim(),
        confirmed: true,
      });
      if (!mounted.current) return;
      setState({
        status: 'ready',
        body: data.document.body,
        expectedBody: data.document.body,
        task: taskFrom(data.document.task),
      });
      setText('');
      setSent(kind === 'aprobacion' ? 'Aprobación registrada.' : 'Aportación añadida.');
      await window.Oficina?.refresh?.();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function manage() {
    if (state.status !== 'ready' || busy || !reason.trim()) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiRequest('/api/tasks/manage', {
        fileName: currentFile,
        expectedBody: state.expectedBody,
        id: newId(),
        role,
        priority,
        state: targetState,
        reason: reason.trim(),
        confirmed: true,
      });
      if (!mounted.current) return;
      const task = taskFrom(data.document.task);
      setState({
        status: 'ready',
        body: data.document.body,
        expectedBody: data.document.body,
        task,
      });
      setCurrentFile(task.fileName);
      setReason('');
      setManageOpen(false);
      setSent(`Tarea actualizada: [${task.role}] · ${task.state}.`);
      await window.Oficina?.refresh?.();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function deleteTask() {
    if (state.status !== 'ready' || busy) return;
    const ok = window.confirm(
      '¿Seguro que quieres eliminar definitivamente esta tarea del tablero?\nEsta acción no se puede deshacer.'
    );
    if (!ok) return;

    setBusy(true);
    setError('');
    setSent('');
    try {
      await apiRequest('/api/tasks/delete', {
        fileName: currentFile,
        expectedBody: state.expectedBody,
        confirmed: true,
      });
      setSent('Tarea eliminada correctamente.');
      await window.Oficina?.refresh?.();
      window.setTimeout(() => {
        closeFicha();
      }, 500);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function uploadSingleAttachment(file: File): Promise<{ name: string; path: string; url?: string }> {
    return uploadAttachmentApi(file);
  }

  async function handleAportacionFiles(fileList: FileList | File[]) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const results: string[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const res = await uploadAttachmentApi(fileList[i]);
        results.push(res.isImage ? `![${res.name}](file://${res.path})` : `[${res.name}](file://${res.path})`);
      }
      setText(prev => `${prev ? `${prev.trim()}\n\n` : ''}${results.join('\n')}\n`);
      setSent('Adjunto(s) transferido(s) y enlazado(s) en la aportación.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (aportacionFileInputRef.current) aportacionFileInputRef.current.value = '';
      if (aportacionCameraInputRef.current) aportacionCameraInputRef.current.value = '';
    }
  }

  async function handleAportacionPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        try {
          const res = await uploadSingleAttachment(file);
          setText(prev => `${prev ? `${prev.trim()}\n\n` : ''}![${res.name}](file://${res.path})\n`);
          setSent('Imagen pegada y enlazada en la aportación.');
        } catch (err) {
          setError((err as Error).message);
        }
      }
    }
  }

  useEffect(() => {
    function onFichaPaste(e: ClipboardEvent) {
      const target = document.activeElement;
      if (target && target.tagName === 'TEXTAREA') return;

      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      const images: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) images.push(f);
        }
      }
      if (images.length > 0) {
        e.preventDefault();
        void Promise.all(images.map(uploadSingleAttachment)).then(results => {
          const attLines = results.map(r => `![${r.name}](file://${r.path})`).join('\n');
          setText(prev => `${prev ? `${prev.trim()}\n\n` : ''}${attLines}\n`);
          setSent('Imagen pegada desde el portapapeles y añadida a la aportación.');
        }).catch(err => setError(err.message));
      }
    }
    window.addEventListener('paste', onFichaPaste);
    return () => window.removeEventListener('paste', onFichaPaste);
  }, []);

  const closeFicha = () => {
    if (window.opener) window.close();
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/vista/tablero.html';
    }
  };

  if (state.status === 'loading') {
    return <div className="real-office"><p className="task-ficha-status">Cargando…</p></div>;
  }
  if (state.status === 'error') {
    return (
      <div className="real-office">
        <div className="task-ficha">
          <header className="task-ficha-heading">
            <div>
              <h2>No se pudo abrir la tarea</h2>
              <small>{currentFile || 'Tarea no disponible'}</small>
            </div>
            <div className="task-ficha-head-actions">
              <button type="button" onClick={closeFicha} aria-label="Cerrar ficha">
                ✕
              </button>
            </div>
          </header>
          <div style={{ padding: '1.25rem' }}>
            <p className="task-ficha-status task-ficha-error">{state.message}</p>
            <div style={{ marginTop: '1.25rem' }}>
              <button type="button" className="task-ficha-action" onClick={closeFicha}>
                Volver al tablero
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // RENDER 1: Modo Nota del buzón (Ideas y recordatorios)
  if (noteStamp) {
    return (
      <div className="real-office">
        <div className="task-ficha">
          <header className="task-ficha-heading">
            <div>
              <h2>Idea o recordatorio del buzón</h2>
              <small>De {noteAuthor === 'javier' ? 'Javier' : noteAuthor} · {noteDate}</small>
            </div>
            <div className="task-ficha-head-actions">
              <button type="button" onClick={closeFicha} aria-label="Cerrar ficha">✕</button>
            </div>
          </header>

          {noteDiscarded ? (
            <p className="task-ficha-status">Esta nota ha sido retirada del buzón.</p>
          ) : (
            <>
              <form className="task-ficha-form" onSubmit={e => { e.preventDefault(); void saveNoteCorrection(); }}>
                <label>
                  Texto de la idea o recordatorio
                  <textarea
                    rows={5}
                    maxLength={2000}
                    value={noteText}
                    disabled={busy || Boolean(created)}
                    onChange={e => {
                      const val = e.target.value;
                      setNoteText(val);
                      if (!form.title || form.title === taskTitleFromText(noteText)) {
                        setForm(f => ({ ...f, title: taskTitleFromText(val), goal: val.trim() }));
                      }
                    }}
                  />
                </label>
                <div className="task-ficha-actions">
                  <button
                    className="primary"
                    type="submit"
                    disabled={busy || !noteText.trim() || noteText.trim() === expectedNoteText || Boolean(created)}
                  >
                    Guardar corrección
                  </button>
                  <button
                    type="button"
                    disabled={busy || Boolean(created)}
                    onClick={() => setShowConvert(val => !val)}
                  >
                    {showConvert ? 'Ocultar conversión' : 'Convertir en tarea con formulario único'}
                  </button>
                  <button
                    type="button"
                    disabled={busy || Boolean(created)}
                    onClick={() => void discardNote()}
                  >
                    Descartar del buzón
                  </button>
                </div>
              </form>

              {showConvert && (
                <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                  <h3>Convertir en tarea oficial</h3>
                  <form onSubmit={e => { e.preventDefault(); void preparePreview(); }} onChange={() => setPreview(null)}>
                    <label style={{ display: 'grid', gap: 5, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                      Agente responsable
                      <select
                        value={form.role}
                        disabled={busy || Boolean(created)}
                        onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      >
                        {AGENTS.map(a => (
                          <option key={a.id} value={a.id}>{a.name} [{a.id}]</option>
                        ))}
                      </select>
                    </label>
                    <TaskForm
                      value={form}
                      onChange={setForm}
                      disabled={busy || Boolean(created)}
                      projects={catalog.projects}
                      skills={catalog.skills}
                      idPrefix="convert-note"
                      referenceSearch
                    />
                    <div className="task-ficha-actions" style={{ marginTop: 12 }}>
                      <button className="primary" type="submit" disabled={busy || Boolean(created)}>
                        Preparar vista previa
                      </button>
                    </div>
                  </form>

                  {preview && (
                    <section className="brief-preview" style={{ marginTop: 16 }} aria-label="Confirmación del encargo">
                      <h3>Confirma el archivo y el contenido exactos</h3>
                      <code>{preview.fileName}</code>
                      <pre>{preview.body}</pre>
                      <p>Al crear la tarea, esta nota se retirará automáticamente del buzón.</p>
                      <div className="brief-confirm-actions">
                        <button disabled={busy} onClick={() => setPreview(null)}>Cancelar vista previa</button>
                        <button className="primary" disabled={busy} onClick={() => void createTaskFromPreview()}>
                          Crear tarea y retirar del buzón
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </>
          )}

          {created && (
            <p className="brief-success" style={{ marginTop: 14 }} role="status">
              Creada en por-hacer: <b>{created}</b>.{' '}
              <button
                type="button"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  window.location.assign(`/vista/tarea-ficha.html?file=${encodeURIComponent(created)}`);
                }}
              >
                Abrir ficha de la tarea
              </button>
            </p>
          )}
          {sent && <p className="task-ficha-status" role="status">{sent}</p>}
          {error && <p className="task-ficha-status task-ficha-error" role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  // RENDER 2: Modo Nueva Tarea desde cero
  if (nueva || (!currentFile && !noteStamp)) {
    return (
      <div className="real-office">
        <div className="task-ficha">
          <header className="task-ficha-heading">
            <div>
              <h2>Nueva tarea oficial</h2>
              <small>Formulario único de encargo</small>
            </div>
            <div className="task-ficha-head-actions">
              <button type="button" onClick={closeFicha} aria-label="Cerrar ficha">✕</button>
            </div>
          </header>

          <form onSubmit={e => { e.preventDefault(); void preparePreview(); }} onChange={() => setPreview(null)}>
            <label style={{ display: 'grid', gap: 5, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              Agente responsable
              <select
                value={form.role}
                disabled={busy || Boolean(created)}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              >
                {AGENTS.map(a => (
                  <option key={a.id} value={a.id}>{a.name} [{a.id}]</option>
                ))}
              </select>
            </label>
            <TaskForm
              value={form}
              onChange={setForm}
              disabled={busy || Boolean(created)}
              projects={catalog.projects}
              skills={catalog.skills}
              idPrefix="new-task"
              referenceSearch
            />
            <div className="task-ficha-actions" style={{ marginTop: 12 }}>
              <button className="primary" type="submit" disabled={busy || Boolean(created)}>
                Preparar vista previa
              </button>
            </div>
          </form>

          {preview && (
            <section className="brief-preview" style={{ marginTop: 16 }} aria-label="Confirmación del encargo">
              <h3>Confirma el archivo y el contenido exactos</h3>
              <code>{preview.fileName}</code>
              <pre>{preview.body}</pre>
              <div className="brief-confirm-actions">
                <button disabled={busy} onClick={() => setPreview(null)}>Cancelar vista previa</button>
                <button className="primary" disabled={busy} onClick={() => void createTaskFromPreview()}>
                  Crear tarea real
                </button>
              </div>
            </section>
          )}

          {created && (
            <p className="brief-success" style={{ marginTop: 14 }} role="status">
              Creada en por-hacer: <b>{created}</b>.{' '}
              <button
                type="button"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  window.location.assign(`/vista/tarea-ficha.html?file=${encodeURIComponent(created)}`);
                }}
              >
                Abrir ficha de la tarea
              </button>
            </p>
          )}
          {sent && <p className="task-ficha-status" role="status">{sent}</p>}
          {error && <p className="task-ficha-status task-ficha-error" role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  // RENDER 3: Modo Tarea existente desde archivo
  const items = checklistItems(state.body);
  const allChecked = items.length > 0 && items.every((_, i) => checked[i]);
  const approveBlockedReason =
    items.length === 0
      ? 'Esta tarea no tiene lista de comprobación: no se puede aprobar desde aquí.'
      : !allChecked
      ? 'Marca todos los puntos de comprobación antes de aprobar.'
      : '';

  return (
    <div className="real-office">
      <div className="task-ficha">
        <header className="task-ficha-heading">
          <div>
            <h2>{state.task.title}</h2>
            <small>[{state.task.role}] · {state.task.state} · {state.task.priority}</small>
          </div>
          <div className="task-ficha-head-actions">
            <button
              type="button"
              onClick={deleteTask}
              disabled={busy}
              aria-label="Eliminar tarea"
              data-tip="Eliminar tarea"
              title="Eliminar tarea definitivamente"
              style={{ color: '#ef4444' }}
            >
              🗑
            </button>
            <button
              type="button"
              onClick={speak}
              aria-label={speaking ? 'Detener lectura' : 'Leer tarea en voz alta'}
              data-tip={speaking ? 'Detener lectura' : 'Leer tarea en voz alta'}
              title={speaking ? 'Detener lectura' : 'Leer tarea en voz alta'}
            >
              {speaking ? '⏹' : '🔊'}
            </button>
            <button
              type="button"
              onClick={previousParagraph}
              disabled={!speaking}
              aria-label="Volver al párrafo anterior"
              data-tip="Párrafo anterior"
              title="Párrafo anterior"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={decreaseSpeechRate}
              aria-label="Disminuir velocidad de lectura"
              data-tip="Disminuir velocidad"
              title="Disminuir velocidad"
            >
              −
            </button>
            <span className="speech-rate-badge" title="Velocidad actual">{speechRate}×</span>
            <button
              type="button"
              onClick={increaseSpeechRate}
              aria-label="Aumentar velocidad de lectura"
              data-tip="Aumentar velocidad"
              title="Aumentar velocidad"
            >
              +
            </button>
            <button
              type="button"
              onClick={nextParagraph}
              disabled={!speaking}
              aria-label="Pasar al párrafo siguiente"
              data-tip="Párrafo siguiente"
              title="Párrafo siguiente"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => setManageOpen((value) => !value)}
              aria-label="Asignar o mover tarea"
              data-tip="Asignar o mover tarea"
              title="Asignar o mover tarea"
            >
              …
            </button>
            <button
              type="button"
              onClick={closeFicha}
              aria-label="Cerrar ficha"
              data-tip="Cerrar ficha"
            >
              ✕
            </button>
          </div>
        </header>
        {manageOpen && (
          <form className="task-ficha-form task-ficha-manage" onSubmit={e => { e.preventDefault(); void manage(); }}>
            <label>Agente<select value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(([id, label]) => <option key={id} value={id}>[{id}] {label}</option>)}</select></label>
            <label>Estado<select value={targetState} onChange={e => setTargetState(e.target.value)}>{STATES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label>Prioridad<select value={priority} onChange={e => setPriority(e.target.value)}>{PRIORITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label className="task-ficha-manage-reason">Motivo<textarea required rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="Por qué la asignas o mueves…" /></label>
            <p className="task-ficha-note">Se guarda el cambio y queda anotado. «Haciendo» solo si ese agente ya trabaja en ella.</p>
            <button className="primary" type="submit" disabled={busy || !reason.trim()}>Confirmar cambio</button>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={deleteTask}
                disabled={busy}
                style={{ color: '#ef4444', borderColor: '#ef4444', background: 'transparent', width: '100%' }}
              >
                🗑 Eliminar esta tarea definitivamente
              </button>
            </div>
          </form>
        )}

        <MarkdownView
          body={state.body}
          activeParagraphIndex={activeParagraph}
          activeWordCharIndex={activeCharIndex}
        />
        {items.length > 0 && (
          <section className="task-ficha-checklist" aria-label="Comprobación">
            <h3>Comprobación</h3>
            {items.map((item, i) => (
              <label key={i}><input type="checkbox" checked={Boolean(checked[i])} onChange={e => setChecked(c => ({ ...c, [i]: e.target.checked }))} /> {item}</label>
            ))}
          </section>
        )}
        <form className="task-ficha-form" onSubmit={e => { e.preventDefault(); void send('comentario'); }}>
          <label>
            Aportación
            <textarea
              required
              rows={4}
              maxLength={4000}
              value={text}
              onChange={e => setText(e.target.value)}
              onPaste={handleAportacionPaste}
              placeholder="Qué añades, aclaras o pides corregir… (puedes adjuntar fotos, cámara o pegar con Cmd+V)"
            />
          </label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              ref={aportacionFileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,application/pdf,text/*,.doc,.docx,.zip,*/*"
              style={{ display: 'none' }}
              onChange={e => e.target.files && void handleAportacionFiles(e.target.files)}
              disabled={busy}
            />
            <input
              ref={aportacionCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => e.target.files && void handleAportacionFiles(e.target.files)}
              disabled={busy}
            />
            <button
              type="button"
              className="task-attach-btn secondary"
              disabled={busy}
              onClick={() => aportacionFileInputRef.current?.click()}
              title="Adjuntar fotos de la galería o documentos"
            >
              📎 Adjuntar
            </button>
            <button
              type="button"
              className="task-attach-btn secondary"
              disabled={busy}
              onClick={() => aportacionCameraInputRef.current?.click()}
              title="Hacer foto directamente con la cámara del móvil"
            >
              📷 Cámara
            </button>
          </div>
          <div className="task-ficha-actions">
            <button className="primary" type="submit" disabled={busy || !text.trim()}>Comentar</button>
            <button type="button" disabled={busy || !text.trim()} onClick={() => void send('correccion')}>Pedir corrección</button>
            <button type="button" disabled={busy || !text.trim() || Boolean(approveBlockedReason)} onClick={() => void send('aprobacion')}>Aprobar</button>
          </div>
          {approveBlockedReason && <p className="task-ficha-note">{approveBlockedReason}</p>}
        </form>
        {sent && <p className="task-ficha-status" role="status">{sent}</p>}
        {error && <p className="task-ficha-status task-ficha-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
