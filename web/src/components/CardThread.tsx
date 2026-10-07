import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ConnectionTarget } from '../../../shared/connections';
import { THREAD_TEXT_MAX, resolveThreadAnchors, sameTarget, splitMentions } from '../../../shared/threads';
import type { Thread, ThreadMessage } from '../../../shared/threads';
import { useStore } from '../store';
import { useThreadPopover, useThreads } from '../threads';
import { anchorStatusText, cardLabel, placePopover, relativeTime, threadsForTarget } from '../threadView';
import { revealThreadPassage } from '../openNote';
import { loadStoryRecords, storyRecords } from '../storyRecords';
import { targetForEditor } from '../connectionsView';
import { ThreadChips } from './ThreadChips';

export function CardThreadHost() {
  const target = useThreadPopover((state) => state.target);
  const threadId = useThreadPopover((state) => state.threadId);
  const range = useThreadPopover((state) => state.range);
  const nonce = useThreadPopover((state) => state.nonce);
  const projectId = useStore((state) => state.project?.id);
  useEffect(() => { useThreadPopover.getState().close(); }, [projectId]);
  return target ? createPortal(<ThreadPopover key={`${target.kind}:${target.id}:${nonce}`} target={target} initialThreadId={threadId} range={range} />, document.body) : null;
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

function ThreadPopover({ target, initialThreadId, range }: { target: ConnectionTarget; initialThreadId: string | null; range: { start: number; end: number; quote: string } | null }) {
  const all = useThreads((state) => state.threads);
  const busy = useThreads((state) => state.busy);
  const error = useThreads((state) => state.error);
  const thinking = useThreads((state) => state.thinking);
  const panels = useStore((state) => state.floatingPanels);
  const isDoc = target.kind === 'document';
  const doc = useStore((state) => state.docs[target.id]);
  const mine = useMemo(() => threadsForTarget(all, target), [all, target]);
  const passageThreads = useMemo(() => (isDoc ? threadsForTarget(all, target, { anchored: true }) : []), [all, target, isDoc]);
  const wholeThreads = useMemo(() => (isDoc ? threadsForTarget(all, target, { anchored: false }) : mine), [all, target, isDoc, mine]);
  const anchorStates = useMemo(() => (isDoc && doc ? resolveThreadAnchors(doc.content, passageThreads) : []), [isDoc, doc?.content, passageThreads]);
  const statusOf = (id: string) => anchorStates.find((state) => state.threadId === id)?.status;
  const [selected, setSelected] = useState<string | null>(initialThreadId);
  const [composingNew, setComposingNew] = useState(Boolean(range));
  const [pendingRange, setPendingRange] = useState(range);
  const [text, setText] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const [label, setLabel] = useState('this card');

  useEffect(() => {
    void useThreads.getState().ensureLoaded();
    void loadStoryRecords().then(() => setLabel(cardLabel(storyRecords(), target)?.label ?? 'a removed card'));
    if (isDoc) void useStore.getState().loadDoc(target.id);
    input.current?.focus();
  }, [target, isDoc]);

  const thread = composingNew ? null : mine.find((item) => item.id === selected) ?? wholeThreads[0] ?? null;
  const group = thread?.anchor ? [] : wholeThreads;
  const position = group.findIndex((item) => item.id === thread?.id);
  const quote = thread?.anchor?.quote ?? (composingNew ? pendingRange?.quote : undefined);
  const threadStatus = thread?.anchor ? statusOf(thread.id) : undefined;
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
    const result = thread ? await useThreads.getState().reply(thread.id, body) : await useThreads.getState().create(target, body, pendingRange ? { range: pendingRange } : undefined);
    if (result) { setText(''); setSelected(result.id); setComposingNew(false); setPendingRange(null); }
    // The composer is disabled while a request runs, which drops focus; put it back.
    requestAnimationFrame(() => input.current?.focus());
  }

  return <div className="thread-popover" role="dialog" aria-label={`Notes on ${label}`} style={place ? { left: place.left, top: place.top } : undefined}>
    <header className="thread-head">
      <b>Notes on {label}</b>
      {group.length > 1 && !composingNew && <span className="thread-switch">
        <button type="button" aria-label="Previous note" disabled={position <= 0} onClick={() => setSelected(group[position - 1].id)}>‹</button>
        <span>{position + 1}/{group.length}</span>
        <button type="button" aria-label="Next note" disabled={position >= group.length - 1} onClick={() => setSelected(group[position + 1].id)}>›</button>
      </span>}
      {thread && <button type="button" className="thread-resolve" disabled={busy} aria-label={thread.status === 'open' ? 'Resolve note' : 'Reopen note'} title={thread.status === 'open' ? 'Resolve' : 'Reopen'}
        onClick={() => void useThreads.getState().setStatus(thread.id, thread.status === 'open' ? 'resolved' : 'open')}>{thread.status === 'open' ? '✓' : '↺'}</button>}
      {thread && <button type="button" aria-label="New note" title="New note" onClick={() => { setComposingNew(true); setPendingRange(null); input.current?.focus(); }}>＋</button>}
      <button type="button" aria-label="Close notes" onClick={() => useThreadPopover.getState().close()}>×</button>
    </header>
    {thread?.status === 'resolved' && <p className="thread-resolved">Resolved</p>}
    {isDoc && passageThreads.length > 0 && <section className="thread-passages" aria-label="On passages"><h4>On passages</h4><ul>
      {passageThreads.map((item) => { const status = statusOf(item.id); const text = item.anchor!.quote; return <li key={item.id}>
        <button type="button" aria-label={`Passage note: ${text.slice(0, 40)}`} aria-current={thread?.id === item.id}
          onClick={() => { setSelected(item.id); setComposingNew(false); void revealThreadPassage(item); }}>
          <q>{text.length > 60 ? `${text.slice(0, 60)}…` : text}</q>
          <small>{status ? anchorStatusText(status) : '…'} · {item.messages.length} message{item.messages.length === 1 ? '' : 's'}</small>
        </button></li>; })}
    </ul></section>}
    {quote && <blockquote className="thread-quote">{quote}</blockquote>}
    {threadStatus && threadStatus !== 'resolved' && <p className="thread-status" role="status">Passage {anchorStatusText(threadStatus)}.
      {(threadStatus === 'missing' || threadStatus === 'ambiguous') && ' It can’t be located in the current text; the original quote is kept.'}</p>}
    {isDoc && thread && !thread.anchor && <p className="thread-scope">Whole document</p>}
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
