import { useState } from 'react';
import { useStore } from '../store';
import { PatchCard } from '../components/PatchCard';
import type { AgentRun, Pane } from '../types';
import { openProjectTool } from '../components/ProjectTools';
import { AgentReply, CopyReply } from '../components/AgentReply';
import { ReplyPlacement } from '../components/ReplyPlacement';
import { openConversation } from '../conversationView';
import { CARD_EXCERPT_MAX, useCardDiscussion } from '../cardDiscussion';
import { askFocus, detachSource, detachTicket, RIPE_THREADS_QUESTION, TICKET_QUESTION, useConversationFocus } from '../conversationFocus';
import { createTicket, suggestionDraft } from '../tickets';
import type { TicketSuggestion } from '../../../shared/tickets';
import type { SettingsView } from '../types';

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
      {open && <div className="consult-a">{c.error ? <em className="err">{c.error}</em> : <AgentReply text={c.answer} />}</div>}
      {!open && <button className="linkish" onClick={() => setOpen(true)}>show reply</button>}
    </div>
  );
}

function RunView({ run }: { run: AgentRun }) {
  const openSource = (sourceId: string) => {
    useStore.getState().openPane('sources', { title: 'Sources', region: 'main', focus: true });
    useStore.setState({ sceneFocusId: null });
    window.dispatchEvent(new CustomEvent('muse:open-source', { detail: { sourceId } }));
  };
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
      {run.error ? <div className="run-error">{run.error}</div> : <div className="run-text"><AgentReply text={run.text} /></div>}
      {run.sourceCitations?.length ? (
        <div className="source-citations">
          <span className="source-citations-title">Sources used</span>
          {run.sourceCitations.map((citation) => (
            <button key={citation.chunkId} className="source-citation" onClick={() => openSource(citation.sourceId)}
              title={`${citation.title} — ${citation.location.heading ? `${citation.location.heading}, ` : ''}${citation.location.page ? `page ${citation.location.page}` : 'passage'}`}>
              <b>{citation.title}</b>
              <em>{[citation.location.heading, citation.location.page ? `page ${citation.location.page}` : null].filter(Boolean).join(' · ') || 'passage'}</em>
              <span>{citation.snippet}</span>
            </button>
          ))}
        </div>
      ) : null}
      {run.patches.map((p) => (
        <PatchCard key={p.id} patch={p} agentId={run.agentId} />
      ))}
      {run.ticketSuggestions?.map((suggestion, index) => <SuggestedTicket key={`${run.runId}-${index}`} suggestion={suggestion} />)}
      {!run.error && run.text && <><CopyReply text={run.text} /><ReplyPlacement text={run.text} /><ShareAdvice run={run} /></>}
      {run.contextReceipt && <details className="share-advice"><summary>Context receipt</summary><p>Policy revision: {run.contextReceipt.policyRevision}</p><p>{run.contextReceipt.records.map((r) => `${r.kind}: ${r.id}${r.trimmed ? ' (trimmed)' : ''}`).join(' · ') || 'No saved records sent'}</p>{run.contextReceipt.sharedExcerpt && <p>Writer shared an excerpt for this run.</p>}</details>}
    </div>
  );
}

