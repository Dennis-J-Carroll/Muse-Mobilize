import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import yaml from 'js-yaml';
import { safeJoin } from './paths.js';

type Snapshot = Map<string, Buffer>;
type Change = { file: string; before: Buffer | null; after: Buffer | null };
interface Entry { id: string; label: string; changes: Change[] }
interface History { undo: Entry[]; redo: Entry[]; message?: string }
export interface HistoryStatus { undo: { id: string; label: string } | null; redo: { id: string; label: string } | null; message?: string }
const histories = new Map<string, History>();
const queues = new Map<string, Promise<unknown>>();
const MAX_BYTES = 64 * 1024 * 1024;
const key = (dir: string, session: string) => JSON.stringify([dir, session]);
const bytes = (entries: Entry[]) => entries.reduce((sum, entry) => sum + entry.changes.reduce((n, c) => n + (c.before?.length ?? 0) + (c.after?.length ?? 0), 0), 0);

/** All HTTP content mutations, including clients without history, share this queue. */
export async function withProjectEdit<T>(dir: string, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(dir) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(action);
  queues.set(dir, pending);
  try { return await pending; } finally { if (queues.get(dir) === pending) queues.delete(dir); }
}

function historyFor(dir: string, session: string): History {
  const id = key(dir, session);
  const value = histories.get(id) ?? { undo: [], redo: [] };
  histories.delete(id); histories.set(id, value);
  // History belongs to the running local server, not to portable story data.
  while (histories.size > 24 || [...histories.values()].reduce((n, h) => n + bytes([...h.undo, ...h.redo]), 0) > MAX_BYTES * 2) {
    const oldest = histories.keys().next().value!;
    if (oldest === id && histories.size === 1) break;
    histories.delete(oldest);
  }
  return value;
}

export function historyStatus(dir: string, session: string): HistoryStatus {
  const h = historyFor(dir, session);
  const brief = (entry?: Entry) => entry ? { id: entry.id, label: entry.label } : null;
  return { undo: brief(h.undo.at(-1)), redo: brief(h.redo.at(-1)), ...(h.message ? { message: h.message } : {}) };
}

async function checkedPath(dir: string, relative: string): Promise<string> {
  const file = safeJoin(dir, relative);
  let current = dir;
  for (const segment of path.relative(dir, file).split(path.sep)) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (stat?.isSymbolicLink()) throw new Error('Undo does not follow symbolic links.');
  }
  return file;
}

async function capture(dir: string, scopes: string[]): Promise<Snapshot> {
  const result: Snapshot = new Map(); let size = 0;
  const visit = async (relative: string) => {
    const file = await checkedPath(dir, relative);
    const stat = await fs.lstat(file).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) return;
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(file)).sort()) if (!name.endsWith('.tmp')) await visit(`${relative}/${name}`);
    } else if (stat.isFile() && !result.has(relative)) {
      size += stat.size;
      if (size > MAX_BYTES / 2 || result.size >= 5000) throw new Error('Change exceeds the session undo limit.');
      result.set(relative, await fs.readFile(file));
    } else if (!stat.isFile()) throw new Error('Undo supports regular project files only.');
  };
  for (const scope of scopes) await visit(scope);
  return result;
}

function comparable(file: string, content: Buffer | null): string | null {
  if (content === null) return null;
  if (file.startsWith('agents/') && /\.ya?ml$/.test(file)) {
    const agent = yaml.load(content.toString()) as any;
    if (agent?.access) delete agent.access.revision;
    return JSON.stringify(agent);
  }
  if (file === 'project.json') {
    const manifest = JSON.parse(content.toString()); delete manifest.updatedAt;
    return JSON.stringify(manifest);
  }
  return content.toString('base64');
}

