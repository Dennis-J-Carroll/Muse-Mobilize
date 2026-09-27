/** Draft text zoom, in percent. Scales only the manuscript text, never the app chrome. */
export const ZOOM_MIN = 70;
export const ZOOM_MAX = 200;
export const ZOOM_DEFAULT = 100;
export function parseZoom(raw: string | null): number {
  if (!raw || !/^\d+$/.test(raw)) return ZOOM_DEFAULT;
  const value = Number(raw);
  return value >= ZOOM_MIN && value <= ZOOM_MAX ? value : ZOOM_DEFAULT;
}
/** One zoom step: 10% increments, clamped to the supported range. */
export function stepZoom(current: number, direction: 1 | -1): number {
  const next = Math.round(current / 10) * 10 + direction * 10;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
}
