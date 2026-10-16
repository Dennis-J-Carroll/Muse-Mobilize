import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import yazl from 'yazl';
import { captureSavedProject, writeBackupArchive, readBackupArchive, installSavedProject, parseArchiveManifest, snapshotHash, ARCHIVE_LIMITS } from '../src/backup-archive.js';

async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-archive-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'original');
  await fs.mkdir(path.join(source, 'manuscript'), { recursive: true });
  await fs.mkdir(path.join(source, 'assets/images'), { recursive: true });
  await fs.mkdir(path.join(source, 'world'), { recursive: true });
  await fs.writeFile(path.join(source, 'project.json'), JSON.stringify({ id: 'sample', name: 'Sample', createdAt: '2026-01-01', updatedAt: '2026-01-01', documents: [
    { id: 'chapter', title: 'Chapter', kind: 'manuscript', path: 'manuscript/chapter.md', order: 1 },
  ] }));
  await fs.writeFile(path.join(source, 'manuscript/chapter.md'), '# Chapter\n\nLiteral /api/projects/sample/assets/images/pixel.png');
  await fs.writeFile(path.join(source, 'assets/images/pixel.png'), Buffer.from([0, 1, 2, 255]));
  await fs.writeFile(path.join(source, 'world/map.json'), JSON.stringify({ version: 1, image: { src: '/api/projects/sample/assets/images/pixel.png' } }));
  return { root, source, snapshot: path.join(root, 'snapshot'), archive: path.join(root, 'backup.zip') };
}

test('v2 round trip verifies original bytes, restores fresh identity, remaps typed links only', async t => {
  const f = await fixture(t);
  const manifest = await captureSavedProject(f.source, 'sample', f.snapshot);
  await writeBackupArchive(f.snapshot, manifest, f.archive);
  const extracted = path.join(f.root, 'extracted');
  assert.deepEqual(await readBackupArchive(f.archive, extracted), manifest);
  const workspace = path.join(f.root, 'workspace');
  const restored = await installSavedProject(extracted, manifest, workspace);
  const target = path.join(workspace, `${restored.id}.muse`);
  assert.notEqual(restored.id, 'sample');
  assert.deepEqual(await fs.readFile(path.join(target, 'assets/images/pixel.png')), await fs.readFile(path.join(f.source, 'assets/images/pixel.png')));
  assert.match(await fs.readFile(path.join(target, 'manuscript/chapter.md'), 'utf8'), /projects\/sample\//);
  assert.match(await fs.readFile(path.join(target, 'world/map.json'), 'utf8'), new RegExp(restored.id));
  assert.equal(JSON.parse(await fs.readFile(path.join(f.source, 'project.json'), 'utf8')).id, 'sample');
  await assert.rejects(installSavedProject(extracted, manifest, workspace, restored.id), /EEXIST/);
  assert.equal((await fs.readdir(workspace)).length, 1);
});

test('v2 accepts assets above legacy 50 MiB ceiling without base64', async t => {
  const f = await fixture(t);
  const large = await fs.open(path.join(f.source, 'assets/large.bin'), 'w');
  await large.truncate(51 * 1024 ** 2); await large.close();
  const manifest = await captureSavedProject(f.source, 'sample', f.snapshot);
  assert.equal(manifest.files.find(x => x.path === 'assets/large.bin')?.size, 51 * 1024 ** 2);
  assert.ok(!JSON.stringify(manifest).includes('base64'));
  await writeBackupArchive(f.snapshot, manifest, f.archive);
  assert.deepEqual(await readBackupArchive(f.archive), manifest);
});

test('capture rejects symlinks and malformed source hashes', async t => {
  const f = await fixture(t);
  await fs.symlink(path.join(f.source, 'project.json'), path.join(f.source, 'assets/link'));
  await assert.rejects(captureSavedProject(f.source, 'sample', f.snapshot), /symlink/);
  await fs.unlink(path.join(f.source, 'assets/link'));
  await fs.mkdir(path.join(f.source, 'sources/originals'), { recursive: true });
  await fs.writeFile(path.join(f.source, 'sources/originals/one'), 'original');
  await fs.writeFile(path.join(f.source, 'sources/index.json'), JSON.stringify({ version: 1, sources: [{ id: 'one', title: 'One', originalName: 'one.txt', sourceHash: '0'.repeat(64) }] }));
  await assert.rejects(captureSavedProject(f.source, 'sample', f.snapshot), /recorded hash/);
});

test('manifest rejects unsafe paths, collisions, excessive sizes, and wrong snapshot hash', async t => {
  const f = await fixture(t);
  const valid = await captureSavedProject(f.source, 'sample', f.snapshot);
  for (const bad of ['../secret', 'assets/../secret', 'assets\\secret', 'settings.json']) {
    const input = structuredClone(valid); input.files[0].path = bad;
    input.snapshotHash = snapshotHash(input.files);
    assert.throws(() => parseArchiveManifest(input));
  }
  const collision = structuredClone(valid); collision.files.push({ ...collision.files[0], path: collision.files[0].path.toUpperCase() });
  assert.throws(() => parseArchiveManifest(collision));
  const huge = structuredClone(valid); huge.files[0].size = ARCHIVE_LIMITS.saved + 1;
  assert.throws(() => parseArchiveManifest(huge), /limit/);
  assert.throws(() => parseArchiveManifest({ ...valid, snapshotHash: '0'.repeat(64) }), /Snapshot hash/);
});

async function adversarialZip(file: string, manifest: unknown, entries: { name: string; data: Buffer; mode?: number }[]) {
  const zip = new yazl.ZipFile();
  const done = pipeline(zip.outputStream, createWriteStream(file));
  zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'muse-backup.json');
  for (const entry of entries) zip.addBuffer(entry.data, entry.name, { mode: entry.mode });
  zip.end(); await done;
}

