import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { openFloatingEditor } from '../components/floatingEditors';
import { DraftRecoveryNotice, useRecoverableDraft } from '../useRecoverableDraft';
import type { CanonEntity, Pane, PlotNode, Scene, SceneAssetKind, SceneAssetRef, SceneBeat, SceneStatus, SceneTheme } from '../types';

const DRAG_TYPE = 'application/x-muse-scene-asset';
const STATUSES: SceneStatus[] = ['planned', 'drafting', 'revised', 'locked'];
const ASSET_LABEL: Record<SceneAssetKind, string> = { character: 'Character', theme: 'Theme', location: 'Location', plot: 'Plot node' };
const ASSET_MARK: Record<SceneAssetKind, string> = { character: '◉', theme: '◇', location: '⌖', plot: '↝' };

type Resource = SceneAssetRef & { label: string; detail: string };

function sceneResources(characters: CanonEntity[], locations: CanonEntity[], themes: SceneTheme[], nodes: PlotNode[]): Resource[] {
  return [
    ...characters.map((item) => ({ kind: 'character' as const, refId: item.id, role: 'present', label: item.name, detail: item.character?.attributes.role || item.summary || 'Character' })),
    ...themes.map((item) => ({ kind: 'theme' as const, refId: item.id, role: 'appears', label: item.name, detail: item.description || 'Theme' })),
    ...locations.map((item) => ({ kind: 'location' as const, refId: item.id, role: 'setting', label: item.name, detail: item.world?.attributes.atmosphere || item.summary || 'Location' })),
    ...nodes.map((item) => ({ kind: 'plot' as const, refId: item.id, role: 'dramatizes', label: item.title, detail: `${item.section || 'Unsectioned'} · ${item.kind}` })),
  ];
}

function SceneDrawer({ scene, onClose }: { scene?: Scene; onClose: () => void }) {
  const project = useStore((s) => s.project);
  const documents = project?.documents.filter((document) => document.kind === 'manuscript') ?? [];
  const draftFrom = (item?: Scene) => ({ title: item?.title ?? '', section: item?.section ?? 'Act I', status: item?.status ?? 'planned' as SceneStatus, summary: item?.summary ?? '', purpose: item?.purpose ?? '', documentId: item?.documentId ?? '', beats: item?.beats ?? [] as SceneBeat[] });
  const recovery = useRecoverableDraft('scenes', scene?.id ?? 'new', () => draftFrom(scene));
  const [title, setTitle] = recovery.field('title');
  const [section, setSection] = recovery.field('section');
  const [status, setStatus] = recovery.field('status');
  const [summary, setSummary] = recovery.field('summary');
  const [purpose, setPurpose] = recovery.field('purpose');
  const [documentId, setDocumentId] = recovery.field('documentId');
  const [beats, setBeats] = recovery.field('beats');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const setBeat = (index: number, patch: Partial<SceneBeat>) => setBeats((current) => current.map((beat, i) => (i === index ? { ...beat, ...patch } : beat)));
  const moveBeat = (index: number, direction: -1 | 1) => setBeats((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next.map((beat, order) => ({ ...beat, order }));
  });
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const checkpoint = recovery.checkpoint();
    const recordId = scene?.id ?? recovery.recordId;
    const input = { title, section, status, summary, purpose, documentId, beats };
    const saved = recordId
      ? await useStore.getState().updateScene(recordId, input)
      : await useStore.getState().createScene(input);
    if (saved) { recovery.rememberRecord(saved.id); if (recovery.completeSave(checkpoint, draftFrom(saved))) onClose(); }
  };

  return <form className="scene-drawer" onSubmit={save}>
      <header><div><span>Scene folio</span><h2>{scene ? `Revise ${scene.title}` : 'Add scene'}</h2></div><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
      <div className="scene-drawer-scroll">
        <DraftRecoveryNotice recovery={recovery} />
        <section><h3>Story position</h3><div className="scene-form-grid">
          <label className="span-2">Scene title<input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Council summons Kiala" /></label>
          <label>Section<input value={section} onChange={(event) => setSection(event.target.value)} placeholder="Act I" /></label>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as SceneStatus)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="span-2">What happens?<textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
          <label className="span-2">Why this scene exists<textarea rows={3} value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>
          <label className="span-2">Bound manuscript page<select value={documentId} onChange={(event) => setDocumentId(event.target.value)}><option value="">No bound page</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
        </div></section>
        <section><h3>Beat lane <span>{beats.length}</span></h3><p>Small dramatic changes. Order becomes left-to-right storyboard.</p>
          <div className="scene-beat-editor">{beats.map((beat, index) => <div key={beat.id || index}>
            <span>{String(index + 1).padStart(2, '0')}</span><input aria-label={`Beat ${index + 1} title`} value={beat.title} onChange={(event) => setBeat(index, { title: event.target.value })} placeholder="Beat title" /><input aria-label={`Beat ${index + 1} summary`} value={beat.summary} onChange={(event) => setBeat(index, { summary: event.target.value })} placeholder="What changes?" />
            <button type="button" aria-label="Move beat left" disabled={index === 0} onClick={() => moveBeat(index, -1)}>←</button><button type="button" aria-label="Move beat right" disabled={index === beats.length - 1} onClick={() => moveBeat(index, 1)}>→</button><button type="button" aria-label="Remove beat" onClick={() => setBeats((current) => current.filter((_, i) => i !== index).map((item, order) => ({ ...item, order })))}>×</button>
          </div>)}</div>
          <button type="button" className="btn" onClick={() => setBeats((current) => [...current, { id: `draft-${Date.now()}`, title: '', summary: '', order: current.length }])}>+ Add beat</button>
        </section>
      </div>
      <footer><button type="button" className="btn" onClick={() => { recovery.discard(); onClose(); }}>Cancel</button><button className="btn btn-primary" disabled={!title.trim()}>{scene ? 'Save scene' : 'Add to board'}</button></footer>
    </form>;
}

