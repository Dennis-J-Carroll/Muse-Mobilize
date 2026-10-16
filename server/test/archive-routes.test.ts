import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { ArchiveJobs } from '../src/archive-jobs.js';
import { registerArchiveRoutes } from '../src/archive-routes.js';

test('HTTP ZIP transfer bypasses JSON limit, validates before restore, and returns capability-only status', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-archive-http-'));
  const workspace = path.join(root, 'workspace');
  const source = path.join(workspace, 'sample.muse');
  await fs.mkdir(path.join(source, 'assets'), { recursive: true });
  await fs.writeFile(path.join(source, 'project.json'), JSON.stringify({ id: 'sample', name: 'Sample', createdAt: '2026-01-01', updatedAt: '2026-01-01', documents: [] }));
  await fs.writeFile(path.join(source, 'assets/body.bin'), Buffer.alloc(9 * 1024 ** 2, 42));
  const jobs = new ArchiveJobs(path.join(root, 'jobs'));
  const app = express();
  registerArchiveRoutes(app, jobs, { projectDir: async () => source, workspaceRoot: async () => workspace });
  app.use(express.json({ limit: '8mb' }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await jobs.close(); await new Promise<void>(resolve => server.close(() => resolve())); await fs.rm(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = (url: string, body?: unknown) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const wait = async (id: string) => {
    for (let i = 0; i < 500; i++) {
      const response = await fetch(`${base}/api/archive-jobs/${id}`);
      const job = await response.json();
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(job.workspace, undefined); assert.equal(job.manifest, undefined);
      if (['ready', 'restored', 'failed'].includes(job.state)) return job;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('HTTP job timeout');
  };
  const created = await (await post('/api/projects/sample/backup-jobs')).json();
  const ready = await wait(created.id); assert.equal(ready.state, 'ready');
  const download = await fetch(base + ready.downloadUrl);
  assert.match(download.headers.get('content-disposition')!, /sample\.muse-backup\.zip/);
  const bytes = await download.arrayBuffer(); assert.ok(bytes.byteLength > 8 * 1024 ** 2);
  const upload = await (await post('/api/backup-imports', { filename: 'sample.zip', size: bytes.byteLength })).json();
  assert.equal((await post(`/api/archive-jobs/${upload.id}/restore`, { snapshotHash: 'unvalidated' })).status, 409);
  const sent = await fetch(`${base}/api/archive-jobs/${upload.id}/upload`, { method: 'PUT', headers: { 'Content-Type': 'application/zip' }, body: bytes });
  assert.equal(sent.status, 202);
  const validated = await wait(upload.id); assert.equal(validated.state, 'ready');
  await post(`/api/archive-jobs/${upload.id}/restore`, { snapshotHash: validated.preview.snapshotHash });
  const restored = await wait(upload.id); assert.equal(restored.state, 'restored');
  const retry = await (await post(`/api/archive-jobs/${upload.id}/restore`, { snapshotHash: validated.preview.snapshotHash })).json();
  assert.equal(retry.project.id, restored.project.id);
  assert.equal((await fetch(`${base}/api/archive-jobs/not-a-job`)).status, 404);
  assert.ok((await (await fetch(`${base}/api/projects/sample/backup-status`)).json()).lastRestore);
});
