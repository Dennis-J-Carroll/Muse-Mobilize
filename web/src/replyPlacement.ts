import type { Selection } from './types';

export function placeReply(base: string, excerpt: string, mode: 'append' | 'selection', selection?: Selection | null): string {
  const text = excerpt.trim();
  if (!text) throw new Error('Choose some response text first.');
  if (mode === 'append') return base + (base && !base.endsWith('\n\n') ? base.endsWith('\n') ? '\n' : '\n\n' : '') + text;
  if (!selection || selection.start < 0 || selection.end <= selection.start || base.slice(selection.start, selection.end) !== selection.text) {
    throw new Error('Selected passage changed. Select it again and reopen Send to project.');
  }
  return base.slice(0, selection.start) + text + base.slice(selection.end);
}
