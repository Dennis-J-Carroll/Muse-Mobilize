import { useRef, useState, type KeyboardEvent } from 'react';
import { emptyValueHistory, rememberValue, travelValue } from './editHistory';

/** Local form history: identity changes reset it; edits and preview invalidation stay with the owner. */
export function useValueUndo<T>(value: T, apply: (value: T) => void) {
  const [history, setHistory] = useState(emptyValueHistory<T>);
  const latest = useRef(value); latest.current = value;
  const travel = (direction: 'undo' | 'redo') => {
    const next = travelValue(history, latest.current, direction);
    if (next) { setHistory(next.history); apply(next.value); }
  };
  return {
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    undo: () => travel('undo'), redo: () => travel('redo'),
    reset: () => setHistory(emptyValueHistory<T>()),
    change: (next: T) => { const before = latest.current; setHistory((h) => rememberValue(h, before, Date.now(), true)); apply(next); },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      // Search and preview questions have their own text state. Their native
      // undo must not silently reverse a knowledge assignment or recipe section.
      if ((event.target as Element).closest('input, textarea, [contenteditable="true"]')) return;
      const direction = event.key.toLowerCase() === 'z' ? (event.shiftKey ? 'redo' : 'undo') : event.key.toLowerCase() === 'y' ? 'redo' : null;
      if (direction) { event.preventDefault(); event.stopPropagation(); travel(direction); }
    },
  };
}
