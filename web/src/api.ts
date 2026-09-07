import type {
  AgentDef, AgentRun, CanonEntity, CanonEntityType, CanonFact, CanonStatus, CanonStore, CharacterProfile,
  DocumentMeta, MuseEvent, Patch, ProjectManifest,
  GoalStore, ProgressProjection, ReferenceStore, StoryReference,
  LocalModelInstallResult, LocalModelProgress, PlotEdge, PlotEdgeRelation, PlotGraph, PlotNode, PlotNodeKind, PlotWorldRef,
  ProviderCheckResult, ProviderStatus, Scene, SceneBoard, SceneStatus, SceneTheme, Selection, SettingsView, StoryImage, WorkspaceDef, WorldMap, WorldProfile,
} from './types';
import type { ConnectionStore, ConnectionTarget, StoryAttachment, StoryTag } from '../../shared/connections';

function imagePayload(file: File): Promise<{ name: string; mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      if (comma === -1) return reject(new Error(`Could not read ${file.name}.`));
      resolve({ name: file.name, mimeType: file.type, data: result.slice(comma + 1) });
    };
    reader.readAsDataURL(file);
  });
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Runtime returned non-JSON (${res.status}). Is the server running?`);
  }
  if (!res.ok) throw Object.assign(new Error(json.error ?? `Request failed (${res.status})`), json);
  return json as T;
}

export const api = {
  connections: (id: string) => req<{ connections: ConnectionStore }>(`/api/projects/${id}/connections`),
  createTag: (id: string, label: string) => req<{ tag: StoryTag }>(`/api/projects/${id}/connections/tags`, { method: 'POST', body: JSON.stringify({ label }) }),
  renameTag: (id: string, tagId: string, label: string) => req<{ tag: StoryTag }>(`/api/projects/${id}/connections/tags/${tagId}`, { method: 'PUT', body: JSON.stringify({ label }) }),
  attachConnection: (id: string, body: { target: ConnectionTarget; tagId?: string; entity?: ConnectionTarget; range?: { start: number; end: number; quote: string } }) =>
    req<{ attachment: StoryAttachment }>(`/api/projects/${id}/connections/attachments`, { method: 'POST', body: JSON.stringify(body) }),
  removeConnection: (id: string, attachmentId: string) => req<{ ok: true }>(`/api/projects/${id}/connections/attachments/${attachmentId}`, { method: 'DELETE' }),
  restoreBackup: (backup: string) => req<{ project: ProjectManifest }>('/api/projects/restore', { method: 'POST', body: backup }),
  listProjects: () => req<{ projects: ProjectManifest[] }>('/api/projects'),
  createProject: (name: string) =>
    req<{ project: ProjectManifest }>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  openProject: (id: string) =>
    req<{ project: ProjectManifest; agents: AgentDef[]; workspaces: WorkspaceDef[] }>(`/api/projects/${id}`),
  uploadImage: async (id: string, file: File) =>
    req<{ image: StoryImage }>(`/api/projects/${id}/assets/images`, {
      method: 'POST',
      body: JSON.stringify(await imagePayload(file)),
    }),

  readDoc: (id: string, docId: string) =>
    req<{ meta: DocumentMeta; content: string }>(`/api/projects/${id}/documents/${docId}`),
  writeDoc: (id: string, docId: string, content: string, log = true) =>
    req<{ meta: DocumentMeta; savedAt: string }>(`/api/projects/${id}/documents/${docId}`, {
      method: 'PUT',
      body: JSON.stringify({ content, log }),
    }),
  createDoc: (id: string, title: string, kind: DocumentMeta['kind']) =>
    req<{ meta: DocumentMeta }>(`/api/projects/${id}/documents`, {
      method: 'POST',
      body: JSON.stringify({ title, kind }),
    }),

  canon: (id: string) => req<{ canon: CanonStore }>(`/api/projects/${id}/canon`),
  createCanonEntity: (id: string, body: { type: CanonEntityType; name: string; aliases?: string[]; summary?: string; character?: CharacterProfile; world?: WorldProfile }) =>
    req<{ entity: CanonEntity }>(`/api/projects/${id}/canon/entities`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCanonEntity: (id: string, entityId: string, patch: Partial<Pick<CanonEntity, 'name' | 'aliases' | 'summary' | 'character' | 'world'>>) =>
    req<{ entity: CanonEntity }>(`/api/projects/${id}/canon/entities/${entityId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  createCanonFact: (id: string, body: Omit<CanonFact, 'id' | 'createdAt' | 'updatedAt'> & { status?: CanonStatus }) =>
    req<{ fact: CanonFact }>(`/api/projects/${id}/canon/facts`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCanonFact: (id: string, factId: string, patch: Partial<CanonFact>) =>
    req<{ fact: CanonFact }>(`/api/projects/${id}/canon/facts/${factId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  plot: (id: string) => req<{ plot: PlotGraph }>(`/api/projects/${id}/plot`),
  createPlotNode: (id: string, body: {
    title: string; summary?: string; kind?: PlotNodeKind; section?: string; position?: { x: number; y: number };
    details?: Partial<PlotNode['details']>; documentId?: string; worldRefs?: PlotWorldRef[]; images?: StoryImage[];
  }) => req<{ node: PlotNode }>(`/api/projects/${id}/plot/nodes`, { method: 'POST', body: JSON.stringify(body) }),
  updatePlotNode: (id: string, nodeId: string, patch: Partial<Pick<PlotNode, 'title' | 'summary' | 'kind' | 'section' | 'position' | 'details' | 'documentId' | 'worldRefs' | 'images'>>) =>
    req<{ node: PlotNode }>(`/api/projects/${id}/plot/nodes/${nodeId}`, { method: 'PUT', body: JSON.stringify(patch) }),
  createPlotEdge: (id: string, body: { from: string; to: string; relation?: PlotEdgeRelation; label?: string }) =>
    req<{ edge: PlotEdge }>(`/api/projects/${id}/plot/edges`, { method: 'POST', body: JSON.stringify(body) }),
  updatePlotEdge: (id: string, edgeId: string, patch: Partial<Pick<PlotEdge, 'relation' | 'label'>>) =>
    req<{ edge: PlotEdge }>(`/api/projects/${id}/plot/edges/${edgeId}`, { method: 'PUT', body: JSON.stringify(patch) }),

  scenes: (id: string) => req<{ board: SceneBoard }>(`/api/projects/${id}/scenes`),
  createSceneTheme: (id: string, body: { name: string; description?: string }) =>
    req<{ theme: SceneTheme }>(`/api/projects/${id}/scenes/themes`, { method: 'POST', body: JSON.stringify(body) }),
  updateSceneTheme: (id: string, themeId: string, patch: Partial<Pick<SceneTheme, 'name' | 'description' | 'question' | 'motif'>>) =>
    req<{ theme: SceneTheme }>(`/api/projects/${id}/scenes/themes/${themeId}`, { method: 'PUT', body: JSON.stringify(patch) }),
  createScene: (id: string, body: {
    title: string; summary?: string; section?: string; purpose?: string; status?: SceneStatus; order?: number;
    documentId?: string; assets?: Scene['assets']; beats?: Scene['beats']; dialogue?: Scene['dialogue'];
  }) => req<{ scene: Scene }>(`/api/projects/${id}/scenes`, { method: 'POST', body: JSON.stringify(body) }),
  updateScene: (id: string, sceneId: string, patch: Partial<Pick<Scene, 'title' | 'summary' | 'section' | 'purpose' | 'status' | 'order' | 'documentId' | 'assets' | 'beats' | 'dialogue'>>) =>
    req<{ scene: Scene }>(`/api/projects/${id}/scenes/${sceneId}`, { method: 'PUT', body: JSON.stringify(patch) }),

  references: (id: string) => req<{ references: ReferenceStore }>(`/api/projects/${id}/references`),
  createReference: (id: string, body: Omit<StoryReference, 'id' | 'createdAt' | 'updatedAt'>) =>
    req<{ reference: StoryReference }>(`/api/projects/${id}/references`, { method: 'POST', body: JSON.stringify(body) }),
  updateReference: (id: string, referenceId: string, patch: Partial<Omit<StoryReference, 'id' | 'createdAt' | 'updatedAt'>>) =>
    req<{ reference: StoryReference }>(`/api/projects/${id}/references/${referenceId}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteReference: (id: string, referenceId: string) =>
    req<{ reference: StoryReference }>(`/api/projects/${id}/references/${referenceId}`, { method: 'DELETE' }),

  goals: (id: string) => req<{ goals: GoalStore }>(`/api/projects/${id}/goals`),
  updateGoals: (id: string, patch: Partial<Pick<GoalStore, 'sessionTarget' | 'milestones'>>) =>
    req<{ goals: GoalStore }>(`/api/projects/${id}/goals`, { method: 'PUT', body: JSON.stringify(patch) }),
  worldMap: (id: string) => req<{ worldMap: WorldMap }>(`/api/projects/${id}/world-map`),
  updateWorldMap: (id: string, patch: Partial<Omit<WorldMap, 'version'>>) =>
    req<{ worldMap: WorldMap }>(`/api/projects/${id}/world-map`, { method: 'PUT', body: JSON.stringify(patch) }),
  progress: (id: string) => req<{ progress: ProgressProjection }>(`/api/projects/${id}/progress`),

  setAgentState: (id: string, agentId: string, mode: string) =>
    req<{ agent: AgentDef }>(`/api/projects/${id}/agents/${agentId}/state`, {
      method: 'PUT',
      body: JSON.stringify({ mode }),
    }),

  ask: (id: string, body: { agentId: string; documentId?: string; selection?: Selection | null; question: string }) =>
    req<{ run: AgentRun }>(`/api/projects/${id}/ask`, { method: 'POST', body: JSON.stringify(body) }),

  applyPatch: (id: string, documentId: string, patch: Patch) =>
    req<{ content: string }>(`/api/projects/${id}/patches/apply`, {
      method: 'POST',
      body: JSON.stringify({ documentId, patch }),
    }),
  rejectPatch: (id: string, patchId: string) =>
    req<{ ok: true }>(`/api/projects/${id}/patches/reject`, { method: 'POST', body: JSON.stringify({ patchId }) }),

  events: (id: string, limit = 120) => req<{ events: MuseEvent[] }>(`/api/projects/${id}/events?limit=${limit}`),
  emit: (id: string, type: string, payload?: Record<string, unknown>) =>
    req<{ event: MuseEvent }>(`/api/projects/${id}/events`, { method: 'POST', body: JSON.stringify({ type, payload }) }),

  workspaces: (id: string) => req<{ workspaces: WorkspaceDef[] }>(`/api/projects/${id}/workspaces`),
  saveWorkspace: (id: string, ws: WorkspaceDef) =>
    req<{ workspace: WorkspaceDef }>(`/api/projects/${id}/workspaces`, { method: 'POST', body: JSON.stringify(ws) }),

  settings: () => req<{ settings: SettingsView; providers: ProviderStatus[] }>('/api/settings'),
  saveSettings: (patch: Record<string, string>) =>
    req<{ settings: SettingsView; providers: ProviderStatus[] }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  testProvider: (providerId: string) =>
    req<{ result: ProviderCheckResult }>(`/api/providers/${encodeURIComponent(providerId)}/test`, { method: 'POST' }),
  async installLocalModel(modelId: string, onProgress: (progress: LocalModelProgress) => void) {
    const res = await fetch(`/api/local-models/${encodeURIComponent(modelId)}/install`, { method: 'POST' });
    if (!res.ok) throw new Error(`Local model install failed (${res.status})`);
    if (!res.body) throw new Error('Runtime returned no install progress stream.');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: LocalModelInstallResult | undefined;
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'progress') onProgress({ status: event.status, percent: event.percent });
        if (event.type === 'error') throw new Error(event.error);
        if (event.type === 'complete') result = { id: event.id, model: event.model };
      }
      if (done) break;
    }
    if (!result) throw new Error('Local model install ended before activation.');
    return result;
  },
};
