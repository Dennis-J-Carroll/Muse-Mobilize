import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { safeJoin, slugify, ensureDir, exists } from './paths.js';
import { readSettings } from './settings.js';
import { emit } from './events.js';
import { SEED_CHAPTER, SEED_NOTES, SEED_OUTLINE, SEED_AGENTS, SEED_WORKSPACES } from './seed.js';
import type { AgentDef, DocumentMeta, ProjectManifest } from './types.js';

/**
 * Local-first project store (§25). The manuscript lives on disk as plain
 * Markdown the writer can open in any editor — nothing here is buried in an
 * opaque database, which is non-negotiable §34.13.
 */

export async function workspaceRoot(): Promise<string> {
  const s = await readSettings();
  await ensureDir(s.workspaceRoot);
  return s.workspaceRoot;
}

export async function projectDir(projectId: string): Promise<string> {
  const root = await workspaceRoot();
  const dir = safeJoin(root, `${projectId}.muse`);
  if (!(await exists(dir))) throw new Error(`No such project: ${projectId}`);
  return dir;
}

export async function listProjects(): Promise<ProjectManifest[]> {
  const root = await workspaceRoot();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const out: ProjectManifest[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.endsWith('.muse')) continue;
    try {
      const raw = await fs.readFile(path.join(root, e.name, 'project.json'), 'utf8');
      out.push(JSON.parse(raw));
    } catch {
      // Not a Muse project (or half-written) — skip rather than fail the list.
    }
  }
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function createProject(name: string): Promise<ProjectManifest> {
  const root = await workspaceRoot();
  let id = slugify(name);
  let dir = safeJoin(root, `${id}.muse`);
  let n = 2;
  while (await exists(dir)) {
    id = `${slugify(name)}-${n++}`;
    dir = safeJoin(root, `${id}.muse`);
  }

  const now = new Date().toISOString();
  const documents: DocumentMeta[] = [
    { id: 'chapter-01', title: 'Chapter One', kind: 'manuscript', path: 'manuscript/chapter-01.md', order: 1 },
    { id: 'outline', title: 'Outline', kind: 'outline', path: 'outline/outline.md', order: 2 },
    { id: 'notes', title: 'Scratchpad', kind: 'notes', path: 'notes/scratchpad.md', order: 3 },
  ];
  const manifest: ProjectManifest = { id, name, createdAt: now, updatedAt: now, documents };

  for (const sub of ['manuscript', 'outline', 'notes', 'canon/characters', 'assets', '.muse/snapshots', 'agents', 'workspaces']) {
    await ensureDir(safeJoin(dir, sub));
  }
  await fs.writeFile(safeJoin(dir, 'manuscript/chapter-01.md'), SEED_CHAPTER, 'utf8');
  await fs.writeFile(safeJoin(dir, 'outline/outline.md'), SEED_OUTLINE, 'utf8');
  await fs.writeFile(safeJoin(dir, 'notes/scratchpad.md'), SEED_NOTES, 'utf8');
  await fs.writeFile(safeJoin(dir, 'project.json'), JSON.stringify(manifest, null, 2), 'utf8');
  for (const a of SEED_AGENTS) {
    await fs.writeFile(safeJoin(dir, `agents/${a.file}`), a.yaml, 'utf8');
  }
  for (const w of SEED_WORKSPACES) {
    await fs.writeFile(safeJoin(dir, `workspaces/${(w as any).id}.json`), JSON.stringify(w, null, 2), 'utf8');
  }
  await emit(dir, 'project.created', { id, name });
  return manifest;
}

export async function readManifest(projectId: string): Promise<ProjectManifest> {
  const dir = await projectDir(projectId);
  return JSON.parse(await fs.readFile(safeJoin(dir, 'project.json'), 'utf8'));
}

async function writeManifest(projectId: string, m: ProjectManifest): Promise<void> {
  const dir = await projectDir(projectId);
  m.updatedAt = new Date().toISOString();
  await fs.writeFile(safeJoin(dir, 'project.json'), JSON.stringify(m, null, 2), 'utf8');
}

export async function readDocument(projectId: string, documentId: string): Promise<{ meta: DocumentMeta; content: string }> {
  const m = await readManifest(projectId);
  const meta = m.documents.find((d) => d.id === documentId);
  if (!meta) throw new Error(`No such document: ${documentId}`);
  const dir = await projectDir(projectId);
  const content = await fs.readFile(safeJoin(dir, meta.path), 'utf8');
  return { meta, content };
}

