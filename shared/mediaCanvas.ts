export type MediaCanvasNodeKind = 'image' | 'audio' | 'video';

export interface MediaCanvasCamera { x: number; y: number; scale: number }

export interface MediaCanvasNode {
  id: string;
  kind: MediaCanvasNodeKind;
  assetSrc: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  resumeAt?: number;
}

export interface MediaCanvasEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
}

export interface MediaCanvasStore {
  version: 1;
  revision: string;
  camera: MediaCanvasCamera;
  nodes: MediaCanvasNode[];
  edges: MediaCanvasEdge[];
}

const NODE_KINDS: MediaCanvasNodeKind[] = ['image', 'audio', 'video'];
const COORD_BOUND = 100_000;
const MIN_DIMENSION = 40;
const MAX_DIMENSION = 4_000;

// Deliberately duplicates web/src/atlasCamera.ts's clamp shape (not its
// bounds) rather than importing it: docs/media-desk-architecture.md defers
// unifying the two into one shared module until Media Desk (a second
// surface) actually consumes the atlas camera code. The bounds here (.05-4)
// are intentionally different from atlasCamera.ts's (.001-2) -- Media Desk
// supports a different zoom range than the World Building atlas. Do NOT
// "sync" the numbers; if the two are ever unified, picking a single bound
// (or keeping both configurable) is a deliberate design decision for
// whoever builds the shared spatial-canvas extraction in a later phase.
export const clampMediaCanvasScale = (scale: number): number => Math.max(.05, Math.min(4, scale));

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function cleanMediaCanvasCamera(value: unknown): MediaCanvasCamera {
  const camera = (value ?? {}) as Partial<MediaCanvasCamera>;
  return {
    x: finite(camera.x, -COORD_BOUND, COORD_BOUND) ? camera.x : 0,
    y: finite(camera.y, -COORD_BOUND, COORD_BOUND) ? camera.y : 0,
    scale: clampMediaCanvasScale(typeof camera.scale === 'number' && Number.isFinite(camera.scale) ? camera.scale : 1),
  };
}

export function cleanMediaCanvasNode(value: unknown): MediaCanvasNode {
  const node = value as Partial<MediaCanvasNode> | undefined;
  const id = String(node?.id ?? '').trim();
  if (!id) throw new Error('media canvas node requires an id');
  const kind = node?.kind as MediaCanvasNodeKind;
  if (!NODE_KINDS.includes(kind)) throw new Error(`media canvas node kind must be one of: ${NODE_KINDS.join(' | ')}`);
  const assetSrc = String(node?.assetSrc ?? '').trim();
  if (!assetSrc) throw new Error('media canvas node requires an asset reference');
  if (!finite(node?.x, -COORD_BOUND, COORD_BOUND) || !finite(node?.y, -COORD_BOUND, COORD_BOUND)) {
    throw new Error('media canvas node position must be finite');
  }
  if (!finite(node?.width, MIN_DIMENSION, MAX_DIMENSION) || !finite(node?.height, MIN_DIMENSION, MAX_DIMENSION)) {
    throw new Error(`media canvas node dimensions must be between ${MIN_DIMENSION} and ${MAX_DIMENSION}`);
  }
  const resumeAt = finite(node?.resumeAt, 0, 1e7) ? node!.resumeAt : undefined;
  return {
    id, kind, assetSrc, label: String(node?.label ?? '').trim().slice(0, 200),
    x: node!.x as number, y: node!.y as number, width: node!.width as number, height: node!.height as number,
    ...(resumeAt !== undefined ? { resumeAt } : {}),
  };
}

export function cleanMediaCanvasEdgeShape(value: unknown): Pick<MediaCanvasEdge, 'fromNodeId' | 'toNodeId' | 'label'> {
  const edge = value as Partial<MediaCanvasEdge> | undefined;
  const fromNodeId = String(edge?.fromNodeId ?? '').trim();
  const toNodeId = String(edge?.toNodeId ?? '').trim();
  if (!fromNodeId || !toNodeId) throw new Error('media canvas edge requires two node ids');
  if (fromNodeId === toNodeId) throw new Error('media canvas edge cannot connect a node to itself');
  return { fromNodeId, toNodeId, label: String(edge?.label ?? '').trim().slice(0, 200) };
}