/** Called inside withProjectEdit. Only successful changed files become an action. */
export async function recordEdit<T>(dir: string, session: string | null, label: string, scopes: string[], action: () => Promise<T>): Promise<T> {
  if (!session) return action();
  const h = historyFor(dir, session);
  let before: Snapshot | null = null;
  try { before = await capture(dir, scopes); } catch { /* Saving must not depend on undo capacity. */ }
  let result: T;
  try { result = await action(); } catch (error) {
    h.undo = []; h.redo = []; h.message = 'Undo history cleared after an unsuccessful save. Check the saved project before continuing.';
    throw error;
  }
  try {
    if (!before) throw new Error('Change exceeds the session undo limit.');
    const after = await capture(dir, scopes);
    const changes = [...new Set([...before.keys(), ...after.keys()])].map((file) => ({ file, before: before!.get(file) ?? null, after: after.get(file) ?? null }))
      .filter((c) => comparable(c.file, c.before) !== comparable(c.file, c.after));
    if (!changes.length) return result;
    h.undo.push({ id: randomUUID(), label, changes }); h.redo = []; h.message = undefined;
    while (h.undo.length > 40 || bytes(h.undo) > MAX_BYTES) h.undo.shift();
    if (!h.undo.length) h.message = 'Saved. This change exceeded the session undo limit.';
  } catch {
    h.undo = []; h.redo = []; h.message = 'Saved. Undo history cleared because this change could not be captured.';
  }
  return result;
}

async function replaceFile(dir: string, file: string, content: Buffer | null) {
  const destination = await checkedPath(dir, file);
  if (content === null) { await fs.rm(destination, { force: true }); return; }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, content); await fs.rename(temporary, destination); }
  finally { await fs.rm(temporary, { force: true }); }
}

function restoredBytes(file: string, content: Buffer | null): Buffer | null {
  if (content === null) return null;
  if (file.startsWith('agents/') && /\.ya?ml$/.test(file)) {
    const agent = yaml.load(content.toString()) as any;
    // Restoring an older permission set is still a new policy revision.
    if (agent?.access) agent.access.revision = randomUUID();
    return Buffer.from(yaml.dump(agent, { lineWidth: 100 }));
  }
  if (file === 'project.json') {
    const manifest = JSON.parse(content.toString()); manifest.updatedAt = new Date().toISOString();
    return Buffer.from(JSON.stringify(manifest, null, 2));
  }
  return content;
}

/** Refuse stale requests and externally changed files before writing anything. */
export async function restoreEdit(dir: string, session: string, direction: 'undo' | 'redo', expectedId: string): Promise<{ label: string; files: string[]; history: HistoryStatus }> {
  return withProjectEdit(dir, async () => {
    const h = historyFor(dir, session);
    const stack = h[direction]; const entry = stack.at(-1);
    if (!entry || entry.id !== expectedId) throw new Error('Undo history changed. Refresh and try again.');
    const expected = direction === 'undo' ? 'after' : 'before';
    const target = direction === 'undo' ? 'before' : 'after';
    const current = new Map<string, Buffer | null>();
    for (const change of entry.changes) {
      const file = await checkedPath(dir, change.file);
      const content = await fs.readFile(file).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
      const retainedAsset = change.file.startsWith('assets/') && change[expected] === null && content?.equals(change[target] ?? Buffer.alloc(0));
      if (!retainedAsset && comparable(change.file, content) !== comparable(change.file, change[expected])) throw new Error('Cannot undo or redo: this saved content changed elsewhere. Your newer work was preserved.');
      current.set(change.file, content);
    }
    const written: string[] = [];
    try {
      for (const change of entry.changes) {
        // Images are immutable uploads. Keep restored bytes even after redo so
        // a newer card in another browser can continue referencing that asset.
        if (change.file.startsWith('assets/') && change[target] === null) continue;
        written.push(change.file);
        await replaceFile(dir, change.file, restoredBytes(change.file, change[target]));
      }
    } catch (error) {
      for (const file of written.reverse()) await replaceFile(dir, file, current.get(file)!);
      throw error;
    }
    stack.pop(); h[direction === 'undo' ? 'redo' : 'undo'].push(entry); h.message = undefined;
    return { label: entry.label, files: entry.changes.map((c) => c.file), history: historyStatus(dir, session) };
  });
}
