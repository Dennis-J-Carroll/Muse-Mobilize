import express from 'express';
import { historyStatus, recordEdit, restoreEdit, withProjectEdit } from './history.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
import {
  readSources, importSource, updateSourceMetadata, deleteSource, readSourceText, readSourceOriginal,
  searchSources, rebuildSourceIndexes,
} from './sources.js';
import { renderExport } from './export.js';
import { saveAgent, saveArrangement, readArrangements, loadArrangement, withAgentLock, parseManagedAgent } from './agent-config.js';
import { projectResources, resourceInfo } from './project-resources.js';
import { buildContext } from './context.js';
import { readBinder, saveBinder, previewBinder, verifyBinderSnapshot, packageBinder } from './binder.js';

const app = express();

function historySession(req: express.Request): string | null {
  const value = req.get('x-muse-history-session');
  return value && /^[a-zA-Z0-9-]{8,100}$/.test(value) ? value : null;
}

async function editScope(req: express.Request): Promise<{ label: string; paths: string[] } | null> {
  if (!req.params.id || !['POST', 'PUT', 'DELETE'].includes(req.method)) return null;
  const route = String(req.route?.path ?? '').replace('/api/projects/:id/', '');
  const stores: Record<string, string> = { canon: 'canon/canon.json', plot: 'plot/plot.json', scenes: 'scenes/scenes.json', references: 'references/references.json', goals: 'goals/goals.json', connections: 'connections/connections.json', 'world-map': 'world/map.json' };
  const kind = route.split('/')[0];
  const verb = req.method === 'DELETE' ? 'Remove' : req.method === 'POST' ? 'Add' : 'Edit';
  if (stores[kind]) return { label: `${verb} ${kind === 'canon' ? 'story card' : kind === 'world-map' ? 'atlas background' : kind}`, paths: [stores[kind], ...((kind === 'references' && req.method === 'DELETE') || kind === 'world-map' ? ['assets'] : [])] };
  if (route === 'documents/:docId' || route === 'patches/apply') {
    const doc = await readDocument(req.params.id, req.params.docId ?? req.body?.documentId);
    return { label: route === 'patches/apply' ? 'Accept suggested edit' : `Write ${doc.meta.title}`, paths: [doc.meta.path] };
  }
  if (route === 'documents') return { label: 'Create document', paths: ['project.json', 'manuscript', 'outline', 'notes', 'canon'] };
  if (route === 'sources' || route === 'sources/:sourceId') return { label: `${verb} Source`, paths: [req.method === 'PUT' ? 'sources/index.json' : 'sources'] };
  if (route === 'agents/save' || route === 'agents/:agentId/state') return { label: 'Save agent', paths: ['agents'] };
  if (route === 'agent-arrangements' || route === 'agent-arrangements/:arrangementId/load') return { label: route.endsWith('/load') ? 'Load agent arrangement' : 'Save agent arrangement', paths: ['agents', 'studio'] };
  if (route === 'binder' && req.method === 'PUT') return { label: 'Save binder recipe', paths: ['binder'] };
  if (route === 'workspaces') return { label: 'Save workspace', paths: ['workspaces'] };
  return null;
}

