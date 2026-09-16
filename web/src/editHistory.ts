import { create } from 'zustand';

export interface HistoryStatus { undo: { id: string; label: string } | null; redo: { id: string; label: string } | null; message?: string }
export const emptyHistory: HistoryStatus = { undo: null, redo: null };
export const useEditHistory = create<{ byProject: Record<string, HistoryStatus>; pending: number; restoring: boolean }>(() => ({ byProject: {}, pending: 0, restoring: false }));
let session: string | undefined;
export function historySession(): string {
  if (session) return session;
  try { session = sessionStorage.getItem('muse:undo-session') ?? undefined; } catch { /* In-memory session works without browser storage. */ }
  session ??= globalThis.crypto?.randomUUID?.() ?? `history-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try { sessionStorage.setItem('muse:undo-session', session); } catch { /* Reload will start a fresh history. */ }
  return session;
}
export function updateHistory(projectId: string, history: HistoryStatus) {
  useEditHistory.setState((state) => ({ byProject: { ...state.byProject, [projectId]: history } }));
}

export interface ValueHistory<T> { past: T[]; future: T[]; lastEdit: number }
export const emptyValueHistory = <T>(): ValueHistory<T> => ({ past: [], future: [], lastEdit: 0 });
/** Group continuous typing, but preserve paste/replacement and post-undo boundaries. */
export function rememberValue<T>(history: ValueHistory<T>, before: T, now = Date.now(), separate = false): ValueHistory<T> {
  return { past: separate || !history.lastEdit || now - history.lastEdit > 700 || history.future.length
    ? [...history.past, before].slice(-80) : history.past, future: [], lastEdit: now };
}
export function travelValue<T>(history: ValueHistory<T>, current: T, direction: 'undo' | 'redo'): { value: T; history: ValueHistory<T> } | null {
  const from = direction === 'undo' ? history.past : history.future;
  if (!from.length) return null;
  return { value: from[from.length - 1], history: direction === 'undo'
    ? { past: from.slice(0, -1), future: [...history.future, current], lastEdit: 0 }
    : { past: [...history.past, current], future: from.slice(0, -1), lastEdit: 0 } };
}
