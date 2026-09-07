import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolvePassageAnchor, type ConnectionStore, type ConnectionTarget, type StoryAttachment } from '../../../shared/connections';
import { api } from '../api';
import { getProjectSession, useStore } from '../store';
import { closeConnections, useConnectionsView } from '../connectionsView';
import { loadStoryRecords, sameTarget, storyRecords, targetKey } from '../storyRecords';
import { trapLayerTab } from '../focusLayers';
import { revealRange } from '../panes/EditorPane';
import { useWritingView } from '../writingView';

export function ConnectionsPanel() {
  const view = useConnectionsView();
  const projectId = useStore((s) => s.project?.id);
  useEffect(() => {
    if (view.open && view.projectId !== projectId) closeConnections(false);
  }, [projectId, view.open, view.projectId]);
  return view.open && view.projectId === projectId ? <ConnectionContents key={projectId} projectId={projectId!} /> : null;
}

function ConnectionContents({ projectId }: { projectId: string }) {
  const state = useStore();
  const context = useConnectionsView((s) => s.context);
  const [data, setData] = useState<ConnectionStore | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [filter, setFilter] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [existingTag, setExistingTag] = useState('');
  const [rename, setRename] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const live = useRef(true);
  const session = useRef(getProjectSession());
  const input = useRef<HTMLInputElement>(null);
  const current = () => live.current && useStore.getState().project?.id === projectId && getProjectSession() === session.current;
  useEffect(() => {
    live.current = true; input.current?.focus();
    void Promise.all([api.connections(projectId), loadStoryRecords()]).then(([result]) => {
      if (current()) { setData(result.connections); setError(''); }
    }).catch((err) => { if (current()) setError(err.message); });
    return () => { live.current = false; };
  }, [projectId, attempt]);

  const records = storyRecords(state);
  const record = (target: ConnectionTarget) => records.find((item) => sameTarget(target, item.target));
  const name = (target: ConnectionTarget) => record(target)?.label ?? `Missing ${target.kind}: ${target.id}`;
  const selectedTag = data?.tags.find((tag) => tag.id === filter);
  const attached = data?.attachments.filter((item) => context && sameTarget(item.target, context.target)
    && (context.range ? item.anchor?.quote === context.range.quote && item.anchor.start === context.range.start : !item.anchor)) ?? [];
  const backlinks = data?.attachments.filter((item) => context && sameTarget(context.target, item.entity)) ?? [];
  const passages = data?.attachments.filter((item) => context && !context.range && sameTarget(item.target, context.target) && item.anchor) ?? [];
  const filtered = records.filter((item) => (kind === 'all' || item.target.kind === kind)
    && `${item.group} ${item.words}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    && (!filter || data?.attachments.some((link) => link.tagId === filter && sameTarget(link.target, item.target))));
  const source = context ? name(context.target) : null;

  const mutate = async (action: () => Promise<unknown>) => {
    if (pending || !data) return;
    setPending(true); setError('');
    try {
      await action();
      if (!current()) return;
      const result = await api.connections(projectId);
      if (current()) setData(result.connections);
    } catch (err) { if (current()) setError((err as Error).message); }
    finally { if (current()) setPending(false); }
  };
  const attach = async (link: { tagId: string } | { entity: ConnectionTarget }) => {
    if (!context) throw new Error('Choose a story record or select a passage first.');
    if (context.target.kind === 'document') {
      const s = useStore.getState();
      await s.loadDoc(context.target.id);
      if (!current()) return;
      await s.flushDoc(context.target.id);
      if (!current()) return;
      const doc = useStore.getState().docs[context.target.id];
      if (!doc || doc.dirty || doc.recovery) throw new Error('Save or resolve the recovered document before attaching a connection.');
      if (context.range && doc.content.slice(context.range.start, context.range.end) !== context.range.quote) {
        throw new Error('Selected passage changed. Close this panel and select it again.');
      }
    }
    if (current()) await api.attachConnection(projectId, { ...context, ...link });
  };
  const goToPassage = async (link: StoryAttachment) => {
    setError('');
    await useStore.getState().loadDoc(link.target.id);
    if (!current()) return;
    const doc = useStore.getState().docs[link.target.id];
    if (!doc || !link.anchor) { setError('Document could not be opened.'); return; }
    const resolved = resolvePassageAnchor(doc.content, link.anchor);
    if (resolved.status !== 'resolved') {
      setError(`Passage ${resolved.status === 'ambiguous' ? 'has more than one match' : 'or its nearby context has changed'}. Original quote retained; reselect the intended passage to reconnect it.`);
      return;
    }
    closeConnections(false);
    record(link.target)?.open();
    requestAnimationFrame(() => revealRange(link.target.id, resolved.start, resolved.end));
  };
  const showLink = (link: StoryAttachment) => <li key={link.id}>
    <small>{link.tagId ? `# ${data?.tags.find((tag) => tag.id === link.tagId)?.label ?? 'Missing tag'}` : `Linked to ${name(link.entity!)}`}</small>
    {link.anchor ? <><blockquote>{link.anchor.quote}</blockquote><button type="button" onClick={() => void goToPassage(link)}>Go to passage in {name(link.target)}</button></>
      : <button type="button" onClick={() => useConnectionsView.setState({ context: { target: link.target } })}>Inspect {name(link.target)}</button>}
    <button type="button" disabled={pending} aria-label={link.anchor ? 'Remove passage connection' : 'Remove record connection'} onClick={() => void mutate(() => api.removeConnection(projectId, link.id))}>Unlink</button>
  </li>;

  return createPortal(<div className="connections-backdrop">
    <section className="connections-panel" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Tags and connections" onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); closeConnections(); }
      trapLayerTab(event);
    }}>
      <header><div><span className="connections-eyebrow">Story connections</span><h2>Threads through your world</h2>
        <p>Shared tags, linked records, and passages—without changing your prose.</p></div>
        <button type="button" aria-label="Close connections" onClick={() => closeConnections()}>×</button></header>
      {error && <p className="connections-error" role="alert">{error} {!data && <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry connections</button>}</p>}
      {!data && !error && <p role="status">Loading connections…</p>}
      <div className="connections-layout" aria-busy={pending}>
        <aside>
          <h3>Shared tags</h3>
          <div className="connections-tags"><button type="button" aria-pressed={!filter} onClick={() => { setFilter(''); setQuery(''); }}>All records</button>
            {data?.tags.map((tag) => <button key={tag.id} type="button" aria-label={`Filter tag ${tag.label}`} aria-pressed={filter === tag.id} onClick={() => { setFilter(tag.id); setRename(tag.label); setQuery(''); }}>{tag.label}</button>)}
          </div>
          {!data?.tags.length && <p className="connections-muted">Your first tag can tie a motif, place, and passage together.</p>}
          <form onSubmit={(event) => { event.preventDefault(); void mutate(async () => {
            const result = await api.createTag(projectId, newLabel);
            if (!current()) return;
            setNewLabel(''); setExistingTag(result.tag.id);
            if (context) await attach({ tagId: result.tag.id });
          }); }}>
            <label>New tag<input aria-label="New tag" maxLength={80} value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Winter lantern" /></label>
            <button disabled={pending || !data || !newLabel.trim()}>{context ? 'Create and attach tag' : 'Create tag'}</button>
          </form>
          {selectedTag && <form onSubmit={(event) => { event.preventDefault(); void mutate(() => api.renameTag(projectId, selectedTag.id, rename)); }}>
            <label>Rename tag<input maxLength={80} value={rename} onChange={(event) => setRename(event.target.value)} /></label>
            <button disabled={pending || !rename.trim()}>Save tag name</button><small>All connections keep this tag.</small>
          </form>}
        </aside>
        <div className="connections-main">
          {context && <section className="connections-context" aria-label="Selected connection source">
            <div className="connections-row"><div><small>{context.range ? 'Selected passage' : context.target.kind}</small><h3>{source}</h3></div>
              <button type="button" onClick={() => useConnectionsView.setState({ context: null })}>Clear selection</button></div>
            {context.range && <blockquote>{context.range.quote}</blockquote>}
            <form className="connections-row" onSubmit={(event) => { event.preventDefault(); void mutate(() => attach({ tagId: existingTag })); }}>
              <label>Existing tag<select aria-label="Existing tag" value={existingTag} onChange={(event) => setExistingTag(event.target.value)}><option value="">Choose a tag…</option>{data?.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.label}</option>)}</select></label>
              <button disabled={pending || !existingTag}>Attach tag</button>
            </form>
            <div className="connections-tags">{attached.map((item) => {
              const label = item.tagId ? data?.tags.find((tag) => tag.id === item.tagId)?.label ?? 'Missing tag' : name(item.entity!);
              return <button key={item.id} type="button" disabled={pending} aria-label={`Remove ${item.tagId ? 'tag' : 'link'} ${label}`} onClick={() => void mutate(() => api.removeConnection(projectId, item.id))}>{item.tagId ? '#' : '↗'} {label} <span aria-hidden="true">×</span></button>;
            })}</div>
            {backlinks.length > 0 && <><h4>Linked from</h4><ul className="connection-passages">{backlinks.map(showLink)}</ul></>}
            {passages.length > 0 && <><h4>Passage annotations</h4><ul className="connection-passages">{passages.map(showLink)}</ul></>}
          </section>}
          <div className="connections-search"><label>Find story record<input ref={input} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, alias, motif…" /></label>
            <label>Record type<select aria-label="Record type" value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">Every tool</option>{['document', 'canon', 'plot', 'scene', 'theme', 'reference', 'goal'].map((type) => <option key={type} value={type}>{type === 'canon' ? 'Characters & world' : type[0].toUpperCase() + type.slice(1)}</option>)}</select></label></div>
          <div className="connections-records">{filtered.map((item) => <article key={targetKey(item.target)}>
            <div className="connections-row"><button className="connection-record-title" type="button" aria-label={`Inspect ${item.group}: ${item.label}`} onClick={() => useConnectionsView.setState({ context: { target: item.target } })}><small>{item.group}</small><span>{item.label}</span></button>
              <div className="connection-record-actions">{context && !sameTarget(context.target, item.target) && <button type="button" disabled={pending || !data} aria-label={`Link ${item.group}: ${item.label}`} onClick={() => void mutate(() => attach({ entity: item.target }))}>Link</button>}
                <button type="button" aria-label={`Open ${item.group}: ${item.label}`} onClick={() => { closeConnections(false); item.open(); }}>Open</button></div></div>
            {filter && <ul className="connection-passages">{data?.attachments.filter((link) => link.tagId === filter && sameTarget(link.target, item.target) && link.anchor).map(showLink)}</ul>}
          </article>)}</div>
          {data && !filtered.length && <p>No matching records. Try another tag, type, or name.</p>}
          {data && (!state.canon || !state.plot || !state.sceneBoard || !state.references || !state.goals) && <p role="status">Some tools could not load. <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry story records</button></p>}
        </div>
      </div>
      <footer>Select text, then type <kbd>!#</kbd> to connect it. Escape closes this layer{useWritingView.getState().focusPaneId ? ', not writing focus' : ''}.</footer>
    </section>
  </div>, document.body);
}