const wrap = (fn: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
  try {
    const scope = await editScope(req);
    if (!scope) { await fn(req, res, next); return; }
    const dir = await projectDir(req.params.id);
    const session = historySession(req);
    // Do not acknowledge the mutation until its undo entry is captured.
    const sendJson = res.json.bind(res); let payload: unknown;
    res.json = ((body: unknown) => { payload = body; return res; }) as typeof res.json;
    try {
      await withProjectEdit(dir, () => recordEdit(dir, session, scope.label, scope.paths, async () => { await fn(req, res, next); }));
      if (session) res.set('x-muse-history', encodeURIComponent(JSON.stringify(historyStatus(dir, session))));
    } finally { res.json = sendJson; }
    res.json(payload);
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

app.get('/api/projects/:id/history', wrap(async (req, res) => {
  const session = historySession(req);
  if (!session) throw new Error('A browser history session is required.');
  res.json({ history: historyStatus(await projectDir(req.params.id), session) });
}));
app.post('/api/projects/:id/history/:direction', wrap(async (req, res) => {
  const session = historySession(req); const direction = req.params.direction;
  if (!session || !['undo', 'redo'].includes(direction) || typeof req.body?.expectedId !== 'string') throw new Error('A current undo or redo action is required.');
  const dir = await projectDir(req.params.id);
  const result = await restoreEdit(dir, session, direction as 'undo' | 'redo', req.body.expectedId);
  await emit(dir, `project.${direction}`, { label: result.label, files: result.files });
  res.json(result);
}));

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

app.get('/api/projects/:id/resources', wrap(async (req, res) => res.json({ resources: (await projectResources(req.params.id)).map(resourceInfo) })));
app.post('/api/projects/:id/agents/save', wrap(async (req, res) => res.json({ agent: await saveAgent(req.params.id, req.body?.agent, req.body?.expectedRevision) })));
app.post('/api/projects/:id/agents/preview', wrap(async (req, res) => {
  const agent = parseManagedAgent(req.body?.agent);
  res.json({ context: await buildContext(req.params.id, agent, { question: String(req.body?.question ?? ''), documentId: req.body?.documentId }) });
}));
app.get('/api/projects/:id/agent-arrangements', wrap(async (req, res) => res.json({ arrangements: await readArrangements(req.params.id) })));
app.post('/api/projects/:id/agent-arrangements', wrap(async (req, res) => res.json({ arrangement: await saveArrangement(req.params.id, req.body?.name, req.body?.agentIds) })));
app.post('/api/projects/:id/agent-arrangements/:arrangementId/load', wrap(async (req, res) => res.json({ agents: await loadArrangement(req.params.id, req.params.arrangementId) })));

app.get('/api/projects/:id/binder', wrap(async (req, res) => res.json({ recipe: await readBinder(req.params.id) })));
app.put('/api/projects/:id/binder', wrap(async (req, res) => res.json({ recipe: await saveBinder(req.params.id, req.body?.recipe) })));
app.post('/api/projects/:id/binder/preview', wrap(async (req, res) => res.json({ preview: await previewBinder(req.params.id, req.body?.recipe) })));
app.post('/api/projects/:id/binder/verify', wrap(async (req, res) => { await verifyBinderSnapshot(req.params.id, req.body?.snapshotHash); res.json({ ok: true }); }));
app.post('/api/projects/:id/binder/package', wrap(async (req, res) => {
  if (typeof req.body?.snapshotHash !== 'string') throw new Error('Preview the project before packaging.');
  const zip = await packageBinder(req.params.id, req.body?.recipe, req.body.snapshotHash);
  res.set('content-type', 'application/zip');
  res.set('content-disposition', 'attachment; filename="muse-project.zip"');
  res.send(zip);
}));

app.put('/api/projects/:id/agents/:agentId/state', wrap(async (req, res) => {
  const mode = req.body?.mode;
  if (!['live', 'idle', 'frozen'].includes(mode)) throw new Error('mode must be live | idle | frozen');
  res.json({ agent: await withAgentLock(req.params.id, () => setAgentState(req.params.id, req.params.agentId, mode)) });
}));

app.post('/api/projects/:id/ask', wrap(async (req, res) => {
  const { agentId, documentId, selection, question, attachments, sharedExcerpt } = req.body ?? {};
  if (!agentId) throw new Error('agentId is required');
  const run = await runAgent(req.params.id, {
    agentId,
    documentId,
    selection: selection && selection.text ? selection : null,
    question: String(question ?? '').trim() || 'Read this passage and tell me what you see.',
    attachments,
    sharedExcerpt,
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

/* ------------------------------------------------- quick manuscript export */

app.post('/api/projects/:id/export', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const documentId = String(req.body?.documentId ?? '');
  const format = String(req.body?.format ?? 'markdown');
  let content: string;
  let meta: { id: string; title: string };
  if (req.body?.content !== undefined) {
    // Explicit visible-draft export: the browser sends the exact text it shows.
    // The document must exist, but nothing on disk is ever written or changed.
    meta = await readManifest(req.params.id).then((m) => {
      const found = m.documents.find((d) => d.id === documentId);
      if (!found) throw new Error(`No such document: ${documentId}`);
      return { id: found.id, title: found.title };
    });
    content = String(req.body.content);
  } else {
    const doc = await readDocument(req.params.id, documentId);
    meta = { id: doc.meta.id, title: doc.meta.title };
    content = doc.content;
  }
  const rendered = renderExport(meta.title, content, format);
  const hash = createHash('sha256').update(content, 'utf8').digest('hex');
  await emit(dir, 'document.exported', {
    documentId: meta.id,
    title: meta.title,
    format,
    rendererVersion: 1,
    sourceRevisionHash: hash,
    bytes: Buffer.byteLength(rendered.body, 'utf8'),
    visibleDraft: req.body?.content !== undefined,
  });
  res.set('content-type', rendered.mimeType);
  res.set('content-disposition', `attachment; filename="${encodeURIComponent(rendered.fileName)}"`);
  res.send(rendered.body);
}));

/* ------------------------------------------------------------------ sources */

app.get('/api/projects/:id/sources', wrap(async (req, res) => {
  res.json({ sources: await readSources(await projectDir(req.params.id)) });
}));

app.post('/api/projects/:id/sources', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const { source, duplicate } = await importSource(dir, {
    name: String(req.body?.name ?? ''),
    data: String(req.body?.data ?? ''),
    classification: req.body?.classification,
    authority: req.body?.authority,
  });
  await emit(dir, duplicate ? 'source.import.duplicate' : 'source.imported', {
    sourceId: source.id,
    title: source.title,
    sourceType: source.sourceType,
    sourceHash: source.sourceHash,
    extractionStatus: source.extractionStatus,
    chunks: source.chunkCount,
  });
  res.json({ source, duplicate });
}));

app.put('/api/projects/:id/sources/:sourceId', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const source = await updateSourceMetadata(dir, req.params.sourceId, {
    title: req.body?.title,
    classification: req.body?.classification,
    authority: req.body?.authority,
  });
  await emit(dir, 'source.metadata.updated', {
    sourceId: source.id,
    title: source.title,
    classification: source.classification,
    authority: source.authority,
  });
  res.json({ source });
}));

app.delete('/api/projects/:id/sources/:sourceId', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const source = await deleteSource(dir, req.params.sourceId);
  await emit(dir, 'source.deleted', { sourceId: source.id, title: source.title });
  res.json({ source });
}));

// Extracted text only: the pane's reading view never exposes original bytes.
app.get('/api/projects/:id/sources/:sourceId/text', wrap(async (req, res) => {
  res.set('content-type', 'text/plain; charset=utf-8');
  res.send(await readSourceText(await projectDir(req.params.id), req.params.sourceId));
}));

app.post('/api/projects/:id/sources/search', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const hits = await searchSources(dir, {
    query: String(req.body?.query ?? ''),
    sourceIds: Array.isArray(req.body?.sourceIds) ? req.body.sourceIds.map(String) : undefined,
    classifications: Array.isArray(req.body?.classifications) ? req.body.classifications : undefined,
    authorities: Array.isArray(req.body?.authorities) ? req.body.authorities : undefined,
    limit: Number(req.body?.limit) || undefined,
  });
  await emit(dir, 'source.searched', { query: String(req.body?.query ?? ''), results: hits.length });
  res.json({ hits });
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
