import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { ImageGalleryEditor, StoryImageStrip } from '../components/ImageGalleryEditor';
import { preflightImageFiles } from '../components/ImageGalleryEditor';
import { openFloatingEditor } from '../components/floatingEditors';
import { DraftRecoveryNotice, useRecoverableDraft } from '../useRecoverableDraft';
import type { CanonEntity, CanonEntityType, CanonFact, Pane, StoryImage, WorldProfile } from '../types';

type Point = { x: number; y: number };
type View = Point & { scale: number };
type WorldMode = 'canvas' | 'pages';

const WORLD_TYPES: CanonEntityType[] = ['location', 'organization', 'object', 'event', 'rule', 'lore'];
const TYPE_LABEL: Record<string, string> = {
  location: 'Place', organization: 'Faction', object: 'Object', event: 'Event', rule: 'Rule', lore: 'Lore',
};
const TYPE_GLYPH: Record<string, string> = {
  location: '⌖', organization: '◇', object: '✦', event: '◷', rule: '§', lore: '≈',
};

const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const fallbackPoint = (index: number): Point => ({
  x: 110 + (index % 4) * 245 + (index % 2) * 28,
  y: 95 + Math.floor(index / 4) * 190 + (index % 3) * 24,
});
const OPEN_OFFSETS: Point[] = [
  { x: 0, y: 0 }, { x: 180, y: 0 }, { x: -180, y: 0 }, { x: 0, y: 155 }, { x: 0, y: -155 },
  { x: 165, y: 135 }, { x: -165, y: 135 }, { x: 165, y: -135 }, { x: -165, y: -135 },
];

function unoccupiedPoint(seed: Point, occupied: Point[]): Point {
  const candidate = OPEN_OFFSETS
    .map((offset) => ({ x: seed.x + offset.x, y: seed.y + offset.y }))
    .find((point) => occupied.every((other) => Math.hypot(point.x - other.x, point.y - other.y) > 135));
  return candidate ?? { x: seed.x + occupied.length * 42, y: seed.y + occupied.length * 38 };
}

function profileAt(entity: CanonEntity, point: Point): WorldProfile {
  return {
    categories: entity.world?.categories ?? [],
    attributes: entity.world?.attributes ?? { era: '', atmosphere: '', significance: '' },
    canvas: point,
    images: entity.world?.images ?? [],
    ...(entity.world?.referenceDocumentId ? { referenceDocumentId: entity.world.referenceDocumentId } : {}),
  };
}

function entityNames(entity: CanonEntity): string[] {
  return [entity.name, ...entity.aliases].map((name) => name.toLocaleLowerCase());
}

interface WorldLink {
  fact: CanonFact;
  source: CanonEntity;
  target: CanonEntity;
}