/** Muse proposes; nothing is saved until the writer accepts (optionally after editing) or dismisses. */
function SuggestedTicket({ suggestion }: { suggestion: TicketSuggestion }) {
  const source = useConversationFocus((s) => s.source);
  const [state, setState] = useState<'shown' | 'editing' | 'saving' | 'accepted' | 'dismissed'>('shown');
  const [title, setTitle] = useState(suggestion.title);
  const [wants, setWants] = useState(suggestion.wants);
  if (state === 'dismissed') return null;
  if (state === 'accepted') return <p className="ticket-suggestion-done" role="status">Ticket saved: {title}. Find it in Tickets.</p>;
  const accept = async () => {
    setState('saving');
    const ticket = await createTicket({ ...suggestionDraft(suggestion, source), title: title.trim() || suggestion.title, wants });
    setState(ticket ? 'accepted' : 'shown');
  };
  return (
    <section className="ticket-suggestion" aria-label={`Suggested ticket: ${suggestion.title}`}>
      <span className="ticket-suggestion-kicker">Suggested ticket · not saved</span>
      {state === 'editing' ? (
        <>
          <label>Assignment<input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>Current wants<textarea rows={2} value={wants} onChange={(e) => setWants(e.target.value)} /></label>
        </>
      ) : (
        <>
          <strong>{title}</strong>
          {wants && <p>{wants}</p>}
        </>
      )}
      {suggestion.threads.length > 0 && <ul>{suggestion.threads.map((thread) => <li key={thread}>{thread}</li>)}</ul>}
      {suggestion.quotes.map((q) => <blockquote key={q.quote}>{q.quote}{q.section && <cite>{q.section}</cite>}</blockquote>)}
      {suggestion.questions.length > 0 && <ul className="ticket-suggestion-questions">{suggestion.questions.map((question) => <li key={question}>{question}</li>)}</ul>}
      <div className="ticket-suggestion-actions">
        <button className="btn btn-primary" disabled={state === 'saving' || !title.trim()} onClick={() => void accept()}>{state === 'editing' ? 'Save ticket' : 'Accept'}</button>
        {state !== 'editing' && <button className="btn" disabled={state === 'saving'} onClick={() => setState('editing')}>Edit</button>}
        <button className="btn" disabled={state === 'saving'} onClick={() => setState('dismissed')}>Dismiss</button>
      </div>
    </section>
  );
}

function providerLabel(provider: string | undefined, model: string | undefined, settings: SettingsView | null) {
  const id = !provider || provider === 'default' ? settings?.defaultProvider ?? 'your default provider' : provider;
  const fallback = settings ? (settings as unknown as Record<string, string | undefined>)[`${id}Model`] : undefined;
  return `${id}${model || fallback ? ` · ${model || fallback}` : ''}`;
}

