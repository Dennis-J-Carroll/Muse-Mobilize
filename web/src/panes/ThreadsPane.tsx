import { useEffect, useMemo, useState } from 'react';
import { splitMentions } from '../../../shared/threads';
import type { Thread, ThreadMessage } from '../../../shared/threads';
import { SESSION_START, useThreadPopover, useThreads } from '../threads';
import { canCombine, cardLabel, filterThreads } from '../threadView';
import type { BoardFilter } from '../threadView';
import { relativeTime } from '../threadView';
import { loadStoryRecords, sameTarget, storyRecords } from '../storyRecords';
import { useStore } from '../store';

const FILTERS: { key: BoardFilter; label: string }[] = [
  { key: 'session', label: 'This session' }, { key: 'open', label: 'Open' }, { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' }, { key: 'trash', label: 'Trash' },
];

export function ThreadsPane() {
  const threads = useThreads((state) => state.threads);
  const loaded = useThreads((state) => state.loaded);
  const busy = useThreads((state) => state.busy);
  const error = useThreads((state) => state.error);
  const projectId = useStore((state) => state.project?.id);
  const [filter, setFilter] = useState<BoardFilter>('session');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [recordsReady, setRecordsReady] = useState(false);

  useEffect(() => { void useThreads.getState().ensureLoaded(); void loadStoryRecords().then(() => setRecordsReady(true)); }, [projectId]);
  useEffect(() => { setPicked(new Set()); }, [filter, projectId]);

  const visible = useMemo(() => filterThreads(threads, filter, SESSION_START).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [threads, filter]);
  const chosen = visible.filter((thread) => picked.has(thread.id));
  const combine = canCombine(chosen);
  const records = recordsReady ? storyRecords() : [];
  const older = filter === 'session' ? filterThreads(threads, 'all', SESSION_START).length : 0;

  if (!loaded) return <div className="pane-body pane-loading">Gathering notes…</div>;
  return <div className="threads-board">
    <header className="story-toolbar">
      <div><span>Margin notes</span><h2>Notes Board</h2></div>
      <nav className="board-filters" aria-label="Filter notes">
        {FILTERS.map((item) => <button key={item.key} type="button" aria-pressed={filter === item.key} className={filter === item.key ? 'is-on' : ''} onClick={() => setFilter(item.key)}>{item.label}</button>)}
      </nav>
      <button type="button" className="btn btn-primary" disabled={!combine.ok || busy}
        title={combine.ok ? 'Merge the selected notes into one thread' : combine.reason}
        onClick={() => void useThreads.getState().merge(chosen.map((thread) => thread.id)).then((merged) => { if (merged) setPicked(new Set()); })}>
        Combine{chosen.length > 1 ? ` (${chosen.length})` : ''}
      </button>
    </header>
    {chosen.length > 1 && !combine.ok && <p className="board-hint" role="status">{combine.reason}</p>}
    {error && <p className="thread-failed" role="alert">{error}</p>}
    {visible.length === 0
      ? <div className="story-empty"><span>¶</span><h3>{filter === 'trash' ? 'Trash is empty.' : 'No notes here yet.'}</h3><p>Open any story card and use its notes button to leave a margin note, or ask @Muse.</p>
        {older > 0 && <p className="board-older">{older === 1 ? '1 older note' : `${older} older notes`} from before this session. <button type="button" className="linkish" onClick={() => setFilter('all')}>Show all notes</button></p>}</div>
      : <ul className="board-grid" aria-label="Notes">
          {visible.map((thread) => <NoteCard key={thread.id} thread={thread} card={recordsReady ? cardLabel(records, thread.target) : undefined}
            selected={picked.has(thread.id)} onSelect={(on) => setPicked((prev) => { const next = new Set(prev); if (on) next.add(thread.id); else next.delete(thread.id); return next; })} />)}
        </ul>}
  </div>;
}

function NoteCard({ thread, card, selected, onSelect }: { thread: Thread; card: { label: string; group: string } | null | undefined; selected: boolean; onSelect: (on: boolean) => void }) {
  const busy = useThreads((state) => state.busy);
  const [confirming, setConfirming] = useState(false);
  const trashed = Boolean(thread.trashedAt);
  const removed = card === null;
  const name = card?.label ?? (removed ? 'Card removed' : '…');

  async function jump() {
    await loadStoryRecords();
    const record = storyRecords().find((item) => sameTarget(item.target, thread.target));
    if (!record) return;
    record.open();
    requestAnimationFrame(() => useThreadPopover.getState().open(thread.target, thread.id));
  }

  return <li className={`board-note ${thread.status === 'resolved' ? 'is-resolved' : ''} ${trashed ? 'is-trashed' : ''} ${selected ? 'is-selected' : ''}`}>
    <header>
      <label className="board-pick"><input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`Select note on ${name}`} /></label>
      <div><b>{name}</b><small>{card ? card.group : removed ? 'no longer in this project' : ''} · {relativeTime(thread.updatedAt)}{thread.status === 'resolved' ? ' · resolved' : ''}</small></div>
    </header>
    <ul className="board-messages">{thread.messages.map((message) => <BoardMessage key={message.id} thread={thread} message={message} locked={trashed} />)}</ul>
    <footer>
      {!trashed && <button type="button" className="linkish" disabled={removed} onClick={() => void jump()}>Open card</button>}
      {!trashed && <button type="button" className="linkish" disabled={busy} onClick={() => void useThreads.getState().setStatus(thread.id, thread.status === 'open' ? 'resolved' : 'open')}>{thread.status === 'open' ? 'Resolve' : 'Reopen'}</button>}
      {!trashed && <button type="button" className="linkish" disabled={busy} onClick={() => void useThreads.getState().setTrashed(thread.id, true)}>Trash</button>}
      {trashed && <button type="button" className="linkish" disabled={busy} onClick={() => void useThreads.getState().setTrashed(thread.id, false)}>Restore</button>}
      {trashed && !confirming && <button type="button" className="linkish" onClick={() => setConfirming(true)}>Delete forever</button>}
      {trashed && confirming && <>
        <button type="button" className="linkish danger" disabled={busy} onClick={() => void useThreads.getState().deleteForever(thread.id)}>Confirm delete</button>
        <button type="button" className="linkish" onClick={() => setConfirming(false)}>Keep</button>
      </>}
    </footer>
  </li>;
}

