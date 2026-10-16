import { parseEditionStore } from '../../shared/story-edition.js';
import fs from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import yauzl from 'yauzl';
import { BackupError, backupPolicy as p, MAX_BACKUP_FILES, validateBackupPath, validateBackupProjectId } from './backups.js';
import type { ProjectManifest } from './types.js';

export const ARCHIVE_LIMITS = {
  saved: 2 * 1024 ** 3, upload: 2 * 1024 ** 3 + 64 * 1024 ** 2,
  manifest: 16 * 1024 ** 2, structured: 50 * 1024 ** 2,
  temporary: 8 * 1024 ** 3, reserve: 512 * 1024 ** 2,
  lifetimeMs: 30 * 60_000, uploadIdleMs: 60_000,
} as const;
export interface ArchiveFile { path: string; size: number; sha256: string }
export interface ArchiveManifest {
  format: 'muse-project-backup'; version: 2; sourceProjectId: string;
  capturedAt: string; snapshotHash: string; files: ArchiveFile[];
}
export interface ArchiveOptions {
  signal?: AbortSignal;
  installation?: { jobId: string; staging: string };
  progress?: (phase: string, bytes: number, total: number) => void;
}
function invalid(message: string): never { throw new BackupError(400, 'INVALID_BACKUP', message); }
export function checkLimit(label: string, actual: number, limit: number) {
  if (!Number.isSafeInteger(actual) || actual < 0 || actual > limit) {
    throw new BackupError(413, 'BACKUP_TOO_LARGE', `${label}: ${actual} bytes/count; limit ${limit}.`);
  }
}
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const snapshotHash = (files: ArchiveFile[]) => digest(JSON.stringify(files.map(f => [f.path, f.size, f.sha256])));
const structured = (file: string) => file === 'project.json' || p.stores.has(file)
  || (!file.startsWith('assets/') && file.endsWith('.json'));

export function parseArchiveManifest(input: unknown): ArchiveManifest {
  if (!p.record(input)) invalid('Missing archive manifest.');
  p.exactKeys(input, ['format', 'version', 'sourceProjectId', 'capturedAt', 'snapshotHash', 'files']);
  if (input.format !== 'muse-project-backup' || input.version !== 2) invalid('Expected version 2 Muse backup.');
  validateBackupProjectId(input.sourceProjectId);
  if (!p.dateString(input.capturedAt) || !Array.isArray(input.files) || !input.files.length) invalid('Missing capture time or files.');
  checkLimit('Backup files', input.files.length, MAX_BACKUP_FILES);
  let saved = 0, json = 0;
  const files: ArchiveFile[] = [];
  for (const item of input.files) {
    if (!p.record(item)) invalid('Malformed file metadata.');
    p.exactKeys(item, ['path', 'size', 'sha256']);
    validateBackupPath(item.path);
    if (!p.allowedFile(item.path)) invalid(`File outside saved-project backup: ${item.path}.`);
    if (typeof item.size !== 'number') invalid('Invalid file size.');
    checkLimit('File size', item.size, ARCHIVE_LIMITS.saved);
    if (typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) invalid('Invalid SHA-256 digest.');
    saved += item.size;
    if (structured(item.path)) json += item.size;
    files.push({ path: item.path, size: item.size, sha256: item.sha256 });
  }
  checkLimit('Saved files', saved, ARCHIVE_LIMITS.saved);
  checkLimit('Structured JSON', json, ARCHIVE_LIMITS.structured);
  p.checkCollisions(files.map(f => f.path));
  const directories = new Set<string>();
  for (const file of files) {
    const parts = file.path.split('/'); parts.pop();
    while (parts.length) { directories.add(parts.join('/')); parts.pop(); }
  }
  checkLimit('Backup directories', directories.size + 1, MAX_BACKUP_FILES);
  if (!files.some(f => f.path === 'project.json')) invalid('Backup is missing project.json.');
  if (files.some((f, i) => i > 0 && files[i - 1].path >= f.path)) invalid('Archive file records must be sorted by path.');
  if (input.snapshotHash !== snapshotHash(files)) invalid('Snapshot hash does not match manifest.');
  return input as unknown as ArchiveManifest;
}

