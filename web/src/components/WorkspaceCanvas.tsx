import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { useDrag } from './useDrag';
import { EditorPane } from '../panes/EditorPane';
import { AgentPane } from '../panes/AgentPane';
import { EventsPane } from '../panes/EventsPane';
import { ReviewPane } from '../panes/ReviewPane';
import { CanonPane } from '../panes/CanonPane';
import { CharactersPane } from '../panes/CharactersPane';
import { WorldPane } from '../panes/WorldPane';
import { PlotPane } from '../panes/PlotPane';
import { ScenesPane } from '../panes/ScenesPane';
import { DialoguePane } from '../panes/DialoguePane';
import { ThemesPane } from '../panes/ThemesPane';
import { ReferencesPane } from '../panes/ReferencesPane';
import { GoalsPane } from '../panes/GoalsPane';
import { ProgressPane } from '../panes/ProgressPane';
import { SourcesPane } from '../panes/SourcesPane';
import type { Pane } from '../types';
import * as Icon from './icons';
import { useWritingView } from '../writingView';
import { ToolDrawer, type DrawerMode } from './ToolDrawer';
import { fitWindow, isWorkbenchDocument, recallGutter, type WorkspaceViewport, type TileLayout } from '../workspaceLayout';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { WorkbenchRail, type WorkbenchTool } from './WorkbenchRail';
import type { SavedDesk } from '../desks';

/**
 * The Workspace Canvas. Panes are views, not agents (§34.3): the same shell
 * hosts a manuscript, a conversation, or an activity log, and any of them can
 * be resized, minimized, maximized or dismissed without touching the draft.
 */

function PaneBody({ pane }: { pane: Pane }) {
  switch (pane.type) {
    case 'editor':
    case 'notes':
    case 'outline':
      return <EditorPane pane={pane} />;
    case 'agent':
      return <AgentPane pane={pane} />;
    case 'events':
      return <EventsPane />;
    case 'review':
      return <ReviewPane />;
    case 'canon':
      return <CanonPane />;
    case 'characters':
      return <CharactersPane pane={pane} />;
    case 'world':
      return <WorldPane pane={pane} />;
    case 'plot':
      return <PlotPane pane={pane} />;
    case 'scenes':
      return <ScenesPane pane={pane} />;
    case 'dialogue':
      return <DialoguePane pane={pane} />;
    case 'themes':
      return <ThemesPane />;
    case 'references':
      return <ReferencesPane />;
    case 'goals':
      return <GoalsPane />;
    case 'progress':
      return <ProgressPane />;
    case 'sources':
      return <SourcesPane />;
    default:
      return <div className="pane-body">Unknown pane type.</div>;
  }
}

