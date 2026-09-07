export interface ConnectionTarget {
  kind: 'document' | 'canon' | 'plot' | 'scene' | 'theme' | 'reference' | 'goal';
  id: string;
}

export interface StoryTag {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

/** Offsets use JavaScript UTF-16 code units, like textarea selections. */
export interface PassageAnchor {
  start: number;
  end: number;
  quote: string;
  prefix: string;
  suffix: string;
}

export interface StoryAttachment {
  id: string;
  target: ConnectionTarget;
  tagId?: string;
  entity?: ConnectionTarget;
  anchor?: PassageAnchor;
  createdAt: string;
}

export interface ConnectionStore {
  version: 1;
  tags: StoryTag[];
  attachments: StoryAttachment[];
}

export type PassageResolution =
  | { status: 'resolved'; start: number; end: number }
  | { status: 'missing' | 'ambiguous' };

const CONTEXT_LENGTH = 32;

export function makePassageAnchor(content: string, start: number, end: number, expectedQuote?: string): PassageAnchor {
  if (typeof content !== 'string' || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || end <= start || end > content.length) {
    throw new Error('Passage range must select nonempty saved text');
  }
  const quote = content.slice(start, end);
  if (expectedQuote !== undefined && expectedQuote !== quote) {
    throw new Error('Passage quote no longer matches the saved document');
  }
  return {
    start, end, quote,
    prefix: content.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: content.slice(end, end + CONTEXT_LENGTH),
  };
}

/** Require surviving adjacent context; offsets alone never establish identity. */
export function resolvePassageAnchor(content: string, anchor: PassageAnchor): PassageResolution {
  if (typeof content !== 'string' || !anchor || typeof anchor.quote !== 'string' || !anchor.quote
    || typeof anchor.prefix !== 'string' || typeof anchor.suffix !== 'string') {
    return { status: 'missing' };
  }
  let match: number | undefined;
  for (let start = content.indexOf(anchor.quote); start !== -1; start = content.indexOf(anchor.quote, start + 1)) {
    const end = start + anchor.quote.length;
    if (anchor.prefix && content.slice(Math.max(0, start - anchor.prefix.length), start) !== anchor.prefix) continue;
    if (anchor.suffix && content.slice(end, end + anchor.suffix.length) !== anchor.suffix) continue;
    // With no original context, the entire document was selected. Its text must survive intact.
    if (!anchor.prefix && !anchor.suffix && content !== anchor.quote) continue;
    if (match !== undefined) return { status: 'ambiguous' };
    match = start;
  }
  return match === undefined
    ? { status: 'missing' }
    : { status: 'resolved', start: match, end: match + anchor.quote.length };
}
