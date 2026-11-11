import type { WindowBounds, WorkspaceViewport } from './workspaceLayout';

/** Where a floating card can be snapped on the desk. */
export type CardPlacement = 'left' | 'right' | 'top' | 'bottom' | 'fill';

export const PLACEMENT_LABELS: Record<CardPlacement, string> = {
  left: 'Left half',
  right: 'Right half',
  top: 'Top half',
  bottom: 'Bottom half',
  fill: 'Fill desk',
};

const MARGIN = 8;
const GAP = 8;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;

/** The desk area a card may cover: inset by the margin, with the recall gutter kept free. */
function usableArea(viewport: WorkspaceViewport) {
  const gutter = viewport.gutter ?? 48;
  const right = viewport.width - gutter - MARGIN;
  const bottom = viewport.height - MARGIN;
  return { left: MARGIN, top: MARGIN, right, bottom, width: right - MARGIN, height: bottom - MARGIN };
}

/** Grow a card to the minimum size, but never past the usable area, and keep it inside. */
function clampToArea(bounds: WindowBounds, area: ReturnType<typeof usableArea>): WindowBounds {
  const width = Math.min(Math.max(MIN_WIDTH, bounds.width), area.width);
  const height = Math.min(Math.max(MIN_HEIGHT, bounds.height), area.height);
  return {
    x: Math.max(area.left, Math.min(bounds.x, area.right - width)),
    y: Math.max(area.top, Math.min(bounds.y, area.bottom - height)),
    width,
    height,
  };
}

export function placementBounds(placement: CardPlacement, viewport: WorkspaceViewport): WindowBounds {
  const area = usableArea(viewport);
  const halfWidth = Math.floor((area.width - GAP) / 2);
  const halfHeight = Math.floor((area.height - GAP) / 2);
  const full = { x: area.left, y: area.top, width: area.width, height: area.height };
  const bounds: Record<CardPlacement, WindowBounds> = {
    left: { ...full, width: halfWidth },
    right: { ...full, x: area.left + halfWidth + GAP, width: halfWidth },
    top: { ...full, height: halfHeight },
    bottom: { ...full, y: area.top + halfHeight + GAP, height: halfHeight },
    fill: full,
  };
  return clampToArea(bounds[placement], area);
}

/** Equal full-height columns across the usable desk, left to right, separated by the gap. */
export function sideBySideBounds(count: number, viewport: WorkspaceViewport): WindowBounds[] {
  if (count <= 0) return [];
  const area = usableArea(viewport);
  const width = Math.floor((area.width - GAP * (count - 1)) / count);
  return Array.from({ length: count }, (_, i) => ({
    x: area.left + i * (width + GAP),
    y: area.top,
    width,
    height: area.height,
  }));
}