function PaneFrame({ pane, tiled, viewport, onFloat }: { pane: Pane; tiled: boolean; viewport: WorkspaceViewport; onFloat: () => void }) {
  const focusPaneId = useWritingView((s) => s.focusPaneId);
  const setPaneSize = useStore((s) => s.setPaneSize);
  const closePane = useStore((s) => s.closePane);
  const resizePane = useStore((s) => s.resizePane);
  const doc = useStore((s) => (pane.binding?.type === 'document' ? s.docs[pane.binding.id] : undefined));
  const minimized = pane.sizeMode === 'minimized';
  const maximized = pane.sizeMode === 'maximized';
  const ref = useRef<HTMLElement>(null);
  const move = (dx: number, dy: number) => {
    if (!ref.current || (!dx && !dy)) return;
    const box = ref.current.getBoundingClientRect();
    const bounds = fitWindow({ x: box.x + dx, y: box.y + dy, width: box.width, height: box.height }, viewport);
    if (minimized) onFloat();
    useStore.getState().floatPane(pane.id, bounds);
  };
  const onMoveDrag = useDrag(move);
  const resize = (dx: number, dy: number) => {
    const el = ref.current;
    if (!el) return;
    if (tiled) {
      const box = el.getBoundingClientRect();
      useStore.getState().floatPane(pane.id, fitWindow({ x: box.x, y: box.y, width: box.width + dx, height: box.height + dy }, viewport));
    } else resizePane(pane.id, el.offsetWidth + dx, el.offsetHeight + dy);
  };
  const onResizeDrag = useDrag(resize);

  // Expand/restore stays usable from the keyboard: Enter or Space on the
  // header toggle behaves like a click, and the control announces its state.
  const toggleMaximized = () => setPaneSize(pane.id, maximized ? 'normal' : 'maximized');
  const onToggleKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleMaximized(); }
  };

  return (
    <section
      ref={ref}
      id={`workspace-${pane.id}`}
      className={`pane pane-${pane.type} ${minimized ? 'is-min' : ''} ${maximized ? 'pane-maximized' : ''} ${focusPaneId === pane.id ? 'is-writing-focus' : ''}`}
      onPointerDownCapture={() => useStore.getState().raisePane(pane.id)}
      onFocusCapture={() => useStore.getState().raisePane(pane.id)}
    >
      <header className="pane-head">
        <button type="button" className="pane-title pane-move" aria-label={`Move ${pane.title}`} title="Drag to move; arrow keys nudge" onPointerDown={onMoveDrag}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 20 : 5;
            const delta = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : null;
            if (delta) { event.preventDefault(); move(delta[0], delta[1]); }
          }}><span aria-hidden="true" className="pane-grip">⠿</span><span>{pane.title}</span></button>
        {doc?.dirty && <span className="pane-dirty" title="unsaved">•</span>}
        <span className="pane-tools">
          {pane.floating && !minimized && <button title="Return to layout" onClick={() => useStore.getState().returnPaneToLayout(pane.id)}><Icon.Layers size={16} /></button>}
          <button title={minimized ? `Restore ${pane.title} to workspace` : 'Minimize'} onClick={() => setPaneSize(pane.id, minimized ? 'normal' : 'minimized')}>
            {minimized ? <Icon.Expand /> : <Icon.Minus />}
          </button>
          {!minimized && <button type="button" className="pane-expand" onClick={toggleMaximized} onKeyDown={onToggleKey}
            aria-pressed={maximized} aria-label={maximized ? `Restore ${pane.title} to workspace` : `Expand ${pane.title} to full workspace`} title={maximized ? 'Restore' : 'Expand'}>
            <Icon.Expand />
          </button>}
          <button title="Close" onClick={() => closePane(pane.id)}>
            <Icon.Close />
          </button>
        </span>
      </header>
      <div className="pane-body"><PaneBody pane={pane} /></div>
      {pane.sizeMode === 'normal' && <button type="button" className="pane-resize-handle" onPointerDown={onResizeDrag} title="Drag to resize; arrow keys adjust" aria-label={`Resize ${pane.title}`}
        onKeyDown={(event) => {
          const el = ref.current;
          if (!el) return;
          const step = event.shiftKey ? 20 : 5;
          const delta = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : null;
          if (delta) { event.preventDefault(); resize(delta[0], delta[1]); }
        }} />}
    </section>
  );
}

/** Keep each portal target stable while moving its DOM host between regions.
 * Moving the existing host preserves React state; a new portal target would
 * remount the tool and discard unsent questions or other local form state. */
