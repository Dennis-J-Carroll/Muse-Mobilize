import { useValueUndo } from '../useValueUndo';
import { useEffect, useState } from 'react';
import { api, type AgentArrangement } from '../api';
import { useStore } from '../store';
import type { AgentDef } from '../types';
import { RESOURCE_LABELS, permits, type ResourceInfo, type ResourceKind, type ResourceSelection } from '../../../shared/project-tools';
import { ResourcePicker } from './ResourcePicker';

function blank(): AgentDef {
  return { id: `agent-${crypto.randomUUID()}`, name: 'New Muse', role: 'Writing adviser', blurb: '', instructions: { system_prompt: 'Help the writer explore possibilities using assigned material. Distinguish evidence from suggestions.', goals: [] }, model: { provider: 'default' }, state: { mode: 'idle' }, activation: { type: 'manual' }, authority: {}, context: { scope: [] }, communication: {}, budget: { max_steps: 1, max_tokens: 2000 }, access: { version: 1, revision: 'draft', allow: [], deny: [], selection: false, proposeEdits: false } };
}
function editable(agent: AgentDef): AgentDef {
  return structuredClone({ ...agent, instructions: agent.instructions ?? blank().instructions, access: agent.access ?? blank().access });
}

export function AgentStudio({ projectId, resources, initialAgentId, onDirty, onPending, close }: {
  projectId: string; resources: ResourceInfo[]; initialAgentId?: string; onDirty: (dirty: boolean) => void; onPending: (pending: boolean) => void; close: () => void;
}) {
  const agents = useStore((s) => s.agents);
  const initial = agents.find((a) => a.id === initialAgentId) ?? agents[0];
  const [draft, setDraft] = useState<AgentDef>(() => initial ? editable(initial) : blank());
  const [revision, setRevision] = useState<string | null>(initial ? initial.access?.revision ?? 'legacy' : null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [question, setQuestion] = useState('');
  const [preview, setPreview] = useState<{ sections: { name: string; body: string }[]; summary: string[] } | null>(null);
  const [arrangements, setArrangements] = useState<AgentArrangement[]>([]);
  const [arrangementName, setArrangementName] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  useEffect(() => { let alive = true; api.arrangements(projectId).then((r) => { if (alive) setArrangements(r.arrangements); }).catch((e) => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [projectId]);
  useEffect(() => onDirty(dirty || Boolean(arrangementName)), [dirty, arrangementName, onDirty]);
  useEffect(() => onPending(busy), [busy, onPending]);
  const edits = useValueUndo(draft, (value) => { setDraft(value); setDirty(true); setPreview(null); setMessage(''); });
  const change = edits.change;
  const select = (agent?: AgentDef, duplicate = false) => {
    if (dirty && !window.confirm('Discard unsaved agent edits?')) return;
    const next = agent ? editable(agent) : blank();
    if (duplicate) { next.id = `agent-${crypto.randomUUID()}`; next.name += ' copy'; }
    edits.reset(); setDraft(next); setRevision(agent && !duplicate ? agent.access?.revision ?? 'legacy' : null); setDirty(!agent || duplicate); setPreview(null); setError(''); setMessage('');
  };
  const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); setMessage(''); try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const updateRoster = (updates: AgentDef[]) => {
    if (useStore.getState().project?.id !== projectId) return;
    useStore.setState((s) => ({ agents: [...s.agents.filter((a) => !updates.some((u) => u.id === a.id)), ...updates] }));
  };
  const policy = draft.access!;
  const setRule = (side: 'allow' | 'deny', kind: ResourceKind, selection?: ResourceSelection) => change({ ...draft, access: { ...policy, [side]: [...policy[side].filter((r) => r.kind !== kind), ...(selection ? [{ kind, selection }] : [])] } });
  const assigned = resources.filter((r) => permits(policy, r));
  return <div className="studio-columns">
    <aside className="studio-roster">
      <h3>Your agents</h3><button disabled={busy} onClick={() => select()}>New agent</button>
      <div className="mobile-agent-choice"><label>Agent<select value={draft.id} disabled={busy} onChange={(e) => select(agents.find((a) => a.id === e.target.value))}>{!agents.some((a) => a.id === draft.id) && <option value={draft.id}>{draft.name}</option>}{agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.access ? '' : ' · legacy'}</option>)}</select></label></div>
      <div className="agent-roster-list">{agents.map((agent) => <button key={agent.id} disabled={busy} className={agent.id === draft.id ? 'selected' : ''} onClick={() => select(agent)}><strong>{agent.name}</strong><small>{agent.access ? 'Assigned knowledge' : 'Legacy scopes'}</small></button>)}</div>
      <details><summary>Saved arrangements</summary>
        <p>Save a group with its current assignments. Loading creates independent copies.</p>
        <label>Arrangement name<input value={arrangementName} onChange={(e) => setArrangementName(e.target.value)} maxLength={100} /></label>
        {agents.filter((a) => a.access).map((a) => <label className="check-row" key={a.id}><input type="checkbox" checked={selectedAgents.includes(a.id)} onChange={(e) => setSelectedAgents(e.target.checked ? [...selectedAgents, a.id] : selectedAgents.filter((id) => id !== a.id))} />{a.name}</label>)}
        <button disabled={busy || !arrangementName.trim() || !selectedAgents.length} onClick={() => void run(async () => { const { arrangement } = await api.saveArrangement(projectId, arrangementName, selectedAgents); setArrangements([...arrangements, arrangement]); setArrangementName(''); setMessage('Arrangement saved.'); })}>Save arrangement</button>
        {arrangements.map((a) => <div className="saved-arrangement" key={a.id}><strong>{a.name}</strong><small>{a.agents.length} agents</small><button disabled={busy} onClick={() => void run(async () => { const result = await api.loadArrangement(projectId, a.id); updateRoster(result.agents); setMessage(`${result.agents.length} independent agents added.`); })}>Load {a.name} as new agents</button></div>)}
      </details>
    </aside>
    <div className="studio-editor" onKeyDown={busy ? undefined : edits.onKeyDown}>
      <div className="undo-controls" role="group" aria-label="Agent form history"><button aria-label="Undo agent edit" disabled={busy || !edits.canUndo} onPointerDown={(event) => event.preventDefault()} onClick={edits.undo}>↶ Undo</button><button aria-label="Redo agent edit" disabled={busy || !edits.canRedo} onPointerDown={(event) => event.preventDefault()} onClick={edits.redo}>↷ Redo</button></div>
      {error && <p role="alert" className="tool-warning">{error}</p>}{message && <p role="status">{message}</p>}
      {revision === 'legacy' && <p className="tool-warning">Legacy scopes: {initial?.id === draft.id ? initial.context.scope.join(', ') : agents.find((a) => a.id === draft.id)?.context.scope.join(', ')}. Saving replaces legacy scopes with the assignments below and disables automatic consultation. No records are preselected.</p>}
      <fieldset disabled={busy}>
        <div className="tool-field-grid"><label>Agent name<input value={draft.name} maxLength={100} onChange={(e) => change({ ...draft, name: e.target.value })} /></label><label>Role<input value={draft.role} maxLength={200} onChange={(e) => change({ ...draft, role: e.target.value })} /></label></div>
        <label>Instructions<textarea rows={5} value={draft.instructions.system_prompt} maxLength={20000} onChange={(e) => change({ ...draft, instructions: { ...draft.instructions, system_prompt: e.target.value } })} /></label>
        <label>Goals — one per line<textarea rows={2} value={(draft.instructions.goals ?? []).join('\n')} onChange={(e) => change({ ...draft, instructions: { ...draft.instructions, goals: e.target.value.split('\n') } })} /></label>
        <details><summary>Model and budget</summary><div className="tool-field-grid"><label>Provider<select value={draft.model.provider} onChange={(e) => change({ ...draft, model: { ...draft.model, provider: e.target.value } })}>{['default', 'mock', 'anthropic', 'openai', 'google', 'xai', 'ollama'].map((p) => <option key={p}>{p}</option>)}</select></label><label>Model override<input value={draft.model.model ?? ''} onChange={(e) => change({ ...draft, model: { ...draft.model, model: e.target.value } })} /></label><label>Maximum response tokens<input type="number" min={100} max={16000} value={draft.budget.max_tokens} onChange={(e) => change({ ...draft, budget: { ...draft.budget, max_tokens: Number(e.target.value) } })} /></label></div></details>
        <h3>Knowledge · {assigned.length} assigned records</h3><p>Choose what this agent may read. Linked cards stay separate. Source passages depend on your question and the context budget.</p>
        {(Object.keys(RESOURCE_LABELS) as ResourceKind[]).map((kind) => <details key={kind}><summary>{RESOURCE_LABELS[kind]} · {policy.allow.find((r) => r.kind === kind)?.selection.mode ?? 'none'}</summary><ResourcePicker kind={kind} value={policy.allow.find((r) => r.kind === kind)?.selection} records={resources} onChange={(selection) => setRule('allow', kind, selection)} /><ResourcePicker kind={kind} labelPrefix="Exclude " value={policy.deny.find((r) => r.kind === kind)?.selection} records={resources} onChange={(selection) => setRule('deny', kind, selection)} /></details>)}
        <label className="check-row"><input type="checkbox" checked={policy.selection} onChange={(e) => change({ ...draft, access: { ...policy, selection: e.target.checked } })} />Include selected passage when its document is assigned</label>
        <label className="check-row"><input type="checkbox" checked={policy.proposeEdits} onChange={(e) => change({ ...draft, access: { ...policy, proposeEdits: e.target.checked } })} />Allow proposed edits to supplied document text</label>
        <p>Automatic consultation is off. Share exact excerpts from a conversation when you want another agent's input. Anything typed into a question is also shared with that agent.</p>
        <details><summary>Preview model context</summary><label>Question for source retrieval<input value={question} onChange={(e) => { setQuestion(e.target.value); setPreview(null); }} /></label><button onClick={() => void run(async () => setPreview((await api.previewAgent(projectId, draft, question)).context))}>Preview assigned context</button>
          {preview && <div className="context-preview"><p>{preview.summary.join(' · ')}</p>{preview.sections.map((section, i) => <pre key={i}>{section.body}</pre>)}</div>}
        </details>
      </fieldset>
      <div className="tool-actions"><button disabled={busy} className="btn-primary" onClick={() => void run(async () => { const { agent } = await api.saveAgent(projectId, draft, revision); updateRoster([agent]); edits.reset(); setDraft(editable(agent)); setRevision(agent.access!.revision); setDirty(false); setMessage('Agent saved with explicit assignments.'); })}>Save agent</button><button disabled={busy} onClick={() => select(draft, true)}>Duplicate agent</button><button disabled={busy || dirty || revision === null} onClick={() => { close(); useStore.getState().openPane('agent', { bindingId: draft.id }); }}>Open conversation</button><span>{dirty ? 'Unsaved edits' : 'Saved'}</span></div>
    </div>
  </div>;
}
