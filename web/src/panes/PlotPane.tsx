import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { ImageGalleryEditor, StoryImageStrip } from '../components/ImageGalleryEditor';
import { openFloatingEditor } from '../components/floatingEditors';
import { DraftRecoveryNotice, useRecoverableDraft } from '../useRecoverableDraft';
import type {
  CanonEntity, Pane, PlotEdgeRelation, PlotNode, PlotNodeKind, PlotWorldRef, PlotWorldRole, StoryImage,
} from '../types';

type Point = { x: number; y: number };

const NODE_KINDS: PlotNodeKind[] = ['beat', 'turn', 'reveal', 'climax', 'resolution'];
const EDGE_RELATIONS: PlotEdgeRelation[] = ['sequence', 'branch', 'merge', 'cause'];
const WORLD_ROLES: PlotWorldRole[] = ['setting', 'constraint', 'catalyst', 'affected'];
const KIND_LABEL: Record<PlotNodeKind, string> = {
  beat: 'Beat', turn: 'Turn', reveal: 'Reveal', climax: 'Climax', resolution: 'Resolution',
};
const KIND_MARK: Record<PlotNodeKind, string> = {
  beat: '•', turn: '↯', reveal: '◉', climax: '▲', resolution: '∴',
};
const ROLE_LABEL: Record<PlotWorldRole, string> = {
  setting: 'Setting', constraint: 'Constraint', catalyst: 'Catalyst', affected: 'Affected',
};

const emptyDetails = (): PlotNode['details'] => ({ goal: '', conflict: '', stakes: '', outcome: '', notes: '' });

function edgePath(from: Point, to: Point): string {
  const direction = to.x >= from.x ? 1 : -1;
  const pull = Math.max(80, Math.min(220, Math.abs(to.x - from.x) * .46));
  return `M ${from.x} ${from.y} C ${from.x + pull * direction} ${from.y}, ${to.x - pull * direction} ${to.y}, ${to.x} ${to.y}`;
}

function nextPoint(nodes: PlotNode[]): Point {
  if (!nodes.length) return { x: 180, y: 280 };
  return { x: Math.max(...nodes.map((node) => node.position.x)) + 270, y: 280 };
}

