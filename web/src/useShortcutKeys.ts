import { useEffect, useRef } from 'react';
import { matchShortcut, shortcutBlocked } from './shortcuts';
import { useWritingView } from './writingView';

/** Handlers return false when there was nothing to do, so the keystroke keeps its normal effect. */
export interface ShortcutHandlers { desk?(index: number): boolean | void; deskPrevious?(): boolean | void; deskSwitcher?(): boolean | void; legend?(): boolean | void }

/** One window listener for every Alt+Shift shortcut; handlers are read fresh on each key. */
export function useShortcutKeys(handlers: ShortcutHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = matchShortcut(event);
      if (!action || shortcutBlocked(event.target)) return;
      const h = latest.current;
      const run = action.kind === 'focus-toggle' ? () => useWritingView.getState().toggleFocus()
        : action.kind === 'desk' ? h.desk && (() => h.desk!(action.index))
        : action.kind === 'desk-previous' ? h.deskPrevious
        : action.kind === 'desk-switcher' ? h.deskSwitcher
        : h.legend;
      if (run && run() !== false) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