function PaneMount({ pane, target, hidden, focused, order, panelMode, viewport, tiled, onFloat }: { pane: Pane; target: RefObject<HTMLDivElement>; hidden: boolean; focused: boolean; order: number; panelMode?: DrawerMode; viewport: WorkspaceViewport; tiled: boolean; onFloat: () => void }) {
  const [host] = useState(() => document.createElement('div'));
  const wasFocused = useRef(false);
  const movedFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    host.dataset.paneOrder = String(order);
    const next = Array.from(target.current?.children ?? []).find((child) => Number((child as HTMLElement).dataset.paneOrder) > order);
    target.current?.insertBefore(host, next ?? null);
    return () => {
      if (host.contains(document.activeElement)) movedFocus.current = document.activeElement as HTMLElement;
      host.remove();
    };
  }, [host, target, order]);
  useLayoutEffect(() => {
    const floating = pane.floating && pane.sizeMode === 'normal' && !focused ? fitWindow(pane.floating, viewport) : undefined;
    host.className = `pane-slot${floating ? ' is-floating' : ''}`;
    host.id = `tool-content-${pane.id}`;
    host.hidden = hidden;
    if (panelMode) {
      host.setAttribute('role', panelMode === 'tabs' ? 'tabpanel' : 'group');
      host.setAttribute('aria-label', pane.title);
    } else {
      host.removeAttribute('role');
      host.removeAttribute('aria-label');
    }
    if (panelMode === 'tabs') host.setAttribute('aria-labelledby', `tool-tab-${pane.id}`);
    else host.removeAttribute('aria-labelledby');
    const size = floating ?? (pane.sizeMode === 'normal' && !tiled ? pane.size : undefined);
    host.style.width = size ? `${size.width}px` : '';
    host.style.height = size ? `${size.height}px` : '';
    host.style.flex = size ? '0 0 auto' : '';
    host.style.left = floating ? `${floating.x}px` : '';
    host.style.top = floating ? `${floating.y}px` : '';
    host.style.zIndex = floating ? String(pane.floating!.layer) : '';
    // Reparenting can blur the textarea; restore focus after the host arrives.
    if (focused !== wasFocused.current) host.querySelector<HTMLTextAreaElement>('.draft')?.focus({ preventScroll: true });
    else if (movedFocus.current?.getClientRects().length) movedFocus.current.focus({ preventScroll: true });
    movedFocus.current = null;
    wasFocused.current = focused;
  }, [host, target, order, hidden, pane.id, pane.title, pane.size, pane.sizeMode, pane.floating, focused, panelMode, viewport, tiled]);
  return createPortal(<PaneFrame pane={pane} tiled={tiled} viewport={viewport} onFloat={onFloat} />, host);
}

