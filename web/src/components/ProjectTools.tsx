import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import type { ResourceInfo } from '../../../shared/project-tools';
import { AgentStudio } from './AgentStudio';
import { ProjectBinder } from './ProjectBinder';

export type ProjectTool = 'agents' | 'binder';
export function openProjectTool(tool: ProjectTool, agentId?: string) {
  window.dispatchEvent(new CustomEvent('muse:project-tool', { detail: { tool, agentId } }));
}
export function ProjectTools({ tool, projectId, projectName, agentId, onClose }: {
  tool: ProjectTool; projectId: string; projectName: string; agentId?: string; onClose: () => void;
}) {
  const root = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const [resources, setResources] = useState<ResourceInfo[] | null>(null);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const close = () => { if (!pending && (!dirty || window.confirm('Discard unsaved changes?'))) onClose(); };
  useEffect(() => { const dialog = root.current; dialog?.showModal(); return () => { dialog?.close(); returnFocus.current?.focus(); }; }, []);
  useEffect(() => { let alive = true; api.resources(projectId).then((r) => { if (alive) setResources(r.resources); }).catch((e) => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [projectId]);
  useEffect(() => { const unload = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload); }, [dirty]);
  return createPortal(<dialog ref={root} className="project-tools" aria-label={tool === 'agents' ? 'Agent Studio' : 'Project Binder'} onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="project-tools-head"><div><span>Muse · {projectName}</span><h2>{tool === 'agents' ? 'Agent Studio' : 'Project Binder'}</h2></div><button disabled={pending} onClick={close}>Back to workspace</button></header>
    <div className="project-tools-body">{error && <p role="alert">{error}</p>}{!resources && !error && <p>Loading project records…</p>}
      {resources && (tool === 'agents' ? <AgentStudio projectId={projectId} resources={resources} initialAgentId={agentId} onDirty={setDirty} onPending={setPending} close={onClose} /> : <ProjectBinder projectId={projectId} projectName={projectName} resources={resources} onDirty={setDirty} onPending={setPending} />)}
    </div>
  </dialog>, document.body);
}
