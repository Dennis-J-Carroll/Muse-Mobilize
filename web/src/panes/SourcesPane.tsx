import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import type { StorySource, SourceClassification, SourceAuthority, SourceSearchHit } from '../sources';
import * as Icon from '../components/icons';

/**
 * Sources (handoff Phase D): imported story material as evidence — never
 * Canon. Search works fully offline (lexical, no model and no network),
 * results show the real passage with its location, and opening a source
 * shows provenance: original filename, import time, hash, extraction status.
 */

const CLASSIFICATIONS: SourceClassification[] = ['manuscript', 'notes', 'research', 'reference', 'archive', 'other'];
const AUTHORITIES: SourceAuthority[] = ['unknown', 'historical', 'working', 'authoritative'];

const AUTHORITY_LABEL: Record<SourceAuthority, string> = {
  unknown: 'Authority unknown',
  historical: 'Historical',
  working: 'Working',
  authoritative: 'Authoritative',
};

const typeLabel: Record<string, string> = { markdown: 'Markdown', text: 'Text', docx: 'Word', pdf: 'PDF' };

function statusLabel(source: StorySource): string {
  switch (source.extractionStatus) {
    case 'ready': return 'Indexed';
    case 'partial': return 'Indexed · limited text';
    case 'failed': return 'Not indexed';
    default: return 'Reading…';
  }
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function locationLabel(location: SourceSearchHit['location']): string | null {
  const parts = [
    location.heading ? `Section: ${location.heading}` : null,
    location.page ? `Page ${location.page}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function ImportControls({ onDone }: { onDone?: () => void }) {
  const importSource = useStore((s) => s.importSource);
  const busy = useStore((s) => s.sourcesBusy);
  const fileRef = useRef<HTMLInputElement>(null);
  const [classification, setClassification] = useState<SourceClassification>('other');
  const [authority, setAuthority] = useState<SourceAuthority>('unknown');

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      await importSource(file, { classification, authority });
    }
    if (fileRef.current) fileRef.current.value = '';
    onDone?.();
  };

  return (
    <div className="sources-import">
      <input ref={fileRef} type="file" accept=".md,.markdown,.txt,.docx,.pdf" multiple hidden
        aria-label="Choose source files" onChange={(event) => void upload(event.target.files)} />
      <label>
        <span>Type of material</span>
        <select aria-label="Classification for imported sources" value={classification} onChange={(event) => setClassification(event.target.value as SourceClassification)}>
          {CLASSIFICATIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label>
        <span>Authority</span>
        <select aria-label="Authority for imported sources" value={authority} onChange={(event) => setAuthority(event.target.value as SourceAuthority)}>
          {AUTHORITIES.map((option) => <option key={option} value={option}>{AUTHORITY_LABEL[option]}</option>)}
        </select>
      </label>
      <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? 'Reading…' : 'Add Sources'}
      </button>
    </div>
  );
}

function MetadataEditor({ source }: { source: StorySource }) {
  const updateSource = useStore((s) => s.updateSource);
  const deleteSource = useStore((s) => s.deleteSource);
  const [title, setTitle] = useState(source.title);
  const [confirming, setConfirming] = useState(false);
  const dirty = title !== source.title;
  return (
    <div className="source-meta-edit">
      <label>
        <span>Display title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && dirty) void updateSource(source.id, { title }); }} />
      </label>
      <label>
        <span>Classification</span>
        <select value={source.classification} onChange={(event) => void updateSource(source.id, { classification: event.target.value as SourceClassification })}>
          {CLASSIFICATIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label>
        <span>Authority</span>
        <select value={source.authority} onChange={(event) => void updateSource(source.id, { authority: event.target.value as SourceAuthority })}>
          {AUTHORITIES.map((option) => <option key={option} value={option}>{AUTHORITY_LABEL[option]}</option>)}
        </select>
      </label>
      {dirty && <button className="btn" onClick={() => void updateSource(source.id, { title })}>Save title</button>}
      <div className="source-remove">
        {confirming ? (
          <>
            <button className="btn btn-danger" aria-label={`Confirm delete source ${source.title}`} onClick={() => void deleteSource(source.id)}>Delete Source</button>
            <button className="linkish" onClick={() => setConfirming(false)}>Keep it</button>
          </>
        ) : (
          <button className="linkish source-remove-start" aria-label={`Delete source ${source.title}`} onClick={() => setConfirming(true)}>Remove this source…</button>
        )}
      </div>
    </div>
  );
}

function SourcePreview({ sourceId, highlight }: { sourceId: string; highlight?: string }) {
  const sources = useStore((s) => s.sources);
  const close = () => useStore.setState({ sceneFocusId: null });
  void close;
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const source = sources?.find((item) => item.id === sourceId);

  useEffect(() => {
    let alive = true;
    setText(null);
    setError(null);
    const project = useStore.getState().project;
    if (!project) return;
    api.sourceText(project.id, sourceId)
      .then((content) => { if (alive) setText(content); })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [sourceId]);

  // Jump to the first match when arriving from a search result.
  useEffect(() => {
    if (!text || !highlight || !bodyRef.current) return;
    const at = text.toLowerCase().indexOf(highlight.toLowerCase());
    if (at === -1) return;
    const marker = bodyRef.current.querySelector('mark');
    const walker = document.createTreeWalker(bodyRef.current, NodeFilter.SHOW_TEXT);
    let node: Node | null = null;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.toLowerCase().includes(highlight.toLowerCase())) {
        node.parentElement?.scrollIntoView({ block: 'center' });
        break;
      }
    }
    void marker;
  }, [text, highlight]);

  if (!source) return <div className="pane-body pane-loading">Source not found.</div>;
  return (
    <div className="source-preview" ref={bodyRef}>
      <header className="source-preview-head">
        <div>
          <h3>{source.title}</h3>
          <p className="source-provenance">
            {typeLabel[source.sourceType] ?? source.sourceType} · {AUTHORITY_LABEL[source.authority]} · {source.classification}
            {' · '}added {formatDate(source.importedAt)}
          </p>
          <p className="source-provenance mono">File: {source.originalName}</p>
        </div>
        <button className="linkish" onClick={() => useStore.setState({ worldFocusEntityId: null })} hidden>close</button>
      </header>
      {source.extractionWarning && <p className="source-warning" role="note">{source.extractionWarning}</p>}
      {error && <p className="source-warning" role="alert">{error}</p>}
      {!text && !error && <p className="pane-loading">Opening…</p>}
      {text !== null && (
        <div className="source-text">
          {highlight ? <HighlightedText text={text} highlight={highlight} /> : text.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph || '\u00a0'}</p>)}
        </div>
      )}
      <footer className="source-preview-foot">
        <MetadataEditor source={source} />
      </footer>
    </div>
  );
}

function HighlightedText({ text, highlight }: { text: string; highlight: string }) {
  const needle = highlight.trim();
  if (!needle) return <>{text}</>;
  const parts: (string | { match: string })[] = [];
  const lower = text.toLowerCase();
  const needleLower = needle.toLowerCase();
  let at = lower.indexOf(needleLower);
  let cursor = 0;
  while (at !== -1) {
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push({ match: text.slice(at, at + needle.length) });
    cursor = at + needle.length;
    at = lower.indexOf(needleLower, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return (
    <>
      {parts.map((part, index) => typeof part === 'string'
        ? <span key={index}>{part}</span>
        : <mark key={index}>{part.match}</mark>)}
    </>
  );
}

export function SourcesPane() {
  const sources = useStore((s) => s.sources);
  const hits = useStore((s) => s.sourceHits);
  const hitsFor = useStore((s) => s.sourceHitsFor);
  const busy = useStore((s) => s.sourcesBusy);
  const loadSources = useStore((s) => s.loadSources);
  const searchSources = useStore((s) => s.searchSources);
  const [query, setQuery] = useState('');
  const [classificationFilter, setClassificationFilter] = useState<SourceClassification | 'all'>('all');
  const [preview, setPreview] = useState<{ sourceId: string; highlight?: string } | null>(null);

  useEffect(() => { void loadSources(); }, [loadSources]);

  // Agent citations open the cited source directly (provenance, handoff §32).
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ sourceId: string }>).detail;
      if (detail?.sourceId) setPreview({ sourceId: detail.sourceId });
    };
    window.addEventListener('muse:open-source', open);
    return () => window.removeEventListener('muse:open-source', open);
  }, []);

  // Debounced interactive search; never searches on every keystroke.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      const id = setTimeout(() => void searchSources(''), 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => {
      void searchSources(trimmed, classificationFilter === 'all' ? {} : { classifications: [classificationFilter] });
    }, 280);
    return () => clearTimeout(id);
  }, [query, classificationFilter, searchSources]);

  const listed = useMemo(() => {
    if (hitsFor) return null;
    return (sources ?? []).filter((source) => classificationFilter === 'all' || source.classification === classificationFilter);
  }, [sources, hitsFor, classificationFilter]);

  if (preview) {
    const source = sources?.find((item) => item.id === preview.sourceId);
    return (
      <div className="sources-workspace">
        <header className="sources-head">
          <button className="linkish" onClick={() => setPreview(null)}>← All sources</button>
          <h2>Sources</h2>
        </header>
        <SourcePreview sourceId={preview.sourceId} highlight={preview.highlight} />
        {source?.extractionStatus === 'failed' && null}
      </div>
    );
  }

  return (
    <div className="sources-workspace">
      <header className="sources-head">
        <h2>Sources</h2>
        <p>Existing story material — drafts, notes, research. Evidence for you and your agents; never promoted to Canon automatically.</p>
      </header>
      <div className="sources-search-row">
        <input
          type="search"
          className="sources-search"
          placeholder="Search story material…"
          aria-label="Search story material"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="sources-filters" role="group" aria-label="Filter by classification">
        {(['all', ...CLASSIFICATIONS] as const).map((option) => (
          <button key={option} className={classificationFilter === option ? 'is-on' : ''}
            aria-pressed={classificationFilter === option}
            onClick={() => setClassificationFilter(option)}>{option === 'all' ? 'All' : option}</button>
        ))}
      </div>
      <ImportControls />
      {busy && hitsFor && <p className="pane-loading">Searching…</p>}
      {hitsFor && hits && (
        <div className="sources-results" aria-label="Search results">
          {hits.length === 0 && !busy && <p className="sources-empty">No matching passages. Exact names work best — try a single distinctive word.</p>}
          {hits.map((hit) => (
            <article key={hit.chunkId} className="source-hit">
              <h3>
                <button className="linkish source-hit-open" onClick={() => setPreview({ sourceId: hit.sourceId, highlight: query.trim().split(/\s+/)[0] })}>
                  {hit.title}
                </button>
              </h3>
              <blockquote>{hit.snippet}</blockquote>
              <p className="source-hit-meta">
                {locationLabel(hit.location) ?? 'Passage'}
              </p>
              <div className="source-hit-actions">
                <button className="btn" onClick={() => setPreview({ sourceId: hit.sourceId, highlight: query.trim().split(/\s+/)[0] })}>Open source</button>
                <button className="btn" onClick={() => {
                  const muse = useStore.getState().agents.find((agent) => agent.role === 'muse') ?? useStore.getState().agents[0];
                  if (!muse) return;
                  useStore.getState().openPane('agent', { bindingId: muse.id });
                  void useStore.getState().ask(muse.id, `In my Sources I found this passage from “${hit.title}”: “${hit.snippet}” — what does it tell me about: ${hitsFor}?`, false);
                }}>Ask Muse about this</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {listed && (
        <div className="sources-list" aria-label="All sources">
          {listed.length === 0 && <p className="sources-empty">No sources yet. Add a Markdown file, a Word draft, or a PDF to begin.</p>}
          {listed.map((source) => (
            <article key={source.id} className={`source-card status-${source.extractionStatus}`}>
              <button className="source-card-open" onClick={() => setPreview({ sourceId: source.id })}>
                <h3>{source.title}</h3>
                <p className="source-card-meta">
                  {typeLabel[source.sourceType] ?? source.sourceType}
                  {' · '}{source.classification} · {AUTHORITY_LABEL[source.authority]}
                </p>
                <p className={`source-card-status status-${source.extractionStatus}`}>
                  {statusLabel(source)}{source.textLength ? ` · ${source.textLength.toLocaleString()} characters` : ''}
                </p>
                {source.extractionWarning && <p className="source-warning" role="note">{source.extractionWarning}</p>}
              </button>
            </article>
          ))}
        </div>
      )}
      <Icon.Feather size={0} />
    </div>
  );
}
