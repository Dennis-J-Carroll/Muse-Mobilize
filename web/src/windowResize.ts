import type { WindowBounds, WorkspaceViewport } from './workspaceLayout';

export type ResizeEdge = 'n' | 'e' | 's' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Keep the opposite edge fixed; pointer deltas are measured from the gesture's start. */
export function resizeWindow(start: WindowBounds, edge: ResizeEdge, dx: number, dy: number, viewport: WorkspaceViewport): WindowBounds {
  const rightLimit = Math.max(128, viewport.width - (viewport.gutter ?? 48));
  const bottomLimit = Math.max(128, viewport.height - 8);
  let left = start.x, top = start.y, right = start.x + start.width, bottom = start.y + start.height;
  if (edge.includes('w')) left = clamp(left + dx, 8, right - Math.min(320, right - 8));
  if (edge.includes('e')) right = clamp(right + dx, left + Math.min(320, rightLimit - left), rightLimit);
  if (edge.includes('n')) top = clamp(top + dy, 8, bottom - Math.min(200, bottom - 8));
  if (edge.includes('s')) bottom = clamp(bottom + dy, top + Math.min(200, bottomLimit - top), bottomLimit);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
