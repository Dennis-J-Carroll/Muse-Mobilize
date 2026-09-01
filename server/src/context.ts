import { projectDir, readDocument, readManifest } from './projects.js';
import { readCanon, renderCanonContext } from './canon.js';
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
  let first = blocks.findIndex((b) => b.end >= start);
  let last = blocks.findIndex((b) => b.start >= end);
  if (first === -1) first = blocks.length - 1;
  if (last === -1) last = blocks.length - 1;
  const from = Math.max(0, first - 1);
  const to = Math.min(blocks.length - 1, last + 1);
  return blocks.slice(from, to + 1).map((b) => b.text).join('\n\n');
}

export async function buildContext(
  projectId: string,
  agent: AgentDef,
  opts: { documentId?: string; selection?: Selection | null; attachments?: string[] },
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

  return { sections, summary };
}

export function renderContext(bundle: ContextBundle): string {
  return bundle.sections.map((s) => `<${s.name}>\n${s.body}\n</${s.name}>`).join('\n\n');
}
