import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { makePassageAnchor } from '../../shared/connections.js';
import type { ConnectionStore, ConnectionTarget, PassageAnchor, StoryAttachment, StoryTag } from '../../shared/connections.js';
import { safeJoin } from './paths.js';
import { readCanon } from './canon.js';
import { readPlot } from './plot.js';
import { readScenes } from './scenes.js';
import { readReferences } from './references.js';
import { readGoals } from './goals.js';
import type { DocumentMeta, ProjectManifest } from './types.js';

export interface AttachConnectionInput {
  target: ConnectionTarget;
  tagId?: string;
  entity?: ConnectionTarget;
  range?: { start: number; end: number; quote: string };
}

const TARGET_KINDS = new Set(['document', 'canon', 'plot', 'scene', 'theme', 'reference', 'goal']);
const storePath = (projectDir: string) => path.join(projectDir, 'connections', 'connections.json');
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && value === value.trim();
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

function labelText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) {
    throw new Error('Tag label must contain 1 to 80 characters');
  }
  return value.trim();
}

function connectionTarget(value: unknown): ConnectionTarget {
  if (!isObject(value) || typeof value.kind !== 'string' || !TARGET_KINDS.has(value.kind) || !isId(value.id)) {
    throw new Error('Connection target requires a supported kind and nonempty id');
  }
  return { kind: value.kind as ConnectionTarget['kind'], id: value.id };
}

function validAnchor(value: unknown): value is PassageAnchor {
  return isObject(value) && Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end)
    && (value.start as number) >= 0 && (value.end as number) > (value.start as number)
    && typeof value.quote === 'string' && value.quote.length === (value.end as number) - (value.start as number)
    && typeof value.prefix === 'string' && typeof value.suffix === 'string';
}

function validateStore(value: unknown): ConnectionStore {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.tags) || !Array.isArray(value.attachments)) {
    throw new Error('Expected version 1 with tags and attachments arrays');
  }
  const tagIds = new Set<string>();
  const labels = new Set<string>();
  for (const tag of value.tags) {
    if (!isObject(tag) || !isId(tag.id) || !isTimestamp(tag.createdAt) || !isTimestamp(tag.updatedAt)) {
      throw new Error('Malformed tag');
    }
    const label = labelText(tag.label);
    if (label !== tag.label || tagIds.has(tag.id) || labels.has(label.toLowerCase())) throw new Error('Duplicate or malformed tag');
    tagIds.add(tag.id);
    labels.add(label.toLowerCase());
  }
  const attachmentIds = new Set<string>();
  for (const attachment of value.attachments) {
    if (!isObject(attachment) || !isId(attachment.id) || !isTimestamp(attachment.createdAt) || attachmentIds.has(attachment.id)) {
      throw new Error('Malformed attachment');
    }
    const target = connectionTarget(attachment.target);
    if ((attachment.tagId !== undefined) === (attachment.entity !== undefined)) throw new Error('Attachment requires exactly one tag or entity');
    if (attachment.tagId !== undefined && (!isId(attachment.tagId) || !tagIds.has(attachment.tagId))) throw new Error('Attachment references an unknown tag');
    if (attachment.entity !== undefined) connectionTarget(attachment.entity);
    if (attachment.anchor !== undefined && (target.kind !== 'document' || !validAnchor(attachment.anchor))) throw new Error('Malformed passage anchor');
    attachmentIds.add(attachment.id);
  }
  return value as unknown as ConnectionStore;
}

export async function readConnections(projectDir: string): Promise<ConnectionStore> {
  const file = storePath(projectDir);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, tags: [], attachments: [] };
    throw error;
  }
  try {
    return validateStore(JSON.parse(raw));
  } catch (error) {
    throw new Error(`Invalid connections store at ${file}: ${(error as Error).message}`, { cause: error });
  }
}