/** Per-file buffering remains bounded, even if the file grows during capture. */
async function transfer(source: NodeJS.ReadableStream, destination: NodeJS.WritableStream, expected: number, options: ArchiveOptions) {
  let bytes = 0;
  const hash = createHash('sha256');
  await pipeline(source, new Transform({ transform(chunk: Buffer, _encoding, cb) {
    bytes += chunk.length;
    if (bytes > expected) { cb(new BackupError(400, 'INVALID_BACKUP', 'File exceeds declared size.')); return; }
    hash.update(chunk); cb(null, chunk);
  } }), destination, { signal: options.signal });
  if (bytes !== expected) invalid('File size does not match declared size.');
  return hash.digest('hex');
}

/** Read each structured store separately; binaries are represented only by metadata. */
export async function validateSavedProject(root: string, manifest: ArchiveManifest): Promise<ProjectManifest> {
  const files = new Map(manifest.files.map(f => [f.path, f]));
  const readJson = async (file: string) => {
    const metadata = files.get(file);
    if (!metadata) invalid(`Missing file: ${file}.`);
    checkLimit('Structured file', metadata.size, ARCHIVE_LIMITS.structured);
    return p.parseJson(await fs.readFile(path.join(root, file)), file);
  };
  const project = p.validateManifest(await readJson('project.json'), manifest.sourceProjectId, new Set(files.keys()));
  for (const file of p.stores) {
    if (!files.has(file)) continue;
    const value = await readJson(file);
    if (!p.record(value) || value.version !== 1) invalid(`Malformed or unsupported saved store: ${file}.`);
    if (file === 'editions/recipes.json') parseEditionStore(value);
    if (file !== 'sources/index.json') continue;
    if (!Array.isArray(value.sources)) invalid('Malformed sources index.');
    const seen = new Set<string>();
    for (const source of value.sources) {
      if (!p.record(source) || typeof source.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(source.id)
        || typeof source.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(source.sourceHash)
        || typeof source.title !== 'string' || typeof source.originalName !== 'string' || seen.has(source.id)) invalid('Malformed source record.');
      seen.add(source.id);
      const original = files.get(`sources/originals/${source.id}`);
      if (!original || original.sha256 !== source.sourceHash) invalid(`Source original does not match recorded hash: ${source.id}.`);
    }
  }
  return project;
}

export async function captureSavedProject(source: string, sourceId: string, staging: string, options: ArchiveOptions = {}): Promise<ArchiveManifest> {
  validateBackupProjectId(sourceId);
  const before = await p.inventory(source, ARCHIVE_LIMITS.saved);
  const total = [...before.files.values()].reduce((n, s) => n + Number(s.size), 0);
  checkLimit('Structured JSON', [...before.files].reduce((n, [f, s]) => n + (structured(f) ? Number(s.size) : 0), 0), ARCHIVE_LIMITS.structured);
  await fs.mkdir(staging, { mode: 0o700 });
  const files: ArchiveFile[] = [];
  let completed = 0;
  for (const [file, stat] of [...before.files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    options.signal?.throwIfAborted();
    // Reject changed/symlinked ancestors before opening a selected file.
    const parts = file.split('/');
    for (let i = 0; i < parts.length; i++) {
      const directory = parts.slice(0, i).join('/');
      const current = await fs.lstat(path.join(source, directory), { bigint: true });
      if (!current.isDirectory() || p.signature(current) !== before.directories.get(directory)) {
        throw new BackupError(409, 'PROJECT_CHANGED', 'Project changed during backup. Save and retry.');
      }
    }
    const handle = await fs.open(path.join(source, file), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (p.signature(await handle.stat({ bigint: true })) !== p.signature(stat)) throw new BackupError(409, 'PROJECT_CHANGED', 'Project changed during backup.');
      const destination = path.join(staging, file);
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      const sha256 = await transfer(handle.createReadStream({ autoClose: false, highWaterMark: 256 * 1024 }),
        createWriteStream(destination, { flags: 'wx', mode: 0o600 }), Number(stat.size), options);
      if (p.signature(await handle.stat({ bigint: true })) !== p.signature(stat)) throw new BackupError(409, 'PROJECT_CHANGED', 'Project changed during backup.');
      files.push({ path: file, size: Number(stat.size), sha256 });
      completed += Number(stat.size); options.progress?.('capturing', completed, total);
    } finally { await handle.close(); }
  }
  if (!p.sameInventory(before, await p.inventory(source, ARCHIVE_LIMITS.saved))) throw new BackupError(409, 'PROJECT_CHANGED', 'Project changed during backup. Save and retry.');
  const manifest: ArchiveManifest = { format: 'muse-project-backup', version: 2, sourceProjectId: sourceId,
    capturedAt: new Date().toISOString(), snapshotHash: snapshotHash(files), files };
  parseArchiveManifest(manifest);
  await validateSavedProject(staging, manifest);
  return manifest;
}

export async function writeBackupArchive(root: string, manifest: ArchiveManifest, output: string, options: ArchiveOptions = {}) {
  parseArchiveManifest(manifest);
  const bytes = Buffer.from(JSON.stringify(manifest));
  checkLimit('Archive manifest', bytes.length, ARCHIVE_LIMITS.manifest);
  const zip = new yazl.ZipFile();
  const destination = createWriteStream(output, { flags: 'wx', mode: 0o600 });
  zip.on('error', error => destination.destroy(error));
  const done = pipeline(zip.outputStream, destination, { signal: options.signal });
  zip.addBuffer(bytes, 'muse-backup.json');
  for (const file of manifest.files) {
    zip.addFile(path.join(root, file.path), `project/${file.path}`, {
      compress: !file.path.startsWith('assets/') && !file.path.startsWith('sources/originals/'),
      mode: 0o100600,
    });
  }
  zip.end();
  await done;
  checkLimit('Archive container', (await fs.stat(output)).size, ARCHIVE_LIMITS.upload);
}

function openZip(filename: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => yauzl.open(filename, {
    lazyEntries: true, strictFileNames: true, validateEntrySizes: true, autoClose: false,
  }, (error, zip) => error ? reject(error) : resolve(zip!)));
}
function entryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream!)));
}

