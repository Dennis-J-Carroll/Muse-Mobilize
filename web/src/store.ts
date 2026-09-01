import { create } from 'zustand';
import { api } from './api';
import type {
  AgentDef, AgentRun, MuseEvent, Pane, PaneType, Patch, ProjectManifest,
  ProviderStatus, Region, Selection, SettingsView, WorkspaceDef,
} from './types';

interface DocState {
  content: string;
  dirty: boolean;
  savedAt?: string;
  title: string;
}

interface State {
  ready: boolean;
  error: string | null;
  notice: string | null;

  projects: ProjectManifest[];
  project: ProjectManifest | null;
  agents: AgentDef[];
  workspaces: WorkspaceDef[];
  activeWorkspace: string | null;

  docs: Record<string, DocState>;
  panes: Pane[];
  rightWidth: number;
  bottomHeight: number;

  selection: Selection | null;
  runs: Record<string, AgentRun[]>;
  busy: Record<string, boolean>;
  events: MuseEvent[];

  settings: SettingsView | null;
  providers: ProviderStatus[];

  bootstrap: () => Promise<void>;
  newProject: (name: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;

  loadDoc: (docId: string) => Promise<void>;
  editDoc: (docId: string, content: string) => void;
  flushDoc: (docId: string) => Promise<void>;

  openPane: (type: PaneType, opts?: { bindingId?: string; title?: string; region?: Region }) => void;
  closePane: (paneId: string) => void;
  setPaneSize: (paneId: string, mode: Pane['sizeMode']) => void;
  setRightWidth: (w: number) => void;
  setBottomHeight: (h: number) => void;
  applyWorkspace: (id: string) => Promise<void>;
  saveWorkspaceAs: (name: string) => Promise<void>;

  setSelection: (sel: Selection | null) => void;
  ask: (agentId: string, question: string, useSelection: boolean) => Promise<void>;
  acceptPatch: (patch: Patch, override?: string) => Promise<void>;
  rejectPatch: (agentId: string, patch: Patch) => Promise<void>;
  cycleAgentState: (agentId: string) => Promise<void>;

  refreshEvents: () => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (patch: Record<string, string>) => Promise<void>;
  setNotice: (n: string | null) => void;
}

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
let paneSeq = 0;

const titleFor = (type: PaneType, s: State, bindingId?: string): string => {
  if (type === 'agent') return s.agents.find((a) => a.id === bindingId)?.name ?? 'Agent';
  if (type === 'events') return 'Activity';
  if (type === 'review') return 'Review';
  return s.docs[bindingId ?? '']?.title ?? s.project?.documents.find((d) => d.id === bindingId)?.title ?? 'Document';
};

export const useStore = create<State>((set, get) => ({
  ready: false,
  error: null,
  notice: null,
  projects: [],
  project: null,
  agents: [],
  workspaces: [],
  activeWorkspace: null,
  docs: {},
  panes: [],
  rightWidth: 400,
  bottomHeight: 210,
  selection: null,
  runs: {},
  busy: {},
  events: [],
  settings: null,
  providers: [],

  setNotice: (notice) => set({ notice }),

  async bootstrap() {
    try {
      const [{ projects }, cfg] = await Promise.all([api.listProjects(), api.settings()]);
      set({ projects, settings: cfg.settings, providers: cfg.providers });
      const last = localStorage.getItem('muse:lastProject');
      const target = projects.find((p) => p.id === last) ?? projects[0];
      if (target) await get().openProject(target.id);
      set({ ready: true });
    } catch (err: any) {
      set({ ready: true, error: err.message });
    }
  },

  async newProject(name) {
    const { project } = await api.createProject(name);
    set({ projects: [project, ...get().projects] });
    await get().openProject(project.id);
  },

  async openProject(id) {
    try {
      const { project, agents, workspaces } = await api.openProject(id);
      localStorage.setItem('muse:lastProject', id);
      set({ project, agents, workspaces, docs: {}, panes: [], runs: {}, events: [], selection: null, error: null });
      const drafting = workspaces.find((w) => w.id === 'drafting') ?? workspaces[0];
      if (drafting) await get().applyWorkspace(drafting.id);
      else {
        const first = project.documents[0];
        if (first) get().openPane('editor', { bindingId: first.id });
      }
      await get().refreshEvents();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  async loadDoc(docId) {
    const { project, docs } = get();
    if (!project || docs[docId]) return;
    const { meta, content } = await api.readDoc(project.id, docId);
    set({ docs: { ...get().docs, [docId]: { content, dirty: false, title: meta.title } } });
  },

  /** Autosave. The draft is sovereign: we never block typing on the network. */
  editDoc(docId, content) {
    const cur = get().docs[docId];
    set({ docs: { ...get().docs, [docId]: { ...(cur ?? { title: docId }), content, dirty: true } } });
    clearTimeout(saveTimers[docId]);
    saveTimers[docId] = setTimeout(() => void get().flushDoc(docId), 900);
  },

  async flushDoc(docId) {
    const { project, docs } = get();
    const doc = docs[docId];
    if (!project || !doc || !doc.dirty) return;
    try {
      const { savedAt } = await api.writeDoc(project.id, docId, doc.content);
      const latest = get().docs[docId];
      set({
        docs: {
          ...get().docs,
          [docId]: { ...latest, dirty: latest.content !== doc.content, savedAt },
        },
      });
    } catch (err: any) {
      set({ error: `Could not save: ${err.message}` });
    }
  },

  openPane(type, opts = {}) {
    const s = get();
    const bindingId = opts.bindingId;
    const existing = s.panes.find((p) => p.type === type && p.binding?.id === bindingId);
    if (existing) {
      set({ panes: s.panes.map((p) => (p.id === existing.id ? { ...p, sizeMode: 'normal' } : p)) });
      return;
    }
    const region: Region = opts.region ?? (type === 'agent' ? 'right' : type === 'editor' ? 'main' : 'bottom');
    const pane: Pane = {
      id: `pane-${++paneSeq}-${type}-${bindingId ?? ''}`,
      type,
      title: opts.title ?? titleFor(type, s, bindingId),
      region,
      binding: bindingId ? { type: type === 'agent' ? 'agent' : 'document', id: bindingId } : undefined,
      sizeMode: 'normal',
    };
    set({ panes: [...s.panes, pane] });
    if (pane.binding?.type === 'document') void get().loadDoc(pane.binding.id);
    if (s.project) void api.emit(s.project.id, 'workspace.pane.opened', { type, binding: bindingId });
  },

  closePane(paneId) {
    const s = get();
    const pane = s.panes.find((p) => p.id === paneId);
    set({ panes: s.panes.filter((p) => p.id !== paneId) });
    if (s.project && pane) void api.emit(s.project.id, 'workspace.pane.closed', { type: pane.type });
  },

  setPaneSize(paneId, mode) {
    set({
      panes: get().panes.map((p) =>
        p.id === paneId ? { ...p, sizeMode: mode } : p.sizeMode === 'maximized' && mode === 'maximized' ? { ...p, sizeMode: 'normal' } : p,
      ),
    });
  },

  setRightWidth: (w) => set({ rightWidth: Math.max(0, Math.min(900, w)) }),
  setBottomHeight: (h) => set({ bottomHeight: Math.max(0, Math.min(700, h)) }),

  async applyWorkspace(id) {
    const s = get();
    const ws = s.workspaces.find((w) => w.id === id);
    if (!ws || !s.project) return;
    const panes: Pane[] = ws.panes
      .filter((p) => {
        if (p.binding?.type === 'document') return s.project!.documents.some((d) => d.id === p.binding!.id);
        if (p.binding?.type === 'agent') return s.agents.some((a) => a.id === p.binding!.id);
        return true;
      })
      .map((p, i) => ({
        id: `pane-${++paneSeq}-${p.type}-${i}`,
        type: p.type,
        title: titleFor(p.type, s, p.binding?.id),
        region: p.region,
        binding: p.binding,
        sizeMode: 'normal' as const,
      }));
    set({ panes, activeWorkspace: id });
    await Promise.all(
      panes.filter((p) => p.binding?.type === 'document').map((p) => get().loadDoc(p.binding!.id)),
    );
    // Titles resolve only after documents load.
    set({ panes: get().panes.map((p) => ({ ...p, title: titleFor(p.type, get(), p.binding?.id) })) });
  },

  async saveWorkspaceAs(name) {
    const s = get();
    if (!s.project) return;
    const ws: WorkspaceDef = {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      panes: s.panes.map((p) => ({ id: p.id, type: p.type, region: p.region, binding: p.binding })),
    };
    const { workspace } = await api.saveWorkspace(s.project.id, ws);
    const others = s.workspaces.filter((w) => w.id !== workspace.id);
    set({ workspaces: [...others, workspace], activeWorkspace: workspace.id, notice: `Workspace “${name}” saved.` });
    await get().refreshEvents();
  },

  setSelection(selection) {
    set({ selection });
  },

  async ask(agentId, question, useSelection) {
    const s = get();
    if (!s.project) return;
    const editorPane = s.panes.find((p) => p.type === 'editor' || p.type === 'notes');
    const documentId = editorPane?.binding?.id ?? s.project.documents[0]?.id;
    set({ busy: { ...s.busy, [agentId]: true }, error: null });
    try {
      const { run } = await api.ask(s.project.id, {
        agentId,
        documentId,
        selection: useSelection ? s.selection : null,
        question,
      });
      set({ runs: { ...get().runs, [agentId]: [...(get().runs[agentId] ?? []), run] } });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ busy: { ...get().busy, [agentId]: false } });
      await get().refreshEvents();
    }
  },

  async acceptPatch(patch, override) {
    const s = get();
    if (!s.project) return;
    const applied = override !== undefined ? { ...patch, afterText: override } : patch;
    // Flush pending keystrokes first, or the server would apply to a stale file.
    await get().flushDoc(patch.documentId);
    try {
      const { content } = await api.applyPatch(s.project.id, patch.documentId, applied);
      const cur = get().docs[patch.documentId];
      set({
        docs: { ...get().docs, [patch.documentId]: { ...(cur ?? { title: patch.documentId }), content, dirty: false } },
        runs: markPatch(get().runs, patch.id, 'accepted'),
        notice: 'Patch applied.',
      });
    } catch (err: any) {
      set({ runs: markPatch(get().runs, patch.id, 'stale'), error: err.message });
    }
    await get().refreshEvents();
  },

  async rejectPatch(_agentId, patch) {
    const s = get();
    if (!s.project) return;
    await api.rejectPatch(s.project.id, patch.id);
    set({ runs: markPatch(get().runs, patch.id, 'rejected') });
    await get().refreshEvents();
  },

  async cycleAgentState(agentId) {
    const s = get();
    if (!s.project) return;
    const agent = s.agents.find((a) => a.id === agentId);
    if (!agent) return;
    const order = ['idle', 'live', 'frozen'] as const;
    const next = order[(order.indexOf(agent.state.mode as any) + 1) % order.length];
    const { agent: updated } = await api.setAgentState(s.project.id, agentId, next);
    set({ agents: s.agents.map((a) => (a.id === agentId ? { ...a, state: updated.state } : a)) });
    await get().refreshEvents();
  },

  async refreshEvents() {
    const s = get();
    if (!s.project) return;
    try {
      const { events } = await api.events(s.project.id, 120);
      set({ events });
    } catch {
      /* the log is a nicety, never a blocker */
    }
  },

  async loadSettings() {
    const cfg = await api.settings();
    set({ settings: cfg.settings, providers: cfg.providers });
  },

  async saveSettings(patch) {
    const cfg = await api.saveSettings(patch);
    set({ settings: cfg.settings, providers: cfg.providers, notice: 'Settings saved.' });
  },
}));

function markPatch(runs: Record<string, AgentRun[]>, patchId: string, status: Patch['status']) {
  const next: Record<string, AgentRun[]> = {};
  for (const [k, list] of Object.entries(runs)) {
    next[k] = list.map((r) => ({
      ...r,
      patches: r.patches.map((p) => (p.id === patchId ? { ...p, status } : p)),
    }));
  }
  return next;
}