test('reader rejects missing, duplicate, unlisted, corrupt, and symlink entries', async t => {
  const f = await fixture(t);
  const valid = await captureSavedProject(f.source, 'sample', f.snapshot);
  const entries = await Promise.all(valid.files.map(async item => ({ name: `project/${item.path}`, data: await fs.readFile(path.join(f.snapshot, item.path)) })));
  for (const [name, list] of [
    ['missing', entries.slice(1)], ['duplicate', [...entries, entries[0]]],
    ['unlisted', [...entries, { name: 'project/assets/extra', data: Buffer.from('x') }]],
    ['corrupt', entries.map((e, i) => i ? e : { ...e, data: Buffer.alloc(e.data.length, 9) })],
    ['symlink', entries.map((e, i) => i ? e : { ...e, mode: 0o120777 })],
  ] as const) {
    const file = path.join(f.root, `${name}.zip`);
    await adversarialZip(file, valid, [...list]);
    await assert.rejects(readBackupArchive(file), { name: /Error/ }, name);
  }
});

test('staged tampering cannot be installed and cancelled capture does not modify source', async t => {
  const f = await fixture(t);
  const valid = await captureSavedProject(f.source, 'sample', f.snapshot);
  await fs.writeFile(path.join(f.snapshot, 'assets/images/pixel.png'), Buffer.from([9, 9, 9, 9]));
  const workspace = path.join(f.root, 'workspace');
  await assert.rejects(installSavedProject(f.snapshot, valid, workspace), /Staged file changed/);
  assert.deepEqual(await fs.readdir(workspace), []);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(captureSavedProject(f.source, 'sample', path.join(f.root, 'cancel'), { signal: abort.signal }), /abort/i);
  assert.equal(createHash('sha256').update(await fs.readFile(path.join(f.source, 'assets/images/pixel.png'))).digest('hex'), valid.files.find(x => x.path.endsWith('pixel.png'))?.sha256);
});

test('manifest enforces 10,000-file and structured-record budgets', async t => {
  const f = await fixture(t);
  const valid = await captureSavedProject(f.source, 'sample', f.snapshot);
  const files = Array.from({ length: 9999 }, (_, i) => ({ path: `assets/${String(i).padStart(5, '0')}`, size: 0, sha256: '0'.repeat(64) }));
  files.push(valid.files.find(x => x.path === 'project.json')!);
  assert.equal(parseArchiveManifest({ ...valid, files, snapshotHash: snapshotHash(files) }).files.length, 10000);
  const overflow = [...files, { path: 'assets/extra', size: 0, sha256: '0'.repeat(64) }];
  assert.throws(() => parseArchiveManifest({ ...valid, files: overflow }), /limit/);
  const largeStore = structuredClone(valid);
  largeStore.files.find(x => x.path === 'world/map.json')!.size = ARCHIVE_LIMITS.structured + 1;
  assert.throws(() => parseArchiveManifest(largeStore), /Structured JSON/);
});

test('observed edit during capture invalidates snapshot', async t => {
  const f = await fixture(t);
  let edited = false;
  const { writeFileSync } = await import('node:fs');
  await assert.rejects(captureSavedProject(f.source, 'sample', f.snapshot, { progress() {
    if (!edited) { edited = true; writeFileSync(path.join(f.source, 'manuscript/chapter.md'), 'Changed during capture'); }
  } }), /changed/i);
});

test('capacity: 256 MiB, 512 MiB, 2 GiB streamed verification and bounded memory', {
  skip: process.env.MUSE_ARCHIVE_CAPACITY !== '1', timeout: 180_000,
}, async t => {
  const { randomBytes } = await import('node:crypto');
  for (const mib of [256, 512, 2048]) {
    const f = await fixture(t);
    let existing = 0;
    for (const file of ['project.json', 'manuscript/chapter.md', 'assets/images/pixel.png', 'world/map.json']) existing += (await fs.stat(path.join(f.source, file))).size;
    const handle = await fs.open(path.join(f.source, 'assets/payload.bin'), 'wx');
    const chunk = randomBytes(256 * 1024);
    let remaining = mib * 1024 ** 2 - existing;
    while (remaining > 0) {
      const count = Math.min(remaining, chunk.length);
      await handle.write(chunk, 0, count); remaining -= count;
    }
    await handle.close();
    global.gc?.();
    const baseline = process.memoryUsage().rss;
    let peak = baseline;
    const monitor = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 10);
    const started = Date.now();
    try {
      const manifest = await captureSavedProject(f.source, 'sample', f.snapshot);
      assert.equal(manifest.files.reduce((sum, x) => sum + x.size, 0), mib * 1024 ** 2);
      await writeBackupArchive(f.snapshot, manifest, f.archive);
      assert.deepEqual(await readBackupArchive(f.archive), manifest);
      const delta = (peak - baseline) / 1024 ** 2;
      t.diagnostic(JSON.stringify({ savedMiB: mib, incrementalRssMiB: delta, seconds: (Date.now() - started) / 1000 }));
      assert.ok(delta < 256, `Incremental RSS ${delta} MiB exceeds 256 MiB`);
    } finally { clearInterval(monitor); await fs.rm(f.root, { recursive: true, force: true }); }
  }
});
