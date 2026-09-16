import { projectDir, readDocument, readManifest } from './projects.js';
import { readCanon, renderCanonContext } from './canon.js';
import { searchSources, readSourceChunk } from './sources.js';
import type { SourceCitation } from './types.js';
import type { AgentDef, Selection } from './types.js';
import { createHash } from 'node:crypto';
import { parseAccess, permits, resourceKey } from '../../shared/project-tools.js';
import { projectResources, resourceContent } from './project-resources.js';

/**
 * Context Engine (§11). Context is scoped, never dumped (§34.9): each agent
 * declares which layers it may see, and we assemble only those, under a
 * character budget, with each layer clearly labelled so the model — and the
 * writer reading the provenance — can tell selection from canon.
 */

const TOTAL_BUDGET = 14000;
const SECTION_BUDGET = 6000;

export interface ContextSection {
  name: string;
  body: string;
  resource?: { kind: string; id: string };
}

export interface ContextBundle {
  receipt?: NonNullable<import('./types.js').AgentRun['contextReceipt']>;
  sections: ContextSection[];
  summary: string[]; // human-readable, shown in the UI beside the answer
  sourceCitations?: SourceCitation[]; // real retrieved chunks only — never invented
}

/** Sources retrieval runs BEFORE prompt assembly and only for scoped agents. */
export const SOURCE_QUERY_BUDGET = 4000;
async function retrieveSourceSections(
  projectId: string,
  question: string,
  selection: Selection | null | undefined,
  sourceIds?: string[],
  budget = SOURCE_QUERY_BUDGET,
): Promise<{ body: string; citations: SourceCitation[]; used: number } | null> {
  // The writer's question drives retrieval; a selection without a question
  // adds its own words so "check this passage" still finds related material.
  const query = [question, selection?.text?.slice(0, 400) ?? ''].join(' ').trim();
  if (!query || sourceIds?.length === 0 || budget <= 0) return null;
  const dir = await projectDir(projectId);
  const hits = await searchSources(dir, { query, limit: 6, sourceIds });
  if (!hits.length) return null;
  const citations: SourceCitation[] = [];
  const parts: string[] = [];
  let used = 0;
  for (const hit of hits) {
    const chunk = await readSourceChunk(dir, hit.sourceId, hit.chunkId);
    if (!chunk) continue; // never cite a chunk we cannot actually read
    const where = [
      hit.location.heading ? `section “${hit.location.heading}”` : null,
      hit.location.page ? `page ${hit.location.page}` : null,
    ].filter(Boolean).join(', ');
    const part = `From “${hit.title}”${where ? ` (${where})` : ''}:\n${chunk.text}`;
    if (used + part.length + 2 > budget) continue;
    used += part.length + 2;
    parts.push(part);
    citations.push({
      sourceId: hit.sourceId,
      title: hit.title,
      chunkId: hit.chunkId,
      location: hit.location,
      snippet: hit.snippet,
    });
  }
  if (!parts.length) return null;
  return { body: parts.join('\n\n'), citations, used };
}

function clip(text: string, max = SECTION_BUDGET): string {
  if (text.length <= max) return text;
  const suffix = '\n…[trimmed to context budget]';
  return max <= suffix.length ? text.slice(0, max) : text.slice(0, max - suffix.length) + suffix;
}

/**
 * The "scene" around a selection: the paragraph containing it plus one on
 * either side. Cheaper and more predictable than semantic retrieval, which
 * the MVP deliberately defers (§11 MVP context strategy).
 */
export function sceneAround(doc: string, start: number, end: number): string {
  const blocks: { text: string; start: number; end: number }[] = [];
  let cursor = 0;
  for (const raw of doc.split(/\n\s*\n/)) {
    const idx = doc.indexOf(raw, cursor);
    const s = idx === -1 ? cursor : idx;
    blocks.push({ text: raw, start: s, end: s + raw.length });
    cursor = s + raw.length;
  }
  if (!blocks.length) return doc;
  // Containment: the selection belongs to the block(s) it actually fills —
  // a selection ending exactly at a block's end must not spill into the next.
  let first = blocks.findIndex((b) => b.end >= start);
  if (first === -1) first = blocks.length - 1;
  let last = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].start < end) last = i;
    else break;
  }
  if (last === -1 || last < first) last = first;
  const from = Math.max(0, first - 1);
  const to = Math.min(blocks.length - 1, last + 1);
  return blocks.slice(from, to + 1).map((b) => b.text).join('\n\n');
}

