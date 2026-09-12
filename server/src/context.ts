import { projectDir, readDocument, readManifest } from './projects.js';
import { readCanon, renderCanonContext } from './canon.js';
import { searchSources, readSourceChunk } from './sources.js';
import type { SourceCitation } from './types.js';
import type { AgentDef, Selection } from './types.js';

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
}

export interface ContextBundle {
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
): Promise<{ body: string; citations: SourceCitation[]; used: number } | null> {
  // The writer's question drives retrieval; a selection without a question
  // adds its own words so "check this passage" still finds related material.
  const query = [question, selection?.text?.slice(0, 400) ?? ''].join(' ').trim();
  if (!query) return null;
  const dir = await projectDir(projectId);
  const hits = await searchSources(dir, { query, limit: 6 });
  if (!hits.length) return null;
  const citations: SourceCitation[] = [];
  const parts: string[] = [];
  let used = 0;
  for (const hit of hits) {
    const chunk = await readSourceChunk(dir, hit.sourceId, hit.chunkId);
    if (!chunk) continue; // never cite a chunk we cannot actually read
    if (used + chunk.text.length > SOURCE_QUERY_BUDGET) break;
    used += chunk.text.length;
    const where = [
      hit.location.heading ? `section “${hit.location.heading}”` : null,
      hit.location.page ? `page ${hit.location.page}` : null,
    ].filter(Boolean).join(', ');
    parts.push(`From “${hit.title}”${where ? ` (${where})` : ''}:\n${chunk.text}`);
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
  return text.slice(0, max) + `\n…[trimmed ${text.length - max} characters to stay inside the context budget]`;
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
  const scope = new Set(agent.context?.scope ?? []);
  const sections: ContextSection[] = [];
  const summary: string[] = [];
  let spent = 0;

  const push = (name: string, body: string, label: string) => {
    if (!body.trim()) return;
    const clipped = clip(body, Math.min(SECTION_BUDGET, Math.max(500, TOTAL_BUDGET - spent)));
    spent += clipped.length;
    sections.push({ name, body: clipped });
    summary.push(label);
  };

  const manifest = await readManifest(projectId);
  const docId = opts.documentId ?? manifest.documents[0]?.id;
  let docContent = '';
  let docTitle = '';
  if (docId) {
    try {
      const { meta, content } = await readDocument(projectId, docId);
      docContent = content;
      docTitle = meta.title;
    } catch {
      /* document may have been removed */
    }
  }

  if (scope.has('selection') && opts.selection && opts.selection.text.trim()) {
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
    const chapters = manifest.documents.filter((d) => d.kind === 'manuscript' && d.id !== docId);
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
    const outline = manifest.documents.find((d) => d.kind === 'outline');
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
    const notes = manifest.documents.filter((d) => d.kind === 'notes');
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

  // Role fallback keeps pre-Phase-5 projects compatible; newly seeded
  // Continuity definitions also declare `canon` explicitly.
  if (scope.has('canon') || agent.role === 'continuity') {
    const canon = await readCanon(await projectDir(projectId));
    const rendered = renderCanonContext(canon);
    if (rendered) push('canon', rendered, `canon (${canon.entities.length} entities, ${canon.facts.length} facts)`);
  }

  // Sources: retrieved passages only — never a whole file dump (handoff §30).
  // Agents without the `sources` scope receive no Source text at all.
  let sourceCitations: SourceCitation[] | undefined;
  if (scope.has('sources')) {
    const retrieved = await retrieveSourceSections(projectId, opts.question ?? '', opts.selection ?? null);
    if (retrieved) {
      push('sources', retrieved.body, `sources — ${retrieved.citations.length} passage${retrieved.citations.length === 1 ? '' : 's'} from ${new Set(retrieved.citations.map((c) => c.sourceId)).size} document(s)`);
      sourceCitations = retrieved.citations;
      spent += retrieved.used;
    }
  }

  for (const attachId of opts.attachments ?? []) {
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

export function renderContext(bundle: ContextBundle): string {
  return bundle.sections.map((s) => `<${s.name}>\n${s.body}\n</${s.name}>`).join('\n\n');
}
