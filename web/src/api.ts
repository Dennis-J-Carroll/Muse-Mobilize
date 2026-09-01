import type {
  AgentDef, AgentRun, CanonEntity, CanonEntityType, CanonFact, CanonStatus, CanonStore, CharacterProfile,
  DocumentMeta, MuseEvent, Patch, ProjectManifest,
  ProviderStatus, Selection, SettingsView, WorkspaceDef,
} from './types';

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
  listProjects: () => req<{ projects: ProjectManifest[] }>('/api/projects'),
  createProject: (name: string) =>
    req<{ project: ProjectManifest }>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  openProject: (id: string) =>
    req<{ project: ProjectManifest; agents: AgentDef[]; workspaces: WorkspaceDef[] }>(`/api/projects/${id}`),

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
  createCanonEntity: (id: string, body: { type: CanonEntityType; name: string; aliases?: string[]; summary?: string; character?: CharacterProfile }) =>
    req<{ entity: CanonEntity }>(`/api/projects/${id}/canon/entities`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCanonEntity: (id: string, entityId: string, patch: Partial<Pick<CanonEntity, 'name' | 'aliases' | 'summary' | 'character'>>) =>
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
};
