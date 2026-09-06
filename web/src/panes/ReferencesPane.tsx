import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageGalleryEditor } from '../components/ImageGalleryEditor';
import { openFloatingEditor } from '../components/floatingEditors';
import { useStore } from '../store';
import type {
  CanonEntity, PlotNode, Scene, SceneTheme, StoryEntityKind, StoryEntityRef, StoryImage,
  StoryReference, StoryReferenceKind,
} from '../types';

type LinkOption = StoryEntityRef & { label: string; group: string };

const emptyReference = (): Omit<StoryReference, 'id' | 'createdAt' | 'updatedAt'> => ({
  kind: 'image', title: '', images: [], quote: '', url: '', attribution: '', sourceUrl: '', notes: '', entityRefs: [],
});

function referenceLinks(
  canon: CanonEntity[], plot: PlotNode[], scenes: Scene[], themes: SceneTheme[],
  documents: { id: string; title: string }[],
): LinkOption[] {
  return [
    ...canon.map((item) => ({ kind: 'canon' as const, refId: item.id, label: item.name, group: item.type })),
    ...plot.map((item) => ({ kind: 'plot' as const, refId: item.id, label: item.title, group: 'Plot' })),
    ...scenes.map((item) => ({ kind: 'scene' as const, refId: item.id, label: item.title, group: 'Scene' })),
    ...themes.map((item) => ({ kind: 'theme' as const, refId: item.id, label: item.name, group: 'Theme' })),
    ...documents.map((item) => ({ kind: 'document' as const, refId: item.id, label: item.title, group: 'Document' })),
  ];
}

