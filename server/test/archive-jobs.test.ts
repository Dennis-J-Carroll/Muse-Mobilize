import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { ArchiveJobs, type JobManagerOptions } from '../src/archive-jobs.js';
import { installSavedProject } from '../src/backup-archive.js';

async function fixture(t: TestContext, options: JobManagerOptions = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-job-test-'));
  const source = path.join(root, 'workspace', 'sample.muse');
  const workspace = path.dirname(source);
  await fs.mkdir(path.join(source, 'manuscript'), { recursive: true });
  await fs.writeFile(path.join(source, 'project.json'), JSON.stringify({ id: 'sample', name: 'Sample', createdAt: '2026-01-01', updatedAt: '2026-01-01', documents: [
    { id: 'chapter', title: 'Chapter', kind: 'manuscript', path: 'manuscript/chapter.md', order: 1 },
  ] }));
  await fs.writeFile(path.join(source, 'manuscript/chapter.md'), 'The lighthouse survived.');
  const jobsRoot = path.join(root, 'jobs');
  const jobs = new ArchiveJobs(jobsRoot, options);
  t.after(async () => { await jobs.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, source, workspace, jobsRoot, jobs };
}
async function settled(jobs: ArchiveJobs, id: string) {
  for (let i = 0; i < 500; i++) {
    const job = await jobs.get(id);
    if (['ready', 'restored', 'failed', 'cancelled'].includes(job.state)) return job;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Archive did not settle');
}
async function exported(f: Awaited<ReturnType<typeof fixture>>) {
  const created = await f.jobs.createExport('sample', f.source);
  const ready = await settled(f.jobs, created.id);
  assert.equal(ready.state, 'ready', JSON.stringify(ready.error));
  return { job: ready, artifact: await f.jobs.download(ready.id) };
}
async function imported(f: Awaited<ReturnType<typeof fixture>>) {
  const { artifact } = await exported(f);
  const job = await f.jobs.createImport('sample.muse-backup.zip', (await fs.stat(artifact.path)).size);
  await f.jobs.upload(job.id, createReadStream(artifact.path));
  const ready = await settled(f.jobs, job.id);
  assert.equal(ready.state, 'ready', JSON.stringify(ready.error)); return ready;
}

test('worker export, upload validation, restore and retries preserve source and identity', async t => {
  const f = await fixture(t);
  const ready = await imported(f);
  assert.equal(ready.preview?.files, 2);
  await assert.rejects(f.jobs.restore(ready.id, 'wrong', f.workspace), /changed/);
  const started = await f.jobs.restore(ready.id, ready.preview!.snapshotHash, f.workspace);
  assert.equal(started.state, 'restoring');
  const during = await f.jobs.restore(ready.id, ready.preview!.snapshotHash, f.workspace);
  assert.equal(during.id, started.id);
  const restored = await settled(f.jobs, started.id);
  assert.equal(restored.state, 'restored', JSON.stringify(restored.error));
  const retry = await f.jobs.restore(ready.id, ready.preview!.snapshotHash, f.workspace);
  assert.equal(retry.project?.id, restored.project?.id);
  assert.equal((await fs.readdir(f.workspace)).filter(n => n.endsWith('.muse')).length, 2);
  assert.equal(await fs.readFile(path.join(f.workspace, `${restored.project!.id}.muse/manuscript/chapter.md`), 'utf8'), 'The lighthouse survived.');
  assert.equal(JSON.parse(await fs.readFile(path.join(f.source, 'project.json'), 'utf8')).id, 'sample');
  assert.ok((await f.jobs.status('sample')).lastRestore);
  assert.deepEqual((await fs.readdir(path.join(f.jobsRoot, ready.id))).sort(), ['job.json']);
});

test('one heavy job at a time; cancellation frees capacity and never deletes unknown paths', async t => {
  const f = await fixture(t);
  const unknown = path.join(f.jobsRoot, 'unregistered');
  await fs.mkdir(unknown, { recursive: true }); await fs.writeFile(path.join(unknown, 'keep'), 'keep');
  const first = await f.jobs.createImport('test.zip', 10);
  await assert.rejects(f.jobs.createExport('sample', f.source), /Another archive/);
  await f.jobs.cancel(first.id);
  assert.equal((await f.jobs.get(first.id)).state, 'cancelled');
  const next = await exported(f); assert.ok(next.artifact.path.endsWith('.zip'));
  await f.jobs.expire();
  assert.equal(await fs.readFile(path.join(unknown, 'keep'), 'utf8'), 'keep');
});

test('declared and actual upload sizes, malformed ZIP, idle upload, disk and quota limits', async t => {
  const f = await fixture(t, { uploadIdleMs: 40 });
  const short = await f.jobs.createImport('short.zip', 10);
  assert.equal((await f.jobs.upload(short.id, Readable.from([Buffer.alloc(2)]))).state, 'failed');
  const oversized = await f.jobs.createImport('large.zip', 1);
  assert.equal((await f.jobs.upload(oversized.id, Readable.from([Buffer.alloc(2)]))).state, 'failed');
  const malformed = await f.jobs.createImport('invalid.zip', 4);
  await f.jobs.upload(malformed.id, Readable.from([Buffer.from('oops')]));
  assert.equal((await settled(f.jobs, malformed.id)).state, 'failed');
  const idle = await f.jobs.createImport('idle.zip', 1);
  assert.equal((await f.jobs.upload(idle.id, new Readable({ read() {} }))).state, 'cancelled');
  const lowDisk = await fixture(t, { availableBytes: async () => 0 });
  await assert.rejects(lowDisk.jobs.createExport('sample', lowDisk.source), /free disk space/);
  const quota = await fixture(t, { maxTemporary: 1 });
  await assert.rejects(quota.jobs.createImport('test.zip', 1), /Managed temporary storage/);
});

test('ready jobs survive restart and expiry removes only registered artifacts', async t => {
  const f = await fixture(t, { lifetimeMs: 2000 });
  const ready = await exported(f);
  await f.jobs.close();
  const reopened = new ArchiveJobs(f.jobsRoot, { lifetimeMs: 2000 });
  t.after(() => reopened.close());
  assert.equal((await reopened.get(ready.job.id)).state, 'ready');
  assert.ok((await reopened.status('sample')).lastVerifiedArchive);
  const journalPath = path.join(f.jobsRoot, ready.job.id, 'job.json');
  await reopened.close();
  const record = JSON.parse(await fs.readFile(journalPath, 'utf8')); record.expiresAt = 0;
  await fs.writeFile(journalPath, JSON.stringify(record));
  const expired = new ArchiveJobs(f.jobsRoot); t.after(() => expired.close());
  await assert.rejects(expired.get(ready.job.id), /expired|not found/i);
  await assert.rejects(fs.stat(path.dirname(journalPath)), /ENOENT/);
});

test('restart after atomic install recovers same project from durable receipt', async t => {
  const f = await fixture(t);
  const ready = await imported(f);
  await f.jobs.close();
  const file = path.join(f.jobsRoot, ready.id, 'job.json');
  const journal = JSON.parse(await fs.readFile(file, 'utf8'));
  journal.state = 'restoring'; journal.workspace = f.workspace; journal.targetId = 'sample-restored-crash-fixture';
  await fs.writeFile(file, JSON.stringify(journal));
  const project = await installSavedProject(path.join(f.jobsRoot, ready.id, 'work/snapshot'), journal.manifest, f.workspace, journal.targetId,
    { installation: { jobId: ready.id, staging: path.join(f.workspace, `.muse-restore-${ready.id}`) } });
  const reopened = new ArchiveJobs(f.jobsRoot); t.after(() => reopened.close());
  assert.equal((await reopened.get(ready.id)).state, 'restored');
  const retry = await reopened.restore(ready.id, ready.preview!.snapshotHash, f.workspace);
  assert.equal(retry.project?.id, project.id);
  assert.equal((await fs.readdir(f.workspace)).filter(n => n.endsWith('.muse')).length, 2);
});

test('restart cancels unfinished work and removes only receipt-owned workspace staging', async t => {
  const f = await fixture(t);
  const ready = await imported(f);
  await f.jobs.close();
  const journalPath = path.join(f.jobsRoot, ready.id, 'job.json');
  const journal = JSON.parse(await fs.readFile(journalPath, 'utf8'));
  journal.state = 'restoring'; journal.workspace = f.workspace; journal.targetId = 'sample-restored-interrupted';
  await fs.writeFile(journalPath, JSON.stringify(journal));
  const staging = path.join(f.workspace, `.muse-restore-${ready.id}`);
  await fs.mkdir(path.join(staging, '.muse'), { recursive: true });
  await fs.writeFile(path.join(staging, '.muse/restore-receipt.json'), JSON.stringify({ jobId: ready.id }));
  await fs.writeFile(path.join(staging, 'partial'), 'partial');
  const unrelated = path.join(f.workspace, '.muse-restore-unrelated');
  await fs.mkdir(unrelated); await fs.writeFile(path.join(unrelated, 'keep'), 'keep');
  const reopened = new ArchiveJobs(f.jobsRoot); t.after(() => reopened.close());
  assert.equal((await reopened.get(ready.id)).state, 'cancelled');
  await assert.rejects(fs.stat(staging), /ENOENT/);
  assert.equal(await fs.readFile(path.join(unrelated, 'keep'), 'utf8'), 'keep');
  assert.equal((await fs.readdir(f.workspace)).filter(n => n.endsWith('.muse')).length, 1);
});

test('deadline and cancellation stop workers before staged-file cleanup', async t => {
  const f = await fixture(t, { lifetimeMs: 100 });
  const created = await f.jobs.createImport('waiting.zip', 1);
  await new Promise(resolve => setTimeout(resolve, 120));
  const stopped = await f.jobs.get(created.id);
  assert.equal(stopped.state, 'cancelled');
  assert.match(stopped.error?.message ?? '', /timed out/);
  const running = await f.jobs.createExport('sample', f.source);
  const cancelled = await f.jobs.cancel(running.id);
  assert.equal(cancelled.state, 'cancelled');
  await assert.rejects(fs.stat(path.join(f.jobsRoot, running.id, 'work')), /ENOENT/);
  assert.equal(await fs.readFile(path.join(f.source, 'manuscript/chapter.md'), 'utf8'), 'The lighthouse survived.');
});

test('combined Binder package embeds verified backup from same selected snapshot', async t => {
  const f = await fixture(t);
  const { previewBinder } = await import('../src/binder.js');
  const { parseRecipe } = await import('../../shared/project-tools.js');
  const recipe = parseRecipe({ format: 'muse-project-binder', version: 1, title: 'Story', introduction: '', pageSize: 'letter', includeImages: false,
    sections: [{ id: 'story', kind: 'document', title: 'Story', selection: { mode: 'selected', ids: ['chapter'] } }] });
  const preview = await previewBinder('sample', recipe, undefined, f.source);
  const created = await f.jobs.createExport('sample', f.source, { recipe, snapshotHash: preview.receipt.snapshotHash });
  const ready = await settled(f.jobs, created.id);
  assert.equal(ready.state, 'ready', JSON.stringify(ready.error));
  const artifact = await f.jobs.download(created.id);
  assert.match(artifact.name, /project-package.zip$/);
  const yauzl = await import('yauzl');
  const zip = await new Promise<import('yauzl').ZipFile>((resolve, reject) => yauzl.open(artifact.path, { lazyEntries: true }, (error, result) => error ? reject(error) : resolve(result!)));
  const entries = new Map<string, Buffer>();
  await new Promise<void>((resolve, reject) => {
    zip.on('error', reject); zip.on('end', resolve);
    zip.on('entry', entry => {
      zip.openReadStream(entry, (error, stream) => {
        if (error) { reject(error); return; }
        void (async () => { const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(chunk); entries.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); })().catch(reject);
      });
    }); zip.readEntry();
  });
  assert.match(entries.get('binder.html')!.toString(), /The lighthouse survived/);
  const receipt = JSON.parse(entries.get('receipt.json')!.toString());
  assert.equal(receipt.backupSnapshotHash, ready.preview!.snapshotHash);
  assert.equal(receipt.snapshotHash, preview.receipt.snapshotHash);
  const bytes = entries.get('backup.muse-backup.zip')!;
  const uploaded = await f.jobs.createImport('backup.muse-backup.zip', bytes.length);
  await f.jobs.upload(uploaded.id, Readable.from([bytes]));
  assert.equal((await settled(f.jobs, uploaded.id)).preview?.snapshotHash, ready.preview!.snapshotHash);
  await fs.writeFile(path.join(f.source, 'manuscript/chapter.md'), 'Changed after preview.');
  const stale = await f.jobs.createExport('sample', f.source, { recipe, snapshotHash: preview.receipt.snapshotHash });
  const rejected = await settled(f.jobs, stale.id);
  assert.equal(rejected.state, 'failed'); assert.match(rejected.error!.message, /changed/i);
});

test('2 GiB worker export, streamed upload, and installation remain bounded', {
  skip: process.env.MUSE_ARCHIVE_CAPACITY !== '1', timeout: 240_000,
}, async t => {
  const f = await fixture(t);
  const { randomBytes } = await import('node:crypto');
  await fs.mkdir(path.join(f.source, 'assets'));
  const payload = path.join(f.source, 'assets/random.bin');
  const other = (await fs.stat(path.join(f.source, 'project.json'))).size + (await fs.stat(path.join(f.source, 'manuscript/chapter.md'))).size;
  const handle = await fs.open(payload, 'wx');
  const chunk = randomBytes(256 * 1024); let remaining = 2 * 1024 ** 3 - other;
  while (remaining) { const result = await handle.write(chunk, 0, Math.min(remaining, chunk.length)); remaining -= result.bytesWritten; }
  await handle.close();
  global.gc?.(); const baseline = process.memoryUsage().rss; let peak = baseline;
  const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 20);
  const started = Date.now();
  try {
    const created = await f.jobs.createExport('sample', f.source);
    const waitLarge = async (id: string) => {
      for (let i = 0; i < 2400; i++) { const job = await f.jobs.get(id); if (['ready', 'restored', 'failed'].includes(job.state)) return job; await new Promise(resolve => setTimeout(resolve, 50)); }
      throw new Error('Large worker job timeout');
    };
    const ready = await waitLarge(created.id); assert.equal(ready.state, 'ready', JSON.stringify(ready.error));
    const archive = await f.jobs.download(ready.id);
    const upload = await f.jobs.createImport('large.zip', (await fs.stat(archive.path)).size);
    await f.jobs.upload(upload.id, createReadStream(archive.path));
    const validated = await waitLarge(upload.id); assert.equal(validated.state, 'ready', JSON.stringify(validated.error));
    await f.jobs.restore(upload.id, validated.preview!.snapshotHash, f.workspace);
    const installed = await waitLarge(upload.id); assert.equal(installed.state, 'restored', JSON.stringify(installed.error));
    assert.equal((await fs.stat(path.join(f.workspace, `${installed.project!.id}.muse/assets/random.bin`))).size, 2 * 1024 ** 3 - other);
    const delta = (peak - baseline) / 1024 ** 2;
    t.diagnostic(JSON.stringify({ savedGiB: 2, incrementalProcessRssMiB: delta, seconds: (Date.now() - started) / 1000 }));
    assert.ok(delta < 256, `Incremental RSS ${delta} MiB exceeds 256 MiB`);
  } finally { clearInterval(timer); }
});