function PlotDrawer({
  node,
  point,
  onClose,
  onSaved,
}: {
  node?: PlotNode;
  point: Point;
  onClose: () => void;
  onSaved: (node: PlotNode) => void;
}) {
  const project = useStore((s) => s.project);
  const canon = useStore((s) => s.canon);
  const documents = project?.documents ?? [];
  const worldEntities = useMemo(() => (canon?.entities ?? []).filter((entity) => entity.type !== 'character'), [canon]);
  const draftFrom = (item?: PlotNode) => ({ title: item?.title ?? '', kind: item?.kind ?? 'beat' as PlotNodeKind, section: item?.section ?? 'Act I', summary: item?.summary ?? '', details: item?.details ?? emptyDetails(), documentId: item?.documentId ?? '', images: item?.images ?? [] as StoryImage[], anchors: Array.from({ length: Math.max(3, item?.worldRefs.length ?? 0) }, (_, index) => item?.worldRefs[index] ?? { entityId: '', role: 'setting' as PlotWorldRole }), point: item?.position ?? point });
  const recovery = useRecoverableDraft('plot', node?.id ?? 'new', () => draftFrom(node));
  const [title, setTitle] = recovery.field('title');
  const [kind, setKind] = recovery.field('kind');
  const [section, setSection] = recovery.field('section');
  const [summary, setSummary] = recovery.field('summary');
  const [details, setDetails] = recovery.field('details');
  const [documentId, setDocumentId] = recovery.field('documentId');
  const [images, setImages] = recovery.field('images');
  const [uploadingImages, setUploadingImages] = useState(false);
  const [anchors, setAnchors] = recovery.field('anchors');
  const titleRef = useRef<HTMLInputElement>(null);
  const close = () => { if (!uploadingImages) onClose(); };

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const setDetail = (key: keyof PlotNode['details'], value: string) => setDetails((current) => ({ ...current, [key]: value }));
  const setAnchor = (index: number, patch: Partial<{ entityId: string; role: PlotWorldRole }>) => setAnchors((current) => current.map((anchor, i) => (i === index ? { ...anchor, ...patch } : anchor)));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || uploadingImages) return;
    const checkpoint = recovery.checkpoint();
    const recordId = node?.id ?? recovery.recordId;
    const worldRefs = anchors.filter((anchor) => anchor.entityId) as PlotWorldRef[];
    const input = {
      title: title.trim(), summary: summary.trim(), kind, section: section.trim(), position: recovery.draft.point,
      details, documentId, worldRefs, images,
    };
    const saved = recordId
      ? await useStore.getState().updatePlotNode(recordId, input)
      : await useStore.getState().createPlotNode(input);
    if (saved) { recovery.rememberRecord(saved.id); if (recovery.completeSave(checkpoint, draftFrom(saved))) onSaved(saved); }
  };

  return (
      <form className="plot-drawer" onSubmit={save}>
        <header><div><span>Story folio</span><h2>{node ? `Revise ${node.title}` : 'Add plot beat'}</h2></div><button type="button" className="drawer-close" aria-label="Close" onClick={close} disabled={uploadingImages}>×</button></header>
        <div className="drawer-scroll">
          <DraftRecoveryNotice recovery={recovery} />
          <section className="drawer-section">
            <h3>Place in story</h3>
            <div className="drawer-grid">
              <label className="span-2">Title<input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Imperial seal revealed" /></label>
              <label>Kind<select value={kind} onChange={(event) => setKind(event.target.value as PlotNodeKind)}>{NODE_KINDS.map((item) => <option key={item} value={item}>{KIND_LABEL[item]}</option>)}</select></label>
              <label>Section<input value={section} onChange={(event) => setSection(event.target.value)} placeholder="Act I" /></label>
              <label className="span-2">What changes?<textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Recognition changes Senna’s objective." /></label>
            </div>
          </section>
          <section className="drawer-section">
            <h3>Beat mechanics</h3>
            <div className="drawer-grid">
              <label>Goal<textarea rows={3} value={details.goal} onChange={(event) => setDetail('goal', event.target.value)} /></label>
              <label>Conflict<textarea rows={3} value={details.conflict} onChange={(event) => setDetail('conflict', event.target.value)} /></label>
              <label>Stakes<textarea rows={3} value={details.stakes} onChange={(event) => setDetail('stakes', event.target.value)} /></label>
              <label>Outcome<textarea rows={3} value={details.outcome} onChange={(event) => setDetail('outcome', event.target.value)} /></label>
              <label className="span-2">Private planning notes<textarea rows={3} value={details.notes} onChange={(event) => setDetail('notes', event.target.value)} /></label>
            </div>
          </section>
          <section className="drawer-section">
            <h3>Detail page</h3>
            <div className="drawer-grid"><label className="span-2">Bound document<select value={documentId} onChange={(event) => setDocumentId(event.target.value)}><option value="">No bound page</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title} · {document.kind}</option>)}</select></label></div>
          </section>
          <section className="drawer-section">
            <h3>Visual references</h3>
            <ImageGalleryEditor images={images} onChange={setImages} noun="plot beat" onBusyChange={setUploadingImages} />
          </section>
          <section className="drawer-section">
            <h3>World anchors · optional</h3>
            <p className="plot-drawer-note">Up to three quiet references. World Atlas remains source of truth.</p>
            <div className="plot-anchor-editor">
              {anchors.map((anchor, index) => <div key={index}><span>{index + 1}</span><select aria-label={`World anchor ${index + 1}`} value={anchor.entityId} onChange={(event) => setAnchor(index, { entityId: event.target.value })}><option value="">No anchor</option>{worldEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name} · {entity.type}</option>)}</select><select aria-label={`World anchor ${index + 1} role`} value={anchor.role} disabled={!anchor.entityId} onChange={(event) => setAnchor(index, { role: event.target.value as PlotWorldRole })}>{WORLD_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></div>)}
            </div>
          </section>
        </div>
        <footer><button type="button" className="btn" onClick={() => { recovery.discard(); close(); }} disabled={uploadingImages}>Cancel</button><button className="btn btn-primary" disabled={!title.trim() || uploadingImages}>{uploadingImages ? 'Adding images…' : node ? 'Save folio' : 'Add to through-line'}</button></footer>
      </form>
  );
}

