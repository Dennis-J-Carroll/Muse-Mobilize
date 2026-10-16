import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ARCHIVE_LIMITS as limits, checkLimit, type ArchiveManifest } from './backup-archive.js';
import { BackupError, backupPolicy, validateBackupProjectId } from './backups.js';
import { parseRecipe, type BinderRecipe } from '../../shared/project-tools.js';
import type { ArchiveTask } from './archive-worker.js';
import type { ProjectManifest } from './types.js';

export type ArchiveState = 'created' | 'uploading' | 'capturing' | 'building' | 'validating' | 'ready' | 'restoring' | 'restored' | 'failed' | 'cancelled';
export interface ArchiveJob {
  version: 1; id: string; kind: 'export' | 'import'; state: ArchiveState;
  createdAt: number; expiresAt: number; reserved: number; declaredSize?: number;
  sourceId?: string; package?: boolean; workspace?: string; targetId?: string; manifest?: ArchiveManifest;
  project?: ProjectManifest; artifactBytes?: number;
  error?: { code: string; message: string }; bytes: number; total: number;
}
interface Runtime { worker?: Worker; abort?: AbortController; done?: Promise<void>; timer?: NodeJS.Timeout; cancelReason?: string }
export interface JobManagerOptions {
  lifetimeMs?: number; uploadIdleMs?: number; maxTemporary?: number;
  availableBytes?: (directory: string) => Promise<number>;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const terminal = (state: ArchiveState) => ['restored', 'failed', 'cancelled'].includes(state);
const fail = (status: number, code: string, message: string): never => { throw new BackupError(status, code, message); };

/** Atomic, fsynced journals survive an acknowledged operation and process restart. */
async function atomicJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.partial`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(temporary, file);
  const directory = await fs.open(path.dirname(file), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

export class ArchiveJobs {
  private jobs = new Map<string, ArchiveJob>();
  private runtime = new Map<string, Runtime>();
  private active: string | null = null;
  private ready: Promise<void>;
  private sweep: NodeJS.Timeout;
  private writes = new Map<string, Promise<void>>();
  private closed = false;
  readonly lifetime: number;
  constructor(readonly root: string, private options: JobManagerOptions = {}) {
    this.lifetime = options.lifetimeMs ?? limits.lifetimeMs;
    this.ready = this.initialize();
    this.sweep = setInterval(() => { void this.expire().catch(() => {}); }, Math.min(this.lifetime, 30_000));
    this.sweep.unref();
  }
  private dir(id: string) { return path.join(this.root, id); }
  private work(id: string) { return path.join(this.dir(id), 'work'); }
  private persist(job: ArchiveJob) {
    // Snapshot now; progress updates must not mutate a queued journal write.
    const value = structuredClone(job);
    const previous = this.writes.get(job.id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => atomicJson(path.join(this.dir(job.id), 'job.json'), value));
    this.writes.set(job.id, next); return next;
  }
  private async initialize() {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    for (const entry of await fs.readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !uuid.test(entry.name)) continue;
      let job: ArchiveJob;
      try { job = JSON.parse(await fs.readFile(path.join(this.dir(entry.name), 'job.json'), 'utf8')); }
      catch { continue; } // Unknown directories are never cleanup targets.
      if (job.version !== 1 || job.id !== entry.name || !['export', 'import'].includes(job.kind)) continue;
      this.jobs.set(job.id, job);
      if (job.state === 'restoring' && await this.recoverInstalled(job)) {
        await this.clean(job); await this.persist(job); await this.recordStatus(job); continue;
      }
      if (job.state !== 'ready' && !terminal(job.state)) {
        job.state = 'cancelled'; job.error = { code: 'SERVER_RESTARTED', message: 'Server restarted before archive operation completed. Retry.' };
        await this.clean(job); await this.persist(job);
      }
    }
    await this.expireLoaded();
  }
  private async recoverInstalled(job: ArchiveJob): Promise<boolean> {
    if (!job.workspace || !job.targetId || !job.manifest) return false;
    validateBackupProjectId(job.targetId);
    const destination = path.join(job.workspace, `${job.targetId}.muse`);
    try {
      const stat = await fs.lstat(destination);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
      const receipt = JSON.parse(await fs.readFile(path.join(destination, '.muse/restore-receipt.json'), 'utf8'));
      if (receipt.jobId !== job.id || receipt.targetId !== job.targetId || receipt.snapshotHash !== job.manifest.snapshotHash) return false;
      const project = JSON.parse(await fs.readFile(path.join(destination, 'project.json'), 'utf8'));
      if (project.id !== job.targetId) return false;
      job.project = project; job.state = 'restored'; return true;
    } catch { return false; }
  }
  private async clean(job: ArchiveJob) {
    await fs.rm(this.work(job.id), { recursive: true, force: true });
    if (job.workspace) {
      const staging = path.join(job.workspace, `.muse-restore-${job.id}`);
      try {
        const receipt = JSON.parse(await fs.readFile(path.join(staging, '.muse/restore-receipt.json'), 'utf8'));
        if (receipt.jobId === job.id) await fs.rm(staging, { recursive: true, force: true });
      } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    }
    job.reserved = 0;
  }
  private async expireLoaded() {
    for (const job of this.jobs.values()) {
      if (job.expiresAt > Date.now() || this.active === job.id) continue;
      await this.clean(job);
      // Only a validated job directory, never a path supplied by a client.
      await fs.rm(this.dir(job.id), { recursive: true, force: true });
      this.jobs.delete(job.id); this.writes.delete(job.id);
    }
  }
  async expire() { await this.ready; await this.expireLoaded(); }
  private async available(directory: string) {
    if (this.options.availableBytes) return this.options.availableBytes(directory);
    const stat = await fs.statfs(directory);
    return stat.bavail * stat.bsize;
  }
  private async reserve(job: ArchiveJob, bytes: number, workspaceBytes = 0) {
    const total = [...this.jobs.values()].reduce((sum, item) => sum + (item.id === job.id ? 0 : item.reserved), 0) + bytes;
    checkLimit('Managed temporary storage', total, this.options.maxTemporary ?? limits.temporary);
    const needed = bytes - job.reserved;
    if (await this.available(this.root) < Math.max(needed, 0) + limits.reserve) fail(507, 'INSUFFICIENT_DISK', 'Not enough free disk space for a verified archive. Free space and retry.');
    if (workspaceBytes && job.workspace && await this.available(job.workspace) < workspaceBytes + limits.reserve) fail(507, 'INSUFFICIENT_DISK', 'Not enough workspace disk space to restore a separate copy.');
    job.reserved = bytes;
  }
  private async lock(id: string) {
    await this.ready;
    if (this.closed) fail(503, 'ARCHIVES_CLOSED', 'Archive service is shutting down.');
    if (this.active) {
      const finishing = this.jobs.get(this.active);
      if (finishing && (finishing.state === 'ready' || terminal(finishing.state))) await this.runtime.get(this.active)?.done;
    }
    if (this.active) fail(409, 'ARCHIVE_BUSY', 'Another archive operation is active. Wait or cancel it first.');
    if ([...this.jobs.values()].filter(job => !terminal(job.state)).length >= 4 && !this.jobs.has(id)) fail(409, 'ARCHIVE_SLOTS_FULL', 'Four archives are already retained. Discard one or wait for expiry.');
    this.active = id;
  }
  private find(id: string) {
    if (!uuid.test(id)) return fail(404, 'ARCHIVE_NOT_FOUND', 'Archive job not found.');
    const job = this.jobs.get(id);
    if (!job || job.expiresAt <= Date.now() && this.active !== id) return fail(404, 'ARCHIVE_EXPIRED', 'Archive expired or not found. Prepare it again.');
    return job;
  }
  view(job: ArchiveJob) {
    return {
      id: job.id, kind: job.kind, state: job.state, createdAt: job.createdAt, expiresAt: job.expiresAt,
      bytes: job.bytes, total: job.total, error: job.error,
      preview: job.manifest ? { sourceProjectId: job.manifest.sourceProjectId, name: job.project?.name,
        capturedAt: job.manifest.capturedAt, files: job.manifest.files.length,
        savedBytes: job.manifest.files.reduce((sum, f) => sum + f.size, 0), snapshotHash: job.manifest.snapshotHash } : undefined,
      project: job.state === 'restored' ? job.project : undefined,
      downloadUrl: job.state === 'ready' && job.kind === 'export' ? `/api/archive-jobs/${job.id}/download` : undefined,
    };
  }
  async get(id: string) {
    await this.ready; const job = this.find(id);
    if (job.state === 'ready' || terminal(job.state)) await this.runtime.get(id)?.done;
    return this.view(job);
  }
  private newJob(kind: ArchiveJob['kind'], id: string): ArchiveJob {
    return { version: 1, id, kind, state: 'created', createdAt: Date.now(), expiresAt: Date.now() + this.lifetime, reserved: 0, bytes: 0, total: 0 };
  }
  async createExport(sourceId: string, source: string, binder?: { recipe: unknown; snapshotHash: string }) {
    validateBackupProjectId(sourceId);
    const selection = binder ? { recipe: parseRecipe(binder.recipe), snapshotHash: binder.snapshotHash } : undefined;
    if (selection && !/^[a-f0-9]{64}$/.test(selection.snapshotHash)) fail(400, 'INVALID_SNAPSHOT', 'Preview binder before creating package.');
    const id = randomUUID(); await this.lock(id);
    const job = this.newJob('export', id); job.sourceId = sourceId; job.package = !!selection;
    try {
      const inventory = await backupPolicy.inventory(source, limits.saved);
      const bytes = [...inventory.files.values()].reduce((sum, stat) => sum + Number(stat.size), 0);
      await this.reserve(job, selection ? bytes * 3 + 256 * 1024 ** 2 : bytes * 2 + 64 * 1024 ** 2);
      await fs.mkdir(this.work(id), { recursive: true, mode: 0o700 });
      job.state = 'capturing'; this.jobs.set(id, job); await this.persist(job);
      this.launch(job, { operation: 'export', source, sourceId, binder: selection, jobId: id, work: this.work(id) });
      return this.view(job);
    } catch (error) { this.active = null; this.jobs.delete(id); await fs.rm(this.dir(id), { recursive: true, force: true }); throw error; }
  }
  async createImport(filename: unknown, size: unknown) {
    if (typeof filename !== 'string' || filename.length > 255 || !filename.toLowerCase().endsWith('.zip') || typeof size !== 'number' || size < 1) fail(400, 'INVALID_UPLOAD', 'Choose a .muse-backup.zip file. Legacy JSON uses the separate legacy restore option.');
    checkLimit('Uploaded archive', size as number, limits.upload);
    const id = randomUUID(); await this.lock(id);
    const job = this.newJob('import', id); job.declaredSize = size as number;
    try {
      await this.reserve(job, (size as number) + limits.saved);
      await fs.mkdir(this.work(id), { recursive: true, mode: 0o700 });
      this.jobs.set(id, job); await this.persist(job);
      this.runtime.set(id, {}); this.deadline(job);
      return this.view(job);
    } catch (error) { this.active = null; this.jobs.delete(id); await fs.rm(this.dir(id), { recursive: true, force: true }); throw error; }
  }
  private deadline(job: ArchiveJob) {
    const runtime = this.runtime.get(job.id)!;
    if (runtime.timer) clearTimeout(runtime.timer);
    runtime.timer = setTimeout(() => { void this.cancel(job.id, 'Archive operation timed out. Retry.').catch(() => {}); }, this.lifetime);
    runtime.timer.unref();
  }
  private async failed(job: ArchiveJob, error: any) {
    if (job.state === 'restoring' && await this.recoverInstalled(job)) {
      await this.clean(job); await this.persist(job); await this.recordStatus(job); return;
    }
    const runtime = this.runtime.get(job.id);
    job.state = runtime?.cancelReason ? 'cancelled' : 'failed';
    job.error = { code: runtime?.cancelReason ? 'ARCHIVE_CANCELLED' : error.code ?? 'ARCHIVE_FAILED', message: runtime?.cancelReason ?? error.message ?? String(error) };
    job.expiresAt = Date.now() + this.lifetime;
    await this.clean(job); await this.persist(job);
  }
  private release(id: string) {
    const runtime = this.runtime.get(id);
    if (runtime?.timer) clearTimeout(runtime.timer);
    this.runtime.delete(id);
    if (this.active === id) this.active = null;
  }
  async upload(id: string, input: Readable) {
    await this.ready;
    const job = this.find(id);
    if (job.kind !== 'import' || job.state !== 'created' || this.active !== id) fail(409, 'INVALID_JOB_STATE', 'Upload is no longer available for this job.');
    job.state = 'uploading'; await this.persist(job);
    const runtime = this.runtime.get(id)!;
    runtime.abort = new AbortController();
    let idle: NodeJS.Timeout | undefined;
    const resetIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => { runtime.cancelReason = 'Upload stopped sending bytes. Retry.'; runtime.abort!.abort(); }, this.options.uploadIdleMs ?? limits.uploadIdleMs);
    };
    resetIdle();
    runtime.done = (async () => {
      try {
        await pipeline(input, new Transform({ transform(chunk: Buffer, _encoding, cb) {
          job.bytes += chunk.length; resetIdle();
          if (job.bytes > job.declaredSize! || job.bytes > limits.upload) { cb(new BackupError(413, 'BACKUP_TOO_LARGE', 'Uploaded bytes exceed declared archive size.')); return; }
          cb(null, chunk);
        } }), createWriteStream(path.join(this.work(id), 'upload'), { flags: 'wx', mode: 0o600 }), { signal: runtime.abort!.signal });
        if (job.bytes !== job.declaredSize) throw new BackupError(400, 'TRUNCATED_UPLOAD', 'Upload ended before declared file size.');
        job.state = 'validating'; job.bytes = 0; await this.persist(job);
      } catch (error) { await this.failed(job, error); this.release(id); }
      finally { clearTimeout(idle); }
    })();
    await runtime.done;
    if ((job.state as ArchiveState) === 'validating') this.launch(job, { operation: 'validate', jobId: id, work: this.work(id) });
    return this.view(job);
  }
  private launch(job: ArchiveJob, task: ArchiveTask) {
    const runtime = this.runtime.get(job.id) ?? {};
    this.runtime.set(job.id, runtime);
    this.deadline(job);
    runtime.done = (async () => {
      try {
        const result = await new Promise<any>((resolve, reject) => {
          const worker = new Worker(new URL('./archive-worker.mjs', import.meta.url), { workerData: task, execArgv: [] });
          runtime.worker = worker;
          let result: unknown; let failure: any;
          worker.on('message', message => {
            if (message.type === 'progress') {
              if (job.state !== 'restoring') job.state = message.phase;
              job.bytes = message.bytes; job.total = message.total;
            } else if (message.type === 'result') result = message.result;
            else if (message.type === 'failure') failure = message.error;
          });
          worker.once('error', reject);
          worker.once('exit', code => failure ? reject(failure) : code || !result ? reject(new Error(`Archive worker exited before completion (${code}).`)) : resolve(result));
        });
        if (runtime.cancelReason && task.operation !== 'restore') throw new Error(runtime.cancelReason);
        if (result.manifest) job.manifest = result.manifest;
        job.project = result.project;
        job.state = task.operation === 'restore' ? 'restored' : 'ready';
        job.artifactBytes = result.artifactBytes;
        job.reserved = job.kind === 'export' ? result.artifactBytes : job.manifest!.files.reduce((sum, f) => sum + f.size, 0);
        job.expiresAt = Date.now() + this.lifetime;
        if (job.state === 'restored') await this.clean(job);
        await this.persist(job); await this.recordStatus(job);
      } catch (error) { await this.failed(job, error); }
      finally { this.release(job.id); }
    })();
    // The durable job remains inspectable if journal persistence itself fails.
    void runtime.done.catch(error => { job.state = 'failed'; job.error = { code: 'JOB_IO_ERROR', message: String(error) }; });
  }
  async restore(id: string, expectedHash: unknown, workspace: string) {
    await this.ready;
    const job = this.find(id);
    if (job.kind !== 'import' || !job.manifest || expectedHash !== job.manifest.snapshotHash) fail(409, 'SNAPSHOT_MISMATCH', 'Validated backup changed. Select it again.');
    if (job.state === 'restored' || job.state === 'restoring') return this.view(job);
    if (job.state !== 'ready') fail(409, 'INVALID_JOB_STATE', 'Backup is not ready to restore.');
    await this.lock(id);
    try {
      await fs.mkdir(workspace, { recursive: true });
      job.workspace = path.resolve(workspace);
      const size = job.manifest!.files.reduce((sum, f) => sum + f.size, 0);
      await this.reserve(job, size * 2 + 64 * 1024 ** 2, size + 64 * 1024 ** 2);
      job.targetId = `${job.manifest!.sourceProjectId}-restored-${randomUUID()}`;
      validateBackupProjectId(job.targetId);
      job.state = 'restoring'; job.expiresAt = Date.now() + this.lifetime; await this.persist(job);
      this.launch(job, { operation: 'restore', work: this.work(id), jobId: id, workspace: job.workspace, targetId: job.targetId, manifest: job.manifest });
      return this.view(job);
    } catch (error) { this.active = null; throw error; }
  }
  async cancel(id: string, reason = 'Archive operation cancelled.') {
    await this.ready;
    const job = this.find(id);
    if (job.state === 'restored') return this.view(job);
    const runtime = this.runtime.get(id);
    if (runtime) {
      runtime.cancelReason = reason; runtime.abort?.abort(); runtime.worker?.postMessage('cancel');
      // Wait until writers close before deleting any staged files.
      if (runtime.done) { await runtime.done; return this.view(job); }
    }
    job.state = 'cancelled'; job.expiresAt = Date.now() + this.lifetime; job.error = { code: 'ARCHIVE_CANCELLED', message: reason };
    await this.clean(job); await this.persist(job); this.release(id);
    return this.view(job);
  }
  async download(id: string) {
    await this.ready; const job = this.find(id);
    if (job.kind !== 'export' || job.state !== 'ready') fail(409, 'ARCHIVE_NOT_READY', 'Verified archive is not ready.');
    return { path: path.join(this.work(id), job.package ? 'project-package.zip' : 'backup.muse-backup.zip'), name: job.package ? `${job.sourceId}-project-package.zip` : `${job.sourceId}.muse-backup.zip` };
  }
  private async recordStatus(job: ArchiveJob) {
    if (!job.manifest || !['ready', 'restored'].includes(job.state)) return;
    const file = path.join(this.root, 'status', `${job.manifest.sourceProjectId}.json`);
    let previous = {};
    try { previous = JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
    await atomicJson(file, { ...previous, [job.state === 'restored' ? 'lastRestore' : job.kind === 'export' ? 'lastVerifiedArchive' : 'lastValidatedImport']:
      { at: new Date().toISOString(), snapshotHash: job.manifest.snapshotHash, savedBytes: job.manifest.files.reduce((sum, f) => sum + f.size, 0), projectId: job.state === 'restored' ? job.project?.id : undefined } });
  }
  async status(projectId: string) {
    await this.ready; validateBackupProjectId(projectId);
    try { return JSON.parse(await fs.readFile(path.join(this.root, 'status', `${projectId}.json`), 'utf8')); }
    catch (error: any) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  async close() {
    this.closed = true; clearInterval(this.sweep); await this.ready;
    if (this.active && this.jobs.has(this.active)) await this.cancel(this.active, 'Server is shutting down. Retry.');
    await Promise.allSettled(this.writes.values());
  }
}
