import express from 'express';
import {
  listProjects, createProject, readManifest, readDocument, writeDocument, createDocument,
  readAgents, setAgentState, readWorkspaces, saveWorkspace, projectDir, snapshot,
} from './projects.js';
import { readEvents, emit } from './events.js';
import { runAgent } from './agents.js';
import { applyPatch } from './protocol.js';
import { readSettings, writeSettings, redact } from './settings.js';
import { providerStatus } from './providers/index.js';

const app = express();
app.use(express.json({ limit: '8mb' }));

const wrap = (fn: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
};

app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* ---------------------------------------------------------------- settings */

app.get('/api/settings', wrap(async (_req, res) => {
  res.json({ settings: redact(await readSettings()), providers: await providerStatus() });
}));

app.put('/api/settings', wrap(async (req, res) => {
  const body = req.body ?? {};
  const patch: Record<string, unknown> = {};
  for (const k of ['workspaceRoot', 'anthropicModel', 'ollamaBaseUrl', 'ollamaModel', 'defaultProvider']) {
    if (typeof body[k] === 'string') patch[k] = body[k];
  }
  // An empty string clears the key; undefined leaves it untouched.
  if (typeof body.anthropicApiKey === 'string') patch.anthropicApiKey = body.anthropicApiKey || undefined;
  await writeSettings(patch);
  res.json({ settings: redact(await readSettings()), providers: await providerStatus() });
}));

/* ---------------------------------------------------------------- projects */

app.get('/api/projects', wrap(async (_req, res) => res.json({ projects: await listProjects() })));

app.post('/api/projects', wrap(async (req, res) => {
  const name = String(req.body?.name ?? '').trim() || 'Untitled Story';
  res.json({ project: await createProject(name) });
}));

app.get('/api/projects/:id', wrap(async (req, res) => {
  const [project, agents, workspaces] = await Promise.all([
    readManifest(req.params.id),
    readAgents(req.params.id),
    readWorkspaces(req.params.id),
  ]);
  res.json({ project, agents, workspaces });
}));

/* --------------------------------------------------------------- documents */

app.get('/api/projects/:id/documents/:docId', wrap(async (req, res) => {
  const { meta, content } = await readDocument(req.params.id, req.params.docId);
  res.json({ meta, content });
}));

app.put('/api/projects/:id/documents/:docId', wrap(async (req, res) => {
  const content = String(req.body?.content ?? '');
  const meta = await writeDocument(req.params.id, req.params.docId, content);
  if (req.body?.log !== false) {
    await emit(await projectDir(req.params.id), 'document.saved', {
      documentId: meta.id,
      words: content.split(/\s+/).filter(Boolean).length,
    });
  }
  res.json({ meta, savedAt: new Date().toISOString() });
}));

app.post('/api/projects/:id/documents', wrap(async (req, res) => {
  const title = String(req.body?.title ?? 'Untitled').trim() || 'Untitled';
  const kind = (req.body?.kind ?? 'manuscript') as any;
  res.json({ meta: await createDocument(req.params.id, title, kind) });
}));

/* ------------------------------------------------------------------ agents */

app.get('/api/projects/:id/agents', wrap(async (req, res) => res.json({ agents: await readAgents(req.params.id) })));

app.put('/api/projects/:id/agents/:agentId/state', wrap(async (req, res) => {
  const mode = req.body?.mode;
  if (!['live', 'idle', 'frozen'].includes(mode)) throw new Error('mode must be live | idle | frozen');
  res.json({ agent: await setAgentState(req.params.id, req.params.agentId, mode) });
}));

app.post('/api/projects/:id/ask', wrap(async (req, res) => {
  const { agentId, documentId, selection, question, attachments } = req.body ?? {};
  if (!agentId) throw new Error('agentId is required');
  const run = await runAgent(req.params.id, {
    agentId,
    documentId,
    selection: selection && selection.text ? selection : null,
    question: String(question ?? '').trim() || 'Read this passage and tell me what you see.',
    attachments,
  });
  res.json({ run });
}));

/* ----------------------------------------------------------------- patches */

app.post('/api/projects/:id/patches/apply', wrap(async (req, res) => {
  const { documentId, patch } = req.body ?? {};
  if (!documentId || !patch) throw new Error('documentId and patch are required');
  const { content } = await readDocument(req.params.id, documentId);
  const result = applyPatch(content, patch);
  const dir = await projectDir(req.params.id);
  if (!result.ok) {
    await emit(dir, 'patch.rejected', { patchId: patch.id, reason: result.reason });
    res.status(409).json({ error: result.message, reason: result.reason });
    return;
  }
  await snapshot(req.params.id, documentId, content, `before patch ${patch.id}`);
  await writeDocument(req.params.id, documentId, result.text);
  await emit(dir, 'patch.accepted', { patchId: patch.id, documentId, reason: patch.reason });
  res.json({ content: result.text });
}));

app.post('/api/projects/:id/patches/reject', wrap(async (req, res) => {
  await emit(await projectDir(req.params.id), 'patch.rejected', { patchId: req.body?.patchId });
  res.json({ ok: true });
}));

/* ------------------------------------------------------- events, workspaces */

app.get('/api/projects/:id/events', wrap(async (req, res) => {
  const limit = Math.min(1000, Number(req.query.limit ?? 200) || 200);
  res.json({ events: await readEvents(await projectDir(req.params.id), limit) });
}));

app.post('/api/projects/:id/events', wrap(async (req, res) => {
  const { type, payload, actor } = req.body ?? {};
  if (!type) throw new Error('type is required');
  res.json({ event: await emit(await projectDir(req.params.id), String(type), payload, actor) });
}));

app.get('/api/projects/:id/workspaces', wrap(async (req, res) => res.json({ workspaces: await readWorkspaces(req.params.id) })));

app.post('/api/projects/:id/workspaces', wrap(async (req, res) => res.json({ workspace: await saveWorkspace(req.params.id, req.body ?? {}) })));

const PORT = Number(process.env.MUSE_PORT ?? 5178);
app.listen(PORT, () => {
  console.log(`[muse] project runtime listening on http://localhost:${PORT}`);
});
