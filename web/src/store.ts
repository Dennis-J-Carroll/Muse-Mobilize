import { create } from 'zustand';
import type { ReactNode } from 'react';
import { api } from './api';
import { reconcileDeskPanes, type DeskPane } from './desks';
import { draftJournal, draftKey, documentDraftScope, type DraftEntry } from './draftRecovery';
import type {
  AgentDef, AgentRun, CanonEntity, CanonEntityType, CanonFact, CanonStatus, CanonStore, CharacterProfile,
  FloatingPanel, GoalStore, ProgressProjection, ReferenceStore, StoryReference,
  LocalModelInstallResult, LocalModelProgress, MuseEvent, Pane, PaneType, Patch, ProjectManifest,
  PlotEdge, PlotEdgeRelation, PlotGraph, PlotNode, PlotNodeKind, PlotWorldRef,
  ProviderCheckResult, ProviderStatus, Region, Scene, SceneBoard, SceneStatus, SceneTheme, Selection, SettingsView, StoryImage, WorkspaceDef, WorldMap, WorldProfile,
} from './types';

interface DocState {
  content: string;
  dirty: boolean;
  savedAt?: string;
  title: string;
  baseContent?: string;
  journalRevision?: string;
  recovery?: DraftEntry<string>;
  applyingPatch?: boolean;
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
  floatingPanels: FloatingPanel[];
  floatingEditorContents: Record<string, ReactNode>;
  rightWidth: number;
  bottomHeight: number;

  selection: Selection | null;
  runs: Record<string, AgentRun[]>;
  busy: Record<string, boolean>;
  events: MuseEvent[];
  canon: CanonStore | null;
  plot: PlotGraph | null;
  sceneBoard: SceneBoard | null;
  references: ReferenceStore | null;
  goals: GoalStore | null;
  progress: ProgressProjection | null;
  worldMap: WorldMap | null;
  worldFocusEntityId: string | null;
  plotFocusNodeId: string | null;
  sceneFocusId: string | null;

  settings: SettingsView | null;
  providers: ProviderStatus[];