export async function writeDocument(projectId: string, documentId: string, content: string): Promise<DocumentMeta> {
  const m = await readManifest(projectId);
  const meta = m.documents.find((d) => d.id === documentId);
  if (!meta) throw new Error(`No such document: ${documentId}`);
  const dir = await projectDir(projectId);
  await fs.writeFile(safeJoin(dir, meta.path), content, 'utf8');
  await writeManifest(projectId, m);
  return meta;
}

export async function createDocument(
  projectId: string,
  title: string,
  kind: DocumentMeta['kind'],
): Promise<DocumentMeta> {
  const m = await readManifest(projectId);
  const dir = await projectDir(projectId);
  const folder = kind === 'manuscript' ? 'manuscript' : kind === 'outline' ? 'outline' : kind === 'canon' ? 'canon' : 'notes';
  let id = slugify(title);
  while (m.documents.some((d) => d.id === id)) id = `${id}-1`;
  const meta: DocumentMeta = {
    id,
    title,
    kind,
    path: `${folder}/${id}.md`,
    order: m.documents.length + 1,
  };
  await ensureDir(safeJoin(dir, folder));
  await fs.writeFile(safeJoin(dir, meta.path), `# ${title}\n\n`, 'utf8');
  m.documents.push(meta);
  await writeManifest(projectId, m);
  await emit(dir, 'document.created', { id, title, kind });
  return meta;
}

export async function readAgents(projectId: string): Promise<AgentDef[]> {
  const dir = await projectDir(projectId);
  const agentsDir = safeJoin(dir, 'agents');
  if (!(await exists(agentsDir))) return [];
  const files = (await fs.readdir(agentsDir)).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  const out: AgentDef[] = [];
  for (const f of files) {
    try {
      const def = yaml.load(await fs.readFile(safeJoin(agentsDir, f), 'utf8')) as AgentDef;
      if (def && def.id) out.push(def);
    } catch {
      // A malformed agent file should not take the whole roster down.
    }
  }
  return out;
}

export async function readAgent(projectId: string, agentId: string): Promise<AgentDef> {
  const agents = await readAgents(projectId);
  const found = agents.find((a) => a.id === agentId);
  if (!found) throw new Error(`No such agent: ${agentId}`);
  return found;
}

/** Open ≠ Active ≠ Watching (§7): state changes are persisted, not just UI. */
export async function setAgentState(projectId: string, agentId: string, mode: AgentDef['state']['mode']): Promise<AgentDef> {
  const dir = await projectDir(projectId);
  const agentsDir = safeJoin(dir, 'agents');
  const files = await fs.readdir(agentsDir);
  for (const f of files) {
    const p = safeJoin(agentsDir, f);
    const def = yaml.load(await fs.readFile(p, 'utf8')) as AgentDef;
    if (def?.id === agentId) {
      def.state = { ...def.state, mode };
      await fs.writeFile(p, yaml.dump(def, { lineWidth: 100 }), 'utf8');
      await emit(dir, mode === 'live' ? 'agent.activated' : mode === 'frozen' ? 'agent.frozen' : 'agent.idled', { agentId });
      return def;
    }
  }
  throw new Error(`No such agent: ${agentId}`);
}

export async function readWorkspaces(projectId: string): Promise<any[]> {
  const dir = await projectDir(projectId);
  const wsDir = safeJoin(dir, 'workspaces');
  if (!(await exists(wsDir))) return [];
  const files = (await fs.readdir(wsDir)).filter((f) => f.endsWith('.json'));
  const out: any[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await fs.readFile(safeJoin(wsDir, f), 'utf8')));
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function saveWorkspace(projectId: string, ws: any): Promise<any> {
  const dir = await projectDir(projectId);
  const id = slugify(ws.id || ws.name || 'workspace');
  ws.id = id;
  await ensureDir(safeJoin(dir, 'workspaces'));
  await fs.writeFile(safeJoin(dir, `workspaces/${id}.json`), JSON.stringify(ws, null, 2), 'utf8');
  await emit(dir, 'workspace.layout.saved', { id, name: ws.name });
  return ws;
}

/** Snapshot a document before an agent-authored change lands (§26). */
export async function snapshot(projectId: string, documentId: string, content: string, label: string): Promise<void> {
  const dir = await projectDir(projectId);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = safeJoin(dir, `.muse/snapshots/${documentId}-${stamp}.md`);
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, content, 'utf8');
  await emit(dir, 'snapshot.created', { documentId, label, file: path.basename(file) });
}
