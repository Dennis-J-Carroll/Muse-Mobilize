import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
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
import { createPlotEdge, createPlotNode, readPlot, updatePlotEdge, updatePlotNode } from './plot.js';
import { localModelInstaller } from './providers/local-models.js';
import { createScene, createSceneTheme, readScenes, updateScene, updateSceneTheme } from './scenes.js';
import { imageAssetPath, managedImageFileName, saveImageAsset } from './assets.js';
import { createReference, deleteReference, readReferences, updateReference } from './references.js';
import { deleteOrphanedImages } from './imageGc.js';
import { readGoals, writeGoals } from './goals.js';
import { readProgress } from './progress.js';
import { readWorldMap, writeWorldMap } from './world-map.js';
import { readConnections, createTag, renameTag, attachConnection, removeConnection } from './connections.js';
import { exportProjectBackup, restoreProjectBackup, BackupError } from './backups.js';

const app = express();

const wrap = (fn: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err: any) {
    res.status(err instanceof BackupError ? err.status : 400).json({ error: String(err?.message ?? err) });
  }
};

// Only portable restore accepts larger JSON. Parse and validate inside the
// backup boundary before any destination project is created.
app.post('/api/projects/restore', express.raw({ type: 'application/json', limit: '80mb' }), wrap(async (req, res) => {
  res.json({ project: await restoreProjectBackup(req.body) });
}));
app.use(express.json({ limit: '8mb' }));

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

app.get('/api/projects/:id/backup', wrap(async (req, res) => {
  const backup = await exportProjectBackup(req.params.id);
  res.set('content-disposition', `attachment; filename="muse-backup-${encodeURIComponent(req.params.id)}.json"`);
  res.json(backup);
}));

app.get('/api/projects/:id/connections', wrap(async (req, res) => {
  res.json({ connections: await readConnections(await projectDir(req.params.id)) });
}));
app.post('/api/projects/:id/connections/tags', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const tag = await createTag(dir, req.body);
  await emit(dir, 'connection.tag.created', { tagId: tag.id });
  res.json({ tag });
}));
app.put('/api/projects/:id/connections/tags/:tagId', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const tag = await renameTag(dir, req.params.tagId, req.body);
  await emit(dir, 'connection.tag.renamed', { tagId: tag.id });
  res.json({ tag });
}));
app.post('/api/projects/:id/connections/attachments', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const attachment = await attachConnection(dir, req.body);
  await emit(dir, 'connection.attached', { attachmentId: attachment.id });
  res.json({ attachment });
}));
app.delete('/api/projects/:id/connections/attachments/:attachmentId', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  await removeConnection(dir, req.params.attachmentId);
  await emit(dir, 'connection.removed', { attachmentId: req.params.attachmentId });
  res.json({ ok: true });
}));

app.get('/api/projects', wrap(async (_req, res) => res.json({ projects: await listProjects() })));

app.post('/api/projects', wrap(async (req, res) => {
  const name = String(req.body?.name ?? '').trim() || 'Untitled Story';
  res.json({ project: await createProject(name) });
}));

app.post('/api/projects/:id/assets/images', wrap(async (req, res) => {
  const stored = await saveImageAsset(await projectDir(req.params.id), req.body ?? {});
  const image = {
    id: path.parse(stored.fileName).name,
    src: `/api/projects/${encodeURIComponent(req.params.id)}/assets/images/${stored.fileName}`,
    caption: '',
    tags: [],
  };
  await emit(await projectDir(req.params.id), 'asset.image.uploaded', {
    imageId: image.id,
    originalName: stored.originalName,
    size: stored.size,
  });
  res.json({ image });
}));

app.get('/api/projects/:id/assets/images/:fileName', wrap(async (req, res) => {
  const file = imageAssetPath(await projectDir(req.params.id), req.params.fileName);
  const bytes = await fs.readFile(file);
  res.type(path.extname(file)).set('cache-control', 'private, max-age=31536000, immutable').send(bytes);
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

app.put('/api/projects/:id/plot/edges/:edgeId', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const edge = await updatePlotEdge(dir, req.params.edgeId, req.body ?? {});
  await emit(dir, 'plot.edge.updated', { edgeId: edge.id, from: edge.from, to: edge.to, relation: edge.relation, label: edge.label });
  res.json({ edge });
}));

/* ------------------------------------------------------------------ scenes */

app.get('/api/projects/:id/scenes', wrap(async (req, res) => {
  res.json({ board: await readScenes(await projectDir(req.params.id)) });
}));

app.post('/api/projects/:id/scenes/themes', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const theme = await createSceneTheme(dir, req.body ?? {});
  await emit(dir, 'scene.theme.created', { themeId: theme.id, name: theme.name });
  res.json({ theme });
}));

