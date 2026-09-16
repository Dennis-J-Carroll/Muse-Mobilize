import { readManifest, projectDir, readAgents, readDocument } from './projects.js';
import { readCanon } from './canon.js';
import { readPlot } from './plot.js';
import { readScenes } from './scenes.js';
import { readReferences } from './references.js';
import { readGoals } from './goals.js';
import { readWorldMap } from './world-map.js';
import { readConnections } from './connections.js';
import { readSources, readSourceText } from './sources.js';
import { readEvents } from './events.js';
import { resourceKey, type ResourceInfo, type ResourceRef, type ResourceKind } from '../../shared/project-tools.js';
import type { StoryImage } from './types.js';

export interface ProjectResource extends ResourceInfo { data?: any; required?: ResourceRef[] }
export interface ResourceContent { text: string; images: StoryImage[]; warnings: string[] }

/** Metadata and structured stores stay local. Documents and source text load only after selection. */
export async function projectResources(projectId: string): Promise<ProjectResource[]> {
  const dir = await projectDir(projectId);
  const [manifest, canon, plot, board, refs, goals, map, links, sources, agents] = await Promise.all([
    readManifest(projectId), readCanon(dir), readPlot(dir), readScenes(dir), readReferences(dir),
    readGoals(dir), readWorldMap(dir), readConnections(dir), readSources(dir), readAgents(projectId),
  ]);
  const out: ProjectResource[] = [];
  const add = (kind: ResourceKind, id: string, title: string, data?: any, detail?: string, required?: ResourceRef[]) => out.push({ kind, id, title, data, detail, required });
  const canonRef = (id: string): ResourceRef => ({ kind: canon.entities.find((e) => e.id === id)?.type === 'character' ? 'character' : 'world', id });
  const target = (r: { kind: string; id: string }): ResourceRef => r.kind === 'canon' ? canonRef(r.id) : r as ResourceRef;
  for (const doc of [...manifest.documents].sort((a, b) => a.order - b.order)) add('document', doc.id, doc.title, doc, doc.kind);
  for (const e of canon.entities) add(e.type === 'character' ? 'character' : 'world', e.id, e.name, e, e.type);
  for (const f of canon.facts) add('fact', f.id, `${f.subject} · ${f.predicate}`, f, f.status, f.subjectId ? [canonRef(f.subjectId)] : []);
  for (const n of plot.nodes) add('plot', n.id, n.title, n, n.kind);
  for (const s of [...board.scenes].sort((a, b) => a.order - b.order)) add('scene', s.id, s.title, s, s.status);
  for (const t of board.themes) add('theme', t.id, t.name, t);
  for (const r of refs.items) add('reference', r.id, r.title, r, r.kind);
  for (const s of sources) add('source', s.id, s.title, s, `${s.classification} · ${s.extractionStatus}`);
  add('goal', 'session-target', 'Session target', goals.sessionTarget);
  for (const g of [...goals.milestones].sort((a, b) => a.order - b.order)) add('goal', g.id, g.title, g, g.status);
  if (map.image) add('world-map', 'map', 'World map', map);
  for (const edge of plot.edges) add('connection', `plot-${edge.id}`, edge.label || edge.relation, edge, 'plot edge', [{ kind: 'plot', id: edge.from }, { kind: 'plot', id: edge.to }]);
  for (const link of links.attachments) add('connection', link.id, link.tagId ? links.tags.find((t) => t.id === link.tagId)?.label || 'Tag' : 'Story connection', link, 'story connection', [target(link.target), ...(link.entity ? [target(link.entity)] : [])]);
  for (const a of agents) add('agent', a.id, a.name, a, a.access ? 'managed' : 'legacy');
  // The complete saved log is loaded only when explicitly selected.
  add('activity', 'log', 'Saved activity log');
  if (new Set(out.map(resourceKey)).size !== out.length) throw new Error('Project contains duplicate record identities. Resolve them before assigning or exporting records.');
  return out;
}

export const resourceInfo = ({ kind, id, title, detail }: ProjectResource): ResourceInfo => ({ kind, id, title, detail });

