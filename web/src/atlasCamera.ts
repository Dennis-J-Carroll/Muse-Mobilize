export type Point = { x: number; y: number };
export type AtlasCamera = Point & { scale: number };
export const clampAtlasScale = (scale: number) => Math.max(.001, Math.min(2, scale));

/** Keep the same map point beneath the gesture's moving midpoint. */
export function pinchCamera(origin: AtlasCamera, start: [Point, Point], current: [Point, Point]): AtlasCamera {
  const midpoint = ([a, b]: [Point, Point]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = ([a, b]: [Point, Point]) => Math.hypot(a.x - b.x, a.y - b.y);
  const from = midpoint(start); const to = midpoint(current);
  const scale = clampAtlasScale(origin.scale * distance(current) / Math.max(1, distance(start)));
  return { scale, x: to.x - (from.x - origin.x) / origin.scale * scale, y: to.y - (from.y - origin.y) / origin.scale * scale };
}

export function zoomCamera(origin: AtlasCamera, factor: number, point: Point): AtlasCamera {
  const scale = clampAtlasScale(origin.scale * factor);
  return { scale, x: point.x - (point.x - origin.x) / origin.scale * scale, y: point.y - (point.y - origin.y) / origin.scale * scale };
}
