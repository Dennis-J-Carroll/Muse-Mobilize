/**
 * Provider-agnostic agent output protocol.
 *
 * We deliberately avoid vendor tool-calling schemas so the same agent
 * definition runs on Anthropic, Ollama, or the mock provider unchanged
 * (handoff §5, §19). The model writes prose and may embed blocks:
 *
 *   <consult agent="continuity">Does Kiala know the seal yet?</consult>
 *
 *   <patch>
 *   <before>Kiala walked across the chamber.</before>
 *   <after>Kiala crossed the chamber without looking back.</after>
 *   <reason>Movement signals emotional withdrawal.</reason>
 *   </patch>
 *
 * Parsing NEVER throws. A malformed block stays in the prose and is
 * reported as a warning, because a broken tag must not cost the writer
 * the agent's actual answer.
 */

export interface RawConsult {
  agent: string;
  question: string;
}

export interface RawPatch {
  beforeText: string;
  afterText: string;
  reason: string;
}

export interface ParsedAgentOutput {
  prose: string;
  consults: RawConsult[];
  patches: RawPatch[];
  warnings: string[];
}

const CONSULT_RE = /<consult\s+agent\s*=\s*["']?([a-zA-Z0-9_\-]+)["']?\s*>([\s\S]*?)<\/consult>/gi;
const PATCH_RE = /<patch\s*>([\s\S]*?)<\/patch>/gi;

function inner(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\s*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
  return m ? m[1] : null;
}

/** Strip one leading and one trailing newline without touching real indentation. */
function trimBlock(s: string): string {
  return s.replace(/^\r?\n/, '').replace(/[ \t]*\r?\n[ \t]*$/, '');
}

export function parseAgentOutput(raw: string): ParsedAgentOutput {
  const warnings: string[] = [];
  const consults: RawConsult[] = [];
  const patches: RawPatch[] = [];
  let prose = raw ?? '';

  prose = prose.replace(CONSULT_RE, (_all, agent: string, question: string) => {
    const q = question.trim();
    if (!q) {
      warnings.push(`Empty consult block addressed to "${agent}" — ignored.`);
      return '';
    }
    consults.push({ agent: agent.trim().toLowerCase(), question: q });
    return '';
  });

  prose = prose.replace(PATCH_RE, (all, body: string) => {
    const before = inner(body, 'before');
    const after = inner(body, 'after');
    const reason = inner(body, 'reason');
    if (before === null || after === null) {
      warnings.push('Patch block missing <before> or <after> — left as prose.');
      return all; // keep it visible rather than silently dropping the idea
    }
    patches.push({
      beforeText: trimBlock(before),
      afterText: trimBlock(after),
      reason: reason ? reason.trim() : '',
    });
    return '';
  });

  // Report genuinely unclosed blocks (open tag with no partner) so the UI
  // can hint at a flaky model. Counted on the raw input, because a
  // well-formed-but-incomplete patch is preserved in `prose` on purpose.
  const count = (re: RegExp) => (raw.match(re) || []).length;
  if (count(/<consult\b/gi) > count(/<\/consult>/gi)) warnings.push('Unclosed <consult> block detected.');
  if (count(/<patch\b/gi) > count(/<\/patch>/gi)) warnings.push('Unclosed <patch> block detected.');

  return { prose: prose.replace(/\n{3,}/g, '\n\n').trim(), consults, patches, warnings };
}

export interface Anchor {
  start: number;
  end: number;
  anchored: boolean;
}

/**
 * Locate `beforeText` in `doc`. Offsets are the source of truth at apply
 * time; `beforeText` is kept alongside them as a staleness check.
 * Search order: inside the selection the writer sent, then whole document.
 */
export function anchorPatch(
  doc: string,
  beforeText: string,
  hint?: { start: number; end: number },
): Anchor {
  if (!beforeText) return { start: hint?.start ?? 0, end: hint?.end ?? 0, anchored: false };

  if (hint && hint.end > hint.start) {
    const window = doc.slice(hint.start, hint.end);
    const local = window.indexOf(beforeText);
    if (local !== -1) {
      return { start: hint.start + local, end: hint.start + local + beforeText.length, anchored: true };
    }
  }

  const idx = doc.indexOf(beforeText);
  if (idx !== -1) return { start: idx, end: idx + beforeText.length, anchored: true };

  return { start: hint?.start ?? 0, end: hint?.end ?? 0, anchored: false };
}

export type ApplyResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'stale' | 'unanchored'; message: string };

/**
 * Apply a patch only if the document still reads the way the agent saw it.
 * A mismatch means the writer kept typing (which they are always allowed
 * to do — non-negotiable §34.12), so we refuse rather than guess.
 */
export function applyPatch(
  doc: string,
  patch: { start: number; end: number; beforeText: string; afterText: string; anchored: boolean },
): ApplyResult {
  if (!patch.anchored) {
    return { ok: false, reason: 'unanchored', message: 'Patch text was never located in this document.' };
  }
  if (doc.slice(patch.start, patch.end) === patch.beforeText) {
    return { ok: true, text: doc.slice(0, patch.start) + patch.afterText + doc.slice(patch.end) };
  }
  const idx = doc.indexOf(patch.beforeText);
  if (idx !== -1 && doc.indexOf(patch.beforeText, idx + 1) === -1) {
    // Text moved but is still unique — safe to re-anchor.
    return { ok: true, text: doc.slice(0, idx) + patch.afterText + doc.slice(idx + patch.beforeText.length) };
  }
  return {
    ok: false,
    reason: 'stale',
    message: 'The document changed since this patch was proposed.',
  };
}