export async function buildContext(
  projectId: string,
  agent: AgentDef,
  opts: { documentId?: string; selection?: Selection | null; attachments?: string[]; question?: string },
): Promise<ContextBundle> {
  if (agent.access !== undefined) return buildAssignedContext(projectId, agent, opts);
  const forbidden = new Set(agent.context?.forbidden ?? []);
  const supported = new Set(['selection', 'current_scene', 'current_document', 'manuscript', 'notes', 'canon', 'outline', 'sources', 'future_chapters']);
  if ([...forbidden].some((value) => !supported.has(value))) throw new Error('Unsupported legacy exclusion. Configure explicit assignments in Agent Studio before asking this agent.');
  const scope = new Set(agent.context?.scope ?? []);
  for (const denied of forbidden) scope.delete(denied as any);
  const sections: ContextSection[] = [];
  const summary: string[] = [];
  let spent = 0;

  const push = (name: string, body: string, label: string) => {
    if (!body.trim() || spent >= TOTAL_BUDGET) return;
    const clipped = clip(body, Math.min(SECTION_BUDGET, TOTAL_BUDGET - spent));
    spent += clipped.length;
    sections.push({ name, body: clipped });
    summary.push(label);
  };

  const manifest = await readManifest(projectId);
  const docId = opts.documentId ?? manifest.documents[0]?.id;
  const docAllowed = (id: string) => {
    const doc = manifest.documents.find((d) => d.id === id);
    const current = manifest.documents.find((d) => d.id === docId);
    return !!doc && !forbidden.has(doc.kind) && !(id === docId && forbidden.has('current_document'))
      && !(forbidden.has('future_chapters') && doc.kind === 'manuscript' && (!current || doc.order > current.order));
  };
  let docContent = '';
  let docTitle = '';
  if (docId && docAllowed(docId)) {
    try {
      const { meta, content } = await readDocument(projectId, docId);
      docContent = content;
      docTitle = meta.title;
    } catch {
      /* document may have been removed */
    }
  }

  if (scope.has('selection') && opts.selection && opts.selection.documentId === docId && docId && docAllowed(docId) && opts.selection.text.trim()) {
    push('selection', opts.selection.text, `selection (${opts.selection.text.split(/\s+/).filter(Boolean).length} words)`);
  }

  if (scope.has('current_scene') && docContent) {
    const sel = opts.selection;
    const scene = sel && sel.end > sel.start ? sceneAround(docContent, sel.start, sel.end) : docContent.slice(0, SECTION_BUDGET);
    push('current-scene', scene, `current scene in “${docTitle}”`);
  }

  if (scope.has('current_document') && docContent) {
    push('current-document', `# ${docTitle}\n\n${docContent}`, `full document “${docTitle}”`);
  }

  if (scope.has('manuscript')) {
    const chapters = manifest.documents.filter((d) => d.kind === 'manuscript' && d.id !== docId && docAllowed(d.id));
    const parts: string[] = [];
    for (const c of chapters) {
      try {
        const { content } = await readDocument(projectId, c.id);
        parts.push(`## ${c.title}\n\n${content}`);
      } catch {
        /* skip */
      }
    }
    if (parts.length) push('manuscript', parts.join('\n\n'), `${parts.length} other manuscript document(s)`);
  }

  if (scope.has('outline')) {
    const outline = manifest.documents.find((d) => d.kind === 'outline' && docAllowed(d.id));
    if (outline) {
      try {
        const { content } = await readDocument(projectId, outline.id);
        push('outline', content, 'outline');
      } catch {
        /* skip */
      }
    }
  }

  if (scope.has('notes')) {
    const notes = manifest.documents.filter((d) => d.kind === 'notes' && docAllowed(d.id));
    const parts: string[] = [];
    for (const n of notes) {
      try {
        const { content } = await readDocument(projectId, n.id);
        parts.push(content);
      } catch {
        /* skip */
      }
    }
    if (parts.length) push('notes', parts.join('\n\n'), 'project notes');
  }

  // A role never grants knowledge. Seeded continuity agents declare canon explicitly.
  if (scope.has('canon')) {
    const canon = await readCanon(await projectDir(projectId));
    canon.facts = canon.facts.map((fact) => ({ ...fact, evidence: fact.evidence.filter((evidence) => docAllowed(evidence.documentId)) }));
    const rendered = renderCanonContext(canon);
    if (rendered) push('canon', rendered, `canon (${canon.entities.length} entities, ${canon.facts.length} facts)`);
  }

  // Sources: retrieved passages only — never a whole file dump (handoff §30).
  // Agents without the `sources` scope receive no Source text at all.
  let sourceCitations: SourceCitation[] | undefined;
  if (scope.has('sources')) {
    const retrieved = await retrieveSourceSections(projectId, opts.question ?? '', scope.has('selection') && docId && docAllowed(docId) && opts.selection?.documentId === docId ? opts.selection : null, undefined, Math.min(SOURCE_QUERY_BUDGET, TOTAL_BUDGET - spent));
    if (retrieved) {
      push('sources', retrieved.body, `sources — ${retrieved.citations.length} passage${retrieved.citations.length === 1 ? '' : 's'} from ${new Set(retrieved.citations.map((c) => c.sourceId)).size} document(s)`);
      sourceCitations = retrieved.citations;
    }
  }

  for (const attachId of opts.attachments ?? []) {
    const meta = manifest.documents.find((d) => d.id === attachId);
    // Attachment is a transport mechanism, never a grant to read a whole document.
    if (!meta || !docAllowed(attachId) || !(scope.has(meta.kind) || (attachId === docId && scope.has('current_document')))) continue;
    try {
      const { meta, content } = await readDocument(projectId, attachId);
      push(`attachment-${meta.id}`, `# ${meta.title}\n\n${content}`, `attached “${meta.title}”`);
    } catch {
      /* skip */
    }
  }

  if (agent.context?.forbidden?.length) {
    summary.push(`withheld: ${agent.context.forbidden.join(', ')}`);
  }

  return { sections, summary, sourceCitations };
}

