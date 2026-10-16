import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { resourceKey, type BinderRecipe } from '../../shared/project-tools.js';
import { projectResources, resourceContent } from './project-resources.js';
import { projectDir } from './projects.js';
import { safeJoin } from './paths.js';

export const MAX_BINDER_BYTES = 65 * 1024 * 1024;
export function binderTooLarge(): never {
  throw new Error('Selected binder content exceeds 65 MiB. Select fewer sections or omit images; full-project backup size does not limit readable exports.');
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const changed = () => new Error('Selected binder content changed during capture. Refresh the preview.');

/** Reads only named inputs, rejects links, and checks sizes before allocating buffers. */
export class BinderFiles {
  private bytes = 0;
  constructor(private readonly root: string) {}

  async stat(relative: string) {
    if (relative && (relative.includes('\\') || relative.split('/').some((p) => !p || p === '.' || p === '..'))) {
      throw new Error('Unsafe binder file path.');
    }
    const parts = relative ? relative.split('/') : [];
    for (let i = 0; i <= parts.length; i++) {
      const stat = await fs.lstat(safeJoin(this.root, parts.slice(0, i).join('/')), { bigint: true });
      if (stat.isSymbolicLink() || (i < parts.length && !stat.isDirectory())) throw new Error('Binder inputs must not contain symlinks or non-directory parents.');
      if (i === parts.length) return stat;
    }
    throw new Error('Invalid binder path.');
  }

  async read(relative: string): Promise<Buffer> {
    const before = await this.stat(relative);
    if (!before.isFile()) throw new Error('Binder inputs must be regular files.');
    const size = Number(before.size);
    this.bytes += size;
    if (this.bytes > MAX_BINDER_BYTES) binderTooLarge();
    const signature = (s: typeof before) => [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':');
    const handle = await fs.open(safeJoin(this.root, relative), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (signature(await handle.stat({ bigint: true })) !== signature(before)) throw changed();
      const bytes = Buffer.alloc(size);
      let offset = 0;
      while (offset < size) {
        const result = await handle.read(bytes, offset, size - offset, offset);
        if (!result.bytesRead) throw changed();
        offset += result.bytesRead;
      }
      if (signature(await handle.stat({ bigint: true })) !== signature(before)
        || signature(await this.stat(relative)) !== signature(before)) throw changed();
      return bytes;
    } finally { await handle.close(); }
  }

  /** Existing catalog readers load metadata, never source originals or asset bodies. */
  async guardCatalog() {
    const paths = ['project.json', 'canon/canon.json', 'plot/plot.json', 'scenes/scenes.json',
      'references/references.json', 'goals/goals.json', 'world/map.json', 'connections/connections.json', 'sources/index.json'];
    try {
      const stat = await this.stat('agents');
      if (!stat.isDirectory()) throw new Error('Agent directory must be a directory.');
      for (const name of await fs.readdir(safeJoin(this.root, 'agents'))) {
        if (/\.ya?ml$/i.test(name)) paths.push(`agents/${name}`);
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    let bytes = 0;
    for (const file of paths) {
      try {
        const stat = await this.stat(file);
        if (!stat.isFile()) throw new Error('Binder catalog inputs must be regular files.');
        bytes += Number(stat.size);
        if (bytes > MAX_BINDER_BYTES) binderTooLarge();
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }
}

/** Fingerprint render inputs, including recipe/order, missing records, and image bytes. */
export async function captureBinder(projectId: string, recipe: BinderRecipe, snapshotDir?: string) {
  const files = new BinderFiles(snapshotDir ?? await projectDir(projectId));
  await files.guardCatalog();
  const catalog = await projectResources(projectId, snapshotDir);
  const warnings = new Set<string>();
  const selected = recipe.sections.map((section) => section.selection.mode === 'all'
    ? catalog.filter((r) => r.kind === section.kind)
    : section.selection.ids.flatMap((id) => {
      const record = catalog.find((r) => r.kind === section.kind && r.id === id);
      if (!record) warnings.add(`${section.title}: missing record ${id}.`);
      return record ? [record] : [];
    }));
  const keys = new Set(selected.flat().map(resourceKey));
  const contents = new Map<string, Awaited<ReturnType<typeof resourceContent>>>();
  const images = new Map<string, { data: string; sha256: string } | null>();
  let contentBytes = 0;
  for (const record of selected.flat()) {
    const key = resourceKey(record);
    if (contents.has(key)) continue;
    const content = await resourceContent(projectId, record, keys, catalog, async (relative) => (await files.read(relative)).toString('utf8'));
    contentBytes += Buffer.byteLength(content.text);
    if (contentBytes > MAX_BINDER_BYTES) binderTooLarge();
    contents.set(key, content);
    if (!recipe.includeImages) continue;
    for (const img of content.images) {
      const name = localImageName(projectId, img.src);
      if (!name || images.has(name)) continue;
      try {
        const bytes = await files.read(`assets/images/${name}`);
        contentBytes += 4 * Math.ceil(bytes.length / 3);
        if (contentBytes > MAX_BINDER_BYTES) binderTooLarge();
        images.set(name, { data: bytes.toString('base64'), sha256: hash(bytes) });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        images.set(name, null);
      }
    }
  }
  // Omitted count is visible in the receipt. Omitted content and asset bytes are not inputs.
  // Hash each unique body once: repeated sections must not multiply snapshot memory.
  const contentHashes = new Map([...contents].map(([key, content]) => [key, hash(JSON.stringify(content))]));
  const fingerprint = hash(JSON.stringify({
    renderer: 'muse-binder-2', recipe, catalogCount: catalog.length, warnings: [...warnings],
    sections: selected.map((records) => records.map((record) => ({
      key: resourceKey(record), title: record.title, detail: record.detail,
      contentHash: contentHashes.get(resourceKey(record)),
      links: (record.required ?? []).filter((ref) => keys.has(resourceKey(ref)))
        .map((ref) => [resourceKey(ref), catalog.find((r) => resourceKey(r) === resourceKey(ref))?.title ?? ref.id]),
    }))),
    images: [...images].map(([name, image]) => [name, image?.sha256 ?? null]),
  }));
  return { catalog, selected, keys, contents, images, warnings, fingerprint, capturedAt: new Date().toISOString() };
}

export function localImageName(projectId: string, src?: string): string | null {
  const prefix = `/api/projects/${projectId}/assets/images/`;
  const name = src?.startsWith(prefix) ? src.slice(prefix.length) : '';
  return /^[a-f0-9-]{36}\.(png|jpg|webp|gif|avif)$/.test(name) ? name : null;
}