function WorldDrawer({
  entity,
  point,
  onClose,
  onSaved,
}: {
  entity?: CanonEntity;
  point: Point;
  onClose: () => void;
  onSaved: (entity: CanonEntity) => void;
}) {
  const project = useStore((s) => s.project);
  const documents = project?.documents ?? [];
  const draftFrom = (item?: CanonEntity) => ({ name: item?.name ?? '', type: item?.type ?? 'location' as CanonEntityType, aliases: item?.aliases.join(', ') ?? '', categories: item?.world?.categories.join(', ') ?? '', summary: item?.summary ?? '', era: item?.world?.attributes.era ?? '', atmosphere: item?.world?.attributes.atmosphere ?? '', significance: item?.world?.attributes.significance ?? '', referenceDocumentId: item?.world?.referenceDocumentId ?? '', images: item?.world?.images ?? [] as StoryImage[], point: item?.world?.canvas ?? point });
  const recovery = useRecoverableDraft('world', entity?.id ?? 'new', () => draftFrom(entity));
  const [name, setName] = recovery.field('name');
  const [type, setType] = recovery.field('type');
  const [aliases, setAliases] = recovery.field('aliases');
  const [categories, setCategories] = recovery.field('categories');
  const [summary, setSummary] = recovery.field('summary');
  const [era, setEra] = recovery.field('era');
  const [atmosphere, setAtmosphere] = recovery.field('atmosphere');
  const [significance, setSignificance] = recovery.field('significance');
  const [referenceDocumentId, setReferenceDocumentId] = recovery.field('referenceDocumentId');
  const [images, setImages] = recovery.field('images');
  const [uploadingImages, setUploadingImages] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const close = () => { if (!uploadingImages) onClose(); };

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || uploadingImages) return;
    const checkpoint = recovery.checkpoint();
    const recordId = entity?.id ?? recovery.recordId;
    const world: WorldProfile = {
      categories: splitList(categories),
      attributes: {
        era: era.trim(),
        atmosphere: atmosphere.trim(),
        significance: significance.trim(),
      },
      canvas: recovery.draft.point,
      images,
      ...(referenceDocumentId ? { referenceDocumentId } : {}),
    };
    const saved = recordId
      ? await useStore.getState().updateCanonEntity(recordId, {
          name: name.trim(), aliases: splitList(aliases), summary: summary.trim(), world,
        })
      : await useStore.getState().createCanonEntity({
          type, name: name.trim(), aliases: splitList(aliases), summary: summary.trim(), world,
        });
    if (saved) { recovery.rememberRecord(saved.id); if (recovery.completeSave(checkpoint, draftFrom(saved))) onSaved(saved); }
  };

  const loreDocuments = documents.filter((document) => document.kind === 'canon' || document.kind === 'notes');

  return (
      <form className="world-drawer" onSubmit={save}>
        <header>
          <div><span>Atlas entry</span><h2>{entity ? `Edit ${entity.name}` : 'Place a landmark'}</h2></div>
          <button type="button" className="drawer-close" aria-label="Close" onClick={close} disabled={uploadingImages}>×</button>
        </header>
        <div className="drawer-scroll">
          <DraftRecoveryNotice recovery={recovery} />
          <section className="drawer-section">
            <h3>Identity</h3>
            <div className="drawer-grid">
              <label>Name<input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="Veyr" /></label>
              <label>Kind<select value={type} disabled={Boolean(entity)} onChange={(event) => setType(event.target.value as CanonEntityType)}>{WORLD_TYPES.map((item) => <option key={item} value={item}>{TYPE_LABEL[item]}</option>)}</select></label>
              <label className="span-2">Aliases<input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="The Bell City, Council Seat" /></label>
              <label className="span-2">Categories<input value={categories} onChange={(event) => setCategories(event.target.value)} placeholder="capital, coastal, contested" /></label>
            </div>
          </section>
          <section className="drawer-section">
            <h3>World function</h3>
            <div className="drawer-grid">
              <label className="span-2">Summary<textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What exists here?" /></label>
              <label>Era<input value={era} onChange={(event) => setEra(event.target.value)} placeholder="Late empire" /></label>
              <label>Atmosphere<input value={atmosphere} onChange={(event) => setAtmosphere(event.target.value)} placeholder="Salt, bells, political pressure" /></label>
              <label className="span-2">Story significance<textarea rows={3} value={significance} onChange={(event) => setSignificance(event.target.value)} placeholder="Why this matters to story" /></label>
            </div>
          </section>
          <section className="drawer-section">
            <h3>Page binding</h3>
            <div className="drawer-grid">
              <label className="span-2">Lore document
                <select value={referenceDocumentId} onChange={(event) => setReferenceDocumentId(event.target.value)}>
                  <option value="">No linked document</option>
                  {loreDocuments.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
                </select>
              </label>
            </div>
            <p className="world-drawer-note">Canvas entry remains structured canon. Linked page holds long-form lore.</p>
          </section>
          <section className="drawer-section">
            <h3>Visual references</h3>
            <ImageGalleryEditor images={images} onChange={setImages} noun="world" onBusyChange={setUploadingImages} />
          </section>
        </div>
        <footer><button type="button" className="btn" onClick={() => { recovery.discard(); close(); }} disabled={uploadingImages}>Cancel</button><button className="btn btn-primary" disabled={!name.trim() || uploadingImages}>{uploadingImages ? 'Adding images…' : entity ? 'Save landmark' : 'Place landmark'}</button></footer>
      </form>
  );
}

