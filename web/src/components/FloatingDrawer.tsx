import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import type { FloatingPanel } from '../types';
import { useDrag } from './useDrag';
import { useWritingView } from '../writingView';
import { recallGutter } from '../workspaceLayout';
import { dismissFocusLayer, trapLayerTab } from '../focusLayers';
import { openConnections, targetForEditor } from '../connectionsView';

export function FloatingDrawer({ panel, order, children, hidden = false, focusMode = false }: { panel: FloatingPanel; order: number; children: ReactNode; hidden?: boolean; focusMode?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const wasDocked = useRef(panel.docked);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const workbench = useWritingView((s) => s.workbench);
  const connectionTarget = targetForEditor(panel.id);
  const gutter = focusMode ? 8 : recallGutter(workbench, viewport.width);
  const width = Math.min(panel.width, Math.max(120, viewport.width - gutter - 16));
  const height = Math.min(panel.height, Math.max(120, viewport.height - 16));
  const left = Math.max(8, Math.min(panel.x, viewport.width - width - gutter));
  const top = Math.max(8, Math.min(panel.y, viewport.height - height - 8));
  const move = (dx: number, dy: number) => useStore.getState().moveFloatingPanel(panel.id,
    Math.max(8, Math.min(left + dx, viewport.width - width - gutter)),
    Math.max(8, Math.min(top + dy, viewport.height - height - 8)));
  const drag = useDrag(move);

  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (wasDocked.current === panel.docked) return;
    wasDocked.current = panel.docked;
    if (panel.docked) document.getElementById(`floating-tab-${panel.id}`)?.focus();
    else (lastFocus.current?.isConnected ? lastFocus.current : root.current)?.focus();
  }, [panel.docked, panel.id]);

  useEffect(() => {
    if (focusMode) (lastFocus.current?.isConnected ? lastFocus.current : root.current)?.focus({ preventScroll: true });
  }, [focusMode]);

  return <div
    ref={root}
    id={`floating-${panel.id}`}
    className="floating-drawer"
    role="dialog"
    aria-label={panel.title}
    aria-modal={focusMode || undefined}
    tabIndex={-1}
    style={{ left, top, width, height, zIndex: 1000 + order, display: panel.docked || hidden ? 'none' : 'flex' }}
    onPointerDownCapture={() => useStore.getState().focusFloatingPanel(panel.id)}
    onFocusCapture={(event) => {
      if (event.target !== root.current) lastFocus.current = event.target as HTMLElement;
      useStore.getState().focusFloatingPanel(panel.id);
    }}
    onKeyDown={(event) => {
      if (focusMode) trapLayerTab(event);
      if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (focusMode) dismissFocusLayer();
      else useStore.getState().dockFloatingPanel(panel.id);
    }}
  >
    <header className="floating-drawer-grip">
      <button type="button" className="floating-drawer-move" aria-label={`Move ${panel.title}`} title="Drag to move; arrow keys nudge"
        onPointerDown={drag}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 20 : 5;
          const delta = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : null;
          if (delta) { event.preventDefault(); move(delta[0], delta[1]); }
        }}><span aria-hidden="true">⠿</span><span>{panel.title}</span></button>
      {connectionTarget && <button type="button" className="floating-drawer-dock" aria-label="Tags and links" title="Tags and links" onClick={() => openConnections({ target: connectionTarget })}>#</button>}
      <button type="button" className="floating-drawer-dock" aria-label={focusMode ? 'Return to writing' : 'Send to side'} title={focusMode ? 'Return to writing, keep card draft (Escape)' : 'Send to side (Escape)'}
        onClick={() => focusMode ? dismissFocusLayer() : useStore.getState().dockFloatingPanel(panel.id)}>−</button>
    </header>
    <div className="floating-drawer-body">{children}</div>
  </div>;
}