function BoardMessage({ thread, message, locked }: { thread: Thread; message: ThreadMessage; locked: boolean }) {
  const busy = useThreads((state) => state.busy);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const mine = message.author.kind === 'user';
  if (editing) {
    return <li className="board-message is-editing">
      <textarea rows={3} value={draft} aria-label="Edit note" onChange={(event) => setDraft(event.target.value)} />
      <span>
        <button type="button" className="btn btn-primary" disabled={busy || !draft.trim()}
          onClick={() => void useThreads.getState().editMessage(thread.id, message.id, draft).then((saved) => { if (saved) setEditing(false); })}>Save</button>
        <button type="button" className="btn" onClick={() => { setDraft(message.text); setEditing(false); }}>Cancel</button>
      </span>
    </li>;
  }
  return <li className={`board-message ${mine ? 'is-user' : 'is-muse'}`}>
    <b>{mine ? 'You' : 'Muse'}</b>
    {message.state === 'pending' ? <em>Muse is thinking…</em>
      : message.state === 'failed' ? <em className="thread-failed">Muse couldn’t reply: {message.text}</em>
      : <p>{splitMentions(message.text).map((part, index) => part.mention ? <mark key={index} className="thread-mention">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p>}
    {mine && !locked && <button type="button" className="linkish" onClick={() => { setDraft(message.text); setEditing(true); }}>Edit</button>}
  </li>;
}