export function openWorldEditor(point: Point, entity?: CanonEntity, onSaved?: (entity: CanonEntity) => void) {
  openFloatingEditor({
    id: `world:${entity?.id ?? 'new'}`, paneType: 'world', title: entity ? `Edit ${entity.name}` : 'Place a landmark', width: 560,
    render: (close) => <WorldDrawer entity={entity} point={point} onClose={close} onSaved={(saved) => { onSaved?.(saved); close(); }} />,
  });
}

export function WorldPane({ pane }: { pane: Pane }) {
  const canon = useStore((s) => s.canon);
  const plot = useStore((s) => s.plot);
  const worldMap = useStore((s) => s.worldMap);
  const focusEntityId = useStore((s) => s.worldFocusEntityId);
  const project = useStore((s) => s.project);
  const documents = project?.documents ?? [];
  const [mode, setMode] = useState<WorldMode>('canvas');
  const [filter, setFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState('');
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [view, setView] = useState<View>({ x: 85, y: 82, scale: 1 });
  const [relationship, setRelationship] = useState('');
  const [targetId, setTargetId] = useState('');
  const [panning, setPanning] = useState(false);
  const [mapPanelOpen, setMapPanelOpen] = useState(false);
  const [mapNatural, setMapNatural] = useState<{ width: number; height: number } | null>(null);
  const [mapUploading, setMapUploading] = useState(false);
  const [localOpacity, setLocalOpacity] = useState<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapFileRef = useRef<HTMLInputElement>(null);
  const panRef = useRef<{ pointerId: number; clientX: number; clientY: number; origin: View } | null>(null);
  const dragRef = useRef<{ id: string; clientX: number; clientY: number; origin: Point; scale: number } | null>(null);
  const initializedSelection = useRef(false);
  const openDrawer = (point: Point, entity?: CanonEntity) => openWorldEditor(point, entity, (saved) => setSelectedId(saved.id));

  useEffect(() => {
    void Promise.all([useStore.getState().loadCanon(), useStore.getState().loadPlot(), useStore.getState().loadWorldMap()]);
  }, []);

  useEffect(() => {
    const src = worldMap?.image?.src;
    if (!src) { setMapNatural(null); return; }
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => { if (!cancelled) setMapNatural({ width: probe.naturalWidth, height: probe.naturalHeight }); };
    probe.src = src;
    return () => { cancelled = true; };
  }, [worldMap?.image?.src]);

  useEffect(() => {
    if (worldMap?.image && !worldMap.visible) setMapPanelOpen(true);
  }, [worldMap?.image?.src, worldMap?.visible]);

  useEffect(() => {
    if (localOpacity !== null && worldMap?.opacity === localOpacity) setLocalOpacity(null);
  }, [worldMap?.opacity, localOpacity]);

  const displayOpacity = localOpacity ?? worldMap?.opacity ?? .55;
  const commitOpacity = () => {
    if (localOpacity !== null) void useStore.getState().updateWorldMap({ opacity: localOpacity });
  };

  const mapBounds = worldMap?.visible && worldMap.image && mapNatural
    ? [{ x: 0, y: 0 }, { x: mapNatural.width, y: mapNatural.height }]
    : [];

  const uploadMapImage = async (file: File) => {
    const { accepted, issues } = preflightImageFiles([file]);
    if (issues.length) { useStore.setState({ error: `${file.name}: ${issues[0].reason}` }); return; }
    if (!accepted.length) return;
    setMapUploading(true);
    try {
      const image = await useStore.getState().uploadStoryImage(accepted[0]);
      await useStore.getState().updateWorldMap({ image, visible: true });
    } catch (err: any) {
      useStore.setState({ error: err.message });
    } finally {
      setMapUploading(false);
      if (mapFileRef.current) mapFileRef.current.value = '';
    }
  };

  const worldEntities = useMemo(
    () => (canon?.entities ?? []).filter((entity) => entity.type !== 'character'),
    [canon],
  );

  useEffect(() => {
    setPositions((current) => {
      const occupied: Point[] = [];
      return Object.fromEntries(worldEntities.map((entity, index) => {
        const requested = entity.world?.canvas ?? current[entity.id] ?? fallbackPoint(index);
        const point = unoccupiedPoint(requested, occupied);
        occupied.push(point);
        return [entity.id, point];
      }));
    });
  }, [worldEntities]);

  useEffect(() => {
    if (focusEntityId && worldEntities.some((entity) => entity.id === focusEntityId)) {
      const point = positions[focusEntityId];
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!point || !rect) return;
      setMode('canvas');
      setSelectedId(focusEntityId);
      setView((current) => ({
        ...current,
        x: rect.width / 2 - point.x * current.scale - 90,
        y: rect.height / 2 - point.y * current.scale,
      }));
      initializedSelection.current = true;
      useStore.setState({ worldFocusEntityId: null });
      return;
    }
    if (!initializedSelection.current && worldEntities[0]) {
      initializedSelection.current = true;
      setSelectedId(worldEntities[0].id);
    }
    if (selectedId && !worldEntities.some((entity) => entity.id === selectedId)) setSelectedId(worldEntities[0]?.id ?? '');
  }, [focusEntityId, positions, selectedId, worldEntities]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setPositions((current) => ({
        ...current,
        [drag.id]: {
          x: drag.origin.x + (event.clientX - drag.clientX) / drag.scale,
          y: drag.origin.y + (event.clientY - drag.clientY) / drag.scale,
        },
      }));
    };
    const up = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const point = {
        x: drag.origin.x + (event.clientX - drag.clientX) / drag.scale,
        y: drag.origin.y + (event.clientY - drag.clientY) / drag.scale,
      };
      setPositions((current) => ({ ...current, [drag.id]: point }));
      const entity = useStore.getState().canon?.entities.find((item) => item.id === drag.id);
      if (entity) void useStore.getState().updateCanonEntity(entity.id, { world: profileAt(entity, point) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const visible = filter === 'all' ? worldEntities : worldEntities.filter((entity) => entity.type === filter);
  const visibleIds = new Set(visible.map((entity) => entity.id));
  const selected = worldEntities.find((entity) => entity.id === selectedId);

  const links = useMemo<WorldLink[]>(() => {
    if (!canon) return [];
    const byName = new Map<string, CanonEntity>();
    worldEntities.forEach((entity) => entityNames(entity).forEach((name) => byName.set(name, entity)));
    return canon.facts.flatMap((fact) => {
      const source = worldEntities.find((entity) => entity.id === fact.subjectId) ?? byName.get(fact.subject.toLocaleLowerCase());
      const target = typeof fact.value === 'string' ? byName.get(fact.value.toLocaleLowerCase()) : undefined;
      return source && target && source.id !== target.id ? [{ fact, source, target }] : [];
    });
  }, [canon, worldEntities]);

  const selectedFacts = (canon?.facts ?? []).filter((fact) => {
    if (!selected) return false;
    return fact.subjectId === selected.id || fact.subject === selected.name || String(fact.value).toLocaleLowerCase() === selected.name.toLocaleLowerCase();
  });
  const plotBacklinks = (plot?.nodes ?? []).filter((node) => node.worldRefs.some((reference) => reference.entityId === selectedId));

  const openDocument = (documentId: string) => {
    useStore.getState().setPaneSize(pane.id, 'normal');
    useStore.getState().openPane('editor', { bindingId: documentId, region: 'right' });
  };

  const openCanon = () => {
    useStore.getState().setPaneSize(pane.id, 'normal');
    useStore.getState().openPane('canon', { title: 'Canon', region: 'right' });
  };

  const openPlotAt = (nodeId: string) => {
    useStore.setState({ plotFocusNodeId: nodeId });
    useStore.getState().openPane('plot', { title: 'Plot Through-line', region: 'main', focus: true });
  };

  const placePoint = (clientX?: number, clientY?: number): Point => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 240, y: 180 };
    const x = clientX ?? rect.left + rect.width / 2;
    const y = clientY ?? rect.top + rect.height / 2;
    return unoccupiedPoint(
      { x: (x - rect.left - view.x) / view.scale, y: (y - rect.top - view.y) / view.scale },
      Object.values(positions),
    );
  };

  const fitWorld = () => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const points = [...visible.map((entity) => positions[entity.id]).filter(Boolean), ...mapBounds];
    if (!rect || !points.length) {
      setView({ x: 85, y: 82, scale: 1 });
      return;
    }
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const paddingX = mapBounds.length ? 24 : Math.min(150, rect.width * .15);
    const paddingY = mapBounds.length ? 24 : Math.min(90, rect.height * .15);
    const scale = Math.max(.001, Math.min(1.35,
      Math.max(1, rect.width - paddingX * 2) / Math.max(260, maxX - minX),
      Math.max(1, rect.height - paddingY * 2) / Math.max(180, maxY - minY)));
    setView({
      scale,
      x: rect.width / 2 - ((minX + maxX) / 2) * scale,
      y: rect.height / 2 - ((minY + maxY) / 2) * scale,
    });
  };

  const zoom = (factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextScale = Math.max(.001, Math.min(2, view.scale * factor));
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const worldX = (cx - view.x) / view.scale;
    const worldY = (cy - view.y) / view.scale;
    setView({ scale: nextScale, x: cx - worldX * nextScale, y: cy - worldY * nextScale });
  };

  const moveNode = (entity: CanonEntity, dx: number, dy: number) => {
    const current = positions[entity.id] ?? fallbackPoint(0);
    const point = { x: current.x + dx, y: current.y + dy };
    setPositions((all) => ({ ...all, [entity.id]: point }));
    void useStore.getState().updateCanonEntity(entity.id, { world: profileAt(entity, point) });
  };

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    const target = worldEntities.find((entity) => entity.id === targetId);
    if (!selected || !target || !relationship.trim()) return;
    const created = await useStore.getState().createCanonFact({
      subject: selected.name,
      subjectId: selected.id,
      predicate: relationship.trim(),
      value: target.name,
      status: 'proposed',
      evidence: [],
    });
    if (created) {
      setRelationship('');
      setTargetId('');
    }
  };

  if (!canon) return <div className="pane-body pane-loading">Unfolding atlas…</div>;

  return (
    <div className="world-workspace">
      <header className="world-toolbar">
        <div className="world-heading"><span>Living atlas</span><h2>{useStore.getState().project?.name ?? 'Story world'}</h2></div>
        <div className="world-mode" aria-label="World view">
          <button className={mode === 'canvas' ? 'is-on' : ''} aria-pressed={mode === 'canvas'} onClick={() => setMode('canvas')}>Canvas</button>
          <button className={mode === 'pages' ? 'is-on' : ''} aria-pressed={mode === 'pages'} onClick={() => setMode('pages')}>Pages</button>
        </div>
        <label className="world-filter">Show<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Everything</option>{WORLD_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}</select></label>
        <button className="btn world-add" onClick={() => openDrawer(placePoint())}>+ Place landmark</button>
      </header>

      {mode === 'canvas' ? (
        <div
          ref={viewportRef}
          className={`world-viewport ${panning ? 'is-panning' : ''}`}
          style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${34 * view.scale}px ${34 * view.scale}px` }}
          onPointerDown={(event) => {
            if (event.button !== 0 || (event.target as Element).closest('.world-node, .world-inspector, .world-nav, .world-map-panel')) return;
            panRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, origin: view };
            event.currentTarget.setPointerCapture(event.pointerId);
            setPanning(true);
          }}
          onPointerMove={(event) => {
            const pan = panRef.current;
            if (!pan || pan.pointerId !== event.pointerId) return;
            setView({ ...pan.origin, x: pan.origin.x + event.clientX - pan.clientX, y: pan.origin.y + event.clientY - pan.clientY });
          }}
          onPointerUp={(event) => {
            if (panRef.current?.pointerId !== event.pointerId) return;
            panRef.current = null;
            setPanning(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onWheel={(event) => {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const nextScale = Math.max(.001, Math.min(2, view.scale * (event.deltaY > 0 ? .9 : 1.1)));
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const worldX = (mouseX - view.x) / view.scale;
            const worldY = (mouseY - view.y) / view.scale;
            setView({ scale: nextScale, x: mouseX - worldX * nextScale, y: mouseY - worldY * nextScale });
          }}
          onDoubleClick={(event) => {
            if ((event.target as Element).closest('.world-node, .world-inspector, .world-nav, .world-map-panel')) return;
            openDrawer(placePoint(event.clientX, event.clientY));
          }}
        >
          <div className="world-space" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
            {worldMap?.visible && worldMap.image && (
              <img
                className="world-map-layer"
                src={worldMap.image.src}
                alt=""
                draggable={false}
                style={{ opacity: displayOpacity }}
              />
            )}
            <svg className="world-links" width="1" height="1" aria-hidden>
              <defs><marker id="world-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
              {links.filter((link) => visibleIds.has(link.source.id) && visibleIds.has(link.target.id)).map((link) => {
                const source = positions[link.source.id];
                const target = positions[link.target.id];
                if (!source || !target) return null;
                const active = selectedId === link.source.id || selectedId === link.target.id;
                return <g key={link.fact.id} className={`world-link fact-${link.fact.status} ${active ? 'is-active' : ''}`}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} markerEnd="url(#world-arrow)" /><text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 8}>{link.fact.predicate}</text></g>;
              })}
            </svg>
            {visible.map((entity, index) => {
              const point = positions[entity.id] ?? fallbackPoint(index);
              const cover = entity.world?.images?.[0];
              return (
                <button
                  key={entity.id}
                  className={`world-node type-${entity.type} ${selectedId === entity.id ? 'is-selected' : ''}`}
                  style={{ left: point.x, top: point.y }}
                  aria-label={`${TYPE_LABEL[entity.type]}: ${entity.name}`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedId(entity.id);
                    dragRef.current = { id: entity.id, clientX: event.clientX, clientY: event.clientY, origin: point, scale: view.scale };
                  }}
                  onClick={() => setSelectedId(entity.id)}
                  onKeyDown={(event) => {
                    const amount = event.shiftKey ? 20 : 5;
                    const delta = event.key === 'ArrowLeft' ? [-amount, 0] : event.key === 'ArrowRight' ? [amount, 0] : event.key === 'ArrowUp' ? [0, -amount] : event.key === 'ArrowDown' ? [0, amount] : null;
                    if (delta) { event.preventDefault(); moveNode(entity, delta[0], delta[1]); }
                  }}
                >
                  <span className={`world-marker ${cover ? 'has-image' : ''}`}>{cover ? <img src={cover.src} alt="" /> : <i>{TYPE_GLYPH[entity.type]}</i>}<em /></span>
                  <strong>{entity.name}</strong>
                  <small>{entity.world?.attributes.era || TYPE_LABEL[entity.type]}</small>
                </button>
              );
            })}
          </div>

          {!visible.length && <div className="world-empty"><span className="world-empty-compass">N<i /></span><h3>No landmarks placed</h3><p>Double-click open ground or place first location.</p><button className="btn" onClick={() => openDrawer(placePoint())}>Place first landmark</button></div>}

          <nav className="world-nav" aria-label="Canvas controls">
            <button onClick={() => zoom(1.15)} aria-label="Zoom in">+</button>
            <button onClick={() => zoom(.87)} aria-label="Zoom out">−</button>
            <button onClick={fitWorld} aria-label="Fit landmarks">◎</button>
            <button className={mapPanelOpen ? 'is-on' : ''} aria-pressed={mapPanelOpen} onClick={() => setMapPanelOpen((open) => !open)} aria-label="Atlas background controls">▤</button>
            <span>{Math.round(view.scale * 100)}%</span>
          </nav>
          <div className="world-compass" aria-hidden><b>N</b><i /><span /></div>

          {mapPanelOpen && (
            <aside className="world-map-panel">
              <header><span>Atlas background</span><button onClick={() => setMapPanelOpen(false)} aria-label="Collapse atlas background controls">×</button></header>
              <div className="world-map-panel-body">
                {worldMap?.image
                  ? <StoryImageStrip images={[worldMap.image]} label="Atlas background preview" />
                  : <p className="world-map-empty">No background image set. Upload one to trace landmarks over it.</p>}
                <label className="btn world-map-choose">
                  {mapUploading ? 'Uploading…' : worldMap?.image ? 'Replace image' : 'Upload image'}
                  <input
                    ref={mapFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    disabled={mapUploading}
                    onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMapImage(file); }}
                  />
                </label>
                {worldMap?.image && (
                  <>
                    <label className="world-map-opacity">
                      Opacity
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={.05}
                        value={displayOpacity}
                        onChange={(event) => setLocalOpacity(Number(event.target.value))}
                        onPointerUp={commitOpacity}
                        onBlur={commitOpacity}
                      />
                    </label>
                    <label className="world-map-visible">
                      <input
                        type="checkbox"
                        checked={worldMap.visible}
                        onChange={(event) => void useStore.getState().updateWorldMap({ visible: event.target.checked })}
                      />
                      Show on canvas
                    </label>
                    <div className="world-map-panel-actions">
                      <button className="btn" onClick={fitWorld} disabled={!mapNatural}>Fit to canvas</button>
                      <button className="linkish" onClick={() => void useStore.getState().updateWorldMap({ image: null })}>Remove background</button>
                    </div>
                  </>
                )}
              </div>
            </aside>
          )}

          {selected && (
            <aside className="world-inspector">
              <header><span>{TYPE_LABEL[selected.type]}</span><button onClick={() => setSelectedId('')} aria-label="Close inspector">×</button></header>
              <div className="world-inspector-scroll">
                <h1>{selected.name}</h1>
                {selected.aliases.length > 0 && <p className="world-aliases">{selected.aliases.join(' · ')}</p>}
                <div className="world-categories">{(selected.world?.categories ?? []).map((category) => <span key={category}>{category}</span>)}</div>
                <StoryImageStrip images={selected.world?.images ?? []} label={`${selected.name} visual references`} />
                <p className="world-summary">{selected.summary || 'No atlas summary yet.'}</p>
                <dl className="world-ledger">
                  <div><dt>Era</dt><dd>{selected.world?.attributes.era || '—'}</dd></div>
                  <div><dt>Atmosphere</dt><dd>{selected.world?.attributes.atmosphere || '—'}</dd></div>
                  <div><dt>Story weight</dt><dd>{selected.world?.attributes.significance || '—'}</dd></div>
                </dl>
                <section className="world-threads"><h3>World threads <span>{selectedFacts.length}</span></h3>{selectedFacts.length ? selectedFacts.map((fact) => <div key={fact.id}><i className={`fact-dot fact-${fact.status}`} /><p><b>{fact.subject}</b> {fact.predicate} <strong>{String(fact.value)}</strong></p><em>{fact.status}</em></div>) : <p>No relationships yet.</p>}</section>
                {plotBacklinks.length > 0 && <section className="world-plot-echoes"><h3>Appears in plot <span>{plotBacklinks.length}</span></h3>{plotBacklinks.map((node) => <button key={node.id} onClick={() => openPlotAt(node.id)}><i>{node.kind}</i><strong>{node.title}</strong><span>{node.section || 'Unsectioned'} →</span></button>)}</section>}
                {worldEntities.length > 1 && <form className="world-connect" onSubmit={connect}><h3>Draw connection</h3><input value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="borders, governs, hides…" /><select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Choose target</option>{worldEntities.filter((entity) => entity.id !== selected.id).map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select><button className="btn" disabled={!relationship.trim() || !targetId}>Connect as proposed</button></form>}
              </div>
              <footer>
                {selected.world?.referenceDocumentId && documents.some((document) => document.id === selected.world?.referenceDocumentId) && <button className="btn" onClick={() => openDocument(selected.world!.referenceDocumentId!)}>Open lore page</button>}
                <button className="btn" onClick={() => openDrawer(positions[selected.id] ?? fallbackPoint(0), selected)}>Edit landmark</button>
                <button className="linkish" onClick={openCanon}>canon trail</button>
              </footer>
            </aside>
          )}
        </div>
      ) : (
        <div className="world-pages">
          <aside className="world-page-index"><span>Atlas index</span>{WORLD_TYPES.map((type) => { const count = worldEntities.filter((entity) => entity.type === type).length; return <button key={type} disabled={!count} className={filter === type ? 'is-on' : ''} onClick={() => setFilter(filter === type ? 'all' : type)}><i>{TYPE_GLYPH[type]}</i>{TYPE_LABEL[type]}<em>{count}</em></button>; })}</aside>
          <main className="world-page-list">
            <header><span>World record</span><h1>{visible.length} {visible.length === 1 ? 'entry' : 'entries'}</h1><p>Structured atlas pages. Open bound lore documents for long-form writing.</p></header>
            {!visible.length && <div className="world-pages-empty">No entries in this part of atlas.</div>}
            {visible.map((entity) => {
              const related = links.filter((link) => link.source.id === entity.id || link.target.id === entity.id);
              const cover = entity.world?.images?.[0];
              return <article key={entity.id} className={`world-page-entry type-${entity.type}`}><div className={`world-page-mark ${cover ? 'has-image' : ''}`}>{cover ? <img src={cover.src} alt="" /> : TYPE_GLYPH[entity.type]}<small>{TYPE_LABEL[entity.type]}</small></div><div><span>{entity.world?.attributes.era || 'Era unmarked'}</span><h2>{entity.name}</h2><p>{entity.summary || 'No summary recorded.'}</p><div className="world-page-meta">{entity.world?.attributes.atmosphere && <em>Atmosphere: {entity.world.attributes.atmosphere}</em>}{entity.world?.attributes.significance && <em>Story weight: {entity.world.attributes.significance}</em>}{related.length > 0 && <em>{related.length} connected {related.length === 1 ? 'thread' : 'threads'}</em>}</div></div><div className="world-page-actions">{entity.world?.referenceDocumentId && documents.some((document) => document.id === entity.world?.referenceDocumentId) && <button className="linkish" onClick={() => openDocument(entity.world!.referenceDocumentId!)}>Open lore page</button>}<button className="linkish" onClick={() => openDrawer(positions[entity.id] ?? fallbackPoint(0), entity)}>Edit</button><button className="linkish" onClick={() => { setSelectedId(entity.id); setMode('canvas'); }}>Locate</button></div></article>;
            })}
          </main>
        </div>
      )}

    </div>
  );
}