async function buildAssignedContext(projectId: string, agent: AgentDef, opts: { documentId?: string; selection?: Selection | null; attachments?: string[]; question?: string }): Promise<ContextBundle> {
  const policy = parseAccess(agent.access);
  const catalog = await projectResources(projectId);
  const granted = catalog.filter((r) => permits(policy, r));
  const keys = new Set(granted.map(resourceKey));
  const receipt: NonNullable<ContextBundle['receipt']> = { policyRevision: policy.revision, records: [] };
  const sections: ContextSection[] = [];
  const summary = ['Explicit assignments · no automatic consultation'];
  let spent = 0;
  const push = (name: string, body: string, ref: { kind: string; id: string }, title: string) => {
    const room = Math.min(SECTION_BUDGET, TOTAL_BUDGET - spent);
    if (!body.trim() || room <= 0) return;
    const sent = body.slice(0, room);
    sections.push({ name, body: sent, resource: ref }); spent += sent.length;
    receipt.records.push({ ...ref, sha256: createHash('sha256').update(sent).digest('hex'), trimmed: sent.length < body.length });
    summary.push(`${title}${sent.length < body.length ? ' (trimmed)' : ''}`);
  };
  let selection: Selection | null = null;
  if (opts.selection && policy.selection && opts.selection.documentId === opts.documentId && keys.has(`document:${opts.selection.documentId}`)) {
    const s = opts.selection;
    const { content } = await readDocument(projectId, s.documentId);
    if (!Number.isSafeInteger(s.start) || !Number.isSafeInteger(s.end) || s.start < 0 || s.end <= s.start || s.end > content.length || content.slice(s.start, s.end) !== s.text) throw new Error('Selection differs from the saved document. Save the passage and select it again.');
    selection = s;
    push('selection', s.text, { kind: 'document', id: s.documentId }, 'Selected passage');
  }
  const sourceIds = granted.filter((r) => r.kind === 'source').map((r) => r.id);
  const sources = await retrieveSourceSections(projectId, opts.question ?? '', selection, sourceIds, Math.min(SOURCE_QUERY_BUDGET, TOTAL_BUDGET - spent));
  if (sources) {
    sections.push({ name: 'sources', body: sources.body }); spent += sources.body.length;
    summary.push(`${sources.citations.length} retrieved source passages`);
    for (const citation of sources.citations) receipt.records.push({ kind: 'source', id: citation.sourceId, sha256: createHash('sha256').update(sources.body).digest('hex'), trimmed: false });
  }
  let omitted = 0;
  for (const record of granted) {
    if (record.kind === 'source') continue;
    if (spent >= TOTAL_BUDGET) { omitted++; continue; }
    const content = await resourceContent(projectId, record, keys, catalog);
    if (!content.text.trim()) { omitted++; continue; }
    push(record.kind === 'document' && record.id === opts.documentId ? 'current-document' : 'assigned-record', `# ${record.title}\n\n${content.text}`, record, record.title);
  }
  if (opts.selection && !selection) summary.push('Selection withheld by assignments');
  if (opts.attachments?.some((id) => !keys.has(`document:${id}`))) summary.push('Unassigned document attachments withheld');
  if (omitted) summary.push(`${omitted} assigned records not sent (budget or excluded links)`);
  if (!sections.length) summary.push('No project material sent');
  return { sections, summary, sourceCitations: sources?.citations, receipt };
}

export function renderContext(bundle: ContextBundle): string {
  return bundle.sections.map((s) => `<${s.name}>\n${s.body}\n</${s.name}>`).join('\n\n');
}