function ShareAdvice({ run }: { run: AgentRun }) {
  const agents = useStore((s) => s.agents);
  const busy = useStore((s) => s.busy);
  const [target, setTarget] = useState('');
  const [excerpt, setExcerpt] = useState(run.text.slice(0, 12000));
  return <details className="share-advice"><summary>Share advice with another agent</summary><p>Only the excerpt below is shared, for one run. Edit it to choose what the other agent learns.</p><label>Recipient<select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose agent</option>{agents.filter((a) => a.id !== run.agentId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Excerpt to share<textarea rows={5} maxLength={12000} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} /></label><button disabled={!target || !excerpt.trim() || busy[target]} onClick={() => { void useStore.getState().ask(target, `Consider this advice from ${run.agentName} and give your own view.`, false, excerpt); openConversation(target); }}>Share excerpt and ask</button></details>;
}

export function AgentPane({ pane }: { pane: Pane }) {
  const agentId = pane.binding?.id ?? '';
  const agent = useStore((s) => s.agents.find((a) => a.id === agentId));
  const runs = useStore((s) => s.runs[agentId]) ?? NO_RUNS;
  const busy = useStore((s) => s.busy[agentId]);
  const selection = useStore((s) => s.selection);
  const [q, setQ] = useState('');
  const [useSel, setUseSel] = useState(true);
  const pending = useCardDiscussion(s => s.current);
  const projectId = useStore(s => s.project?.id);
  const attachment = pending && pending.projectId === projectId && pending.agentId === agentId ? pending : null;
  const focusState = useConversationFocus();
  const settings = useStore((s) => s.settings);
  const focus = focusState.projectId === projectId && focusState.agentId === agentId && (focusState.source || focusState.ticket)
    ? { source: focusState.source, ticket: focusState.ticket } : null;

  if (!agent) return <div className="pane-body pane-loading">Agent not found.</div>;

  const send = async () => {
    if (busy || (attachment && !attachment.text.trim())) return;
    const question = q.trim() || (attachment ? 'Help me develop this card. Distinguish what is on the card from your suggestions.'
      : focus?.ticket ? TICKET_QUESTION : focus?.source ? RIPE_THREADS_QUESTION : 'Read this passage and tell me what you see.');
    const sent = await useStore.getState().ask(agentId, question, !attachment && !focus && useSel && Boolean(selection), attachment?.text,
      focus ? askFocus(focus, useStore.getState().runs[agentId] ?? []) : undefined);
    if (!sent || useStore.getState().project?.id !== projectId) return;
    setQ(current => current === q ? '' : current);
    if (attachment && useCardDiscussion.getState().current?.id === attachment.id) useCardDiscussion.setState({ current: null });
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
        {agent.access ? 'Explicit assignments · automatic consultation off' : `Legacy scopes: ${agent.context?.scope?.join(' · ') || 'nothing yet'}`}
        {!agent.access && agent.context?.forbidden?.length ? ` · withheld: ${agent.context.forbidden.join(', ')}` : ''}
        <button className="linkish" onClick={() => openProjectTool('agents', agentId)}>Configure in Agent Studio</button>
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
        {focus && <section className="conversation-focus" aria-label="Attached to this conversation">
          {focus.source && <div className="focus-chip">
            <span><b>Source:</b> {focus.source.title}</span>
            <small>Whole document sent to {providerLabel(agent.model?.provider, agent.model?.model, settings)} with each question</small>
            <button type="button" className="linkish" disabled={busy} onClick={detachSource} aria-label={`Remove source ${focus.source.title}`}>Remove</button>
          </div>}
          {focus.ticket && <div className="focus-chip">
            <span><b>Ticket:</b> {focus.ticket.title}</span>
            <small>Ticket, its returned files and its recent Muse exchanges are sent</small>
            <button type="button" className="linkish" disabled={busy} onClick={detachTicket} aria-label={`Remove ticket ${focus.ticket.title}`}>Remove</button>
          </div>}
          {!q.trim() && <p className="focus-hint">Press Ask with an empty box to {focus.ticket ? 'work on the ticket' : 'find ripe threads'}.</p>}
        </section>}
        {attachment && <section className="card-discussion" aria-label="Card to discuss">
          <div><strong>{attachment.title}</strong><button type="button" className="linkish" disabled={busy} onClick={() => useCardDiscussion.setState({ current: null })}>Remove attachment</button></div>
          <p>Review this snapshot before sending. Shared for this question alongside Muse’s usual context. Linked records and images are excluded.</p>
          {attachment.trimmed && <p role="status">Long card: first 12,000 characters included. Edit to choose what matters.</p>}
          <label>Card excerpt to share<textarea rows={4} maxLength={CARD_EXCERPT_MAX} value={attachment.text} disabled={busy} onChange={event => useCardDiscussion.setState({ current: { ...attachment, text: event.target.value } })} /></label>
        </section>}
        {!attachment && !focus &&
        <label className={`sel-toggle ${selection ? '' : 'is-off'}`}>
          <input type="checkbox" checked={useSel && Boolean(selection)} disabled={!selection} onChange={(e) => setUseSel(e.target.checked)} />
          attach selection{selection ? ` (${selection.text.split(/\s+/).filter(Boolean).length}w)` : ''}{agent.access ? ' · assignments apply' : ''}
        </label>}
        <div className="compose-row">
          <textarea
            rows={2}
            aria-label={`Ask ${agent.name}`}
            value={q}
            placeholder={`Ask ${agent.name}…`}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
            }}
          />
          <button className="btn btn-primary" disabled={busy || Boolean(attachment && !attachment.text.trim())} onClick={() => void send()}>
            {busy ? '…' : 'Ask'}
          </button>
        </div>
      </div>
    </div>
  );
}
