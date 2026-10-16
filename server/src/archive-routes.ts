import express from 'express';
import { ArchiveJobs } from './archive-jobs.js';
import { BackupError } from './backups.js';

/** Register before express.json: archive uploads must remain raw request streams. */
export function registerArchiveRoutes(app: express.Express, jobs: ArchiveJobs, resolve: {
  projectDir: (id: string) => Promise<string>; workspaceRoot: () => Promise<string>;
}) {
  const json = express.json({ limit: '16kb' });
  const run = (handler: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try { await handler(req, res, next); }
    catch (error: any) {
      if (res.headersSent || res.destroyed) return;
      res.status(error instanceof BackupError ? error.status : 400).json({ error: error.message ?? String(error), code: error.code ?? 'ARCHIVE_ERROR' });
    }
  };
  app.post('/api/projects/:id/backup-jobs', run(async (req, res) => {
    res.status(202).json(await jobs.createExport(req.params.id, await resolve.projectDir(req.params.id)));
  }));
  app.post('/api/projects/:id/binder/package-jobs', express.json({ limit: '1mb' }), run(async (req, res) => {
    res.status(202).json(await jobs.createExport(req.params.id, await resolve.projectDir(req.params.id), { recipe: req.body?.recipe, snapshotHash: req.body?.snapshotHash }));
  }));
  app.post('/api/backup-imports', json, run(async (req, res) => {
    res.status(202).json(await jobs.createImport(req.body?.filename, req.body?.size));
  }));
  app.put('/api/archive-jobs/:jobId/upload', run(async (req, res) => {
    res.status(202).json(await jobs.upload(req.params.jobId, req));
  }));
  app.get('/api/archive-jobs/:jobId', run(async (req, res) => { res.json(await jobs.get(req.params.jobId)); }));
  app.get('/api/archive-jobs/:jobId/download', run(async (req, res) => {
    const artifact = await jobs.download(req.params.jobId);
    res.type('application/zip');
    res.download(artifact.path, artifact.name, error => { if (error && !res.headersSent) res.status(410).end(); });
  }));
  app.post('/api/archive-jobs/:jobId/restore', json, run(async (req, res) => {
    res.status(202).json(await jobs.restore(req.params.jobId, req.body?.snapshotHash, await resolve.workspaceRoot()));
  }));
  app.delete('/api/archive-jobs/:jobId', run(async (req, res) => { res.json(await jobs.cancel(req.params.jobId)); }));
  app.get('/api/projects/:id/backup-status', run(async (req, res) => { res.json(await jobs.status(req.params.id)); }));
}
