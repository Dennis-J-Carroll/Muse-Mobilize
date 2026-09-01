import { useState } from 'react';
import { useStore } from '../store';
import { PatchCard } from '../components/PatchCard';
import type { AgentRun, Pane } from '../types';

// A fresh [] from a selector makes useSyncExternalStore re-render forever.
const NO_RUNS: AgentRun[] = [];
import * as Icon from '../components/icons';

function StateChip({ agentId }: { agentId: string }) {
  const agent = useStore((s) => s.agents.find((a) => a.id === agentId));
  const cycle = useStore((s) => s.cycleAgentState);
  if (!agent) return null;
  const mode = agent.state?.mode ?? 'idle';
  return (
    <button
      className={`state-chip state-${mode}`}
      onClick={() => void cycle(agentId)}
      title="Open is not the same as active. Click to cycle idle → live → frozen."
    >
      <i /> {mode}
    </button>
  );
}

function Consultation({ c }: { c: AgentRun['consultations'][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="consult">
      <button className="consult-head" onClick={() => setOpen((o) => !o)}>
        <span className="consult-line">
          <b>{c.from}</b> <Icon.Arrow size={14} /> <b>{c.to}</b>
          <em>consulted</em>
          <span className="consult-ms">{c.ms}ms</span>
        </span>
      </button>
      <div className="consult-q">{c.question}</div>
      {open && <div className="consult-a">{c.error ? <em className="err">{c.error}</em> : c.answer}</div>}
      {!open && <button className="linkish" onClick={() => setOpen(true)}>show reply</button>}
    </div>
  );
}

function RunView({ run }: { run: AgentRun }) {
  return (
    <div className="run">
      <div className="run-q">{run.question}</div>
      <div className="run-meta">
        {run.contextSummary.map((c, i) => (
          <span key={i} className="ctx-chip">{c}</span>
        ))}
        <span className="ctx-chip ctx-model">{run.provider}{run.model ? ` · ${run.model}` : ''}</span>
        <span className="ctx-chip">{run.ms}ms</span>
      </div>
      {run.consultations.map((c) => (
        <Consultation key={c.id} c={c} />
      ))}
      {run.error ? <div className="run-error">{run.error}</div> : <div className="run-text">{run.text}</div>}
      {run.patches.map((p) => (
        <PatchCard key={p.id} patch={p} agentId={run.agentId} />
      ))}
    </div>
  );
}

export function AgentPane({ pane }: { pane: Pane }) {
  const agentId = pane.binding?.id ?? '';
  const agent = useStore((s) => s.agents.find((a) => a.id === agentId));
  const runs = useStore((s) => s.runs[agentId]) ?? NO_RUNS;
  const busy = useStore((s) => s.busy[agentId]);
  const selection = useStore((s) => s.selection);
  const [q, setQ] = useState('');
  const [useSel, setUseSel] = useState(true);

  if (!agent) return <div className="pane-body pane-loading">Agent not found.</div>;

  const send = () => {
    const question = q.trim() || 'Read this passage and tell me what you see.';
    setQ('');
    void useStore.getState().ask(agentId, question, useSel && Boolean(selection));
  };

  return (
    <div className="agent-pane">
      <div className="agent-head">
        <div>
          <div className="agent-role">{agent.role}</div>
          {agent.blurb && <div className="agent-blurb">{agent.blurb}</div>}
        </div>
        <StateChip agentId={agentId} />
      </div>

      <div className="agent-scope">
        sees: {agent.context?.scope?.join(' · ') || 'nothing yet'}
        {agent.context?.forbidden?.length ? ` · withheld: ${agent.context.forbidden.join(', ')}` : ''}
      </div>

      <div className="agent-scroll">
        {runs.length === 0 && !busy && (
          <div className="agent-empty">
            Highlight a passage in the draft, or just ask {agent.name} something.
          </div>
        )}
        {runs.map((r) => (
          <RunView key={r.runId} run={r} />
        ))}
        {busy && (
          <div className="run thinking">
            <span className="dot" /> <span className="dot" /> <span className="dot" />
            <span className="thinking-label">{agent.name} is working…</span>
          </div>
        )}
      </div>

      <div className="agent-compose">
        <label className={`sel-toggle ${selection ? '' : 'is-off'}`}>
          <input type="checkbox" checked={useSel && Boolean(selection)} disabled={!selection} onChange={(e) => setUseSel(e.target.checked)} />
          attach selection{selection ? ` (${selection.text.split(/\s+/).filter(Boolean).length}w)` : ''}
        </label>
        <div className="compose-row">
          <textarea
            rows={2}
            value={q}
            placeholder={`Ask ${agent.name}…`}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
          />
          <button className="btn btn-primary" disabled={busy} onClick={send}>
            {busy ? '…' : 'Ask'}
          </button>
        </div>
      </div>
    </div>
  );
}