export function openPlotEditor(point: Point, node?: PlotNode, onSaved?: (node: PlotNode) => void) {
  openFloatingEditor({
    id: `plot:${node?.id ?? 'new'}`, paneType: 'plot', title: node ? `Revise ${node.title}` : 'Add plot beat', width: 610,
    render: (close) => <PlotDrawer node={node} point={point} onClose={close} onSaved={(saved) => { onSaved?.(saved); close(); }} />,
  });
}

export function PlotPane({ pane }: { pane: Pane }) {
  const plot = useStore((s) => s.plot);
  const canon = useStore((s) => s.canon);
  const focusNodeId = useStore((s) => s.plotFocusNodeId);
  const project = useStore((s) => s.project);
  const documents = project?.documents ?? [];
  const agents = useStore((s) => s.agents);
  const [selectedId, setSelectedId] = useState('');
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showWorld, setShowWorld] = useState(false);
  const [edgeTarget, setEdgeTarget] = useState('');
  const [edgeRelation, setEdgeRelation] = useState<PlotEdgeRelation>('sequence');
  const [edgeLabel, setEdgeLabel] = useState('');
  const [edgeEdit, setEdgeEdit] = useState<{ id: string; relation: PlotEdgeRelation; label: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; clientX: number; clientY: number; origin: Point } | null>(null);
  const initializedSelection = useRef(false);
  const openDrawer = (point: Point, node?: PlotNode) => openPlotEditor(point, node, (saved) => { setSelectedId(saved.id); setExpanded((current) => new Set(current).add(saved.id)); });

  useEffect(() => { void Promise.all([useStore.getState().loadPlot(), useStore.getState().loadCanon()]); }, []);

  const nodes = useMemo(() => plot?.nodes ?? [], [plot]);
  const edges = useMemo(() => plot?.edges ?? [], [plot]);
  const worldEntities = useMemo(() => (canon?.entities ?? []).filter((entity) => entity.type !== 'character'), [canon]);
  const worldById = useMemo(() => new Map(worldEntities.map((entity) => [entity.id, entity])), [worldEntities]);

  useEffect(() => { setPositions(Object.fromEntries(nodes.map((node) => [node.id, node.position]))); }, [nodes]);
  useEffect(() => {
    if (focusNodeId && nodes.some((node) => node.id === focusNodeId)) {
      setSelectedId(focusNodeId);
      setExpanded((current) => new Set(current).add(focusNodeId));
      initializedSelection.current = true;
      useStore.setState({ plotFocusNodeId: null });
      return;
    }
    if (!initializedSelection.current && nodes[0]) {
      initializedSelection.current = true;
      setSelectedId(nodes[0].id);
    }
    if (selectedId && !nodes.some((node) => node.id === selectedId)) setSelectedId(nodes[0]?.id ?? '');
  }, [focusNodeId, nodes, selectedId]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setPositions((current) => ({ ...current, [drag.id]: { x: drag.origin.x + event.clientX - drag.clientX, y: drag.origin.y + event.clientY - drag.clientY } }));
    };
    const up = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const dx = event.clientX - drag.clientX;
      const dy = event.clientY - drag.clientY;
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      const point = { x: Math.round((drag.origin.x + dx) / 20) * 20, y: Math.round((drag.origin.y + dy) / 40) * 40 };
      setPositions((current) => ({ ...current, [drag.id]: point }));
      void useStore.getState().updatePlotNode(drag.id, { position: point });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, []);

  const selected = nodes.find((node) => node.id === selectedId);
  const selectedEdges = edges.filter((edge) => edge.from === selectedId || edge.to === selectedId);
  const stageWidth = Math.max(1300, ...nodes.map((node) => (positions[node.id]?.x ?? node.position.x) + 420));
  const stageHeight = Math.max(720, ...nodes.map((node) => (positions[node.id]?.y ?? node.position.y) + 260));
  const columns = Array.from({ length: Math.ceil(stageWidth / 260) }, (_, index) => 130 + index * 260);
  const sections = Array.from(new Set(nodes.map((node) => node.section || 'Unsectioned'))).map((section) => ({
    section,
    x: Math.min(...nodes.filter((node) => (node.section || 'Unsectioned') === section).map((node) => positions[node.id]?.x ?? node.position.x)),
  }));

  const moveNode = (node: PlotNode, dx: number, dy: number) => {
    const current = positions[node.id] ?? node.position;
    const point = { x: current.x + dx, y: current.y + dy };
    setPositions((all) => ({ ...all, [node.id]: point }));
    void useStore.getState().updatePlotNode(node.id, { position: point });
  };

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !edgeTarget) return;
    const created = await useStore.getState().createPlotEdge({ from: selected.id, to: edgeTarget, relation: edgeRelation, label: edgeLabel.trim() });
    if (created) { setEdgeTarget(''); setEdgeLabel(''); }
  };

  const saveEdge = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!edgeEdit) return;
    const updated = await useStore.getState().updatePlotEdge(edgeEdit.id, {
      relation: edgeEdit.relation,
      label: edgeEdit.label,
    });
    if (updated) setEdgeEdit(null);
  };

  const openDocument = (documentId: string) => {
    useStore.getState().setPaneSize(pane.id, 'normal');
    useStore.getState().openPane('editor', { bindingId: documentId, region: 'right' });
  };

  const locateWorld = (entityId: string) => {
    useStore.setState({ worldFocusEntityId: entityId });
    useStore.getState().openPane('world', { title: 'World Atlas', region: 'main', focus: true });
  };

  const openArchitect = () => {
    useStore.getState().setPaneSize(pane.id, 'normal');
    useStore.getState().openPane('agent', { bindingId: 'architect', region: 'right' });
  };

  const toggleExpanded = (nodeId: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
    return next;
  });

  const centerNode = (nodeId: string) => {
    const point = positions[nodeId];
    const scroller = scrollRef.current;
    if (!point || !scroller) return;
    scroller.scrollTo({ left: Math.max(0, point.x - scroller.clientWidth / 2), top: Math.max(0, point.y - scroller.clientHeight / 2), behavior: 'smooth' });
  };

  if (!plot || !canon) return <div className="pane-body pane-loading">Threading plot…</div>;

  return (
    <div className="plot-workspace">
      <header className="plot-toolbar">
        <div className="plot-heading"><span>Story current</span><h2>{useStore.getState().project?.name ?? 'Plot outline'}</h2></div>
        <div className="plot-count"><b>{nodes.length}</b><span>{nodes.length === 1 ? 'beat' : 'beats'}</span><i /> <b>{edges.length}</b><span>threads</span></div>
        <button className={`plot-world-toggle ${showWorld ? 'is-on' : ''}`} aria-pressed={showWorld} onClick={() => setShowWorld((value) => !value)}><i>⌖</i> World pins</button>
        <button className="btn" onClick={() => openDrawer(nextPoint(nodes))}>+ Add beat</button>
      </header>

      <div className="plot-scroll" ref={scrollRef}>
        <div className="plot-stage" style={{ width: stageWidth, height: stageHeight }}>
          <div className="plot-current-line" style={{ width: stageWidth - 120 }} />
          {columns.map((x, index) => <div key={x} className="plot-column" style={{ left: x }}><span>{String(index + 1).padStart(2, '0')}</span></div>)}
          {sections.map(({ section, x }) => <div key={section} className="plot-section-label" style={{ left: Math.max(24, x - 88) }}>{section}</div>)}
          <svg className="plot-threads" width={stageWidth} height={stageHeight} aria-hidden>
            <defs><marker id="plot-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
            {edges.map((edge) => {
              const from = positions[edge.from]; const to = positions[edge.to];
              if (!from || !to) return null;
              const active = edge.from === selectedId || edge.to === selectedId;
              return <g key={edge.id} className={`plot-thread relation-${edge.relation} ${active ? 'is-active' : ''}`}><path d={edgePath(from, to)} markerEnd="url(#plot-arrow)" /><text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 9}>{edge.label || edge.relation}</text></g>;
            })}
          </svg>

          {nodes.map((node) => {
            const point = positions[node.id] ?? node.position;
            const isExpanded = expanded.has(node.id);
            return <article key={node.id} className={`plot-node kind-${node.kind} ${selectedId === node.id ? 'is-selected' : ''} ${isExpanded ? 'is-expanded' : ''}`} style={{ left: point.x, top: point.y }}>
              <button
                className="plot-node-main"
                aria-label={`${KIND_LABEL[node.kind]}: ${node.title}`}
                onPointerDown={(event) => { event.stopPropagation(); setSelectedId(node.id); dragRef.current = { id: node.id, clientX: event.clientX, clientY: event.clientY, origin: point }; }}
                onClick={() => setSelectedId(node.id)}
                onKeyDown={(event) => {
                  const amount = event.shiftKey ? 40 : 10;
                  const delta = event.key === 'ArrowLeft' ? [-amount, 0] : event.key === 'ArrowRight' ? [amount, 0] : event.key === 'ArrowUp' ? [0, -amount] : event.key === 'ArrowDown' ? [0, amount] : null;
                  if (delta) { event.preventDefault(); moveNode(node, delta[0], delta[1]); }
                }}
              >
                <span className="plot-knot">{KIND_MARK[node.kind]}</span>
                <span className="plot-node-copy">{node.images?.[0] && <img className="plot-node-thumbnail" src={node.images[0].src} alt="" />}<small>{node.section || 'Unsectioned'} · {KIND_LABEL[node.kind]}</small><strong>{node.title}</strong>{isExpanded && <p>{node.summary || 'No change summary yet.'}</p>}</span>
              </button>
              <button className="plot-expand" aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.title}`} aria-expanded={isExpanded} onClick={() => toggleExpanded(node.id)}>{isExpanded ? '−' : '+'}</button>
              {showWorld && node.worldRefs.length > 0 && <div className="plot-node-world">{node.worldRefs.map((ref) => { const entity = worldById.get(ref.entityId); return <span key={ref.entityId} title={`${ROLE_LABEL[ref.role]}: ${entity?.name ?? 'Missing world entity'}`}>⌖</span>; })}</div>}
            </article>;
          })}

          {!nodes.length && <div className="plot-empty"><span><i /></span><h3>Through-line begins here</h3><p>Add first beat, then branch when story demands another path.</p><button className="btn" onClick={() => openDrawer({ x: 180, y: 280 })}>Add opening beat</button></div>}
        </div>
      </div>

      {selected && <aside className="plot-folio">
        <header><div><span>{selected.section || 'Unsectioned'} · {KIND_LABEL[selected.kind]}</span><h1>{selected.title}</h1></div><button onClick={() => setSelectedId('')} aria-label="Close folio">×</button></header>
        <div className="plot-folio-scroll">
          <section className="plot-change"><span>Change</span><p>{selected.summary || 'No change summary yet.'}</p></section>
          <StoryImageStrip images={selected.images ?? []} label={`${selected.title} visual references`} />
          <section className="plot-mechanics">{(['goal', 'conflict', 'stakes', 'outcome'] as const).map((key) => <div key={key}><span>{key}</span><p>{selected.details[key] || '—'}</p></div>)}</section>
          {selected.details.notes && <section className="plot-notes"><span>Planning notes</span><p>{selected.details.notes}</p></section>}
          <section className="plot-world-anchors"><h3>World anchors <span>{selected.worldRefs.length}/3</span></h3>{selected.worldRefs.length ? selected.worldRefs.map((ref) => { const entity = worldById.get(ref.entityId); return <div key={ref.entityId}><i>⌖</i><p><small>{ROLE_LABEL[ref.role]}</small><strong>{entity?.name ?? 'Missing world entity'}</strong></p>{entity && <button className="linkish" onClick={() => locateWorld(entity.id)}>Locate in Atlas</button>}</div>; }) : <p>None. Plot stands without World context.</p>}</section>
          <section className="plot-connections"><h3>Story threads <span>{selectedEdges.length}</span></h3>{selectedEdges.length ? selectedEdges.map((edge) => { const outward = edge.from === selected.id; const other = nodes.find((node) => node.id === (outward ? edge.to : edge.from)); const editing = edgeEdit?.id === edge.id; return <div className={`plot-connection-row ${editing ? 'is-editing' : ''}`} key={edge.id}><button className="plot-connection-jump" onClick={() => { if (other) { setSelectedId(other.id); centerNode(other.id); } }}><i className={`relation-${edge.relation}`} /><span>{outward ? 'to' : 'from'} · {edge.relation}</span><strong>{other?.title ?? 'Missing beat'}</strong><em>{edge.label || 'No path text'}</em></button><button className="plot-connection-edit" aria-label={`Edit thread to ${other?.title ?? 'missing beat'}`} onClick={() => setEdgeEdit({ id: edge.id, relation: edge.relation, label: edge.label })}>{editing ? 'Editing' : 'Edit text'}</button>{editing && <form className="plot-edge-edit" onSubmit={saveEdge}><select aria-label="Thread type" value={edgeEdit.relation} onChange={(event) => setEdgeEdit({ ...edgeEdit, relation: event.target.value as PlotEdgeRelation })}>{EDGE_RELATIONS.map((relation) => <option key={relation} value={relation}>{relation}</option>)}</select><input aria-label="Thread text" autoFocus value={edgeEdit.label} onChange={(event) => setEdgeEdit({ ...edgeEdit, label: event.target.value })} placeholder="e.g. quiet path" /><div><button type="button" className="linkish" onClick={() => setEdgeEdit(null)}>Cancel</button><button className="btn btn-primary">Save thread</button></div></form>}</div>; }) : <p>No connected beats yet.</p>}</section>
          {nodes.length > 1 && <form className="plot-connect" onSubmit={connect}><h3>Draw story thread</h3><select aria-label="Connection type" value={edgeRelation} onChange={(event) => setEdgeRelation(event.target.value as PlotEdgeRelation)}>{EDGE_RELATIONS.map((relation) => <option key={relation} value={relation}>{relation}</option>)}</select><select aria-label="Connection target" value={edgeTarget} onChange={(event) => setEdgeTarget(event.target.value)}><option value="">Choose next beat</option>{nodes.filter((node) => node.id !== selected.id).map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select><input aria-label="Connection label" value={edgeLabel} onChange={(event) => setEdgeLabel(event.target.value)} placeholder="optional path label" /><button className="btn" disabled={!edgeTarget}>Connect</button></form>}
        </div>
        <footer>{selected.documentId && documents.some((document) => document.id === selected.documentId) && <button className="btn" onClick={() => openDocument(selected.documentId!)}>Open bound page</button>}<button className="btn" onClick={() => openDrawer(selected.position, selected)}>Edit folio</button>{agents.some((agent) => agent.id === 'architect') && <button className="linkish" onClick={openArchitect}>ask Architect</button>}</footer>
      </aside>}

    </div>
  );
}
