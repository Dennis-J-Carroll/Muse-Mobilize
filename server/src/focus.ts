import { projectDir, readDocument, readManifest } from './projects.js';
import { readSource, readSourceText } from './sources.js';
import { readTicket } from './tickets.js';
import { addManuscriptMentions, renderDepthMap, sourceSections } from './source-map.js';
import { ticketToMarkdown, TICKET_LIMITS } from '../../shared/tickets.js';

/**
 * Writer-attached focus (source gate and tickets). The writer pressed a
 * button to attach this material, so it bypasses agent scopes — like the
 * shared excerpt. This is a deliberate, writer-approved exception to the
 * "retrieved passages only" rule (docs/source-tickets-2026-11-11.md): the
 * whole source is sent, and the UI says so.
 */

export const FOCUS_SOURCE_MAX = 200_000;
export const FOCUS_RETURN_MAX = 30_000;
export const FOCUS_SMALL_MODEL_MAX = 24_000;
export const FOCUS_HISTORY_MAX = 3;
export const FOCUS_OUTPUT_TOKENS = 4000;

export interface FocusInput { sourceId?: string; ticketId?: string }
export interface FocusHistoryItem { question: string; answer: string }

export const FOCUS_PROTOCOL = `
--- WRITER-ATTACHED MATERIAL ---
The writer attached a source and/or a ticket to this conversation. Work from it.
- You prompt; the writer creates. Offer questions, references, directions and suggestions. Do not write new lore, scenes or prose unless the writer explicitly asks you to create it.
- Quote the attached text exactly when you cite it, and name the section it comes from. Never invent source content. Label your own ideas as suggestions.
- When asked for ripe threads, prefer subjects the depth map marks THIN (and that the chapters rarely mention) which connect to deeper material. For each: what the source says (short quote, section), what it connects to, and one or two questions that would open it up.
- Other agents cannot see the attached material, so do not consult them about it.
- A returned file is the writer's own development work. Respond to it with questions, references and anything that contradicts the source; do not rewrite it.
- You may suggest at most three tickets (assignments the writer could take away). The writer decides; never assume a suggestion is accepted. Format each as:
<ticket-suggestion>
<title>the assignment, one line</title>
<wants>what the writer seems to want from it</wants>
<thread>one thread to follow</thread>
<quote section="section name">exact words from the source</quote>
<question>a question to start from</question>
</ticket-suggestion>
Use as many <thread>, <quote> and <question> lines as needed (up to five each).
`;

async function manuscriptText(projectId: string): Promise<string> {
  const manifest = await readManifest(projectId);
  const docs = manifest.documents.filter((doc) => doc.kind === 'manuscript');
  const texts = await Promise.all(docs.map((doc) => readDocument(projectId, doc.id).then((d) => d.content).catch(() => '')));
  return texts.join('\n\n');
}

export function renderHistory(history: FocusHistoryItem[] | undefined): string {
  const recent = (history ?? []).slice(-FOCUS_HISTORY_MAX);
  if (!recent.length) return '';
  return `\n<conversation-so-far>\n${recent.map((item) => `Writer: ${item.question}\nYou: ${item.answer}`).join('\n\n')}\n</conversation-so-far>\n`;
}

export function validateFocus(focus: unknown, history: unknown): { focus?: FocusInput; history?: FocusHistoryItem[] } {
  let parsed: FocusInput | undefined;
  if (focus !== undefined && focus !== null) {
    if (typeof focus !== 'object') throw new Error('Invalid attached material.');
    const { sourceId, ticketId } = focus as Record<string, unknown>;
    if ((sourceId !== undefined && typeof sourceId !== 'string') || (ticketId !== undefined && typeof ticketId !== 'string')) throw new Error('Invalid attached material.');
    if (sourceId || ticketId) parsed = { ...(sourceId ? { sourceId } : {}), ...(ticketId ? { ticketId } : {}) };
  }
  let items: FocusHistoryItem[] | undefined;
  if (history !== undefined && history !== null) {
    if (!Array.isArray(history) || history.length > 10) throw new Error('Invalid conversation history.');
    items = history.slice(-FOCUS_HISTORY_MAX).map((item) => {
      if (typeof item?.question !== 'string' || typeof item?.answer !== 'string') throw new Error('Invalid conversation history.');
      return { question: item.question.slice(0, TICKET_LIMITS.logQuestion), answer: item.answer.slice(0, TICKET_LIMITS.logAnswer) };
    });
  }
  return { focus: parsed, history: items };
}

