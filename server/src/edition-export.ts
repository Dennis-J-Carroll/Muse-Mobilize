import fs from 'node:fs/promises';
import { constants, type BigIntStats } from 'node:fs';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { safeJoin } from './paths.js';
import { BackupError } from './backups.js';
import { convertManuscript, contentHash, studioId, STUDIO_CONVERSION_VERSION } from './studio-conversion.js';
import { EDITION_IMAGE_NAME, EDITION_MAX_BYTES, parseEditionRecipe, type EditionCatalog, type EditionPreview } from '../../shared/story-edition.js';
import type { ProjectManifest } from './types.js';

const changed = () => new BackupError(409, 'EDITION_CHANGED', 'Selected manuscript, images, or edition changed. Refresh the Story Studio preview.');
const signature = (stat: BigIntStats) => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
const imageUrl = (projectId: string, filename: string) => `/api/projects/${encodeURIComponent(projectId)}/assets/images/${encodeURIComponent(filename)}`;
const mime = (filename: string) => `image/${filename.endsWith('.jpg') ? 'jpeg' : filename.split('.').at(-1)}`;
function tooLarge(actual: number, label: string, largest: { filename: string; size: number }[] = []): never {
  const images = [...largest].sort((a, b) => b.size - a.size).slice(0, 3).map(x => `${x.filename}: ${(x.size / 1024 ** 2).toFixed(2)} MiB`).join('; ');
  throw new BackupError(413, 'EDITION_TOO_LARGE', `${label}: ${actual.toLocaleString()} bytes; Story Studio limit ${EDITION_MAX_BYTES.toLocaleString()} bytes (64 MiB).${images ? ` Largest selected images: ${images}.` : ''} Select fewer images or smaller copies.`);
}
/** Bounded named reads, followed by an identity check for every observed input. */
class EditionFiles {
  signatures = new Map<string, string>();
  constructor(readonly root: string, readonly signal?: AbortSignal) {}
  async stat(relative: string) {
    this.signal?.throwIfAborted();
    if (relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Unsafe edition input path.');
    const parts = relative.split('/');
    for (let index = 0; index <= parts.length; index++) {
      const stat = await fs.lstat(safeJoin(this.root, parts.slice(0, index).join('/')), { bigint: true });
      if (stat.isSymbolicLink() || index < parts.length && !stat.isDirectory()) throw new Error('Edition inputs must not contain symlinks or non-directory parents.');
      if (index === parts.length) return stat;
    }
    throw new Error('Invalid edition path.');
  }
  async read(relative: string, maximum: number): Promise<Buffer> {
    const before = await this.stat(relative);
    if (!before.isFile()) throw new Error('Edition inputs must be regular files.');
    const size = Number(before.size);
    if (size > maximum) throw new BackupError(413, 'EDITION_TOO_LARGE', `${relative}: ${size.toLocaleString()} bytes; remaining input budget ${maximum.toLocaleString()} bytes. Reduce selected manuscript or image size.`);
    const handle = await fs.open(safeJoin(this.root, relative), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (signature(await handle.stat({ bigint: true })) !== signature(before)) throw changed();
      const bytes = Buffer.alloc(size);
      for (let offset = 0; offset < size;) {
        this.signal?.throwIfAborted();
        const part = await handle.read(bytes, offset, Math.min(256 * 1024, size - offset), offset);
        if (!part.bytesRead) throw changed();
        offset += part.bytesRead;
      }
      if (signature(await handle.stat({ bigint: true })) !== signature(before) || signature(await this.stat(relative)) !== signature(before)) throw changed();
      this.signatures.set(relative, signature(before));
      return bytes;
    } finally { await handle.close(); }
  }
  async verify() {
    for (const [file, expected] of this.signatures) if (signature(await this.stat(file)) !== expected) throw changed();
  }
}
const decode = (bytes: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
async function manifest(files: EditionFiles, sourceId: string): Promise<ProjectManifest> {
  const value = JSON.parse(decode(await files.read('project.json', 16 * 1024 ** 2))) as ProjectManifest;
  if (value.id !== sourceId || !Array.isArray(value.documents)) throw new Error('Invalid source project metadata.');
  if (new Set(value.documents.map(doc => doc.id)).size !== value.documents.length) throw new Error('Duplicate source document IDs.');
  return value;
}
export async function editionCatalog(root: string, sourceId: string): Promise<EditionCatalog> {
  const files = new EditionFiles(root), project = await manifest(files, sourceId);
  const images: EditionCatalog['images'] = [];
  try {
    const directory = await files.stat('assets/images');
    if (!directory.isDirectory()) throw new Error('Managed images must be a directory.');
    const names = await fs.readdir(path.join(root, 'assets/images'));
    if (names.length > 10_000) throw new Error('Managed image directory exceeds 10,000 entries.');
    for (const filename of names.sort()) if (EDITION_IMAGE_NAME.test(filename)) {
      const stat = await files.stat(`assets/images/${filename}`);
      if (stat.isFile()) images.push({ filename, size: Number(stat.size), src: imageUrl(sourceId, filename) });
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return { documents: project.documents.filter(doc => doc.kind === 'manuscript').sort((a,b) => a.order-b.order).map(({ id, title }) => ({ id, title })), images };
}
export async function buildEdition(root: string, sourceId: string, input: unknown, options: {
  expectedHash?: string; acknowledgeWarnings?: boolean; exporting?: boolean; signal?: AbortSignal;
  afterCapture?: () => Promise<void>;
} = {}) {
  const recipe = parseEditionRecipe(input), files = new EditionFiles(root, options.signal), project = await manifest(files, sourceId);
  const selected = recipe.documentIds.map(id => {
    const doc = project.documents.find(doc => doc.id === id && doc.kind === 'manuscript');
    if (!doc || typeof doc.path !== 'string' || !/^manuscript\/.+\.(md|markdown|txt)$/i.test(doc.path)) throw new Error(`Saved manuscript missing or unsupported: ${id}. Refresh the edition selection.`);
    return doc;
  });
  const imageSizes = new Map<string, number>();
  for (const image of recipe.images) if (!imageSizes.has(image.filename)) {
    const stat = await files.stat(`assets/images/${image.filename}`);
    if (!stat.isFile()) throw new Error(`Selected image is not a regular file: ${image.filename}`);
    imageSizes.set(image.filename, Number(stat.size));
  }
  const largest = [...imageSizes].map(([filename, size]) => ({ filename, size }));
  const encodedImages = recipe.images.reduce((sum, image) => sum + 4 * Math.ceil(imageSizes.get(image.filename)! / 3), 0);
  if (encodedImages > EDITION_MAX_BYTES) tooLarge(encodedImages, 'Encoded selected images', largest);
  const documents: { id: string; title: string; sha256: string; content: string }[] = [];
  let inputBytes = 0;
  for (const doc of selected) {
    const bytes = await files.read(doc.path, EDITION_MAX_BYTES - inputBytes);
    inputBytes += bytes.length;
    documents.push({ id: doc.id, title: doc.title, sha256: contentHash(bytes), content: decode(bytes) });
  }
  const images = new Map<string, { data: string; sha256: string; size: number }>();
  for (const [filename] of imageSizes) {
    const bytes = await files.read(`assets/images/${filename}`, EDITION_MAX_BYTES);
    if (bytes.length !== imageSizes.get(filename)) throw changed();
    images.set(filename, { data: bytes.toString('base64'), sha256: contentHash(bytes), size: bytes.length });
  }
  const recipeHash = contentHash(JSON.stringify(recipe));
  const documentHashes = documents.map(({ id, title, sha256 }) => ({ id, title, sha256 }));
  const snapshotHash = contentHash(JSON.stringify({ version: STUDIO_CONVERSION_VERSION, sourceId, recipeHash, documents: documentHashes, images: [...images].map(([name, image]) => [name, image.sha256]) }));
  if (options.expectedHash !== undefined && options.expectedHash !== snapshotHash) throw changed();
  const capturedAt = new Date().toISOString();
  const warnings: EditionPreview['warnings'] = [];
  const scenes: EditionPreview['scenes'] = [];
  for (const doc of documents) {
    await setImmediate(); options.signal?.throwIfAborted();
    const converted = convertManuscript(doc.content, `${sourceId}:${recipe.id}:${doc.id}`);
    warnings.push(...converted.warnings.map(message => ({ documentId: doc.id, title: doc.title, message })));
    scenes.push({ id: studioId('scene', sourceId, recipe.id, doc.id), documentId: doc.id, title: doc.title, blocks: converted.blocks,
      images: recipe.images.filter(image => image.documentId === doc.id).map(image => ({ ...image, src: imageUrl(sourceId, image.filename), size: images.get(image.filename)!.size })) });
  }
  if (options.exporting && warnings.length && options.acknowledgeWarnings !== true) throw new BackupError(409, 'EDITION_ACK_REQUIRED', 'Review and acknowledge formatting warnings before exporting.');
  const assets = recipe.images.map(image => ({ id: studioId('asset', sourceId, recipe.id, image.id), name: image.filename, kind: 'image', mime: mime(image.filename), size: images.get(image.filename)!.size, source: 'embedded', url: '', dataUrl: `data:${mime(image.filename)};base64,${images.get(image.filename)!.data}`, alt: image.alt, caption: image.caption, role: 'visual', createdAt: capturedAt }));
  const portable = {
    schemaVersion: '1.4.0', appVersion: '1.4.0',
    project: { id: studioId('project', sourceId, recipe.id), title: recipe.title, author: recipe.author, subtitle: '', contentRating: '', advisory: '', createdAt: capturedAt, updatedAt: capturedAt },
    entrySceneId: scenes[0].id,
    theme: { accent: '#e49a48', background: '#110c08', text: '#efe0c6', muted: '#b39978', readerFont: 'Georgia', uiFont: 'Inter', readerTheme: 'parchment' },
    settings: { revealMode: 'still', textDelayMs: 0, mediaDelayMs: 0, choiceDelayMs: 0, showStats: false, allowBack: true, autosavePlayerProgress: true, offerNarration: false },
    variables: [], assets,
    scenes: scenes.map((scene, index) => ({ id: scene.id, title: scene.title, chapter: '', kicker: '', location: '', time: '', authorNotes: '',
      nextSceneId: scenes[index + 1]?.id || '', ending: index === scenes.length - 1, blocks: scene.blocks, choices: [], world: { imageAssetId: '', hotspots: [] },
      media: { items: scene.images.map((image, order) => ({ id: studioId('media', sourceId, recipe.id, image.id), assetId: studioId('asset', sourceId, recipe.id, image.id), role: 'visual', cue: 'after-text', playback: 'once', volume: 1, order })) },
    })),
    museOrigin: { sourceProjectId: sourceId, editionId: recipe.id, recipeHash, snapshotHash, documentHashes, conversionVersion: STUDIO_CONVERSION_VERSION, mapping: scenes.map(scene => ({ documentId: scene.documentId, sceneId: scene.id })) },
  };
  const json = JSON.stringify(portable);
  const encodedBytes = Buffer.byteLength(json);
  if (encodedBytes > EDITION_MAX_BYTES) tooLarge(encodedBytes, 'Encoded Story Studio file', largest);
  await options.afterCapture?.(); await files.verify();
  options.signal?.throwIfAborted();
  return { json, preview: { snapshotHash, recipeHash, capturedAt, encodedBytes, warnings, scenes } satisfies EditionPreview };
}