  bootstrap: () => Promise<void>;
  newProject: (name: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  uploadStoryImage: (file: File) => Promise<StoryImage>;

  loadDoc: (docId: string) => Promise<void>;
  editDoc: (docId: string, content: string) => void;
  flushDoc: (docId: string) => Promise<void>;
  resolveDocRecovery: (docId: string, choice: 'restore' | 'discard') => void;

  openPane: (type: PaneType, opts?: { bindingId?: string; title?: string; region?: Region; focus?: boolean }) => void;
  closePane: (paneId: string) => void;
  setPaneSize: (paneId: string, mode: Pane['sizeMode']) => void;
  resizePane: (paneId: string, width: number, height: number) => void;
  floatPane: (paneId: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  returnPaneToLayout: (paneId: string) => void;
  raisePane: (paneId: string) => void;
  tileDocuments: () => void;
  restoreDeskPanes: (panes: DeskPane[]) => void;
  openFloatingPanel: (cfg: { id: string; paneType: PaneType; title: string; width?: number; height?: number }) => void;
  closeFloatingPanel: (id: string) => void;
  dockFloatingPanel: (id: string) => void;
  undockFloatingPanel: (id: string) => void;
  moveFloatingPanel: (id: string, x: number, y: number) => void;
  focusFloatingPanel: (id: string) => void;
  setRightWidth: (w: number) => void;
  setBottomHeight: (h: number) => void;
  applyWorkspace: (id: string) => Promise<void>;
  saveWorkspaceAs: (name: string) => Promise<void>;

  setSelection: (sel: Selection | null) => void;
  ask: (agentId: string, question: string, useSelection: boolean) => Promise<void>;
  acceptPatch: (patch: Patch, override?: string) => Promise<void>;
  rejectPatch: (agentId: string, patch: Patch) => Promise<void>;
  cycleAgentState: (agentId: string) => Promise<void>;

  loadCanon: () => Promise<void>;
  createCanonEntity: (input: { type: CanonEntityType; name: string; aliases?: string[]; summary?: string; character?: CharacterProfile; world?: WorldProfile }) => Promise<CanonEntity | null>;
  updateCanonEntity: (entityId: string, patch: Partial<Pick<CanonEntity, 'name' | 'aliases' | 'summary' | 'character' | 'world'>>) => Promise<CanonEntity | null>;
  createCanonFact: (input: Omit<CanonFact, 'id' | 'createdAt' | 'updatedAt'> & { status?: CanonStatus }) => Promise<CanonFact | null>;
  updateCanonFact: (factId: string, patch: Partial<CanonFact>) => Promise<void>;

  loadPlot: () => Promise<void>;
  createPlotNode: (input: {
    title: string; summary?: string; kind?: PlotNodeKind; section?: string; position?: { x: number; y: number };
    details?: Partial<PlotNode['details']>; documentId?: string; worldRefs?: PlotWorldRef[]; images?: StoryImage[];
  }) => Promise<PlotNode | null>;
  updatePlotNode: (nodeId: string, patch: Partial<Pick<PlotNode, 'title' | 'summary' | 'kind' | 'section' | 'position' | 'details' | 'documentId' | 'worldRefs' | 'images'>>) => Promise<PlotNode | null>;
  createPlotEdge: (input: { from: string; to: string; relation?: PlotEdgeRelation; label?: string }) => Promise<PlotEdge | null>;
  updatePlotEdge: (edgeId: string, patch: Partial<Pick<PlotEdge, 'relation' | 'label'>>) => Promise<PlotEdge | null>;

  loadScenes: () => Promise<void>;
  createSceneTheme: (input: { name: string; description?: string }) => Promise<SceneTheme | null>;
  updateSceneTheme: (themeId: string, patch: Partial<Pick<SceneTheme, 'name' | 'description' | 'question' | 'motif'>>) => Promise<SceneTheme | null>;
  createScene: (input: {
    title: string; summary?: string; section?: string; purpose?: string; status?: SceneStatus; order?: number;
    documentId?: string; assets?: Scene['assets']; beats?: Scene['beats']; dialogue?: Scene['dialogue'];
  }) => Promise<Scene | null>;
  updateScene: (sceneId: string, patch: Partial<Pick<Scene, 'title' | 'summary' | 'section' | 'purpose' | 'status' | 'order' | 'documentId' | 'assets' | 'beats' | 'dialogue'>>) => Promise<Scene | null>;

  loadReferences: () => Promise<void>;
  createReference: (input: Omit<StoryReference, 'id' | 'createdAt' | 'updatedAt'>) => Promise<StoryReference | null>;
  updateReference: (referenceId: string, patch: Partial<Omit<StoryReference, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<StoryReference | null>;
  deleteReference: (referenceId: string) => Promise<boolean>;
  loadGoals: () => Promise<void>;
  updateGoals: (patch: GoalPatch | ((current: GoalStore) => GoalPatch)) => Promise<GoalStore | null>;
  loadWorldMap: () => Promise<void>;
  updateWorldMap: (patch: Partial<Omit<WorldMap, 'version'>>) => Promise<WorldMap | null>;
  loadProgress: () => Promise<void>;

  refreshEvents: () => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (patch: Record<string, string>) => Promise<void>;
  testProvider: (providerId: string) => Promise<ProviderCheckResult>;
  installLocalModel: (modelId: string, onProgress: (progress: LocalModelProgress) => void) => Promise<LocalModelInstallResult>;
  setNotice: (n: string | null) => void;
}

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const docSaveQueues = new Map<string, Promise<void>>();
let projectOpenRequest = 0;
let paneSeq = 0;
let projectSession = 0;
export const getProjectSession = () => projectSession;
type GoalPatch = Partial<Pick<GoalStore, 'sessionTarget' | 'milestones'>>;
const goalUpdateQueues = new Map<number, Promise<void>>();

const titleFor = (type: PaneType, s: State, bindingId?: string): string => {
  if (type === 'agent') return s.agents.find((a) => a.id === bindingId)?.name ?? 'Agent';
  if (type === 'events') return 'Activity';
  if (type === 'review') return 'Review';
  if (type === 'canon') return 'Canon';
  if (type === 'characters') return 'Cast';
  if (type === 'world') return 'World Atlas';
  if (type === 'plot') return 'Plot Through-line';
  if (type === 'scenes') return 'Scene Board';
  if (type === 'dialogue') return 'Dialogue Table';
  if (type === 'themes') return 'Theme Threads';
  if (type === 'references') return 'Reference Board';
  if (type === 'goals') return 'Writing Goals';
  if (type === 'progress') return 'Manuscript Progress';
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
  floatingPanels: [],
  floatingEditorContents: {},
  rightWidth: 400,
  bottomHeight: 210,
  selection: null,
  runs: {},
  busy: {},
  events: [],
  canon: null,
  plot: null,
  sceneBoard: null,
  references: null,
  goals: null,
  worldMap: null,
  progress: null,
  worldFocusEntityId: null,
  plotFocusNodeId: null,
  sceneFocusId: null,
  settings: null,
  providers: [],

  setNotice: (notice) => set({ notice }),

  async bootstrap() {
    try {
      const [{ projects }, cfg] = await Promise.all([api.listProjects(), api.settings()]);
      set({ projects, settings: cfg.settings, providers: cfg.providers });
      let last: string | null = null;
      try { last = localStorage.getItem('muse:lastProject'); } catch { /* Loading a project must work without browser storage. */ }
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
    const request = ++projectOpenRequest;
    try {
      if (get().project && draftJournal.hasProjectIssues(get().project!.id)) {
        set({ error: 'Browser recovery is unavailable for some edits. Save or copy your unfinished writing before switching projects.' });
        return;
      }
      const { project, agents, workspaces } = await api.openProject(id);
      if (request !== projectOpenRequest) return;
      if (get().project && draftJournal.hasProjectIssues(get().project!.id)) {
        set({ error: 'Browser recovery failed while opening the next project. Your current writing remains open; save it before switching.' });
        return;
      }
      Object.values(saveTimers).forEach(clearTimeout);
      Object.keys(saveTimers).forEach((key) => delete saveTimers[key]);
      projectSession += 1;
      try { localStorage.setItem('muse:lastProject', id); } catch { /* Recovery reports unavailable browser storage when writing. */ }
      set({ project, agents, workspaces, docs: {}, panes: [], floatingPanels: [], floatingEditorContents: {}, runs: {}, events: [], canon: null, plot: null, sceneBoard: null, references: null, goals: null, progress: null, worldMap: null, worldFocusEntityId: null, plotFocusNodeId: null, sceneFocusId: null, selection: null, error: null });
      const drafting = workspaces.find((w) => w.id === 'drafting') ?? workspaces[0];
      if (drafting) await get().applyWorkspace(drafting.id);
      else {
        const first = project.documents[0];
        if (first) get().openPane('editor', { bindingId: first.id });
      }
      await get().refreshEvents();
    } catch (err: any) {
      if (request === projectOpenRequest) set({ error: err.message });
    }
  },

  async uploadStoryImage(file) {
    const session = projectSession;
    const project = get().project;
    if (!project) throw new Error('Open a project before uploading images');
    const { image } = await api.uploadImage(project.id, file);
    if (get().project !== project || projectSession !== session) throw new Error('Project changed before image upload completed');
    return image;
  },

  async loadDoc(docId) {
    const { project, docs } = get();
    if (!project || docs[docId]) return;
    const session = projectSession;
    const { meta, content } = await api.readDoc(project.id, docId);
    // Opening a saved desk can mount and request the same document together.
    // A later read must not overwrite the first loaded/edited draft or cross stories.
    if (get().project !== project || projectSession !== session || get().docs[docId]) return;
    const scope = documentDraftScope(project.id, docId);
    const entry = draftJournal.read<string>(scope);
    const recovery = entry && typeof entry.value === 'string' && typeof entry.base === 'string' && entry.value !== content ? entry : undefined;
    if (entry?.value === content) draftJournal.clear(scope, entry.revision);
    set({ docs: { ...get().docs, [docId]: { content, baseContent: content, dirty: false, title: meta.title, recovery } } });
  },

  /** Autosave. The draft is sovereign: we never block typing on the network. */
  editDoc(docId, content) {
    const project = get().project;
    const cur = get().docs[docId];
    if (!project || !cur || cur.recovery) return;
    const session = projectSession;
    const scope = documentDraftScope(project.id, docId);
    const entry = draftJournal.write(scope, cur.baseContent ?? cur.content, content);
    set({ docs: { ...get().docs, [docId]: { ...cur, content, dirty: true, journalRevision: entry.revision } } });
    const key = draftKey(scope);
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(() => {
      delete saveTimers[key];
      if (get().project === project && projectSession === session) void get().flushDoc(docId);
    }, 900);
  },

  async flushDoc(docId) {
    const { project, docs } = get();
    const doc = docs[docId];
    if (!project || !doc || !doc.dirty || doc.recovery || doc.applyingPatch) return;
    const session = projectSession;
    const scope = documentDraftScope(project.id, docId);
    const key = draftKey(scope);
    clearTimeout(saveTimers[key]);
    delete saveTimers[key];
    const save = async () => {
      // A queued save may outlive the desk that requested it. Its journal remains recoverable.
      if (get().project !== project || projectSession !== session) return;
      try {
        const { savedAt } = await api.writeDoc(project.id, docId, doc.content);
        if (get().project !== project || projectSession !== session) {
          if (doc.journalRevision) draftJournal.clear(scope, doc.journalRevision);
          return;
        }
        const latest = get().docs[docId];
        if (!latest) return;
        const unchanged = latest.journalRevision === doc.journalRevision && latest.content === doc.content;
        if (unchanged && doc.journalRevision) draftJournal.clear(scope, doc.journalRevision);
        else if (latest.journalRevision) draftJournal.rebase(scope, latest.journalRevision, doc.content);
        set({ docs: { ...get().docs, [docId]: { ...latest, baseContent: doc.content, dirty: !unchanged, savedAt } } });
      } catch (err: any) {
        if (get().project === project && projectSession === session) set({ error: `Could not save: ${err.message}` });
      }
    };
    const previous = docSaveQueues.get(key);
    const queued = previous ? previous.then(save) : save();
    docSaveQueues.set(key, queued);
    await queued;
    if (docSaveQueues.get(key) === queued) docSaveQueues.delete(key);
  },

  resolveDocRecovery(docId, choice) {
    const { project, docs } = get();
    const doc = docs[docId];
    if (!project || !doc?.recovery) return;
    const recovery = doc.recovery;
    if (choice === 'discard') {
      draftJournal.clear(documentDraftScope(project.id, docId), recovery.revision);
      set({ docs: { ...docs, [docId]: { ...doc, recovery: undefined } } });
      return;
    }
    set({ docs: { ...docs, [docId]: { ...doc, recovery: undefined } } });
    get().editDoc(docId, recovery.value);
  },

  openPane(type, opts = {}) {
    const s = get();
    const bindingId = opts.bindingId;
    const existing = s.panes.find((p) => p.type === type && p.binding?.id === bindingId);
    if (existing) {
      set({ panes: s.panes.map((p) => (p.id === existing.id ? { ...p, sizeMode: opts.focus ? 'maximized' : 'normal' } : opts.focus && p.sizeMode === 'maximized' ? { ...p, sizeMode: 'normal' } : p)) });
      return;
    }
    const region: Region = opts.region ?? (type === 'agent' || type === 'canon' ? 'right' : type === 'editor' || type === 'characters' || type === 'world' || type === 'plot' || type === 'scenes' || type === 'dialogue' || type === 'themes' || type === 'references' || type === 'goals' || type === 'progress' ? 'main' : 'bottom');
    const pane: Pane = {
      id: `pane-${++paneSeq}-${type}-${bindingId ?? ''}`,
      type,
      title: opts.title ?? titleFor(type, s, bindingId),
      region,
      binding: bindingId ? { type: type === 'agent' ? 'agent' : 'document', id: bindingId } : undefined,
      sizeMode: opts.focus ? 'maximized' : 'normal',
    };
    set({
      panes: [
        ...s.panes.map((item) => (opts.focus && item.sizeMode === 'maximized' ? { ...item, sizeMode: 'normal' as const } : item)),
        pane,
      ],
    });
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

  resizePane(paneId, width, height) {
    set({
      panes: get().panes.map((p) =>
        p.id === paneId ? p.floating
          ? { ...p, floating: { ...p.floating, width: Math.max(320, width), height: Math.max(200, height) } }
          : { ...p, size: { width: Math.max(320, width), height: Math.max(200, height) } } : p,
      ),
    });
  },

  floatPane(paneId, bounds) {
    const layer = Math.max(0, ...get().panes.map((pane) => pane.floating?.layer ?? 0));
    set({ panes: get().panes.map((pane) => pane.id === paneId
      ? { ...pane, sizeMode: 'normal', floating: { ...bounds, layer: pane.floating?.layer ?? layer + 1 } }
      : pane) });
  },

  returnPaneToLayout(paneId) {
    set({ panes: get().panes.map((pane) => pane.id === paneId ? { ...pane, floating: undefined, sizeMode: 'normal' } : pane) });
  },

  raisePane(paneId) {
    const panes = get().panes;
    const pane = panes.find((item) => item.id === paneId);
    const layer = Math.max(0, ...panes.map((item) => item.floating?.layer ?? 0));
    if (!pane?.floating || pane.floating.layer === layer) return;
    set({ panes: panes.map((item) => item.id === paneId ? { ...item, floating: { ...pane.floating!, layer: layer + 1 } } : item) });
  },

  tileDocuments() {
    set({ panes: get().panes.map((pane) => pane.binding?.type === 'document'
      ? { ...pane, sizeMode: 'normal', floating: undefined }
      : pane.sizeMode === 'maximized' ? { ...pane, sizeMode: 'normal' } : pane) });
  },

  restoreDeskPanes(layout) {
    const s = get();
    const valid = layout.filter((pane) => !pane.binding || (pane.binding.type === 'document'
      ? s.project?.documents.some((doc) => doc.id === pane.binding!.id)
      : s.agents.some((agent) => agent.id === pane.binding!.id)));
    const panes = reconcileDeskPanes(s.panes, valid, () => `pane-${++paneSeq}-desk`);
    set({ panes });
    for (const pane of panes) if (pane.binding?.type === 'document') void get().loadDoc(pane.binding.id);
  },

  openFloatingPanel(cfg) {
    const s = get();
    const existing = s.floatingPanels.find((p) => p.id === cfg.id);
    if (existing) {
      set({
        floatingPanels: [
          ...s.floatingPanels.filter((p) => p.id !== cfg.id),
          { ...existing, docked: false },
        ],
      });
      return;
    }
    const width = cfg.width ?? 560;
    const height = cfg.height ?? 640;
    const openIndex = s.floatingPanels.length;
    const cascade = (openIndex % 6) * 28;
    const usedSlots = new Set(s.floatingPanels.map((p) => p.slot).filter((n): n is number => n !== null));
    let slot: number | null = null;
    for (let n = 1; n <= 9; n++) {
      if (!usedSlots.has(n)) { slot = n; break; }
    }
    const panel: FloatingPanel = {
      id: cfg.id,
      paneType: cfg.paneType,
      title: cfg.title,
      x: 160 + cascade,
      y: 90 + cascade,
      width,
      height,
      docked: false,
      slot,
    };
    set({ floatingPanels: [...s.floatingPanels, panel] });
  },

  closeFloatingPanel(id) {
    const contents = { ...get().floatingEditorContents };
    delete contents[id];
    set({ floatingPanels: get().floatingPanels.filter((p) => p.id !== id), floatingEditorContents: contents });
  },

  dockFloatingPanel(id) {
    set({ floatingPanels: get().floatingPanels.map((p) => (p.id === id ? { ...p, docked: true } : p)) });
  },

  undockFloatingPanel(id) {
    const s = get();
    const panel = s.floatingPanels.find((p) => p.id === id);
    if (!panel) return;
    set({
      floatingPanels: [
        ...s.floatingPanels.filter((p) => p.id !== id),
        { ...panel, docked: false },
      ],
    });
  },

  moveFloatingPanel(id, x, y) {
    set({ floatingPanels: get().floatingPanels.map((p) => (p.id === id ? { ...p, x, y } : p)) });
  },

  focusFloatingPanel(id) {
    const s = get();
    if (s.floatingPanels.at(-1)?.id === id) return;
    const panel = s.floatingPanels.find((p) => p.id === id);
    if (!panel) return;
    set({
      floatingPanels: [
        ...s.floatingPanels.filter((p) => p.id !== id),
        panel,
      ],
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
    const session = projectSession;
    const current = () => get().project === s.project && projectSession === session;
    const applied = override !== undefined ? { ...patch, afterText: override } : patch;
    try {
      if (!get().docs[patch.documentId]) await get().loadDoc(patch.documentId);
      if (!current()) return;
      await get().flushDoc(patch.documentId);
      if (!current()) return;
      const before = get().docs[patch.documentId];
      if (!before || before.dirty || before.recovery || before.applyingPatch) {
        set({ error: 'Save your writing and resolve recovered drafts before applying a patch.' });
        return;
      }
      set({ docs: { ...get().docs, [patch.documentId]: { ...before, applyingPatch: true } } });
      const { content } = await api.applyPatch(s.project.id, patch.documentId, applied);
      if (!current()) return;
      const cur = get().docs[patch.documentId];
      if (!cur) return;
      const scope = documentDraftScope(s.project.id, patch.documentId);
      clearTimeout(saveTimers[draftKey(scope)]);
      delete saveTimers[draftKey(scope)];
      const changed = cur.content !== before.content || cur.journalRevision !== before.journalRevision;
      const recovery = changed ? draftJournal.write(scope, before.content, cur.content) : undefined;
      if (!changed && cur.journalRevision) draftJournal.clear(scope, cur.journalRevision);
      set({
        docs: { ...get().docs, [patch.documentId]: { ...cur, content, baseContent: content, dirty: false, applyingPatch: false, recovery, journalRevision: undefined } },
        runs: markPatch(get().runs, patch.id, 'accepted'),
        notice: changed ? 'Patch applied. Review the keystrokes made during acceptance in draft recovery.' : 'Patch applied.',
      });
    } catch (err: any) {
      if (!current()) return;
      const cur = get().docs[patch.documentId];
      if (cur) set({ docs: { ...get().docs, [patch.documentId]: { ...cur, applyingPatch: false } } });
      set({ runs: markPatch(get().runs, patch.id, 'stale'), error: err.message });
      if (cur?.dirty) void get().flushDoc(patch.documentId);
    }
    if (current()) await get().refreshEvents();
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

  async loadCanon() {
    const session = projectSession;
    const s = get();
    if (!s.project) return;
    try {
      const { canon } = await api.canon(s.project.id);
      if (get().project !== s.project || projectSession !== session) return;
      set({ canon });
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return;
      set({ error: `Could not load canon: ${err.message}` });
    }
  },

  async createCanonEntity(input) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { entity } = await api.createCanonEntity(s.project.id, input);
      if (get().project !== s.project || projectSession !== session) return null;
      const canon = get().canon ?? { version: 1, entities: [], facts: [] };
      set({ canon: { ...canon, entities: [...canon.entities, entity] }, notice: `${entity.name} added to canon.` });
      await get().refreshEvents();
      return entity;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async updateCanonEntity(entityId, patch) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { entity } = await api.updateCanonEntity(s.project.id, entityId, patch);
      if (get().project !== s.project || projectSession !== session) return null;
      const canon = get().canon;
      if (canon) set({ canon: { ...canon, entities: canon.entities.map((item) => (item.id === entityId ? entity : item)) }, notice: `${entity.name} updated.` });
      await get().refreshEvents();
      return entity;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async createCanonFact(input) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { fact } = await api.createCanonFact(s.project.id, input);
      if (get().project !== s.project || projectSession !== session) return null;
      const canon = get().canon ?? { version: 1, entities: [], facts: [] };
      set({ canon: { ...canon, facts: [...canon.facts, fact] }, notice: 'Fact captured as proposed.' });
      await get().refreshEvents();
      return fact;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async updateCanonFact(factId, patch) {
    const session = projectSession;
    const s = get();
    if (!s.project) return;
    try {
      const { fact } = await api.updateCanonFact(s.project.id, factId, patch);
      if (get().project !== s.project || projectSession !== session) return;
      const canon = get().canon;
      if (canon) set({ canon: { ...canon, facts: canon.facts.map((item) => (item.id === factId ? fact : item)) }, notice: `Fact marked ${fact.status}.` });
      await get().refreshEvents();
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return;
      set({ error: err.message });
    }
  },

  async loadPlot() {
    const session = projectSession;
    const s = get();
    if (!s.project) return;
    try {
      const { plot } = await api.plot(s.project.id);
      if (get().project !== s.project || projectSession !== session) return;
      set({ plot });
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return;
      set({ error: `Could not load plot: ${err.message}` });
    }
  },

  async createPlotNode(input) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { node } = await api.createPlotNode(s.project.id, input);
      if (get().project !== s.project || projectSession !== session) return null;
      const plot = get().plot ?? { version: 1, nodes: [], edges: [] };
      set({ plot: { ...plot, nodes: [...plot.nodes, node] }, plotFocusNodeId: node.id, notice: `${node.title} added to through-line.` });
      await get().refreshEvents();
      return node;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async updatePlotNode(nodeId, patch) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { node } = await api.updatePlotNode(s.project.id, nodeId, patch);
      if (get().project !== s.project || projectSession !== session) return null;
      const plot = get().plot;
      if (plot) set({ plot: { ...plot, nodes: plot.nodes.map((item) => (item.id === nodeId ? node : item)) }, notice: `${node.title} updated.` });
      await get().refreshEvents();
      return node;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async createPlotEdge(input) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { edge } = await api.createPlotEdge(s.project.id, input);
      if (get().project !== s.project || projectSession !== session) return null;
      const plot = get().plot ?? { version: 1, nodes: [], edges: [] };
      set({ plot: { ...plot, edges: [...plot.edges, edge] }, notice: `${edge.relation} connection added.` });
      await get().refreshEvents();
      return edge;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async updatePlotEdge(edgeId, patch) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { edge } = await api.updatePlotEdge(s.project.id, edgeId, patch);
      if (get().project !== s.project || projectSession !== session) return null;
      const plot = get().plot;
      if (plot) set({ plot: { ...plot, edges: plot.edges.map((item) => (item.id === edgeId ? edge : item)) }, notice: 'Story thread updated.' });
      await get().refreshEvents();
      return edge;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async loadScenes() {
    const session = projectSession;
    const s = get();
    if (!s.project) return;
    try {
      const { board } = await api.scenes(s.project.id);
      if (get().project !== s.project || projectSession !== session) return;
      set({ sceneBoard: board });
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return;
      set({ error: `Could not load scenes: ${err.message}` });
    }
  },

  async createSceneTheme(input) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { theme } = await api.createSceneTheme(s.project.id, input);
      if (get().project !== s.project || projectSession !== session) return null;
      const board = get().sceneBoard ?? { version: 1, themes: [], scenes: [] };
      set({ sceneBoard: { ...board, themes: [...board.themes, theme] }, notice: `${theme.name} added to scene themes.` });
      await get().refreshEvents();
      return theme;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async updateSceneTheme(themeId, patch) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { theme } = await api.updateSceneTheme(s.project.id, themeId, patch);
      if (get().project !== s.project || projectSession !== session) return null;
      const board = get().sceneBoard;
      if (board) set({ sceneBoard: { ...board, themes: board.themes.map((item) => (item.id === themeId ? theme : item)) }, notice: `${theme.name} updated.` });
      await get().refreshEvents();
      return theme;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async createScene(input) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { scene } = await api.createScene(s.project.id, input);
      if (get().project !== s.project || projectSession !== session) return null;
      const board = get().sceneBoard ?? { version: 1, themes: [], scenes: [] };
      set({ sceneBoard: { ...board, scenes: [...board.scenes, scene].sort((a, b) => a.order - b.order) }, sceneFocusId: scene.id, notice: `${scene.title} added to board.` });
      await get().refreshEvents();
      return scene;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async updateScene(sceneId, patch) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { scene } = await api.updateScene(s.project.id, sceneId, patch);
      if (get().project !== s.project || projectSession !== session) return null;
      const board = get().sceneBoard;
      if (board) set({ sceneBoard: { ...board, scenes: board.scenes.map((item) => (item.id === sceneId ? scene : item)).sort((a, b) => a.order - b.order) }, notice: `${scene.title} updated.` });
      await get().refreshEvents();
      return scene;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async loadReferences() {
    const session = projectSession;
    const s = get();
    if (!s.project) return;
    try {
      const { references } = await api.references(s.project.id);
      if (get().project !== s.project || projectSession !== session) return;
      set({ references });
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return;
      set({ error: `Could not load references: ${err.message}` });
    }
  },

  async createReference(input) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { reference } = await api.createReference(s.project.id, input);
      if (get().project !== s.project || projectSession !== session) return null;
      const references = get().references ?? { version: 1, items: [] };
      set({ references: { ...references, items: [...references.items, reference] }, notice: `${reference.title} pinned to references.`, error: null });
      await get().refreshEvents();
      return reference;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async updateReference(referenceId, patch) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { reference } = await api.updateReference(s.project.id, referenceId, patch);
      if (get().project !== s.project || projectSession !== session) return null;
      const references = get().references;
      if (references) set({ references: { ...references, items: references.items.map((item) => (item.id === referenceId ? reference : item)) }, notice: `${reference.title} updated.`, error: null });
      await get().refreshEvents();
      return reference;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async deleteReference(referenceId) {
    const session = projectSession;
    const s = get();
    if (!s.project) return false;
    try {
      const { reference } = await api.deleteReference(s.project.id, referenceId);
      if (get().project !== s.project || projectSession !== session) return false;
      const references = get().references;
      if (references) set({ references: { ...references, items: references.items.filter((item) => item.id !== referenceId) }, notice: `${reference.title} removed from references.`, error: null });
      await get().refreshEvents();
      return true;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return false;
      set({ error: err.message });
      return false;
    }
  },

  async loadGoals() {
    const session = projectSession;
    const s = get();
    if (!s.project) return;
    try {
      const { goals } = await api.goals(s.project.id);
      if (get().project !== s.project || projectSession !== session) return;
      set({ goals });
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return;
      set({ error: `Could not load goals: ${err.message}` });
    }
  },

  async updateGoals(patch) {
    const session = projectSession;
    const project = get().project;
    if (!project) return null;
    const prior = goalUpdateQueues.get(session) ?? Promise.resolve();
    let result: GoalStore | null = null;
    const operation = prior.catch(() => undefined).then(async () => {
      if (get().project !== project || projectSession !== session) return;
      try {
        const current = get().goals;
        if (!current) return;
        const evaluated = typeof patch === 'function' ? patch(current) : patch;
        const { goals } = await api.updateGoals(project.id, evaluated);
        if (get().project !== project || projectSession !== session) return;
        set({ goals, notice: 'Writing goals updated.' });
        result = goals;
        await get().refreshEvents();
      } catch (err: any) {
        if (get().project === project && projectSession === session) set({ error: err.message });
      }
    });
    goalUpdateQueues.set(session, operation);
    await operation;
    if (goalUpdateQueues.get(session) === operation) goalUpdateQueues.delete(session);
    return result;
  },

  async loadWorldMap() {
    const session = projectSession;
    const s = get();
    if (!s.project) return;
    try {
      const { worldMap } = await api.worldMap(s.project.id);
      if (get().project !== s.project || projectSession !== session) return;
      set({ worldMap });
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return;
      set({ error: `Could not load world map: ${err.message}` });
    }
  },

  async updateWorldMap(patch) {
    const session = projectSession;
    const s = get();
    if (!s.project) return null;
    try {
      const { worldMap } = await api.updateWorldMap(s.project.id, patch);
      if (get().project !== s.project || projectSession !== session) return null;
      set({ worldMap });
      await get().refreshEvents();
      return worldMap;
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return null;
      set({ error: err.message });
      return null;
    }
  },

  async loadProgress() {
    const session = projectSession;
    const s = get();
    if (!s.project) return;
    try {
      const { progress } = await api.progress(s.project.id);
      if (get().project !== s.project || projectSession !== session) return;
      set({ progress });
    } catch (err: any) {
      if (get().project !== s.project || projectSession !== session) return;
      set({ error: `Could not load progress: ${err.message}` });
    }
  },

  async refreshEvents() {
    const session = projectSession;
    const s = get();
    if (!s.project) return;
    try {
      const { events } = await api.events(s.project.id, 120);
      if (get().project !== s.project || projectSession !== session) return;
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

  async testProvider(providerId) {
    try {
      const { result } = await api.testProvider(providerId);
      if (result.ok) set({ notice: `${result.provider} connected in ${result.ms} ms.`, error: null });
      else set({ error: result.error });
      return result;
    } catch (err: any) {
      const error = String(err?.message ?? err);
      set({ error });
      return { ok: false, provider: providerId, error };
    }
  },

  async installLocalModel(modelId, onProgress) {
    try {
      const result = await api.installLocalModel(modelId, onProgress);
      await get().loadSettings();
      set({ notice: `${result.model} is ready. Default agents now use local Ollama.`, error: null });
      return result;
    } catch (err: any) {
      const error = String(err?.message ?? err);
      set({ error });
      throw new Error(error);
    }
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
