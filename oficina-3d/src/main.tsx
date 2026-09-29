import { createRoot } from 'react-dom/client';
import App from './App';
import AgentPopup from './components/AgentPopup';
import TaskFicha from './components/TaskFicha';
import { AGENTS, type AgentId } from './office/agents';

const host = document.getElementById('office-3d');
if (host) {
  const params = new URLSearchParams(window.location.search);
  const isFichaPath = window.location.pathname.includes('tarea-ficha');
  const agentParam = params.get('agent');
  const fileParam = params.get('file');
  const noteParam = params.get('note');
  const authorParam = params.get('author') || 'javier';
  const nuevaParam = params.get('nueva') === '1';
  const popupAgent = AGENTS.some(a => a.id === agentParam) ? (agentParam as AgentId) : null;

  if (popupAgent && !isFichaPath) {
    createRoot(host).render(<AgentPopup initialId={popupAgent} />);
  } else if (isFichaPath || fileParam || noteParam || nuevaParam) {
    createRoot(host).render(
      <TaskFicha
        fileName={fileParam || ''}
        noteStamp={noteParam || undefined}
        author={authorParam}
        nueva={nuevaParam}
      />
    );
  } else {
    createRoot(host).render(<App fill={host.dataset.fill === '1'} />);
  }
}
