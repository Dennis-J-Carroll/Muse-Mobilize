import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, exists } from './paths.js';
import {
  cleanMediaCanvasCamera, cleanMediaCanvasEdgeShape, cleanMediaCanvasNode,
} from '../../shared/mediaCanvas.js';
import type {
  MediaCanvasCamera, MediaCanvasEdge, MediaCanvasNode, MediaCanvasNodeKind, MediaCanvasStore,
} from '../../shared/mediaCanvas.js';

export const EMPTY_REVISION = 'empty';

const canvasPath = (projectDir: string) => path.join(projectDir, 'media', 'canvases', 'default.json');
const emptyCanvas = (): MediaCanvasStore => ({ version: 1, revision: EMPTY_REVISION, camera: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] });

export async function readMediaCanvas(projectDir: string): Promise<MediaCanvasStore> {
  const file = canvasPath(projectDir);
  if (!(await exists(file))) return emptyCanvas();
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<MediaCanvasStore>;
  return {
    version: 1,
    revision: typeof parsed.revision === 'string' ? parsed.revision : EMPTY_REVISION,
    camera: cleanMediaCanvasCamera(parsed.camera),
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    edges: Array.isArray(parsed.edges) ? parsed.edges : [],
  };
}

async function writeMediaCanvas(projectDir: string, store: Omit<MediaCanvasStore, 'revision'>): Promise<MediaCanvasStore> {
  const file = canvasPath(projectDir);
  await ensureDir(path.dirname(file));
  const stamped: MediaCanvasStore = { ...store, revision: randomUUID() };
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(stamped, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return stamped;
}

// Mirrors connections.ts's `mutate`: all canvas mutations for one project
// share this queue, so a create/update/remove always reads the previous
// mutation's result instead of racing it.
const queues = new Map<string, Promise<unknown>>();
function withCanvasLock<T>(projectDir: string, operation: () => Promise<T>): Promise<T> {
  const key = path.resolve(projectDir);
  const result = (queues.get(key) ?? Promise.resolve()).then(operation);
  const settled = result.then(() => undefined, () => undefined);
  queues.set(key, settled);
  void settled.then(() => { if (queues.get(key) === settled) queues.delete(key); });
  return result;
}

function requireRevision(store: MediaCanvasStore, expectedRevision: unknown): void {
  if (store.revision !== expectedRevision) {
    throw new Error('Media canvas changed since it was opened. Reload Media Desk before saving.');
  }
}

export interface CreateMediaCanvasNodeInput {
  kind: MediaCanvasNodeKind;
  assetSrc: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  resumeAt?: number;
}

export async function createMediaCanvasNode(
  projectDir: string,
  expectedRevision: unknown,
  input: CreateMediaCanvasNodeInput,
): Promise<{ node: MediaCanvasNode; store: MediaCanvasStore }> {
  return withCanvasLock(projectDir, async () => {
    const store = await readMediaCanvas(projectDir);
    requireRevision(store, expectedRevision);
    const node = cleanMediaCanvasNode({ ...input, id: randomUUID() });
    store.nodes.push(node);
    const saved = await writeMediaCanvas(projectDir, store);
    return { node, store: saved };
  });
}

export async function updateMediaCanvasNode(
  projectDir: string,
  expectedRevision: unknown,
  nodeId: string,
  patch: Partial<Pick<MediaCanvasNode, 'label' | 'x' | 'y' | 'width' | 'height' | 'resumeAt'>>,
): Promise<{ node: MediaCanvasNode; store: MediaCanvasStore }> {
  return withCanvasLock(projectDir, async () => {
    const store = await readMediaCanvas(projectDir);
    requireRevision(store, expectedRevision);
    const index = store.nodes.findIndex((n) => n.id === nodeId);
    if (index === -1) throw new Error(`No such media canvas node: ${nodeId}`);
    const merged = cleanMediaCanvasNode({ ...store.nodes[index], ...patch });
    store.nodes[index] = merged;
    const saved = await writeMediaCanvas(projectDir, store);
    return { node: merged, store: saved };
  });
}

export async function removeMediaCanvasNode(
  projectDir: string,
  expectedRevision: unknown,
  nodeId: string,
): Promise<{ removedNode: MediaCanvasNode; store: MediaCanvasStore }> {
  return withCanvasLock(projectDir, async () => {
    const store = await readMediaCanvas(projectDir);
    requireRevision(store, expectedRevision);
    const removedNode = store.nodes.find((n) => n.id === nodeId);
    if (!removedNode) throw new Error(`No such media canvas node: ${nodeId}`);
    store.nodes = store.nodes.filter((n) => n.id !== nodeId);
    store.edges = store.edges.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId);
    const saved = await writeMediaCanvas(projectDir, store);
    return { removedNode, store: saved };
  });
}

export async function createMediaCanvasEdge(
  projectDir: string,
  expectedRevision: unknown,
  input: unknown,
): Promise<{ edge: MediaCanvasEdge; store: MediaCanvasStore }> {
  return withCanvasLock(projectDir, async () => {
    const store = await readMediaCanvas(projectDir);
    requireRevision(store, expectedRevision);
    const shape = cleanMediaCanvasEdgeShape(input);
    const nodeIds = new Set(store.nodes.map((n) => n.id));
    if (!nodeIds.has(shape.fromNodeId) || !nodeIds.has(shape.toNodeId)) {
      throw new Error('media canvas edge endpoints must reference existing nodes');
    }
    const edge: MediaCanvasEdge = { id: randomUUID(), ...shape };
    store.edges.push(edge);
    const saved = await writeMediaCanvas(projectDir, store);
    return { edge, store: saved };
  });
}

export async function removeMediaCanvasEdge(
  projectDir: string,
  expectedRevision: unknown,
  edgeId: string,
): Promise<{ store: MediaCanvasStore }> {
  return withCanvasLock(projectDir, async () => {
    const store = await readMediaCanvas(projectDir);
    requireRevision(store, expectedRevision);
    if (!store.edges.some((e) => e.id === edgeId)) throw new Error(`No such media canvas edge: ${edgeId}`);
    store.edges = store.edges.filter((e) => e.id !== edgeId);
    const saved = await writeMediaCanvas(projectDir, store);
    return { store: saved };
  });
}

export async function updateMediaCanvasCamera(
  projectDir: string,
  expectedRevision: unknown,
  camera: unknown,
): Promise<{ store: MediaCanvasStore }> {
  return withCanvasLock(projectDir, async () => {
    const store = await readMediaCanvas(projectDir);
    requireRevision(store, expectedRevision);
    store.camera = cleanMediaCanvasCamera(camera);
    const saved = await writeMediaCanvas(projectDir, store);
    return { store: saved };
  });
}
