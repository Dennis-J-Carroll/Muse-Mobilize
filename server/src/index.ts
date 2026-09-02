import express from 'express';
import {
  listProjects, createProject, readManifest, readDocument, writeDocument, createDocument,
  readAgents, setAgentState, readWorkspaces, saveWorkspace, projectDir, snapshot,
} from './projects.js';
import { readEvents, emit } from './events.js';
import { runAgent } from './agents.js';
import { applyPatch } from './protocol.js';
import { readSettings, writeSettings, redact } from './settings.js';
import { providerStatus, testProvider } from './providers/index.js';
import { createCanonEntity, createCanonFact, readCanon, updateCanonEntity, updateCanonFact } from './canon.js';
import { createPlotEdge, createPlotNode, readPlot, updatePlotNode } from './plot.js';
import { localModelInstaller } from './providers/local-models.js';

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
  for (const k of [
    'workspaceRoot', 'anthropicModel', 'openaiModel', 'googleModel', 'xaiModel',
    'ollamaBaseUrl', 'ollamaModel', 'defaultProvider',
  ]) {
    if (typeof body[k] === 'string') patch[k] = body[k];
  }
  // An empty string clears the key; undefined leaves it untouched.
  for (const k of ['anthropicApiKey', 'openaiApiKey', 'googleApiKey', 'xaiApiKey']) {
    if (typeof body[k] === 'string') patch[k] = body[k] || undefined;
  }
  await writeSettings(patch);
  res.json({ settings: redact(await readSettings()), providers: await providerStatus() });
}));

app.post('/api/providers/:id/test', wrap(async (req, res) => {
  res.json({ result: await testProvider(req.params.id) });
}));

app.post('/api/local-models/:id/install', async (req, res) => {
  res.status(200);
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.flushHeaders();
  const send = (payload: Record<string, unknown>) => res.write(`${JSON.stringify(payload)}\n`);
  try {
    const result = await localModelInstaller.install(req.params.id, (progress) => send({ type: 'progress', ...progress }));
    send({ type: 'complete', ...result });
  } catch (err: any) {
    send({ type: 'error', error: String(err?.message ?? err) });
  } finally {
    res.end();
  }
});

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

/* ------------------------------------------------------------------- canon */

app.get('/api/projects/:id/canon', wrap(async (req, res) => {
  res.json({ canon: await readCanon(await projectDir(req.params.id)) });
}));

app.post('/api/projects/:id/canon/entities', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const entity = await createCanonEntity(dir, req.body ?? {});
  await emit(dir, 'canon.entity.created', { entityId: entity.id, type: entity.type, name: entity.name });
  res.json({ entity });
}));

app.put('/api/projects/:id/canon/entities/:entityId', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const entity = await updateCanonEntity(dir, req.params.entityId, req.body ?? {});
  await emit(dir, 'canon.entity.updated', { entityId: entity.id, type: entity.type, name: entity.name });
  res.json({ entity });
}));

app.post('/api/projects/:id/canon/facts', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const fact = await createCanonFact(dir, req.body ?? {});
  await emit(dir, 'canon.fact.created', { factId: fact.id, subject: fact.subject, status: fact.status });
  res.json({ fact });
}));

app.put('/api/projects/:id/canon/facts/:factId', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const fact = await updateCanonFact(dir, req.params.factId, req.body ?? {});
  await emit(dir, 'canon.fact.updated', { factId: fact.id, status: fact.status });
  res.json({ fact });
}));

/* -------------------------------------------------------------------- plot */

app.get('/api/projects/:id/plot', wrap(async (req, res) => {
  res.json({ plot: await readPlot(await projectDir(req.params.id)) });
}));

app.post('/api/projects/:id/plot/nodes', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const node = await createPlotNode(dir, req.body ?? {});
  await emit(dir, 'plot.node.created', { nodeId: node.id, title: node.title, kind: node.kind });
  res.json({ node });
}));

app.put('/api/projects/:id/plot/nodes/:nodeId', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const node = await updatePlotNode(dir, req.params.nodeId, req.body ?? {});
  await emit(dir, 'plot.node.updated', { nodeId: node.id, title: node.title, kind: node.kind });
  res.json({ node });
}));

app.post('/api/projects/:id/plot/edges', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const edge = await createPlotEdge(dir, req.body ?? {});
  await emit(dir, 'plot.edge.created', { edgeId: edge.id, from: edge.from, to: edge.to, relation: edge.relation });
  res.json({ edge });
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
