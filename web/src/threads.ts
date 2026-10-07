import { create } from 'zustand';
import type { ConnectionTarget } from '../../shared/connections';
import { hasMuseMention } from '../../shared/threads';
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
  /** One request at a time; Send, Resolve, Trash and the rest are disabled while it runs. */
  busy: boolean;
  /** True while a request that asked @Muse is in flight, so the thread can show "Muse is thinking…". */
  thinking: boolean;
  error: string;
  ensureLoaded: () => Promise<void>;
  refresh: () => Promise<void>;
  create: (target: ConnectionTarget, text: string, extra?: { range?: { start: number; end: number; quote: string }; tagIds?: string[]; links?: ConnectionTarget[] }) => Promise<Thread | null>;
  reply: (threadId: string, text: string) => Promise<Thread | null>;
  retry: (threadId: string, messageId: string) => Promise<Thread | null>;
  editMessage: (threadId: string, messageId: string, text: string) => Promise<Thread | null>;
  setStatus: (threadId: string, status: 'open' | 'resolved') => Promise<Thread | null>;
  setTrashed: (threadId: string, trashed: boolean) => Promise<Thread | null>;
  setConnections: (threadId: string, input: { tagIds?: string[]; links?: ConnectionTarget[] }) => Promise<Thread | null>;
  merge: (ids: string[]) => Promise<Thread | null>;
  deleteForever: (threadId: string) => Promise<boolean>;
}

/** Each request takes a number; only the newest request may clear `busy`, and a project switch invalidates all. */
let requestSeq = 0;

export const useThreads = create<ThreadsState>((set, get) => {
  /** Runs one request for the current project. A result for a project that was switched away from is dropped. */
  async function run<T>(op: (projectId: string) => Promise<T>, commit: (value: T) => void, options: { thinking?: boolean; refreshAfter?: boolean } = {}): Promise<T | null> {
    const projectId = currentProject();
    if (!projectId || get().busy) return null;
    const mine = ++requestSeq;
    const settle = (error = '') => { if (mine === requestSeq) set({ busy: false, thinking: false, ...(error ? { error } : {}) }); };
    set({ busy: true, thinking: Boolean(options.thinking), error: '' });
    try {
      const value = await op(projectId);
      if (currentProject() !== projectId) { settle(); return null; }
      commit(value);
      settle();
      if (options.refreshAfter) await get().refresh();
      return value;
    } catch (err: any) {
      if (currentProject() === projectId) { settle(String(err?.message ?? err)); await get().refresh(); } else settle();
      return null;
    }
  }
  const putThread = (thread: Thread) => set((state) => ({ threads: upsert(state.threads, thread) }));
  const apply = (op: (projectId: string) => Promise<{ thread: Thread }>, options?: { thinking?: boolean; refreshAfter?: boolean }) =>
    run(op, ({ thread }) => putThread(thread), options).then((result) => result?.thread ?? null);
  return {
    projectId: null, threads: [], loaded: false, busy: false, thinking: false, error: '',
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
      if (get().projectId !== projectId) {
        requestSeq++; // a request still running for the old project must not hold this one busy
        set({ projectId, threads: [], loaded: false, busy: false, thinking: false, error: '' });
      }
      if (!get().loaded) await get().refresh();
    },
    create: (target, text, extra) => apply((id) => api.createThread(id, { target, text, ...extra }), { thinking: hasMuseMention(text) }),
    reply: (threadId, text) => apply((id) => api.replyThread(id, threadId, { text, expectedUpdatedAt: get().threads.find((t) => t.id === threadId)?.updatedAt }), { thinking: hasMuseMention(text) }),
    retry: (threadId, messageId) => apply((id) => api.retryThreadMessage(id, threadId, messageId), { thinking: true }),
    editMessage: (threadId, messageId, text) => apply((id) => api.editThreadMessage(id, threadId, messageId, { text })),
    setStatus: (threadId, status) => apply((id) => api.updateThread(id, threadId, { status })),
    setTrashed: (threadId, trashed) => apply((id) => api.updateThread(id, threadId, { trashed })),
    setConnections: (threadId, input) => apply((id) => api.updateThreadConnections(id, threadId, { ...input, expectedUpdatedAt: get().threads.find((t) => t.id === threadId)?.updatedAt })),
    merge: (ids) => apply((id) => api.mergeThreads(id, ids), { refreshAfter: true }),
    async deleteForever(threadId) {
      const done = await run((id) => api.deleteThread(id, threadId), () => set((state) => ({ threads: state.threads.filter((t) => t.id !== threadId) })));
      return done !== null;
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