export async function buildFocus(projectId: string, focus: FocusInput, providerId: string): Promise<{ block: string; summary: string[] }> {
  const dir = await projectDir(projectId);
  const parts: string[] = [];
  const summary: string[] = [];
  const small = providerId === 'ollama';

  if (focus.sourceId) {
    const source = await readSource(dir, focus.sourceId).catch(() => { throw new Error('The attached source is no longer in Sources.'); });
    const text = await readSourceText(dir, focus.sourceId);
    if (small && text.length > FOCUS_SMALL_MODEL_MAX) {
      throw new Error(`“${source.title}” is too large for the local model (${text.length.toLocaleString('en')} characters; limit ${FOCUS_SMALL_MODEL_MAX.toLocaleString('en')}). Choose a hosted provider for Muse, or remove the attached source.`);
    }
    const sections = addManuscriptMentions(sourceSections(text), await manuscriptText(projectId));
    const body = text.length > FOCUS_SOURCE_MAX
      ? `${text.slice(0, FOCUS_SOURCE_MAX)}\n…[source trimmed: only the first ${FOCUS_SOURCE_MAX.toLocaleString('en')} of ${text.length.toLocaleString('en')} characters are included]`
      : text;
    parts.push(`<writer-attached-source title="${source.title.replace(/"/g, '&quot;')}">\n<depth-map>\n${renderDepthMap(sections)}\n</depth-map>\n<source-text>\n${body}\n</source-text>\n</writer-attached-source>`);
    summary.push(`Whole source attached by the writer: ${source.title}${text.length > FOCUS_SOURCE_MAX ? ' (trimmed)' : ''}`);
  }

  if (focus.ticketId) {
    const ticket = await readTicket(dir, focus.ticketId).catch(() => { throw new Error('The attached ticket no longer exists.'); });
    const returned: string[] = [];
    for (const item of ticket.returns) {
      const text = await readSourceText(dir, item.sourceId).catch(() => null);
      if (text === null) { returned.push(`<returned-file title="${item.title.replace(/"/g, '&quot;')}" missing="true">This file was removed from Sources.</returned-file>`); continue; }
      const clipped = text.length > FOCUS_RETURN_MAX ? `${text.slice(0, FOCUS_RETURN_MAX)}\n…[trimmed]` : text;
      returned.push(`<returned-file title="${item.title.replace(/"/g, '&quot;')}">\n${clipped}\n</returned-file>`);
    }
    if (small && returned.join('').length > FOCUS_SMALL_MODEL_MAX) {
      throw new Error('The returned files on this ticket are too large for the local model. Choose a hosted provider for Muse.');
    }
    const log = ticket.log.slice(-FOCUS_HISTORY_MAX).map((e) => `Writer: ${e.question}\nYou: ${e.answer}`).join('\n\n');
    parts.push(`<writer-attached-ticket>\n${ticketToMarkdown(ticket)}${log ? `\n<earlier-on-this-ticket>\n${log}\n</earlier-on-this-ticket>` : ''}${returned.length ? `\n${returned.join('\n')}` : ''}\n</writer-attached-ticket>`);
    summary.push(`Ticket attached by the writer: ${ticket.title}${ticket.returns.length ? ` (${ticket.returns.length} returned file${ticket.returns.length === 1 ? '' : 's'})` : ''}`);
  }
  return { block: parts.length ? `\n${parts.join('\n')}\n` : '', summary };
}
