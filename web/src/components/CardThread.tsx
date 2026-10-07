import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ConnectionTarget } from '../../../shared/connections';
import { THREAD_TEXT_MAX, sameTarget, splitMentions } from '../../../shared/threads';
import type { Thread, ThreadMessage } from '../../../shared/threads';
import { useStore } from '../store';
import { useThreadPopover, useThreads } from '../threads';
import { cardLabel, placePopover, relativeTime, threadsForTarget } from '../threadView';
import { loadStoryRecords, storyRecords } from '../storyRecords';
import { targetForEditor } from '../connectionsView';
import { ThreadChips } from './ThreadChips';

export function CardThreadHost() {
  const target = useThreadPopover((state) => state.target);
  const threadId = useThreadPopover((state) => state.threadId);
  const projectId = useStore((state) => state.project?.id);
  useEffect(() => { useThreadPopover.getState().close(); }, [projectId]);
  return target ? createPortal(<ThreadPopover key={`${target.kind}:${target.id}`} target={target} initialThreadId={threadId} />, document.body) : null;
}

function MessageText({ text }: { text: string }) {
  return <>{splitMentions(text).map((part, index) => part.mention ? <mark key={index} className="thread-mention">{part.text}</mark> : <span key={index}>{part.text}</span>)}</>;
}

function Bubble({ message, thread }: { message: ThreadMessage; thread: Thread }) {
  const agents = useStore((state) => state.agents);
  const busy = useThreads((state) => state.busy);
  const mine = message.author.kind === 'user';
  const name = mine ? 'You' : agents.find((agent) => agent.id === (message.author as { agentId: string }).agentId)?.name ?? 'Muse';
  return <li className={`thread-message ${mine ? 'is-user' : 'is-muse'}`}>
    <header><span className="thread-avatar" aria-hidden="true">{name[0]}</span><b>{name}</b><time dateTime={message.createdAt}>{relativeTime(message.createdAt)}{message.editedAt ? ' · edited' : ''}</time></header>
    {message.state === 'failed' ? <p className="thread-failed" role="alert">Muse couldn’t reply: {message.text}{' '}
          <button type="button" className="linkish" disabled={busy} onClick={() => void useThreads.getState().retry(thread.id, message.id)}>Retry</button></p>
      : <p><MessageText text={message.text} /></p>}
  </li>;
}

function ThreadPopover({ target, initialThreadId }: { target: ConnectionTarget; initialThreadId: string | null }) {
  const all = useThreads((state) => state.threads);
  const busy = useThreads((state) => state.busy);
  const error = useThreads((state) => state.error);
  const thinking = useThreads((state) => state.thinking);
  const panels = useStore((state) => state.floatingPanels);
  const mine = useMemo(() => threadsForTarget(all, target), [all, target]);
  const [selected, setSelected] = useState<string | null>(initialThreadId);
  const [composingNew, setComposingNew] = useState(false);
  const [text, setText] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const [label, setLabel] = useState('this card');

  useEffect(() => {
    void useThreads.getState().ensureLoaded();
    void loadStoryRecords().then(() => setLabel(cardLabel(storyRecords(), target)?.label ?? 'a removed card'));
    input.current?.focus();
  }, [target]);

  const thread = composingNew ? null : mine.find((item) => item.id === selected) ?? mine[0] ?? null;
  const position = mine.findIndex((item) => item.id === thread?.id);
  const panel = panels.find((item) => !item.docked && sameTarget(target, targetForEditor(item.id) ?? undefined));
  useEffect(() => {
    const element = panel ? document.getElementById(`floating-${panel.id}`) : null;
    element?.classList.add('thread-open');
    return () => element?.classList.remove('thread-open');
  }, [panel?.id]);
  const rect = panel ? document.getElementById(`floating-${panel.id}`)?.getBoundingClientRect() : undefined;
  const place = rect ? placePopover(rect, window.innerWidth, window.innerHeight) : null;

  // Escape closes the thread first. Capture phase, so app-level Escape handlers cannot pre-empt it
  // when focus is on the page or in the thread.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      // Another dialog (a card form, Settings, Connections...) owns Escape while focus is inside it.
      const owner = (event.target as Element | null)?.closest?.('[role="dialog"]');
      if (owner && !owner.classList.contains('thread-popover')) return;
      event.preventDefault();
      event.stopPropagation();
      useThreadPopover.getState().close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    const result = thread ? await useThreads.getState().reply(thread.id, body) : await useThreads.getState().create(target, body);
    if (result) { setText(''); setSelected(result.id); setComposingNew(false); }
    // The composer is disabled while a request runs, which drops focus; put it back.
    requestAnimationFrame(() => input.current?.focus());
  }

  return <div className="thread-popover" role="dialog" aria-label={`Notes on ${label}`} style={place ? { left: place.left, top: place.top } : undefined}>
    <header className="thread-head">
      <b>Notes on {label}</b>
      {mine.length > 1 && !composingNew && <span className="thread-switch">
        <button type="button" aria-label="Previous note" disabled={position <= 0} onClick={() => setSelected(mine[position - 1].id)}>‹</button>
        <span>{position + 1}/{mine.length}</span>
        <button type="button" aria-label="Next note" disabled={position >= mine.length - 1} onClick={() => setSelected(mine[position + 1].id)}>›</button>
      </span>}
      {thread && <button type="button" className="thread-resolve" disabled={busy} aria-label={thread.status === 'open' ? 'Resolve note' : 'Reopen note'} title={thread.status === 'open' ? 'Resolve' : 'Reopen'}
        onClick={() => void useThreads.getState().setStatus(thread.id, thread.status === 'open' ? 'resolved' : 'open')}>{thread.status === 'open' ? '✓' : '↺'}</button>}
      {thread && <button type="button" aria-label="New note" title="New note" onClick={() => { setComposingNew(true); input.current?.focus(); }}>＋</button>}
      <button type="button" aria-label="Close notes" onClick={() => useThreadPopover.getState().close()}>×</button>
    </header>
    {thread?.status === 'resolved' && <p className="thread-resolved">Resolved</p>}
    {thread && <ThreadChips thread={thread} />}
    <ul className="thread-messages" aria-live="polite">
      {thread ? thread.messages.map((message) => <Bubble key={message.id} message={message} thread={thread} />)
        : !thinking && <li className="thread-empty">{composingNew ? 'Start a new note below.' : 'No notes yet. Write one, or start with @Muse to ask.'}</li>}
      {thinking && <li className="thread-message is-muse"><p className="thread-pending" role="status">Muse is thinking…</p></li>}
    </ul>
    {error && <p className="thread-failed" role="alert">{error}</p>}
    <form className="thread-compose" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <textarea ref={input} rows={2} aria-label="Add a note or ask Muse" placeholder="Add a note, or @Muse to ask…" value={text} maxLength={THREAD_TEXT_MAX} disabled={busy}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
      <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>Send</button>
    </form>
  </div>;
}