app.put('/api/projects/:id/scenes/themes/:themeId', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const theme = await updateSceneTheme(dir, req.params.themeId, req.body ?? {});
  await emit(dir, 'scene.theme.updated', { themeId: theme.id, name: theme.name });
  res.json({ theme });
}));

app.post('/api/projects/:id/scenes', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const scene = await createScene(dir, req.body ?? {});
  await emit(dir, 'scene.created', { sceneId: scene.id, title: scene.title, section: scene.section });
  res.json({ scene });
}));

app.put('/api/projects/:id/scenes/:sceneId', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const scene = await updateScene(dir, req.params.sceneId, req.body ?? {});
  await emit(dir, 'scene.updated', {
    sceneId: scene.id,
    title: scene.title,
    status: scene.status,
    beats: scene.beats.length,
    dialogueLines: scene.dialogue.length,
  });
  res.json({ scene });
}));

/* -------------------------------------------------------------- references */

app.get('/api/projects/:id/references', wrap(async (req, res) => {
  res.json({ references: await readReferences(await projectDir(req.params.id)) });
}));

app.post('/api/projects/:id/references', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const reference = await createReference(dir, req.body ?? {});
  await emit(dir, 'reference.created', { referenceId: reference.id, kind: reference.kind, title: reference.title });
  res.json({ reference });
}));

app.put('/api/projects/:id/references/:referenceId', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const reference = await updateReference(dir, req.params.referenceId, req.body ?? {});
  await emit(dir, 'reference.updated', { referenceId: reference.id, kind: reference.kind, title: reference.title });
  res.json({ reference });
}));

app.delete('/api/projects/:id/references/:referenceId', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const removed = await deleteReference(dir, req.params.referenceId);
  const candidateFileNames = removed.images.flatMap((image) => {
    const fileName = managedImageFileName(image.src);
    return fileName ? [fileName] : [];
  });
  await deleteOrphanedImages(dir, candidateFileNames);
  await emit(dir, 'reference.deleted', { referenceId: removed.id, kind: removed.kind, title: removed.title });
  res.json({ reference: removed });
}));

/* ------------------------------------------------------------------- goals */

app.get('/api/projects/:id/goals', wrap(async (req, res) => {
  res.json({ goals: await readGoals(await projectDir(req.params.id)) });
}));

app.put('/api/projects/:id/goals', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const goals = await writeGoals(dir, req.body ?? {});
  await emit(dir, 'goals.updated', {
    wordTarget: goals.sessionTarget.wordTarget,
    minutesTarget: goals.sessionTarget.minutesTarget,
    milestones: goals.milestones.length,
  });
  res.json({ goals });
}));

/* --------------------------------------------------------------- world-map */

app.get('/api/projects/:id/world-map', wrap(async (req, res) => {
  res.json({ worldMap: await readWorldMap(await projectDir(req.params.id)) });
}));

app.put('/api/projects/:id/world-map', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const previous = await readWorldMap(dir);
  const worldMap = await writeWorldMap(dir, req.body ?? {});
  if (previous.image && previous.image.src !== worldMap.image?.src) {
    const fileName = managedImageFileName(previous.image.src);
    if (fileName) await deleteOrphanedImages(dir, [fileName]);
  }
  await emit(dir, 'world-map.updated', { hasImage: Boolean(worldMap.image), visible: worldMap.visible });
  res.json({ worldMap });
}));

/* ---------------------------------------------------------------- progress */

app.get('/api/projects/:id/progress', wrap(async (req, res) => {
  res.json({ progress: await readProgress(await projectDir(req.params.id)) });
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
  await emit(dir, 'document.saved', {
    documentId,
    words: result.text.split(/\s+/).filter(Boolean).length,
    patchId: patch.id,
  });
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
