import fs from 'node:fs/promises';
import { constants, type BigIntStats } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { projectDir, workspaceRoot as configuredWorkspaceRoot } from './projects.js';
import type { ProjectManifest } from './types.js';

export const MAX_BACKUP_BYTES = 80 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 50 * 1024 * 1024;
export const MAX_BACKUP_FILES = 10_000;

export class BackupError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string = code) {
    super(message);
    this.name = 'BackupError';
  }
}

export interface ProjectBackupFile {
  path: string;
  size: number;
  sha256: string;
  data: string;
}

export interface ProjectBackup {
  format: 'muse-project-backup';
  version: 1;
  sourceProjectId: string;
  capturedAt: string;
  files: ProjectBackupFile[];
}

interface BackupOptions { workspaceRoot?: string }

const stores = new Set([
  'canon/canon.json', 'plot/plot.json', 'scenes/scenes.json', 'references/references.json',
  'goals/goals.json', 'world/map.json', 'connections/connections.json', 'sources/index.json',
  'studio/arrangements.json', 'binder/recipe.json',
]);
const broadDirectories = new Set(['manuscript', 'outline', 'notes', 'canon', 'assets', 'agents', 'workspaces', 'sources']);
const rootDirectories = new Set([...broadDirectories, 'plot', 'scenes', 'references', 'goals', 'world', 'connections', 'studio', 'binder', '.muse']);
function invalid(message: string): never { throw new BackupError(400, 'INVALID_BACKUP', message); }
function tooLarge(): never { throw new BackupError(413, 'BACKUP_TOO_LARGE', 'Backup exceeds 80 MiB encoded, 50 MiB saved files, or 10,000 files.'); }
function changed(): never { throw new BackupError(409, 'PROJECT_CHANGED', 'Project changed during backup. Save your work and retry.'); }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) invalid('Unexpected or missing backup fields.');
}

function validProjectId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,249}$/.test(value)) invalid('Invalid project ID.');
}

