import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { cleanStoryImages } from './assets.js';
import { ensureDir, exists } from './paths.js';
import type {
  ReferenceStore,
  StoryEntityKind,
  StoryEntityRef,
  StoryReference,
  StoryReferenceKind,
} from './types.js';

const REFERENCE_KINDS: StoryReferenceKind[] = ['image', 'quote', 'link'];
const ENTITY_KINDS: StoryEntityKind[] = ['canon', 'plot', 'scene', 'theme', 'document'];
const referencePath = (projectDir: string) => path.join(projectDir, 'references', 'references.json');
const emptyReferences = (): ReferenceStore => ({ version: 1, items: [] });
const text = (value: unknown) => String(value ?? '').trim();
const MANAGED_IMAGE = /^\/api\/projects\/[^/?#]+\/assets\/images\/[^/?#]+\.(png|jpe?g|webp|gif|avif)$/i;

function cleanHttpUrl(value: unknown, field: string): string {
  const candidate = text(value);
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname) return candidate;
  } catch {
    // Fall through to one stable validation error.
  }
  throw new Error(`${field} must be empty or an http(s) URL`);
}

function cleanReferenceImages(value: unknown): StoryReference['images'] {
  return cleanStoryImages(value).map((image) => {
    if (MANAGED_IMAGE.test(image.src)) return image;
    try {
      return { ...image, src: cleanHttpUrl(image.src, 'reference image') };
    } catch {
      throw new Error('reference image must use a managed project image or http(s) URL');
    }
  });
}

function cleanEntityRefs(value: unknown): StoryEntityRef[] {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : []).flatMap((item: any) => {
    const kind = item?.kind as StoryEntityKind;
    const refId = text(item?.refId);
    if (!ENTITY_KINDS.includes(kind)) {
      throw new Error(`story entity kind must be one of: ${ENTITY_KINDS.join(' | ')}`);
    }
    if (!refId || seen.has(`${kind}:${refId}`)) return [];
    seen.add(`${kind}:${refId}`);
    return [{ kind, refId }];
  });
}

export async function readReferences(projectDir: string): Promise<ReferenceStore> {
  const file = referencePath(projectDir);
  if (!(await exists(file))) return emptyReferences();
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<ReferenceStore>;
  return { version: 1, items: Array.isArray(parsed.items) ? parsed.items : [] };
}

async function writeReferences(projectDir: string, references: ReferenceStore): Promise<void> {
  const file = referencePath(projectDir);
  await ensureDir(path.dirname(file));
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(references, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

type ReferenceInput = {
  kind: StoryReferenceKind;
  title: string;
  images?: StoryReference['images'];
  quote?: string;
  url?: string;
  attribution?: string;
  sourceUrl?: string;
  notes?: string;
  entityRefs?: StoryEntityRef[];
};

export async function createReference(projectDir: string, input: ReferenceInput): Promise<StoryReference> {
  if (!REFERENCE_KINDS.includes(input.kind)) {
    throw new Error(`reference kind must be one of: ${REFERENCE_KINDS.join(' | ')}`);
  }
  const title = text(input.title);
  if (!title) throw new Error('reference title is required');
  const now = new Date().toISOString();
  const reference: StoryReference = {
    id: randomUUID(),
    kind: input.kind,
    title,
    images: cleanReferenceImages(input.images),
    quote: text(input.quote),
    url: cleanHttpUrl(input.url, 'reference URL'),
    attribution: text(input.attribution),
    sourceUrl: cleanHttpUrl(input.sourceUrl, 'source URL'),
    notes: text(input.notes),
    entityRefs: cleanEntityRefs(input.entityRefs),
    createdAt: now,
    updatedAt: now,
  };
  const references = await readReferences(projectDir);
  references.items.push(reference);
  await writeReferences(projectDir, references);
  return reference;
}

export async function updateReference(
  projectDir: string,
  referenceId: string,
  patch: Partial<Omit<StoryReference, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<StoryReference> {
  const references = await readReferences(projectDir);
  const index = references.items.findIndex((item) => item.id === referenceId);
  if (index === -1) throw new Error(`No such reference: ${referenceId}`);
  if (patch.kind !== undefined && !REFERENCE_KINDS.includes(patch.kind)) {
    throw new Error(`reference kind must be one of: ${REFERENCE_KINDS.join(' | ')}`);
  }
  const current = references.items[index];
  const updated: StoryReference = {
    ...current,
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.title !== undefined ? { title: text(patch.title) } : {}),
    ...(patch.images !== undefined ? { images: cleanReferenceImages(patch.images) } : {}),
    ...(patch.quote !== undefined ? { quote: text(patch.quote) } : {}),
    ...(patch.url !== undefined ? { url: cleanHttpUrl(patch.url, 'reference URL') } : {}),
    ...(patch.attribution !== undefined ? { attribution: text(patch.attribution) } : {}),
    ...(patch.sourceUrl !== undefined ? { sourceUrl: cleanHttpUrl(patch.sourceUrl, 'source URL') } : {}),
    ...(patch.notes !== undefined ? { notes: text(patch.notes) } : {}),
    ...(patch.entityRefs !== undefined ? { entityRefs: cleanEntityRefs(patch.entityRefs) } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (!updated.title) throw new Error('reference title is required');
  references.items[index] = updated;
  await writeReferences(projectDir, references);
  return updated;
}

export async function deleteReference(projectDir: string, referenceId: string): Promise<StoryReference> {
  const references = await readReferences(projectDir);
  const index = references.items.findIndex((item) => item.id === referenceId);
  if (index === -1) throw new Error(`No such reference: ${referenceId}`);
  const [removed] = references.items.splice(index, 1);
  await writeReferences(projectDir, references);
  return removed;
}
