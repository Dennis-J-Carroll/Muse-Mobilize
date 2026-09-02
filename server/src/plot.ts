import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, exists } from './paths.js';
import type {
  PlotEdge, PlotEdgeRelation, PlotGraph, PlotNode, PlotNodeKind, PlotWorldRef, PlotWorldRole,
} from './types.js';

const NODE_KINDS: PlotNodeKind[] = ['beat', 'turn', 'reveal', 'climax', 'resolution'];
const EDGE_RELATIONS: PlotEdgeRelation[] = ['sequence', 'branch', 'merge', 'cause'];
const WORLD_ROLES: PlotWorldRole[] = ['setting', 'constraint', 'catalyst', 'affected'];
const emptyPlot = (): PlotGraph => ({ version: 1, nodes: [], edges: [] });
const plotPath = (projectDir: string) => path.join(projectDir, 'plot', 'plot.json');

function coordinate(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(Math.max(-100000, Math.min(100000, parsed)) * 10) / 10;
}

function cleanDetails(value: Partial<PlotNode['details']> | undefined): PlotNode['details'] {
  return {
    goal: String(value?.goal ?? '').trim(),
    conflict: String(value?.conflict ?? '').trim(),
    stakes: String(value?.stakes ?? '').trim(),
    outcome: String(value?.outcome ?? '').trim(),
    notes: String(value?.notes ?? '').trim(),
  };
}

function cleanWorldRefs(value: PlotWorldRef[] | undefined): PlotWorldRef[] {
  const seen = new Set<string>();
  const cleaned = (value ?? []).flatMap((item) => {
    const entityId = String(item?.entityId ?? '').trim();
    if (!entityId || seen.has(entityId)) return [];
    if (!WORLD_ROLES.includes(item.role)) throw new Error(`world anchor role must be one of: ${WORLD_ROLES.join(' | ')}`);
    seen.add(entityId);
    return [{ entityId, role: item.role }];
  });
  if (cleaned.length > 3) throw new Error('plot node supports at most 3 world anchors');
  return cleaned;
}

export async function readPlot(projectDir: string): Promise<PlotGraph> {
  const file = plotPath(projectDir);
  if (!(await exists(file))) return emptyPlot();
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<PlotGraph>;
  return {
    version: 1,
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    edges: Array.isArray(parsed.edges) ? parsed.edges : [],
  };
}

async function writePlot(projectDir: string, graph: PlotGraph): Promise<void> {
  const file = plotPath(projectDir);
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(graph, null, 2) + '\n', 'utf8');
}

export async function createPlotNode(
  projectDir: string,
  input: {
    title: string;
    summary?: string;
    kind?: PlotNodeKind;
    section?: string;
    position?: { x: number; y: number };
    details?: Partial<PlotNode['details']>;
    documentId?: string;
    worldRefs?: PlotWorldRef[];
  },
): Promise<PlotNode> {
  const title = String(input.title ?? '').trim();
  if (!title) throw new Error('plot node title is required');
  const kind = input.kind ?? 'beat';
  if (!NODE_KINDS.includes(kind)) throw new Error(`plot node kind must be one of: ${NODE_KINDS.join(' | ')}`);
  const documentId = String(input.documentId ?? '').trim();
  const now = new Date().toISOString();
  const node: PlotNode = {
    id: randomUUID(),
    title,
    summary: String(input.summary ?? '').trim(),
    kind,
    section: String(input.section ?? '').trim(),
    position: { x: coordinate(input.position?.x), y: coordinate(input.position?.y) },
    details: cleanDetails(input.details),
    ...(documentId ? { documentId } : {}),
    worldRefs: cleanWorldRefs(input.worldRefs),
    createdAt: now,
    updatedAt: now,
  };
  const graph = await readPlot(projectDir);
  graph.nodes.push(node);
  await writePlot(projectDir, graph);
  return node;
}

export async function updatePlotNode(
  projectDir: string,
  nodeId: string,
  patch: Partial<Pick<PlotNode, 'title' | 'summary' | 'kind' | 'section' | 'position' | 'details' | 'documentId' | 'worldRefs'>>,
): Promise<PlotNode> {
  const graph = await readPlot(projectDir);
  const index = graph.nodes.findIndex((node) => node.id === nodeId);
  if (index === -1) throw new Error(`No such plot node: ${nodeId}`);
  if (patch.kind !== undefined && !NODE_KINDS.includes(patch.kind)) {
    throw new Error(`plot node kind must be one of: ${NODE_KINDS.join(' | ')}`);
  }
  const current = graph.nodes[index];
  const documentId = patch.documentId === undefined ? current.documentId : String(patch.documentId).trim() || undefined;
  const updated: PlotNode = {
    ...current,
    ...(patch.title !== undefined ? { title: String(patch.title).trim() } : {}),
    ...(patch.summary !== undefined ? { summary: String(patch.summary).trim() } : {}),
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.section !== undefined ? { section: String(patch.section).trim() } : {}),
    ...(patch.position !== undefined ? { position: { x: coordinate(patch.position.x), y: coordinate(patch.position.y) } } : {}),
    ...(patch.details !== undefined ? { details: cleanDetails(patch.details) } : {}),
    ...(patch.documentId !== undefined ? { documentId } : {}),
    ...(patch.worldRefs !== undefined ? { worldRefs: cleanWorldRefs(patch.worldRefs) } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (!updated.title) throw new Error('plot node title is required');
  graph.nodes[index] = updated;
  await writePlot(projectDir, graph);
  return updated;
}

export async function createPlotEdge(
  projectDir: string,
  input: { from: string; to: string; relation?: PlotEdgeRelation; label?: string },
): Promise<PlotEdge> {
  const from = String(input.from ?? '').trim();
  const to = String(input.to ?? '').trim();
  if (!from || !to) throw new Error('plot edge endpoints are required');
  const relation = input.relation ?? 'sequence';
  if (!EDGE_RELATIONS.includes(relation)) throw new Error(`plot edge relation must be one of: ${EDGE_RELATIONS.join(' | ')}`);
  const graph = await readPlot(projectDir);
  if (!graph.nodes.some((node) => node.id === from)) throw new Error(`No such plot node: ${from}`);
  if (!graph.nodes.some((node) => node.id === to)) throw new Error(`No such plot node: ${to}`);
  const now = new Date().toISOString();
  const edge: PlotEdge = {
    id: randomUUID(),
    from,
    to,
    relation,
    label: String(input.label ?? '').trim(),
    createdAt: now,
    updatedAt: now,
  };
  graph.edges.push(edge);
  await writePlot(projectDir, graph);
  return edge;
}

export async function updatePlotEdge(
  projectDir: string,
  edgeId: string,
  patch: Partial<Pick<PlotEdge, 'relation' | 'label'>>,
): Promise<PlotEdge> {
  const graph = await readPlot(projectDir);
  const index = graph.edges.findIndex((edge) => edge.id === edgeId);
  if (index === -1) throw new Error(`No such plot edge: ${edgeId}`);
  if (patch.relation !== undefined && !EDGE_RELATIONS.includes(patch.relation)) {
    throw new Error(`plot edge relation must be one of: ${EDGE_RELATIONS.join(' | ')}`);
  }
  const current = graph.edges[index];
  const updated: PlotEdge = {
    ...current,
    ...(patch.relation !== undefined ? { relation: patch.relation } : {}),
    ...(patch.label !== undefined ? { label: String(patch.label).trim() } : {}),
    updatedAt: new Date().toISOString(),
  };
  graph.edges[index] = updated;
  await writePlot(projectDir, graph);
  return updated;
}