export function openSceneEditor(scene?: Scene) {
  openFloatingEditor({ id: `scenes:${scene?.id ?? 'new'}`, paneType: 'scenes', title: scene ? `Revise ${scene.title}` : 'Add scene', width: 650,
    render: (close) => <SceneDrawer scene={scene} onClose={close} /> });
}

export function ScenesPane({ pane }: { pane: Pane }) {
  const board = useStore((s) => s.sceneBoard);
  const canon = useStore((s) => s.canon);
  const plot = useStore((s) => s.plot);
  const focusId = useStore((s) => s.sceneFocusId);
  const [selectedId, setSelectedId] = useState('');
  const [resourceKind, setResourceKind] = useState<SceneAssetKind>('character');
  const [themeName, setThemeName] = useState('');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [dragOverId, setDragOverId] = useState('');

  useEffect(() => { void Promise.all([useStore.getState().loadScenes(), useStore.getState().loadCanon(), useStore.getState().loadPlot()]); }, []);
  const scenes = useMemo(() => board?.scenes ?? [], [board]);
  const characters = useMemo(() => (canon?.entities ?? []).filter((item) => item.type === 'character'), [canon]);
  const locations = useMemo(() => (canon?.entities ?? []).filter((item) => item.type === 'location'), [canon]);
  const resources = useMemo(() => sceneResources(characters, locations, board?.themes ?? [], plot?.nodes ?? []), [characters, locations, board?.themes, plot?.nodes]);
  const resourceMap = useMemo(() => new Map(resources.map((item) => [`${item.kind}:${item.refId}`, item])), [resources]);

  useEffect(() => {
    if (focusId && scenes.some((scene) => scene.id === focusId)) {
      setSelectedId(focusId);
      useStore.setState({ sceneFocusId: null });
    } else if (!selectedId && scenes[0]) setSelectedId(scenes[0].id);
  }, [focusId, scenes, selectedId]);

  const attach = async (scene: Scene, asset: SceneAssetRef) => {
    if (scene.assets.some((item) => item.kind === asset.kind && item.refId === asset.refId)) return;
    await useStore.getState().updateScene(scene.id, { assets: [...scene.assets, asset] });
    setSelectedId(scene.id);
  };
  const drop = (event: React.DragEvent, scene: Scene) => {
    event.preventDefault();
    setDragOverId('');
    try {
      const asset = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as SceneAssetRef;
      if (asset.kind && asset.refId) void attach(scene, asset);
    } catch { /* foreign drag payload */ }
  };
  const openDialogue = (scene: Scene) => {
    useStore.setState({ sceneFocusId: scene.id });
    useStore.getState().setPaneSize(pane.id, 'normal');
    useStore.getState().openPane('dialogue', { title: 'Dialogue Table', region: 'main', focus: true });
  };
  const sections = Array.from(new Set(scenes.map((scene) => scene.section || 'Unsectioned')));
  const selected = scenes.find((scene) => scene.id === selectedId);
  const openDrawer = openSceneEditor;

  if (!board || !canon || !plot) return <div className="pane-body pane-loading">Laying scene cards…</div>;

  return <div className={`scene-workspace ${railCollapsed ? 'scene-rail-collapsed' : ''}`}>
    <header className="scene-toolbar"><div><span>Storyboard</span><h2>{useStore.getState().project?.name ?? 'Scenes'}</h2></div><p><b>{scenes.length}</b> scenes · <b>{scenes.reduce((sum, scene) => sum + scene.beats.length, 0)}</b> beats</p><button className="btn btn-primary" onClick={() => openDrawer()}>+ Add scene</button></header>
    <aside className="scene-resource-rail">
      <button type="button" className="scene-rail-toggle" aria-label={railCollapsed ? 'Expand story material' : 'Collapse story material'} aria-expanded={!railCollapsed} aria-controls={`scene-material-${pane.id}`} onClick={() => setRailCollapsed((value) => !value)}>{railCollapsed ? '›' : '‹'}</button>
      <div id={`scene-material-${pane.id}`} className="scene-rail-body" hidden={railCollapsed}>
      <header><span>Story material</span><p>Drag into any scene. Click adds to selected scene.</p></header>
      <nav>{(['character', 'theme', 'location', 'plot'] as SceneAssetKind[]).map((kind) => <button key={kind} className={resourceKind === kind ? 'is-active' : ''} onClick={() => setResourceKind(kind)}>{ASSET_MARK[kind]}<span>{ASSET_LABEL[kind]}</span><b>{resources.filter((item) => item.kind === kind).length}</b></button>)}</nav>
      {resourceKind === 'theme' && <form className="scene-theme-add" onSubmit={async (event) => { event.preventDefault(); const theme = await useStore.getState().createSceneTheme({ name: themeName }); if (theme) setThemeName(''); }}><input aria-label="New theme" value={themeName} onChange={(event) => setThemeName(event.target.value)} placeholder="New theme…" /><button disabled={!themeName.trim()}>+</button></form>}
      <div className="scene-resource-list">{resources.filter((item) => item.kind === resourceKind).map((resource) => <button key={resource.refId} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(resource)); }} onClick={() => { if (selected) void attach(selected, resource); }} disabled={!selected}><i>{ASSET_MARK[resource.kind]}</i><span><strong>{resource.label}</strong><small>{resource.detail}</small></span><em>⠿</em></button>)}{!resources.some((item) => item.kind === resourceKind) && <p className="scene-resource-empty">No {ASSET_LABEL[resourceKind].toLowerCase()} material yet.</p>}</div>
      </div>
    </aside>
    <main className="scene-board">
      {!scenes.length && <div className="scene-empty"><span>□</span><h3>First scene starts lane</h3><p>Create scene, then drag cast, themes, locations, and plot nodes into it.</p><button className="btn btn-primary" onClick={() => openDrawer()}>Add opening scene</button></div>}
      {sections.map((section) => <section className="scene-section" key={section}><header><span>{section}</span><i /></header>{scenes.filter((scene) => (scene.section || 'Unsectioned') === section).map((scene) => <article key={scene.id} className={`scene-lane ${selectedId === scene.id ? 'is-selected' : ''} ${dragOverId === scene.id ? 'is-drop-target' : ''}`} onClick={() => setSelectedId(scene.id)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragOverId(scene.id); }} onDragLeave={() => setDragOverId('')} onDrop={(event) => drop(event, scene)}>
        <div className="scene-lane-head"><small>{String(scene.order + 1).padStart(2, '0')} · {scene.status}</small><h3>{scene.title}</h3><p>{scene.purpose || scene.summary || 'Purpose not set.'}</p><div className="scene-asset-chips">{scene.assets.map((asset) => { const resource = resourceMap.get(`${asset.kind}:${asset.refId}`); return <button key={`${asset.kind}:${asset.refId}`} title={`Remove ${resource?.label ?? asset.refId}`} onClick={(event) => { event.stopPropagation(); void useStore.getState().updateScene(scene.id, { assets: scene.assets.filter((item) => item !== asset) }); }}><i>{ASSET_MARK[asset.kind]}</i>{resource?.label ?? 'Missing reference'}<span>×</span></button>; })}<em>Drop story material here</em></div></div>
        <div className="scene-beat-lane">{scene.beats.map((beat, index) => <div className="scene-beat-card" key={beat.id}><small>{String(index + 1).padStart(2, '0')}</small><strong>{beat.title}</strong><p>{beat.summary || 'No change note.'}</p></div>)}{!scene.beats.length && <div className="scene-no-beats">No beats yet</div>}<button className="scene-add-beat" onClick={(event) => { event.stopPropagation(); openDrawer(scene); }}>+ beat</button></div>
        <div className="scene-lane-actions"><button onClick={(event) => { event.stopPropagation(); openDialogue(scene); }}><b>{scene.dialogue.length}</b> dialogue</button><button onClick={(event) => { event.stopPropagation(); openDrawer(scene); }}>Edit</button></div>
      </article>)}</section>)}
    </main>
  </div>;
}
