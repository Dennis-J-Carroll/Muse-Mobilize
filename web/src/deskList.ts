import { create } from 'zustand';
import { parseDesks, type SavedDesk } from './desks';

const key = (projectId: string) => `muse:desks:v1:${projectId}`;

export function moveDesk(desks: SavedDesk[], id: string, delta: -1 | 1): SavedDesk[] {
  const from = desks.findIndex((desk) => desk.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= desks.length) return desks;
  const next = [...desks];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Desks stay per device (localStorage); one list serves the dialog, the switcher and the keys. */
export const useDeskList = create<{
  projectId: string | null; desks: SavedDesk[]; error: string; previous: SavedDesk | null;
  load: (projectId: string | null) => void; persist: (next: SavedDesk[]) => boolean; move: (id: string, delta: -1 | 1) => void;
}>((set, get) => ({
  projectId: null, desks: [], error: '', previous: null,
  load: (projectId) => {
    if (projectId === get().projectId) return;
    let desks: SavedDesk[] = [];
    try { desks = projectId ? parseDesks(localStorage.getItem(key(projectId))) : []; } catch { desks = []; }
    // A previous arrangement from another project would bind panes to documents that are not here.
    set({ projectId, desks, error: '', previous: null });
  },
  persist: (next) => {
    const projectId = get().projectId;
    if (!projectId) return false;
    try { localStorage.setItem(key(projectId), JSON.stringify(next)); set({ desks: next, error: '' }); return true; }
    catch { set({ error: 'Browser storage is unavailable or full. Changes were not saved; existing desks are unchanged.' }); return false; }
  },
  move: (id, delta) => { get().persist(moveDesk(get().desks, id, delta)); },
}));

export function restoreWithMemory(capture: (name: string) => SavedDesk, restore: (desk: SavedDesk) => void, desk: SavedDesk) {
  const here = capture('Previous arrangement');
  restore(desk);
  useDeskList.setState({ previous: here });
}

export function restorePrevious(capture: (name: string) => SavedDesk, restore: (desk: SavedDesk) => void) {
  const previous = useDeskList.getState().previous;
  if (previous) restoreWithMemory(capture, restore, previous);
}
