import { create } from 'zustand';
import type { ConnectionTarget } from '../../shared/connections';
import type { Thread } from '../../shared/threads';
import { api } from './api';
import { useStore } from './store';

/** "This session" on the board means touched since this tab loaded. */
export const SESSION_START = new Date().toISOString();

const currentProject = () => useStore.getState().project?.id ?? null;
const upsert = (threads: Thread[], thread: Thread) =>
  threads.some((item) => item.id === thread.id) ? threads.map((item) => (item.id === thread.id ? thread : item)) : [...threads, thread];

interface ThreadsState {
  projectId: string | null;
  threads: Thread[];
  loaded: boolean;
  busy: boolean;
  error: string;
  ensureLoaded: () => Promise<void>;
  refresh: () => Promise<void>;
  create: (target: ConnectionTarget, text: string) => Promise<Thread | null>;
  reply: (threadId: string, text: string) => Promise<Thread | null>;
  retry: (threadId: string, messageId: string) => Promise<Thread | null>;
  editMessage: (threadId: string, messageId: string, text: string) => Promise<Thread | null>;
  setStatus: (threadId: string, status: 'open' | 'resolved') => Promise<Thread | null>;
  setTrashed: (threadId: string, trashed: boolean) => Promise<Thread | null>;
  merge: (ids: string[]) => Promise<Thread | null>;
  deleteForever: (threadId: string) => Promise<boolean>;
}

export const useThreads = create<ThreadsState>((set, get) => {
  /** Runs a mutation for the current project; results for a project that was switched away from are dropped. */
  async function apply(op: (projectId: string) => Promise<{ thread: Thread }>, afterMerge?: boolean): Promise<Thread | null> {
    const projectId = currentProject();
    if (!projectId || get().busy) return null;
    set({ busy: true, error: '' });
    try {
      const { thread } = await op(projectId);
      if (currentProject() !== projectId) return null;
      set((state) => ({ threads: upsert(state.threads, thread), busy: false }));
      if (afterMerge) await get().refresh();
      return thread;
    } catch (err: any) {
      if (currentProject() === projectId) { set({ busy: false, error: String(err?.message ?? err) }); await get().refresh(); }
      return null;
    }
  }
  return {
    projectId: null, threads: [], loaded: false, busy: false, error: '',
    async refresh() {
      const projectId = currentProject();
      if (!projectId) return;
      try {
        const { threads } = await api.threads(projectId);
        if (currentProject() === projectId) set({ projectId, threads, loaded: true });
      } catch (err: any) {
        if (currentProject() === projectId) set({ projectId, loaded: true, error: `Could not load notes: ${err.message}` });
      }
    },
    async ensureLoaded() {
      const projectId = currentProject();
      if (!projectId) return;
      if (get().projectId !== projectId) set({ projectId, threads: [], loaded: false, error: '' });
      if (!get().loaded) await get().refresh();
    },
    create: (target, text) => apply((id) => api.createThread(id, { target, text })),
    reply: (threadId, text) => apply((id) => api.replyThread(id, threadId, { text, expectedUpdatedAt: get().threads.find((t) => t.id === threadId)?.updatedAt })),
    retry: (threadId, messageId) => apply((id) => api.retryThreadMessage(id, threadId, messageId)),
    editMessage: (threadId, messageId, text) => apply((id) => api.editThreadMessage(id, threadId, messageId, { text })),
    setStatus: (threadId, status) => apply((id) => api.updateThread(id, threadId, { status })),
    setTrashed: (threadId, trashed) => apply((id) => api.updateThread(id, threadId, { trashed })),
    merge: (ids) => apply((id) => api.mergeThreads(id, ids), true),
    async deleteForever(threadId) {
      const projectId = currentProject();
      if (!projectId || get().busy) return false;
      set({ busy: true, error: '' });
      try {
        await api.deleteThread(projectId, threadId);
        if (currentProject() === projectId) set((state) => ({ threads: state.threads.filter((t) => t.id !== threadId), busy: false }));
        return true;
      } catch (err: any) {
        if (currentProject() === projectId) { set({ busy: false, error: String(err?.message ?? err) }); await get().refresh(); }
        return false;
      }
    },
  };
});

export const useThreadPopover = create<{
  target: ConnectionTarget | null; threadId: string | null; opener: HTMLElement | null;
  open: (target: ConnectionTarget, threadId?: string) => void; close: () => void;
}>((set, get) => ({
  target: null, threadId: null, opener: null,
  open: (target, threadId) => set({ target, threadId: threadId ?? null, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null }),
  close: () => {
    const { opener } = get();
    set({ target: null, threadId: null, opener: null });
    requestAnimationFrame(() => { if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  },
}));