export function WorkspaceCanvas() {
  const panes = useStore((s) => s.panes);
  const rightWidth = useStore((s) => s.rightWidth);
  const bottomHeight = useStore((s) => s.bottomHeight);
  const setRightWidth = useStore((s) => s.setRightWidth);
  const setBottomHeight = useStore((s) => s.setBottomHeight);
  const focusPaneId = useWritingView((s) => s.focusPaneId);
  const projectId = useStore((s) => s.project?.id);
  const workspaceId = useStore((s) => s.activeWorkspace);
  const workbench = useWritingView((s) => s.workbench);
  const beforeWorkbench = useRef(new Map<string, Pane['sizeMode']>());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('tabs');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<TileLayout>('workspace');
  const tileRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const maximumRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const drawerKey = `muse:tool-drawer:${projectId}:${workspaceId ?? 'custom'}`;
  const docked = panes.filter((pane) => pane.sizeMode === 'minimized');
  const activeDockId = docked.find((pane) => pane.id === selectedId)?.id ?? docked[0]?.id;

  useEffect(() => {
    try { setDrawerMode(localStorage.getItem(drawerKey) === 'stack' ? 'stack' : 'tabs'); }
    catch { setDrawerMode('tabs'); }
    setDrawerOpen(false);
    setLayout('workspace');
    useWritingView.getState().setWorkbench(false);
    beforeWorkbench.current.clear();
  }, [drawerKey]);
  useEffect(() => { if (!docked.length) setDrawerOpen(false); }, [docked.length]);
  const closeDrawer = () => {
    setDrawerOpen(false);
    requestAnimationFrame(() => drawerTriggerRef.current?.focus());
  };
  useEffect(() => {
    if (!drawerOpen || focusPaneId) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if (event.target instanceof Element && event.target.closest('.floating-drawer, .modal-backdrop')) return;
      event.preventDefault();
      closeDrawer();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [drawerOpen, focusPaneId]);

  const onDragV = useDrag((dx) => setRightWidth(useStore.getState().rightWidth - dx));
  const onDragH = useDrag((_dx, dy) => setBottomHeight(useStore.getState().bottomHeight - dy));

  const toggleWorkbench = () => {
    const current = useStore.getState().panes;
    if (!workbench) {
      beforeWorkbench.current = new Map(current.map((pane) => [pane.id, pane.sizeMode]));
      useStore.setState({ panes: current.map((pane) => ({ ...pane, sizeMode: isWorkbenchDocument(pane) ? pane.sizeMode === 'maximized' ? 'normal' : pane.sizeMode : 'minimized' })) });
    } else {
      useStore.setState({ panes: current.map((pane) => ({ ...pane, sizeMode: beforeWorkbench.current.get(pane.id) ?? pane.sizeMode })) });
      beforeWorkbench.current.clear();
    }
    useWritingView.getState().setWorkbench(!workbench);
    setDrawerOpen(false);
  };
  const openWorkbenchTool = (tool: WorkbenchTool) => {
    const state = useStore.getState();
    let pane = state.panes.find((pane) => tool.paneId ? pane.id === tool.paneId : pane.type === tool.type && pane.binding?.id === tool.bindingId);
    if (!pane) {
      state.openPane(tool.type, { title: tool.title, bindingId: tool.bindingId });
      pane = useStore.getState().panes.find((pane) => pane.type === tool.type && pane.binding?.id === tool.bindingId);
    }
    if (!pane) return;
    state.setPaneSize(pane.id, 'minimized');
    setSelectedId(pane.id);
    setDrawerOpen(!(drawerOpen && selectedId === pane.id));
  };
  const captureDesk = (name: string): SavedDesk => {
    const state = useStore.getState();
    const view = useWritingView.getState();
    const visible = [...state.panes].sort((a, b) => (a.floating?.layer ?? 0) - (b.floating?.layer ?? 0)).flatMap((pane) => {
      const element = document.getElementById(`workspace-${pane.id}`);
      if (!element?.getClientRects().length) return [];
      const box = element.getBoundingClientRect();
      return [{ x: box.x / window.innerWidth * 320, y: box.y / window.innerHeight * 180,
        width: box.width / window.innerWidth * 320, height: box.height / window.innerHeight * 180,
        title: pane.title, document: pane.binding?.type === 'document' }];
    });
    return {
      version: 1, id: crypto.randomUUID(), name,
      panes: state.panes.map(({ id: _id, ...pane }) => pane),
      view: { layout, workbench, sidebarCollapsed: view.sidebarCollapsed, rightWidth: state.rightWidth, bottomHeight: state.bottomHeight,
        drawerMode, font: view.font, surface: view.surface, weight: view.weight },
      preview: visible,
    };
  };
  const restoreDesk = (desk: SavedDesk) => {
    const state = useStore.getState();
    const view = useWritingView.getState();
    state.restoreDeskPanes(desk.panes);
    state.setRightWidth(desk.view.rightWidth);
    state.setBottomHeight(desk.view.bottomHeight);
    view.focus(null);
    view.setWorkbench(desk.view.workbench);
    view.setSidebarCollapsed(desk.view.sidebarCollapsed);
    view.setFont(desk.view.font);
    view.setSurface(desk.view.surface);
    view.setWeight(desk.view.weight);
    setLayout(desk.view.layout);
    setDrawerMode(desk.view.drawerMode);
    setDrawerOpen(false);
    beforeWorkbench.current.clear();
  };

  const maximized = panes.find((p) => p.sizeMode === 'maximized');
  const active = panes.filter((pane) => pane.sizeMode !== 'minimized' && !pane.floating);
  const isTiled = (pane: Pane) => layout !== 'workspace' && pane.binding?.type === 'document' && pane.sizeMode === 'normal' && !pane.floating && pane.id !== focusPaneId;
  const rw = active.some((pane) => pane.region === 'right' && !isTiled(pane)) ? rightWidth : 0;
  const bh = active.some((pane) => pane.region === 'bottom' && !isTiled(pane)) ? bottomHeight : 0;

  // Expanded panes restore with Escape. This stays out of the way of writing
  // focus (App owns that Escape), browser fullscreen (the browser owns it),
  // and focus layers, modals, and the tool drawer, which each consume their
  // own Escape first. Ordering: layer → drawer → maximized pane → focus.
  const focusLayerOpen = useWritingView((s) => Boolean(s.focusLayer));
  const maximizedId = maximized?.id ?? null;
  useEffect(() => {
    if (!maximizedId || focusPaneId || focusLayerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if (event.target instanceof Element && event.target.closest('.floating-drawer, .modal-backdrop')) return;
      if (document.fullscreenElement) return;
      if (document.querySelector('.modal-backdrop') || document.querySelector('.tool-drawer:not([hidden])')) return;
      event.preventDefault();
      useStore.getState().setPaneSize(maximizedId, 'normal');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximizedId, focusPaneId, focusLayerOpen]);

  return (
    <>
    <WorkspaceToolbar layout={layout} workbench={workbench} onWorkbench={toggleWorkbench} captureDesk={captureDesk} restoreDesk={restoreDesk} onLayout={(next) => { setLayout(next); if (next !== 'workspace') useStore.getState().tileDocuments(); }} />
    <div
      className={`canvas ${maximized ? 'canvas-single' : ''}`}
      style={{
        gridTemplateColumns: `minmax(0,1fr) ${rw ? '7px' : '0px'} ${rw}px`,
        // min-content floors let the desk grow past one viewport and scroll
        // (Phase A) instead of crushing every docked pane into view.
        gridTemplateRows: `minmax(min-content,1fr) ${bh ? '7px' : '0px'} ${bh}px`,
      }}
    >
      <div ref={mainRef} className="region region-main" hidden={Boolean(maximized)}>
        <div ref={tileRef} className={`document-tiles tiles-${layout}`} hidden={!panes.some(isTiled)} />
      </div>
      <div ref={rightRef} className="region region-right" hidden={Boolean(maximized) || rw === 0} />
      <div ref={bottomRef} className="region region-bottom" hidden={Boolean(maximized) || bh === 0} />
      <div ref={maximumRef} className="region region-maximum" hidden={!maximized && !focusPaneId} />
      {!maximized && rw > 0 && <div className="split split-v" onPointerDown={onDragV} title="Drag to resize" />}
      {!maximized && bh > 0 && <div className="split split-h" onPointerDown={onDragH} title="Drag to resize" />}
      {!active.length && <div className="canvas-empty workspace-empty-message">
        <Icon.Feather size={56} />
        <p className="empty-title">{docked.length ? 'Your tools are tucked away.' : 'Start writing your story…'}</p>
        <p className="empty-sub">{docked.length ? 'Open the tool drawer to bring one back.' : 'Use the cards on the left to bring your ideas to life.'}</p>
      </div>}
    </div>
    {createPortal(<div ref={floatingRef} className="workspace-floating-layer" hidden={Boolean(focusPaneId)} />, document.body)}
    {workbench && <WorkbenchRail hidden={Boolean(focusPaneId)} open={drawerOpen} selectedId={activeDockId} onOpen={openWorkbenchTool} />}
    <ToolDrawer panes={docked} open={drawerOpen} hidden={Boolean(focusPaneId)} mode={drawerMode} workbench={workbench}
      selectedId={activeDockId} contentRef={drawerRef} triggerRef={drawerTriggerRef}
      onToggle={() => setDrawerOpen((open) => !open)} onClose={closeDrawer} onSelect={setSelectedId}
      onMode={(mode) => {
        setDrawerMode(mode);
        try { localStorage.setItem(drawerKey, mode); } catch { /* Keep session preference. */ }
      }} />
    {panes.map((pane, order) => <PaneMount key={pane.id} pane={pane} order={order} viewport={{ ...viewport, gutter: recallGutter(workbench, viewport.width) }} focused={pane.id === focusPaneId}
      tiled={isTiled(pane)} onFloat={() => setDrawerOpen(false)}
      panelMode={pane.sizeMode === 'minimized' && pane.id !== focusPaneId ? drawerMode : undefined}
      target={pane.id === focusPaneId ? maximumRef : pane.sizeMode === 'minimized' ? drawerRef : pane.id === maximized?.id ? maximumRef : pane.floating ? floatingRef : isTiled(pane) ? tileRef : pane.region === 'main' ? mainRef : pane.region === 'right' ? rightRef : bottomRef}
      hidden={pane.id === focusPaneId ? false : pane.sizeMode === 'minimized' ? drawerMode === 'tabs' && pane.id !== activeDockId : Boolean(maximized && pane.id !== maximized.id)} />)}
    </>
  );
}
