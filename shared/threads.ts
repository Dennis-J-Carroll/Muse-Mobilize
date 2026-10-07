import { resolvePassageAnchor } from './connections.js';
import type { ConnectionTarget, PassageAnchor } from './connections.js';

export const THREAD_TEXT_MAX = 4000;
export const THREAD_TAG_MAX = 12;
export const THREAD_LINK_MAX = 12;

export type ThreadAuthor = { kind: 'user' } | { kind: 'muse'; agentId: string };

export interface ThreadMessage {
  id: string;
  author: ThreadAuthor;
  text: string;
  createdAt: string;
  editedAt?: string;
  /** Muse replies only: `failed` means the model could not answer; `text` carries the reason and Retry replaces it. */
  state?: 'failed';
  /** Reserved for the later apply-edit slice; nothing reads or writes it yet. */
  proposal?: { field: string; before: string; after: string };
}

export interface Thread {
  id: string;
  target: ConnectionTarget;
  status: 'open' | 'resolved';
  messages: ThreadMessage[];
  createdAt: string;
  updatedAt: string;
  trashedAt?: string;
  /** Ids of threads folded into this one by Combine. */
  mergedFrom?: string[];
  /** Connection-store tag ids on this note; absent means none. */
  tagIds?: string[];
  /** Cards this note is about; absent means none. */
  links?: ConnectionTarget[];
  /** Passage this note is attached to; document targets only. */
  anchor?: PassageAnchor;
}

export interface ThreadStore { version: 1; threads: Thread[] }

/** Same passage means same text and surroundings; start offsets drift as the document is edited. */
export function samePassage(a?: PassageAnchor, b?: PassageAnchor): boolean {
  if (!a || !b) return !a && !b;
  return a.quote === b.quote && a.prefix === b.prefix && a.suffix === b.suffix;
}

export interface AnchorState { threadId: string; status: 'resolved' | 'moved' | 'missing' | 'ambiguous'; start?: number; end?: number }

/** The one place passage notes are located. The passage list uses it; gutter markers would read the same positions. */
export function resolveThreadAnchors(content: string, threads: Thread[]): AnchorState[] {
  return threads.filter((thread) => thread.anchor).map((thread) => {
    const found = resolvePassageAnchor(content, thread.anchor!);
    if (found.status !== 'resolved') return { threadId: thread.id, status: found.status };
    return { threadId: thread.id, status: found.start === thread.anchor!.start ? 'resolved' as const : 'moved' as const, start: found.start, end: found.end };
  });
}

export const targetKey = (target: ConnectionTarget) => `${target.kind}:${target.id}`;
export const sameTarget = (a: ConnectionTarget, b?: ConnectionTarget) => Boolean(b && targetKey(a) === targetKey(b));

// A mention starts the text or follows a non-word, non-@ character, so emails and "@museum" never match.
const MENTION_SOURCE = String.raw`(^|[^\w@])(@muse)\b`;

export function hasMuseMention(text: string): boolean {
  return new RegExp(MENTION_SOURCE, 'i').test(text);
}

export function splitMentions(text: string): { text: string; mention: boolean }[] {
  const parts: { text: string; mention: boolean }[] = [];
  const pattern = new RegExp(MENTION_SOURCE, 'gi');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const start = match.index + match[1].length;
    if (start > last) parts.push({ text: text.slice(last, start), mention: false });
    parts.push({ text: match[2], mention: true });
    last = start + match[2].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), mention: false });
  return parts;
}

/** Every message of every thread, oldest first; equal timestamps keep their input order. */
export function mergeThreadMessages(threads: Thread[]): ThreadMessage[] {
  return threads.flatMap((thread) => thread.messages).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
