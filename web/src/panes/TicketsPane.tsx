import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { TICKET_STATUSES, TICKET_STATUS_LABELS, type Ticket, type TicketStatus } from '../../../shared/tickets';
import { attachReturn, canShareFiles, createTicket, deleteTicket, detachReturn, exportTicket, loadTickets, updateTicket, useTickets } from '../tickets';
import { workOnTicket } from '../conversationFocus';

const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);
const RETURN_TYPES = '.pdf,.docx,.md,.markdown,.txt';

/** Tickets: assignments that carry a story thread out to the notebook and back. */
export function TicketsPane() {
  const projectId = useStore((s) => s.project?.id);
  const { tickets, loading, projectId: loadedFor } = useTickets();
  const [filter, setFilter] = useState<TicketStatus | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => { if (projectId && loadedFor !== projectId) void loadTickets(); }, [projectId, loadedFor]);

  const shown = useMemo(() => tickets.filter((t) => filter === 'all' ? t.status !== 'closed' : t.status === filter)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [tickets, filter]);
  const counts = useMemo(() => Object.fromEntries(TICKET_STATUSES.map((status) => [status, tickets.filter((t) => t.status === status).length])), [tickets]);
  const open = tickets.find((t) => t.id === openId) ?? null;

  if (open) return <TicketEditor key={open.id} ticket={open} onBack={() => setOpenId(null)} />;

  return (
    <div className="tickets-workspace">
      <header className="tickets-head">
        <h2>Tickets</h2>
        <p>Assignments you take away and bring back. Muse can suggest them; only you save them.</p>
        <button className="btn btn-primary" onClick={() => setComposing(true)}>+ New ticket</button>
      </header>
      {composing && <NewTicket onDone={(ticket) => { setComposing(false); if (ticket) setOpenId(ticket.id); }} />}
      <div className="tickets-filter" role="group" aria-label="Filter tickets by status">
        <button className={filter === 'all' ? 'is-on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Active</button>
        {TICKET_STATUSES.map((status) => (
          <button key={status} className={filter === status ? 'is-on' : ''} aria-pressed={filter === status} onClick={() => setFilter(status)}>
            {TICKET_STATUS_LABELS[status]} <small>{counts[status]}</small>
          </button>
        ))}
      </div>
      {loading && !tickets.length ? <p className="tickets-empty">Loading…</p> : shown.length === 0 ? (
        <p className="tickets-empty">{tickets.length ? 'No tickets here.' : 'No tickets yet. Write one yourself, or attach a source to Muse and accept one of its suggestions.'}</p>
      ) : (
        <ul className="tickets-list" aria-label="Tickets">
          {shown.map((ticket) => (
            <li key={ticket.id}>
              <button className="ticket-row" onClick={() => setOpenId(ticket.id)}>
                <span className={`ticket-status status-${ticket.status}`}>{TICKET_STATUS_LABELS[ticket.status]}</span>
                <strong>{ticket.title}</strong>
                <small>{[ticket.origin === 'muse' ? 'Suggested by Muse' : null, ticket.returns.length ? `${ticket.returns.length} returned` : null, ticket.threads.length ? `${ticket.threads.length} thread${ticket.threads.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewTicket({ onDone }: { onDone: (ticket: Ticket | null) => void }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="ticket-new" onSubmit={async (event) => {
      event.preventDefault();
      if (!title.trim()) return;
      setBusy(true);
      onDone(await createTicket({ title: title.trim(), origin: 'writer' }));
    }}>
      <label>Assignment<input autoFocus value={title} maxLength={200} placeholder="Explore the Omorrii lore and Saras’s connection to it" onChange={(e) => setTitle(e.target.value)} /></label>
      <button className="btn btn-primary" disabled={busy || !title.trim()}>Create</button>
      <button type="button" className="btn" disabled={busy} onClick={() => onDone(null)}>Cancel</button>
    </form>
  );
}

function TicketEditor({ ticket, onBack }: { ticket: Ticket; onBack: () => void }) {
  const [title, setTitle] = useState(ticket.title);
  const [wants, setWants] = useState(ticket.wants);
  const [threads, setThreads] = useState(ticket.threads.join('\n'));
  const [questions, setQuestions] = useState(ticket.questions.join('\n'));
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<'markdown' | 'docx' | 'txt'>('markdown');
  const file = useRef<HTMLInputElement>(null);
  const shareable = useMemo(canShareFiles, []);
  const dirty = title !== ticket.title || wants !== ticket.wants || threads !== ticket.threads.join('\n') || questions !== ticket.questions.join('\n');

  const run = async (work: () => Promise<unknown>) => { setBusy(true); try { await work(); } finally { setBusy(false); } };
  const save = () => run(() => updateTicket(ticket.id, { title: title.trim(), wants, threads: lines(threads), questions: lines(questions) }));
  const saveFirst = async () => { if (dirty) await updateTicket(ticket.id, { title: title.trim(), wants, threads: lines(threads), questions: lines(questions) }); };

  return (
    <div className="tickets-workspace ticket-editor">
      <header className="tickets-head">
        <button className="linkish" onClick={onBack}>← All tickets</button>
        <span className={`ticket-status status-${ticket.status}`}>{TICKET_STATUS_LABELS[ticket.status]}</span>
        {ticket.origin === 'muse' && <small>Suggested by Muse, accepted by you</small>}
      </header>
      <fieldset disabled={busy}>
        <label>Assignment<input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Current wants<textarea rows={3} value={wants} onChange={(e) => setWants(e.target.value)} /></label>
        <label>Current threads <small>one per line</small><textarea rows={4} value={threads} onChange={(e) => setThreads(e.target.value)} /></label>
        <label>Questions to start from <small>one per line</small><textarea rows={3} value={questions} onChange={(e) => setQuestions(e.target.value)} /></label>
        <div className="ticket-actions">
          <button className="btn btn-primary" disabled={!dirty || !title.trim()} onClick={() => void save()}>Save ticket</button>
          <button className="btn" onClick={() => void run(async () => { await saveFirst(); workOnTicket({ id: ticket.id, title: title.trim() || ticket.title }); })}>Work on with Muse</button>
        </div>
      </fieldset>

      {ticket.sourceRefs.length > 0 && <section className="ticket-section" aria-label="From the source">
        <h3>From the source</h3>
        {ticket.sourceRefs.map((ref, index) => <blockquote key={index}>{ref.quote}<cite>{ref.title}{ref.section ? ` — ${ref.section}` : ''}</cite></blockquote>)}
      </section>}

      <section className="ticket-section" aria-label="Take it away">
        <h3>Take it away</h3>
        <p>Export marks the ticket Out.{shareable ? ' Share opens your device’s share sheet (LocalSend, Drive).' : ''}</p>
        <div className="ticket-actions">
          <label className="ticket-format">Format<select aria-label="Export format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            <option value="markdown">Markdown (.md)</option><option value="docx">Word (.docx)</option><option value="txt">Plain text (.txt)</option>
          </select></label>
          <button className="btn" disabled={busy} onClick={() => void run(async () => { await saveFirst(); await exportTicket(ticket, format); })}>Export</button>
          {shareable && <button className="btn" disabled={busy} onClick={() => void run(async () => { await saveFirst(); await exportTicket(ticket, format, true); })}>Share…</button>}
        </div>
      </section>

      <section className="ticket-section" aria-label="Bring it back">
        <h3>Bring it back</h3>
        <p>Attach what you made — PDF, Word, Markdown or text. It is added to Sources and linked here.</p>
        <input ref={file} type="file" accept={RETURN_TYPES} hidden aria-label="Choose returned file" onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = '';
          if (chosen) void run(() => attachReturn(ticket, chosen));
        }} />
        <button className="btn" disabled={busy} onClick={() => file.current?.click()}>Attach returned file…</button>
        {ticket.returns.length > 0 && <ul className="ticket-returns" aria-label="Returned files">
          {ticket.returns.map((r) => <li key={r.sourceId}><span>{r.title}</span><small>{new Date(r.attachedAt).toLocaleDateString()}</small>
            <button className="linkish" disabled={busy} onClick={() => void run(() => detachReturn(ticket, r.sourceId))} aria-label={`Unlink ${r.title}`}>Unlink</button></li>)}
        </ul>}
      </section>

      {ticket.log.length > 0 && <details className="ticket-section ticket-log">
        <summary>Muse on this ticket ({ticket.log.length})</summary>
        {ticket.log.slice().reverse().map((entry) => <div key={entry.at}><p className="ticket-log-q">{entry.question}</p><p>{entry.answer}</p></div>)}
      </details>}

      <footer className="ticket-footer">
        <label className="ticket-format">Status<select aria-label="Ticket status" value={ticket.status} disabled={busy} onChange={(e) => void run(() => updateTicket(ticket.id, { status: e.target.value as TicketStatus }))}>
          {TICKET_STATUSES.map((status) => <option key={status} value={status}>{TICKET_STATUS_LABELS[status]}</option>)}
        </select></label>
        <button className="linkish ticket-delete" disabled={busy} onClick={() => {
          if (!window.confirm(`Delete the ticket “${ticket.title}”? Returned files stay in Sources.`)) return;
          void run(async () => { await deleteTicket(ticket.id); onBack(); });
        }}>Delete ticket…</button>
      </footer>
    </div>
  );
}