function validPath(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 1024
    || /[\\\u0000-\u001f\u007f<>:"|?*]/.test(value)) invalid('Unsafe backup path.');
  const parts = value.split('/');
  if (parts.length > 32 || parts.some((part) => !part || part === '.' || part === '..'
    || /[. ]$/.test(part) || Buffer.byteLength(part) > 255
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) invalid('Unsafe backup path.');
  if (parts.some((part, index) => part.startsWith('.') && !(index === 0 && part === '.muse'))) invalid('Hidden files are outside the saved-project backup.');
}

function documentPath(file: string): boolean {
  return /^(manuscript|outline|notes|canon)\/.+\.(md|markdown|txt)$/i.test(file);
}

/** Imported Source artifacts: original bytes, extracted text, chunk index. */
function sourcePath(file: string): boolean {
  return /^sources\/(originals|extracted|search)\/[a-zA-Z0-9][a-zA-Z0-9_-]*(\.(txt|json))?$/.test(file)
    || file === 'sources/index.json';
}

function allowedFile(file: string): boolean {
  if (file === 'project.json' || stores.has(file) || file === '.muse/events.jsonl') return true;
  if (file.split('/').slice(1).some((part) => part.toLowerCase() === 'project.json')) return false;
  return documentPath(file) || sourcePath(file) || file.startsWith('assets/')
    || /^agents\/.+\.ya?ml$/i.test(file) || /^workspaces\/.+\.json$/i.test(file)
    || /^\.muse\/snapshots\/.+\.(md|markdown|txt)$/i.test(file);
}

function allowedDirectory(file: string): boolean {
  if (rootDirectories.has(file)) return true;
  return broadDirectories.has(file.split('/')[0]) || file === '.muse/snapshots' || file.startsWith('.muse/snapshots/');
}

function collisionKey(file: string): string { return file.normalize('NFC').toLowerCase(); }

function checkCollisions(files: string[]): void {
  const occupied = new Set<string>();
  const directories = new Map<string, string>();
  for (const file of files) {
    const key = collisionKey(file);
    if (occupied.has(key) || directories.has(key)) invalid('Duplicate or colliding backup paths.');
    occupied.add(key);
    const parts = file.split('/');
    parts.pop();
    while (parts.length) {
      const spelling = parts.join('/');
      const directory = collisionKey(spelling);
      if (occupied.has(directory)) invalid('A backup file also acts as a directory.');
      if (directories.has(directory) && directories.get(directory) !== spelling) invalid('Colliding directory spellings in backup paths.');
      directories.set(directory, spelling);
      parts.pop();
    }
  }
}

function signature(stat: BigIntStats): string {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
}

interface Inventory { files: Map<string, BigIntStats>; directories: Map<string, string> }

async function inventory(dir: string): Promise<Inventory> {
  const files = new Map<string, BigIntStats>();
  const directories = new Map<string, string>();
  let total = 0;
  async function walk(relative: string): Promise<void> {
    const absolute = path.join(dir, relative);
    const stat = await fs.lstat(absolute, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalid('Backup project directories must not be symlinks.');
    directories.set(relative, signature(stat));
    if (directories.size > MAX_BACKUP_FILES) tooLarge();
    const entries = await fs.opendir(absolute);
    for await (const entry of entries) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (!allowedFile(file) && !allowedDirectory(file)) continue;
      validPath(file);
      const entryStat = await fs.lstat(path.join(dir, file), { bigint: true });
      if (entryStat.isSymbolicLink()) invalid('Backup files and directories must not be symlinks.');
      if (entryStat.isDirectory()) {
        if (allowedDirectory(file)) await walk(file);
      } else if (entryStat.isFile() && allowedFile(file)) {
        total += Number(entryStat.size);
        if (files.size >= MAX_BACKUP_FILES || total > MAX_PROJECT_BYTES) tooLarge();
        files.set(file, entryStat);
      } else if (allowedFile(file)) invalid('Backup entries must be regular files.');
    }
  }
  await walk('');
  checkCollisions([...files.keys()]);
  return { files, directories };
}

function sameInventory(before: Inventory, after: Inventory): boolean {
  return before.files.size === after.files.size && before.directories.size === after.directories.size
    && [...before.files].every(([file, stat]) => after.files.has(file) && signature(stat) === signature(after.files.get(file)!))
    && [...before.directories].every(([dir, stat]) => after.directories.get(dir) === stat);
}

function parseJson(bytes: Buffer | string, label: string): unknown {
  try {
    return JSON.parse(typeof bytes === 'string' ? bytes : new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return invalid(`Invalid JSON in ${label}.`); }
}

function dateString(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 50 && Number.isFinite(Date.parse(value));
}

function validateManifest(value: unknown, sourceId: string, files: Set<string>): ProjectManifest {
  if (!record(value)) invalid('Missing or malformed project manifest.');
  exactKeys(value, ['id', 'name', 'createdAt', 'updatedAt', 'documents']);
  if (value.id !== sourceId || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 1000
    || !dateString(value.createdAt) || !dateString(value.updatedAt) || !Array.isArray(value.documents)) invalid('Malformed project manifest.');
  const ids = new Set<string>();
  const documentFiles: string[] = [];
  for (const doc of value.documents) {
    if (!record(doc)) invalid('Malformed document metadata.');
    exactKeys(doc, ['id', 'title', 'kind', 'path', 'order']);
    validProjectId(doc.id);
    validPath(doc.path);
    if (ids.has(doc.id) || typeof doc.title !== 'string'
      || !['manuscript', 'outline', 'notes', 'canon'].includes(String(doc.kind))
      || typeof doc.order !== 'number' || !Number.isFinite(doc.order)
      || !documentPath(doc.path) || !files.has(doc.path)) invalid('Invalid or missing manifest document.');
    ids.add(doc.id);
    documentFiles.push(doc.path);
  }
  checkCollisions(documentFiles);
  return value as unknown as ProjectManifest;
}

/** Source records must reference the originals that actually travel in the backup. */
function validateSourcesIndex(files: Map<string, Buffer>): void {
  const indexBytes = files.get('sources/index.json');
  if (!indexBytes) return;
  const value = parseJson(indexBytes, 'sources/index.json');
  if (!record(value) || value.version !== 1 || !Array.isArray(value.sources)) invalid('Malformed sources index.');
  const seen = new Set<string>();
  for (const source of value.sources) {
    if (!record(source) || typeof source.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(source.id)
      || typeof source.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(source.sourceHash)
      || typeof source.title !== 'string' || typeof source.originalName !== 'string'
      || !source.id || seen.has(source.id)) invalid('Malformed source record.');
    seen.add(source.id);
    if (!files.has(`sources/originals/${source.id}`)) invalid(`Source original missing from backup: ${source.id}.`);
    const hash = createHash('sha256').update(files.get(`sources/originals/${source.id}`)!).digest('hex');
    if (hash !== source.sourceHash) invalid(`Source original does not match its recorded hash: ${source.id}.`);
  }
}

function readStores(files: Map<string, Buffer>): Map<string, Record<string, unknown>> {
  const parsed = new Map<string, Record<string, unknown>>();
  for (const file of stores) {
    const bytes = files.get(file);
    if (!bytes) continue;
    const value = parseJson(bytes, file);
    if (!record(value) || value.version !== 1) invalid(`Malformed or unsupported saved store: ${file}.`);
    parsed.set(file, value);
  }
  return parsed;
}

function base64Size(data: unknown): number {
  if (typeof data !== 'string') invalid('File data must be base64.');
  if (data.length > MAX_BACKUP_BYTES) tooLarge();
  if (data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(data)) invalid('Invalid base64 file data.');
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const firstPad = data.indexOf('=');
  if (firstPad !== -1 && firstPad !== data.length - padding) invalid('Invalid base64 padding.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  if (padding && (alphabet.indexOf(data[data.length - padding - 1]) & (padding === 2 ? 15 : 3)) !== 0) invalid('Noncanonical base64 padding.');
  return data.length / 4 * 3 - padding;
}

function validateBackup(input: unknown): { backup: ProjectBackup; files: Map<string, Buffer>; manifest: ProjectManifest; parsedStores: Map<string, Record<string, unknown>> } {
  if (Buffer.isBuffer(input) || typeof input === 'string') {
    if ((typeof input === 'string' ? Buffer.byteLength(input) : input.length) > MAX_BACKUP_BYTES) tooLarge();
    input = parseJson(input, 'backup');
  }
  if (!record(input)) invalid('Expected a project backup object.');
  exactKeys(input, ['format', 'version', 'sourceProjectId', 'capturedAt', 'files']);
  if (input.format !== 'muse-project-backup' || input.version !== 1) invalid('Unsupported project backup format or version.');
  validProjectId(input.sourceProjectId);
  if (!dateString(input.capturedAt) || !Array.isArray(input.files) || !input.files.length) invalid('Missing backup files or capture time.');
  if (input.files.length > MAX_BACKUP_FILES) tooLarge();
  const metadata: ProjectBackupFile[] = [];
  let decodedBytes = 0;
  let wireBytes = Buffer.byteLength(JSON.stringify({ format: input.format, version: input.version, sourceProjectId: input.sourceProjectId, capturedAt: input.capturedAt, files: [] }));
  for (const file of input.files) {
    if (!record(file)) invalid('Malformed backup file.');
    exactKeys(file, ['path', 'size', 'sha256', 'data']);
    validPath(file.path);
    if (!allowedFile(file.path)) invalid(`File is outside the saved-project backup: ${file.path}.`);
    if (typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 0) invalid('Invalid file size.');
    decodedBytes += file.size;
    if (decodedBytes > MAX_PROJECT_BYTES) tooLarge();
    if (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) invalid('Invalid SHA-256 digest.');
    if (base64Size(file.data) !== file.size) invalid('File size does not match base64 data.');
    wireBytes += Buffer.byteLength(JSON.stringify({ path: file.path, size: file.size, sha256: file.sha256, data: '' })) + (file.data as string).length + (metadata.length ? 1 : 0);
    if (wireBytes > MAX_BACKUP_BYTES) tooLarge();
    metadata.push({ path: file.path, size: file.size, sha256: file.sha256, data: file.data as string });
  }
  checkCollisions(metadata.map((file) => file.path));
  // All sizes and paths are checked before allocating any decoded file buffer.
  const files = new Map<string, Buffer>();
  for (const file of metadata) {
    const bytes = Buffer.from(file.data, 'base64');
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) invalid(`Checksum mismatch: ${file.path}.`);
    files.set(file.path, bytes);
  }
  const manifestBytes = files.get('project.json');
  if (!manifestBytes) invalid('Backup is missing project.json.');
  const manifest = validateManifest(parseJson(manifestBytes, 'project.json'), input.sourceProjectId, new Set(files.keys()));
  const parsedStores = readStores(files);
  validateSourcesIndex(files);
  return { backup: { format: 'muse-project-backup', version: 1, sourceProjectId: input.sourceProjectId, capturedAt: input.capturedAt, files: metadata }, files, manifest, parsedStores };
}

export async function exportProjectBackup(projectId: string, options: BackupOptions = {}): Promise<ProjectBackup> {
  validProjectId(projectId);
  const dir = options.workspaceRoot === undefined ? await projectDir(projectId) : path.join(path.resolve(options.workspaceRoot), `${projectId}.muse`);
  let before: Inventory;
  try { before = await inventory(dir); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new BackupError(404, 'PROJECT_NOT_FOUND', 'Project does not exist.');
    throw error;
  }
  const files: ProjectBackupFile[] = [];
  try {
    for (const [file, stat] of [...before.files].sort(([a], [b]) => a.localeCompare(b))) {
      const handle = await fs.open(path.join(dir, file), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (signature(await handle.stat({ bigint: true })) !== signature(stat)) changed();
        // A file that grows while reading cannot make readFile allocate past the inventory limit.
        const bytes = Buffer.alloc(Number(stat.size));
        let offset = 0;
        while (offset < bytes.length) {
          const result = await handle.read(bytes, offset, bytes.length - offset, offset);
          if (!result.bytesRead) changed();
          offset += result.bytesRead;
        }
        if (signature(await handle.stat({ bigint: true })) !== signature(stat)) changed();
        files.push({ path: file, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), data: bytes.toString('base64') });
      } finally { await handle.close(); }
    }
    const backup: ProjectBackup = { format: 'muse-project-backup', version: 1, sourceProjectId: projectId, capturedAt: new Date().toISOString(), files };
    validateBackup(backup);
    if (!sameInventory(before, await inventory(dir))) changed();
    return backup;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '')) changed();
    throw error;
  }
}