async function persistConnections(projectDir: string, store: ConnectionStore): Promise<void> {
  const file = storePath(projectDir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

// All connection mutations share this queue, including retries after a failed mutation.
const mutationQueues = new Map<string, Promise<void>>();
function mutate<T>(projectDir: string, operation: () => Promise<T>): Promise<T> {
  const key = path.resolve(projectDir);
  const result = (mutationQueues.get(key) ?? Promise.resolve()).then(operation);
  const settled = result.then(() => undefined, () => undefined);
  mutationQueues.set(key, settled);
  void settled.then(() => {
    if (mutationQueues.get(key) === settled) mutationQueues.delete(key);
  });
  return result;
}

export async function createTag(projectDir: string, input: { label: string }): Promise<StoryTag> {
  return mutate(projectDir, async () => {
    const label = labelText(input?.label);
    const store = await readConnections(projectDir);
    const existing = store.tags.find((tag) => tag.label.toLowerCase() === label.toLowerCase());
    if (existing) return existing;
    const now = new Date().toISOString();
    const tag: StoryTag = { id: randomUUID(), label, createdAt: now, updatedAt: now };
    store.tags.push(tag);
    await persistConnections(projectDir, store);
    return tag;
  });
}

export async function renameTag(projectDir: string, tagId: string, input: { label: string }): Promise<StoryTag> {
  return mutate(projectDir, async () => {
    const label = labelText(input?.label);
    const store = await readConnections(projectDir);
    const tag = store.tags.find((item) => item.id === tagId);
    if (!tag) throw new Error(`No such tag: ${tagId}`);
    if (store.tags.some((item) => item.id !== tagId && item.label.toLowerCase() === label.toLowerCase())) {
      throw new Error(`Tag already exists: ${label}`);
    }
    if (tag.label !== label) {
      tag.label = label;
      tag.updatedAt = new Date().toISOString();
      await persistConnections(projectDir, store);
    }
    return tag;
  });
}

async function requireTarget(projectDir: string, target: ConnectionTarget): Promise<DocumentMeta | undefined> {
  let found = false;
  switch (target.kind) {
    case 'document': {
      const manifest = JSON.parse(await fs.readFile(path.join(projectDir, 'project.json'), 'utf8')) as ProjectManifest;
      const document = manifest.documents.find((item) => item.id === target.id);
      if (document) {
        await fs.access(safeJoin(projectDir, document.path));
        return document;
      }
      break;
    }
    case 'canon': found = (await readCanon(projectDir)).entities.some((item) => item.id === target.id); break;
    case 'plot': found = (await readPlot(projectDir)).nodes.some((item) => item.id === target.id); break;
    case 'scene': found = (await readScenes(projectDir)).scenes.some((item) => item.id === target.id); break;
    case 'theme': found = (await readScenes(projectDir)).themes.some((item) => item.id === target.id); break;
    case 'reference': found = (await readReferences(projectDir)).items.some((item) => item.id === target.id); break;
    case 'goal': found = (await readGoals(projectDir)).milestones.some((item) => item.id === target.id); break;
  }
  if (!found) throw new Error(`No such ${target.kind}: ${target.id}`);
  return undefined;
}

export async function attachConnection(projectDir: string, input: AttachConnectionInput): Promise<StoryAttachment> {
  return mutate(projectDir, async () => {
    const target = connectionTarget(input?.target);
    if ((input.tagId !== undefined) === (input.entity !== undefined)) throw new Error('Connection requires exactly one tagId or entity');
    const entity = input.entity === undefined ? undefined : connectionTarget(input.entity);
    if (input.tagId !== undefined && !isId(input.tagId)) throw new Error('A nonempty tagId is required');
    const store = await readConnections(projectDir);
    if (input.tagId !== undefined && !store.tags.some((tag) => tag.id === input.tagId)) throw new Error(`No such tag: ${input.tagId}`);
    const document = await requireTarget(projectDir, target);
    if (entity) await requireTarget(projectDir, entity);
    let anchor: PassageAnchor | undefined;
    if (input.range !== undefined) {
      if (!document || target.kind !== 'document') throw new Error('Passage range is only supported on document targets');
      if (!isObject(input.range) || typeof input.range.quote !== 'string') throw new Error('Passage range requires the selected quote');
      const content = await fs.readFile(safeJoin(projectDir, document.path), 'utf8');
      anchor = makePassageAnchor(content, input.range.start, input.range.end, input.range.quote);
    }
    const existing = store.attachments.find((item) =>
      item.target.kind === target.kind && item.target.id === target.id
      && item.tagId === input.tagId && item.entity?.kind === entity?.kind && item.entity?.id === entity?.id
      && item.anchor?.start === anchor?.start && item.anchor?.end === anchor?.end
      && item.anchor?.quote === anchor?.quote && item.anchor?.prefix === anchor?.prefix && item.anchor?.suffix === anchor?.suffix);
    if (existing) return existing;
    const attachment: StoryAttachment = {
      id: randomUUID(), target,
      ...(input.tagId !== undefined ? { tagId: input.tagId } : { entity: entity! }),
      ...(anchor ? { anchor } : {}),
      createdAt: new Date().toISOString(),
    };
    store.attachments.push(attachment);
    await persistConnections(projectDir, store);
    return attachment;
  });
}

export async function removeConnection(projectDir: string, attachmentId: string): Promise<void> {
  return mutate(projectDir, async () => {
    const store = await readConnections(projectDir);
    const index = store.attachments.findIndex((item) => item.id === attachmentId);
    if (index === -1) return;
    store.attachments.splice(index, 1);
    await persistConnections(projectDir, store);
  });
}