function ReferenceDrawer({ reference, onClose }: {
  reference?: StoryReference;
  onClose: () => void;
}) {
  const canon = useStore((s) => s.canon);
  const plot = useStore((s) => s.plot);
  const scenes = useStore((s) => s.sceneBoard);
  const project = useStore((s) => s.project);
  const options = useMemo(() => referenceLinks(canon?.entities ?? [], plot?.nodes ?? [], scenes?.scenes ?? [], scenes?.themes ?? [], project?.documents ?? []), [canon, plot, scenes, project]);
  const [draft, setDraft] = useState(() => reference ? {
    kind: reference.kind, title: reference.title, images: reference.images, quote: reference.quote, url: reference.url,
    attribution: reference.attribution, sourceUrl: reference.sourceUrl, notes: reference.notes, entityRefs: reference.entityRefs,
  } : emptyReference());
  const [linkValue, setLinkValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const savingRef = useRef(false);
  const busy = uploading || saving || deleting;
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const addLink = () => {
    const split = linkValue.indexOf(':');
    if (split === -1) return;
    const next = { kind: linkValue.slice(0, split) as StoryEntityKind, refId: linkValue.slice(split + 1) };
    if (!draft.entityRefs.some((item) => item.kind === next.kind && item.refId === next.refId)) set('entityRefs', [...draft.entityRefs, next]);
    setLinkValue('');
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || uploading || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = reference
        ? await useStore.getState().updateReference(reference.id, draft)
        : await useStore.getState().createReference(draft);
      if (saved) onClose();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!reference || busy || savingRef.current) return;
    if (!window.confirm(`Remove "${reference.title}" from references? This cannot be undone.`)) return;
    savingRef.current = true;
    setDeleting(true);
    try {
      const removed = await useStore.getState().deleteReference(reference.id);
      if (removed) onClose();
    } finally {
      savingRef.current = false;
      setDeleting(false);
    }
  };

  return <form className="story-drawer reference-drawer" onSubmit={submit}>
      <header><div><span>Reference folio</span><h2>{reference ? `Revise ${reference.title}` : 'Pin reference'}</h2></div><button type="button" aria-label="Close reference editor" disabled={busy} onClick={onClose}>×</button></header>
      <fieldset className="story-drawer-scroll" disabled={saving} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <section className="story-form-grid">
          <label>Reference kind<select value={draft.kind} onChange={(event) => set('kind', event.target.value as StoryReferenceKind)}><option value="image">Image</option><option value="quote">Quote</option><option value="link">Web source</option></select></label>
          <label>Title<input ref={titleRef} value={draft.title} onChange={(event) => set('title', event.target.value)} placeholder="Storm light over black water" /></label>
          <label className="span-2">Quote or excerpt<textarea rows={4} value={draft.quote} onChange={(event) => set('quote', event.target.value)} placeholder="Exact words worth returning to…" /></label>
          <label>Attribution<input value={draft.attribution} onChange={(event) => set('attribution', event.target.value)} placeholder="Author, artist, archive" /></label>
          <label>Source page<input type="url" value={draft.sourceUrl} onChange={(event) => set('sourceUrl', event.target.value)} placeholder="https://…" /></label>
          <label className="span-2">Primary link<input type="url" value={draft.url} onChange={(event) => set('url', event.target.value)} placeholder="https://…" /></label>
          <label className="span-2">Why it matters<textarea rows={3} value={draft.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Texture, tension, palette, factual lead…" /></label>
        </section>

        <section><h3>Images <span>{draft.images.length}</span></h3><p>Upload into story project or link external image. Project copies remain available offline.</p>
          <ImageGalleryEditor images={draft.images} onChange={(images: StoryImage[]) => set('images', images)} noun="reference" coverLabel={false} onBusyChange={setUploading} />
        </section>

        <section><h3>Story links <span>{draft.entityRefs.length}</span></h3><p>Connect source to material it informs. Links survive renames.</p>
          <div className="reference-link-add"><select aria-label="Story entity to link" value={linkValue} onChange={(event) => setLinkValue(event.target.value)}><option value="">Choose character, place, plot, scene, theme, or page</option>{options.map((item) => <option key={`${item.kind}:${item.refId}`} value={`${item.kind}:${item.refId}`}>{item.group}: {item.label}</option>)}</select><button type="button" className="btn" disabled={!linkValue} onClick={addLink}>Link</button></div>
          <div className="reference-link-chips">{draft.entityRefs.map((link) => { const option = options.find((item) => item.kind === link.kind && item.refId === link.refId); return <button type="button" key={`${link.kind}:${link.refId}`} title="Remove story link" onClick={() => set('entityRefs', draft.entityRefs.filter((item) => item !== link))}><span>{option?.group ?? link.kind}</span>{option?.label ?? 'Missing story item'} ×</button>; })}</div>
        </section>
      </fieldset>
      <footer>
        <span>{uploading ? 'Finishing image upload…' : ''}</span>
        {reference && <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>{deleting ? 'Removing…' : 'Remove'}</button>}
        <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={!draft.title.trim() || busy}>{saving ? 'Saving…' : reference ? 'Save reference' : 'Pin to board'}</button>
      </footer>
    </form>;
}

function RefVisual({ item }: { item: StoryReference }) {
  if (item.images[0]) return <img src={item.images[0].src} alt={item.images[0].caption || item.title} loading="lazy" />;
  if (item.kind === 'quote') return <blockquote>“{item.quote || 'Quote waiting to be captured.'}”</blockquote>;
  return <div className="reference-link-mark" aria-hidden="true">↗</div>;
}

export function ReferencesPane() {
  const references = useStore((s) => s.references);
  const canon = useStore((s) => s.canon);
  const plot = useStore((s) => s.plot);
  const scenes = useStore((s) => s.sceneBoard);
  const project = useStore((s) => s.project);
  const [filter, setFilter] = useState<'all' | StoryReferenceKind>('all');
  const [query, setQuery] = useState('');

  useEffect(() => { void Promise.all([
    useStore.getState().loadReferences(), useStore.getState().loadCanon(), useStore.getState().loadPlot(), useStore.getState().loadScenes(),
  ]); }, []);

  const options = useMemo(() => referenceLinks(canon?.entities ?? [], plot?.nodes ?? [], scenes?.scenes ?? [], scenes?.themes ?? [], project?.documents ?? []), [canon, plot, scenes, project]);
  const optionMap = useMemo(() => new Map(options.map((item) => [`${item.kind}:${item.refId}`, item])), [options]);
  const items = useMemo(() => (references?.items ?? []).filter((item) => {
    const text = `${item.title} ${item.attribution} ${item.notes} ${item.quote}`.toLocaleLowerCase();
    return (filter === 'all' || item.kind === filter) && (!query.trim() || text.includes(query.trim().toLocaleLowerCase()));
  }), [references, filter, query]);
  const openDrawer = (reference?: StoryReference) => openFloatingEditor({ id: `references:${reference?.id ?? 'new'}`, paneType: 'references', title: reference ? `Revise ${reference.title}` : 'Pin reference', width: 680, render: (close) => <ReferenceDrawer reference={reference} onClose={close} /> });

  if (!references || !canon || !plot || !scenes) return <div className="pane-body pane-loading">Opening reference board…</div>;

  return <div className="reference-workspace">
    <header className="story-toolbar reference-toolbar"><div><span>Source room</span><h2>{project?.name ?? 'References'}</h2></div><p><b>{references.items.length}</b> pinned sources · <b>{references.items.reduce((sum, item) => sum + item.entityRefs.length, 0)}</b> story links</p><button className="btn btn-primary" onClick={() => openDrawer()}>+ Pin reference</button></header>
    <nav className="reference-filter" aria-label="Reference filters"><div>{(['all', 'image', 'quote', 'link'] as const).map((kind) => <button key={kind} className={filter === kind ? 'is-active' : ''} onClick={() => setFilter(kind)}>{kind === 'all' ? 'Everything' : kind === 'link' ? 'Web sources' : `${kind[0].toUpperCase()}${kind.slice(1)}s`} <b>{kind === 'all' ? references.items.length : references.items.filter((item) => item.kind === kind).length}</b></button>)}</div><input type="search" aria-label="Search references" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search board" /></nav>
    <main className="reference-board">
      {!references.items.length && <div className="story-empty"><span>⌑</span><h3>Pin first source</h3><p>Gather images, exact quotes, and links. Connect each source to story material it can sharpen.</p><button className="btn btn-primary" onClick={() => openDrawer()}>Pin first reference</button></div>}
      {references.items.length > 0 && !items.length && <div className="story-empty compact"><h3>No matching references</h3><p>Change filter or search phrase.</p></div>}
      <div className="reference-grid">{items.map((item) => <article className={`reference-card kind-${item.kind}`} key={item.id}>
        <button className="reference-card-open" aria-label={`Edit ${item.title}`} onClick={() => openDrawer(item)}><div className="reference-visual"><RefVisual item={item} /></div><div className="reference-card-copy"><span>{item.kind === 'link' ? 'Web source' : item.kind}</span><h3>{item.title}</h3>{item.kind === 'quote' && item.images[0] && <blockquote>“{item.quote}”</blockquote>}{item.attribution && <p className="reference-by">{item.attribution}</p>}{item.notes && <p>{item.notes}</p>}</div></button>
        <footer><div>{item.entityRefs.slice(0, 4).map((link) => { const option = optionMap.get(`${link.kind}:${link.refId}`); return <span key={`${link.kind}:${link.refId}`}>{option?.label ?? 'Missing link'}</span>; })}{item.entityRefs.length > 4 && <span>+{item.entityRefs.length - 4}</span>}</div>{(item.sourceUrl || item.url) && <a href={item.sourceUrl || item.url} target="_blank" rel="noreferrer" aria-label={`Open source for ${item.title}`} onClick={(event) => event.stopPropagation()}>Source ↗</a>}</footer>
      </article>)}</div>
    </main>
  </div>;
}