/** Resolve references without expanding the selected set or exposing omitted endpoint metadata. */
export async function resourceContent(projectId: string, record: ProjectResource, allowed: Set<string>, catalog: ProjectResource[]): Promise<ResourceContent> {
  const has = (kind: ResourceKind, id?: string) => !!id && allowed.has(resourceKey({ kind, id }));
  const canonKind = (id: string) => catalog.find((r) => r.id === id && (r.kind === 'character' || r.kind === 'world'))?.kind ?? 'world';
  const hasCanon = (id: string) => has(canonKind(id), id);
  if (!has(record.kind, record.id) || record.required?.some((ref) => !has(ref.kind, ref.id))) return { text: '', images: [], warnings: ['Record omitted because a required linked record is not selected.'] };
  if (record.kind === 'document') return { text: (await readDocument(projectId, record.id)).content, images: [], warnings: [] };
  if (record.kind === 'source') {
    const meta = record.data;
    let text = '';
    try { text = await readSourceText(await projectDir(projectId), record.id); }
    catch { return { text: `Original: ${meta.originalName}\nExtraction: ${meta.extractionStatus}`, images: [], warnings: ['Source text unavailable; original remains in the saved-project backup.'] }; }
    return { text: `Original: ${meta.originalName}\nAuthority: ${meta.authority}\nSHA-256: ${meta.sourceHash}\n\n${text}`, images: [], warnings: meta.extractionWarning ? [meta.extractionWarning] : [] };
  }
  if (record.kind === 'activity') {
    const events = await readEvents(await projectDir(projectId), Number.MAX_SAFE_INTEGER);
    return { text: events.reverse().map((e) => `${e.ts} · ${e.type}\n${JSON.stringify(e.payload ?? {})}`).join('\n\n'), images: [], warnings: [] };
  }
  const data = structuredClone(record.data);
  if (record.kind === 'fact') data.evidence = data.evidence.filter((e: any) => has('document', e.documentId));
  if (record.kind === 'world' && data.world && !has('document', data.world.referenceDocumentId)) delete data.world.referenceDocumentId;
  if (record.kind === 'plot') data.worldRefs = data.worldRefs.filter((r: any) => hasCanon(r.entityId));
  if (record.kind === 'scene') {
    data.assets = data.assets.filter((r: any) => r.kind === 'character' || r.kind === 'location' ? hasCanon(r.refId) : has(r.kind, r.refId));
    data.dialogue.forEach((line: any) => { if (!hasCanon(line.speakerId)) delete line.speakerId; });
  }
  if (record.kind === 'reference') data.entityRefs = data.entityRefs.filter((r: any) => r.kind === 'canon' ? hasCanon(r.refId) : has(r.kind, r.refId));
  if (data.documentId && !has('document', data.documentId)) delete data.documentId;
  if (record.kind === 'agent') {
    // Names, instructions, and configuration are explicitly selected content.
    return { text: `Role: ${data.role}\n\n${data.instructions?.system_prompt ?? ''}\n\nGoals:\n${(data.instructions?.goals ?? []).join('\n')}\n\nAccess: ${JSON.stringify(data.access ?? data.context)}\nModel: ${data.model?.provider ?? 'default'} / ${data.model?.model ?? 'default'}`, images: [], warnings: [] };
  }
  const images: StoryImage[] = [];
  const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  function format(value: any, depth = 0): string {
    if (value === null || value === undefined || value === '') return '';
    if (Array.isArray(value)) return value.map((v) => format(v, depth)).filter(Boolean).join('\n\n');
    if (typeof value !== 'object') return String(value);
    if (typeof value.src === 'string') { images.push(value); return value.caption ? `Image: ${value.caption}` : ''; }
    return Object.entries(value).filter(([k]) => !['id', 'createdAt', 'updatedAt', 'position', 'canvas'].includes(k))
      .map(([key, val]) => {
        let display = val;
        if (typeof val === 'string' && ['subjectId', 'speakerId', 'entityId', 'documentId', 'referenceDocumentId', 'refId', 'from', 'to'].includes(key)) {
          const kind = ['subjectId', 'speakerId', 'entityId'].includes(key) ? canonKind(val) : ['documentId', 'referenceDocumentId'].includes(key) ? 'document' : ['from', 'to'].includes(key) ? 'plot' : value.kind === 'canon' || value.kind === 'location' ? canonKind(val) : value.kind;
          display = catalog.find((r) => r.kind === kind && r.id === val && allowed.has(resourceKey(r)))?.title ?? val;
        }
        const body = format(display, depth + 1);
        return body ? `${label(key.replace(/Id$/, ''))}: ${body}` : '';
      }).filter(Boolean).join('\n');
  }
  return { text: format(data), images, warnings: [] };
}
