import type { ConnectionTarget } from '../../shared/connections';
import { samePassage, sameTarget } from '../../shared/threads';
import type { Thread } from '../../shared/threads';

export type BoardFilter = 'session' | 'open' | 'resolved' | 'all' | 'trash';

const time = (iso: string) => Date.parse(iso);

export function threadsForTarget(threads: Thread[], target: ConnectionTarget, options: { anchored?: boolean } = {}): Thread[] {
  return threads
    .filter((thread) => !thread.trashedAt && sameTarget(thread.target, target)
      && (options.anchored === undefined || Boolean(thread.anchor) === options.anchored))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || time(b.createdAt) - time(a.createdAt));
}

export const notesTaggedWith = (threads: Thread[], tagId: string) => threads.filter((thread) => !thread.trashedAt && thread.tagIds?.includes(tagId));
export const notesLinkingTo = (threads: Thread[], target: ConnectionTarget) => threads.filter((thread) => !thread.trashedAt && thread.links?.some((link) => sameTarget(link, target)));
export function noteSummary(thread: Thread, max = 80): string {
  const text = (thread.messages[0]?.text ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export const openCount = (threads: Thread[], target: ConnectionTarget) =>
  threadsForTarget(threads, target).filter((thread) => thread.status === 'open').length;

export function filterThreads(threads: Thread[], filter: BoardFilter, sessionStart: string): Thread[] {
  if (filter === 'trash') return threads.filter((thread) => thread.trashedAt);
  const live = threads.filter((thread) => !thread.trashedAt);
  if (filter === 'session') return live.filter((thread) => time(thread.updatedAt) >= time(sessionStart));
  if (filter === 'open') return live.filter((thread) => thread.status === 'open');
  if (filter === 'resolved') return live.filter((thread) => thread.status === 'resolved');
  return live;
}

export function canCombine(picked: Thread[]): { ok: boolean; reason?: string } {
  if (picked.length < 2) return { ok: false, reason: 'Select two or more notes' };
  if (picked.some((thread) => thread.trashedAt)) return { ok: false, reason: 'Restore trashed notes first' };
  if (!picked.every((thread) => sameTarget(thread.target, picked[0].target))) return { ok: false, reason: 'Combine works within one card' };
  if (!picked.every((thread) => samePassage(thread.anchor, picked[0].anchor))) return { ok: false, reason: 'Combine works within one passage' };
  return { ok: true };
}

/** A tag filter whose tag has disappeared (for example its creation was undone) must not keep hiding every note. */
export const effectiveTagFilter = (tags: { id: string }[], tagFilter: string) => (tags.some((tag) => tag.id === tagFilter) ? tagFilter : '');

export function anchorStatusText(status: 'resolved' | 'moved' | 'missing' | 'ambiguous'): string {
  return status === 'resolved' ? 'found' : status === 'moved' ? 'moved' : status === 'missing' ? "can't be found" : 'matches more than once';
}

export function placePopover(rect: { left: number; top: number; right: number; bottom: number }, vw: number, vh: number, width = 340, height = 420) {
  const left = vw - rect.right >= width + 16 ? rect.right + 8 : Math.max(8, rect.right - width - 8);
  const top = Math.min(Math.max(8, rect.top), Math.max(8, vh - height - 8));
  return { left, top };
}

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - time(iso)) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function cardLabel(records: { target: ConnectionTarget; label: string; group: string }[], target: ConnectionTarget) {
  const found = records.find((record) => sameTarget(record.target, target));
  return found ? { label: found.label, group: found.group } : null;
}
