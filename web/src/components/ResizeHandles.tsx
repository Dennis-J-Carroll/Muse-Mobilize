import { useEffect, useRef, type RefObject } from 'react';
import { resizeWindow, type ResizeEdge } from '../windowResize';
import type { WindowBounds, WorkspaceViewport } from '../workspaceLayout';

const edges: { edge: ResizeEdge; name: string }[] = [
  { edge: 'n', name: 'top' }, { edge: 'e', name: 'right' }, { edge: 's', name: 'bottom' }, { edge: 'w', name: 'left' },
  { edge: 'nw', name: 'top left' }, { edge: 'ne', name: 'top right' }, { edge: 'sw', name: 'bottom left' }, { edge: 'se', name: 'bottom right' },
];

/** Thin pointer targets around the frame; one keyboard stop avoids eight extra tabs per pane. */
export function ResizeHandles({ label, frame, viewport, resize }: {
  label: string; frame: RefObject<HTMLElement>; viewport: WorkspaceViewport;
  resize: (bounds: WindowBounds, edge: ResizeEdge) => void;
}) {
  const drag = useRef<{ pointerId: number; x: number; y: number; bounds: WindowBounds; edge: ResizeEdge; viewport: WorkspaceViewport } | null>(null);
  const latest = useRef(resize); latest.current = resize;
  useEffect(() => {
    const stop = () => { drag.current = null; document.body.classList.remove('is-resizing-window'); document.body.style.removeProperty('--window-resize-cursor'); };
    const move = (event: PointerEvent) => {
      const start = drag.current;
      if (!start || event.pointerId !== start.pointerId) return;
      latest.current(resizeWindow(start.bounds, start.edge, event.clientX - start.x, event.clientY - start.y, start.viewport), start.edge);
    };
    const up = (event: PointerEvent) => { if (drag.current?.pointerId === event.pointerId) stop(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', stop);
    return () => {
      if (drag.current) stop();
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up); window.removeEventListener('blur', stop);
    };
  }, []);
  return <>{edges.map(({ edge, name }) => <button key={edge} type="button"
    className={`window-resize-handle resize-${edge}${edge === 'se' ? ' pane-resize-handle' : ''}`}
    tabIndex={edge === 'se' ? 0 : -1} aria-label={edge === 'se' ? `Resize ${label}` : `Resize ${label} from ${name}`}
    title={`Drag ${name} border to resize; arrow keys adjust`}
    onPointerDown={event => {
      if (event.button !== 0 || !frame.current) return;
      event.preventDefault(); event.stopPropagation();
      const box = frame.current.getBoundingClientRect();
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, bounds: { x: box.x, y: box.y, width: box.width, height: box.height }, edge, viewport };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.setProperty('--window-resize-cursor', getComputedStyle(event.currentTarget).cursor);
      document.body.classList.add('is-resizing-window');
    }}
    onKeyDown={event => {
      const box = frame.current?.getBoundingClientRect();
      if (!box) return;
      const step = event.shiftKey ? 20 : 5;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      if (!dx && !dy) return;
      event.preventDefault(); event.stopPropagation();
      resize(resizeWindow({ x: box.x, y: box.y, width: box.width, height: box.height }, edge, dx, dy, viewport), edge);
    }}
  />)}</>;
}