/** Verify every entry. Extraction is optional, so export verification needs no second payload copy. */
export async function readBackupArchive(filename: string, staging?: string, options: ArchiveOptions = {}): Promise<ArchiveManifest> {
  checkLimit('Archive container', (await fs.stat(filename)).size, ARCHIVE_LIMITS.upload);
  const zip = await openZip(filename);
  let zipError: Error | undefined;
  zip.on('error', error => { zipError = error; });
  const next = () => new Promise<yauzl.Entry | null>((resolve, reject) => {
    if (zipError) { reject(zipError); return; }
    const cleanup = () => { zip.off('entry', onEntry); zip.off('end', onEnd); zip.off('error', onError); };
    const onEntry = (entry: yauzl.Entry) => { cleanup(); resolve(entry); };
    const onEnd = () => { cleanup(); resolve(null); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    zip.once('entry', onEntry); zip.once('end', onEnd); zip.once('error', onError); zip.readEntry();
  });
  try {
    checkLimit('Archive entries', zip.entryCount, MAX_BACKUP_FILES + 1);
    let manifest: ArchiveManifest | undefined;
    const seen = new Set<string>();
    let completed = 0;
    if (staging) await fs.mkdir(staging, { mode: 0o700 });
    while (true) {
      options.signal?.throwIfAborted();
      const entry = await next();
      if (!entry) break;
      const unixType = (entry.externalFileAttributes >>> 16) & 0o170000;
      if ((entry.generalPurposeBitFlag & 1) || ![0, 8].includes(entry.compressionMethod)
        || (unixType !== 0 && unixType !== 0o100000) || entry.fileName.endsWith('/')) invalid('Unsupported encrypted, directory, link, or special ZIP entry.');
      if (!manifest) {
        if (entry.fileName !== 'muse-backup.json') invalid('Select the inner .muse-backup.zip; its first entry must be muse-backup.json.');
        checkLimit('Archive manifest', entry.uncompressedSize, ARCHIVE_LIMITS.manifest);
        const chunks: Buffer[] = [];
        await transfer(await entryStream(zip, entry), new Writable({ write(chunk, _encoding, cb) { chunks.push(chunk); cb(); } }), entry.uncompressedSize, options);
        manifest = parseArchiveManifest(p.parseJson(Buffer.concat(chunks), 'muse-backup.json'));
        continue;
      }
      if (!entry.fileName.startsWith('project/')) invalid('Unexpected archive entry.');
      const relative = entry.fileName.slice(8);
      const file = manifest.files.find(f => f.path === relative);
      if (!file || seen.has(relative) || entry.uncompressedSize !== file.size) invalid('Unlisted, duplicate, or mismatched archive entry.');
      seen.add(relative);
      let destination: NodeJS.WritableStream = new Writable({ write(_chunk, _encoding, cb) { cb(); } });
      if (staging) {
        const target = path.join(staging, relative);
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        destination = createWriteStream(target, { flags: 'wx', mode: 0o600 });
      }
      const sha256 = await transfer(await entryStream(zip, entry), destination, file.size, options);
      if (sha256 !== file.sha256) invalid(`Checksum mismatch: ${relative}.`);
      completed += file.size;
      options.progress?.('validating', completed, manifest.files.reduce((sum, f) => sum + f.size, 0));
    }
    if (!manifest || seen.size !== manifest.files.length) invalid('Archive is missing declared files.');
    if (staging) await validateSavedProject(staging, manifest);
    return manifest;
  } finally { zip.close(); }
}

/** Copies to workspace-local staging, remaps only typed links, then installs atomically. */
export async function installSavedProject(root: string, archive: ArchiveManifest, workspace: string, targetId?: string, options: ArchiveOptions = {}) {
  if (archive.sourceProjectId.length > 204) invalid('Source project ID is too long to append a restore identity.');
  const id = targetId ?? `${archive.sourceProjectId}-restored-${randomUUID()}`;
  validateBackupProjectId(id);
  if (id === archive.sourceProjectId) invalid('Restore must have a new identity.');
  const project = await validateSavedProject(root, archive);
  const now = new Date().toISOString();
  const restored = { ...project, id, name: `${project.name} (restored)`, createdAt: now, updatedAt: now };
  await fs.mkdir(workspace, { recursive: true });
  const staging = options.installation?.staging ?? await fs.mkdtemp(path.join(workspace, '.muse-restore-'));
  if (options.installation) {
    if (!/^[a-f0-9-]{36}$/.test(options.installation.jobId) || staging !== path.join(workspace, `.muse-restore-${options.installation.jobId}`)) invalid('Invalid installation staging.');
    await fs.mkdir(staging, { mode: 0o700 });
  }
  const destination = path.join(workspace, `${id}.muse`);
  let reservation: Awaited<ReturnType<typeof fs.stat>> | undefined;
  let installed = false;
  try {
    if (options.installation) {
      await fs.mkdir(path.join(staging, '.muse'), { recursive: true, mode: 0o700 });
      const marker = await fs.open(path.join(staging, '.muse/restore-receipt.json'), 'wx', 0o600);
      try {
        await marker.writeFile(JSON.stringify({ jobId: options.installation.jobId, snapshotHash: archive.snapshotHash, targetId: id }));
        await marker.sync();
      } finally { await marker.close(); }
    }
    for (const file of archive.files) {
      options.signal?.throwIfAborted();
      const target = path.join(staging, file.path);
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const handle = await fs.open(path.join(root, file.path), constants.O_RDONLY | constants.O_NOFOLLOW);
      let hash: string;
      try {
        hash = await transfer(handle.createReadStream({ autoClose: false }),
          createWriteStream(target, { flags: 'wx', mode: 0o600 }), file.size, options);
      } finally { await handle.close(); }
      if (hash !== file.sha256) invalid(`Staged file changed: ${file.path}.`);
      if (p.stores.has(file.path)) {
        const value = p.parseJson(await fs.readFile(target), file.path) as Record<string, unknown>;
        const changes = new Map<string, Buffer>();
        p.remapImageStores(new Map([[file.path, value]]), changes, archive.sourceProjectId, id);
        if (changes.has(file.path)) await fs.writeFile(target, changes.get(file.path)!);
      }
    }
    await fs.writeFile(path.join(staging, 'project.json'), JSON.stringify(restored, null, 2));
    options.signal?.throwIfAborted();
    await fs.mkdir(destination, { mode: 0o700 });
    reservation = await fs.stat(destination);
    await fs.rename(staging, destination);
    installed = true;
    return restored;
  } finally {
    if (!installed) {
      await fs.rm(staging, { recursive: true, force: true });
      if (reservation) {
        const current = await fs.lstat(destination).catch(() => undefined);
        if (current?.ino === reservation.ino && current.dev === reservation.dev) await fs.rmdir(destination).catch(() => {});
      }
    }
  }
}
