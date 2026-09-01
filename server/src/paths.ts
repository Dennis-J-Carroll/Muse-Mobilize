import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

export const CONFIG_DIR = path.join(os.homedir(), '.muse-mobilize');
export const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
export const DEFAULT_WORKSPACE_ROOT = path.join(os.homedir(), 'MuseProjects');

/**
 * Resolve `rel` inside `root` and refuse anything that escapes it.
 * Every filesystem call in this server goes through here — the client
 * supplies project ids and document paths, so they are untrusted input.
 */
export function safeJoin(root: string, rel: string): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, rel);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Path escapes project root: ${rel}`);
  }
  return target;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  );
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