function remapImageStores(parsed: Map<string, Record<string, unknown>>, files: Map<string, Buffer>, sourceId: string, targetId: string): void {
  const sourcePrefix = `/api/projects/${encodeURIComponent(sourceId)}/assets/images/`;
  const targetPrefix = `/api/projects/${encodeURIComponent(targetId)}/assets/images/`;
  for (const [file, value] of parsed) {
    let modified = false;
    const image = (item: unknown) => {
      if (!record(item) || typeof item.src !== 'string' || !item.src.startsWith(sourcePrefix)) return;
      const name = item.src.slice(sourcePrefix.length);
      if (!/^[^/?#]+\.(png|jpe?g|webp|gif|avif)$/i.test(name)) return;
      item.src = targetPrefix + name;
      modified = true;
    };
    const images = (items: unknown) => { if (Array.isArray(items)) items.forEach(image); };
    if (file === 'canon/canon.json' && Array.isArray(value.entities)) {
      for (const entity of value.entities) {
        if (!record(entity)) continue;
        if (record(entity.character) && record(entity.character.references)) images(entity.character.references.images);
        if (record(entity.world)) images(entity.world.images);
      }
    } else if (file === 'plot/plot.json' && Array.isArray(value.nodes)) {
      for (const node of value.nodes) if (record(node)) images(node.images);
    } else if (file === 'references/references.json' && Array.isArray(value.items)) {
      for (const item of value.items) if (record(item)) images(item.images);
    } else if (file === 'world/map.json') image(value.image);
    if (modified) files.set(file, Buffer.from(JSON.stringify(value, null, 2)));
  }
}

export async function restoreProjectBackup(input: unknown, options: BackupOptions = {}): Promise<ProjectManifest> {
  const { backup, files, manifest, parsedStores } = validateBackup(input);
  if (backup.sourceProjectId.length > 204) invalid('Source project ID is too long to append a restore identity.');
  const id = `${backup.sourceProjectId}-restored-${randomUUID()}`;
  const now = new Date().toISOString();
  const restored: ProjectManifest = { ...manifest, id, name: `${manifest.name} (restored)`, createdAt: now, updatedAt: now };
  files.set('project.json', Buffer.from(JSON.stringify(restored, null, 2)));
  remapImageStores(parsedStores, files, backup.sourceProjectId, id);
  if ([...files.values()].reduce((total, bytes) => total + bytes.length, 0) > MAX_PROJECT_BYTES) tooLarge();

  // No settings reads, directory creation, or writes happen until the archive is fully validated.
  const root = path.resolve(options.workspaceRoot ?? await configuredWorkspaceRoot());
  await fs.mkdir(root, { recursive: true });
  const staging = await fs.mkdtemp(path.join(root, '.muse-restore-'));
  const destination = path.join(root, `${id}.muse`);
  let reservation: BigIntStats | undefined;
  let installed = false;
  try {
    for (const [file, bytes] of files) {
      const target = path.join(staging, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
    }
    // Exclusive reservation prevents rename from replacing an existing (even empty) project.
    try { await fs.mkdir(destination, { mode: 0o700 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new BackupError(409, 'RESTORE_COLLISION', 'Restore destination already exists; retry for a new identity.');
      throw error;
    }
    reservation = await fs.lstat(destination, { bigint: true });
    await fs.rename(staging, destination);
    installed = true;
    return restored;
  } finally {
    if (!installed) {
      await fs.rm(staging, { recursive: true, force: true });
      if (reservation) {
        const current = await fs.lstat(destination, { bigint: true }).catch(() => undefined);
        // Only remove our own empty reservation, never recursively remove a destination.
        if (current?.ino === reservation.ino && current.dev === reservation.dev) await fs.rmdir(destination).catch(() => {});
      }
    }
  }
}
