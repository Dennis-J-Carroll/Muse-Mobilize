/** One list feeds both the key handler and the shortcut legend, so they cannot drift. */
export type ShortcutGroup = 'Writing' | 'Desks and cards';
export interface Shortcut { id: string; keys: string; label: string; group: ShortcutGroup }

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'focus-toggle', keys: 'Alt Shift F', label: 'Enter or leave focus', group: 'Writing' },
  { id: 'focus-exit', keys: 'Esc', label: 'Leave focus', group: 'Writing' },
  { id: 'undo', keys: 'Ctrl Z / Ctrl Y', label: 'Undo / redo writing', group: 'Writing' },
  { id: 'tag', keys: 'type !#', label: 'Tag or link the word at the cursor', group: 'Writing' },
  { id: 'story-cards', keys: 'Alt Shift K', label: 'Story cards (in focus)', group: 'Writing' },
  { id: 'ask-muse', keys: 'Ctrl Enter', label: 'Send to Muse', group: 'Writing' },
  { id: 'desk-n', keys: 'Alt Shift 1–9', label: 'Open desk 1–9', group: 'Desks and cards' },
  { id: 'desk-previous', keys: 'Alt Shift 0', label: 'Back to previous arrangement', group: 'Desks and cards' },
  { id: 'desk-switcher', keys: 'Alt Shift D', label: 'Find a desk', group: 'Desks and cards' },
  { id: 'recall-card', keys: 'Alt 1–9', label: 'Recall a floating card', group: 'Desks and cards' },
  { id: 'legend', keys: 'Alt Shift /', label: 'Show these shortcuts', group: 'Desks and cards' },
];

export type ShortcutAction =
  | { kind: 'focus-toggle' } | { kind: 'desk'; index: number } | { kind: 'desk-previous' }
  | { kind: 'desk-switcher' } | { kind: 'legend' };

export interface KeyLike { altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; code: string; isComposing?: boolean; defaultPrevented?: boolean }

/** Physical keys (event.code) so layouts that turn Shift+digit into symbols still work. */
export function matchShortcut(event: KeyLike): ShortcutAction | null {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.isComposing || event.defaultPrevented) return null;
  if (event.code === 'KeyF') return { kind: 'focus-toggle' };
  if (event.code === 'KeyD') return { kind: 'desk-switcher' };
  if (event.code === 'Slash') return { kind: 'legend' };
  if (event.code === 'Digit0') return { kind: 'desk-previous' };
  const digit = /^Digit([1-9])$/.exec(event.code);
  return digit ? { kind: 'desk', index: Number(digit[1]) - 1 } : null;
}

/** Dialogs and card forms own their keys; the manuscript textarea does not block Alt+Shift shortcuts. */
export function shortcutBlocked(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  if (target.closest('dialog[open], [role="dialog"], .floating-drawer')) return true;
  return Boolean(target.closest('input, select, textarea')) && !target.matches('textarea.draft');
}
