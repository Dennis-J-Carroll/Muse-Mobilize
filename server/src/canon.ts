import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, exists, slugify } from './paths.js';
import type {
  CanonEntity,
  CanonEntityType,
  CanonEvidence,
  CanonFact,
  CanonStatus,
  CanonStore,
  CharacterProfile,
  CharacterSense,
  CharacterSenseSubtag,
  SenseIndicator,
  WorldProfile,
} from './types.js';

export const CANON_STATUSES: CanonStatus[] = [
  'idea',
  'proposed',
  'established',
  'canonical',
  'retconned',
  'deprecated',
];
export const CANON_ENTITY_TYPES: CanonEntityType[] = [
  'character',
  'location',
  'organization',
  'object',
  'event',
  'rule',
  'lore',
];

const emptyCanon = (): CanonStore => ({ version: 1, entities: [], facts: [] });
const canonPath = (projectDir: string) => path.join(projectDir, 'canon', 'canon.json');
const SENSE_INDICATORS: SenseIndicator[] = ['strength', 'limitation', 'sensitivity', 'preference', 'neutral'];

const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : []).map((item) => String(item).trim()).filter(Boolean);

function cleanSense(value: any): CharacterSense {
  const subtags: CharacterSenseSubtag[] = (Array.isArray(value?.subtags) ? value.subtags : [])
    .map((item: any) => {
      const label = String(item?.label ?? '').trim();
      if (!label) return null;
      const status = CANON_STATUSES.includes(item.status) ? item.status : 'proposed';
      const indicator = SENSE_INDICATORS.includes(item.indicator) ? item.indicator : 'neutral';
      return {
        id: String(item.id ?? '').trim() || slugify(label),
        label,
        value: String(item.value ?? '').trim(),
        indicator,
        status,
        evidence: strings(item.evidence),
      } as CharacterSenseSubtag;
    })
    .filter((item: CharacterSenseSubtag | null): item is CharacterSenseSubtag => Boolean(item));
  return { summary: String(value?.summary ?? '').trim(), subtags };
}

function cleanCharacterProfile(value: any): CharacterProfile {
  return {
    categories: strings(value?.categories),
    attributes: {
      role: String(value?.attributes?.role ?? '').trim(),
      pronouns: String(value?.attributes?.pronouns ?? '').trim(),
      age: String(value?.attributes?.age ?? '').trim(),
      goals: strings(value?.attributes?.goals),
      fears: strings(value?.attributes?.fears),
    },
    physical: {
      description: String(value?.physical?.description ?? '').trim(),
      distinguishingFeatures: strings(value?.physical?.distinguishingFeatures),
      clothing: strings(value?.physical?.clothing),
    },
    senses: {
      vision: cleanSense(value?.senses?.vision),
      audio: cleanSense(value?.senses?.audio),
      proximity: cleanSense(value?.senses?.proximity),
    },
    references: {
      images: (Array.isArray(value?.references?.images) ? value.references.images : [])
        .map((image: any) => ({
          id: String(image?.id ?? '').trim() || randomUUID(),
          src: String(image?.src ?? '').trim(),
          caption: String(image?.caption ?? '').trim(),
          tags: strings(image?.tags),
        }))
        .filter((image: { src: string }) => Boolean(image.src)),
    },
  };
}

function coordinate(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(Math.max(-100000, Math.min(100000, parsed)) * 10) / 10;
}

function cleanWorldProfile(value: any): WorldProfile {
  const referenceDocumentId = String(value?.referenceDocumentId ?? '').trim();
  return {
    categories: strings(value?.categories),
    attributes: {
      era: String(value?.attributes?.era ?? '').trim(),
      atmosphere: String(value?.attributes?.atmosphere ?? '').trim(),
      significance: String(value?.attributes?.significance ?? '').trim(),
    },
    canvas: {
      x: coordinate(value?.canvas?.x),
      y: coordinate(value?.canvas?.y),
    },
    ...(referenceDocumentId ? { referenceDocumentId } : {}),
  };
}

export async function readCanon(projectDir: string): Promise<CanonStore> {
  const file = canonPath(projectDir);
  if (!(await exists(file))) return emptyCanon();
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<CanonStore>;
  return {
    version: 1,
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    facts: Array.isArray(parsed.facts) ? parsed.facts : [],
  };
}

async function writeCanon(projectDir: string, canon: CanonStore): Promise<void> {
  const file = canonPath(projectDir);
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(canon, null, 2) + '\n', 'utf8');
}

function cleanEvidence(evidence: CanonEvidence[] | undefined): CanonEvidence[] {
  return (evidence ?? [])
    .filter((item) => typeof item?.documentId === 'string' && item.documentId.trim())
    .map((item) => ({
      documentId: item.documentId.trim(),
      ...(item.quote?.trim() ? { quote: item.quote.trim() } : {}),
      ...(Number.isInteger(item.start) ? { start: item.start } : {}),
      ...(Number.isInteger(item.end) ? { end: item.end } : {}),
    }));
}

export async function createCanonFact(
  projectDir: string,
  input: {
    subject: string;
    subjectId?: string;
    predicate: string;
    value: string | number | boolean;
    status?: CanonStatus;
    evidence?: CanonEvidence[];
  },
): Promise<CanonFact> {
  const subject = String(input.subject ?? '').trim();
  const predicate = String(input.predicate ?? '').trim();
  if (!subject || !predicate) throw new Error('subject and predicate are required');
  if (input.value === undefined || input.value === null) throw new Error('value is required');
  if (input.status !== undefined && !CANON_STATUSES.includes(input.status)) {
    throw new Error(`status must be one of: ${CANON_STATUSES.join(' | ')}`);
  }
  const now = new Date().toISOString();
  const fact: CanonFact = {
    id: randomUUID(),
    subject,
    ...(input.subjectId?.trim() ? { subjectId: input.subjectId.trim() } : {}),
    predicate,
    value: input.value,
    status: input.status ?? 'proposed',
    evidence: cleanEvidence(input.evidence),
    createdAt: now,
    updatedAt: now,
  };
  const canon = await readCanon(projectDir);
  canon.facts.push(fact);
  await writeCanon(projectDir, canon);
  return fact;
}

export async function createCanonEntity(
  projectDir: string,
  input: { type: CanonEntityType; name: string; aliases?: string[]; summary?: string; character?: CharacterProfile; world?: WorldProfile },
): Promise<CanonEntity> {
  const name = String(input.name ?? '').trim();
  if (!name) throw new Error('entity name is required');
  if (!CANON_ENTITY_TYPES.includes(input.type)) {
    throw new Error(`entity type must be one of: ${CANON_ENTITY_TYPES.join(' | ')}`);
  }
  const now = new Date().toISOString();
  const entity: CanonEntity = {
    id: randomUUID(),
    type: input.type,
    name,
    aliases: (input.aliases ?? []).map((alias) => alias.trim()).filter(Boolean),
    ...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),
    ...(input.type === 'character' && input.character ? { character: cleanCharacterProfile(input.character) } : {}),
    ...(input.type !== 'character' && input.world ? { world: cleanWorldProfile(input.world) } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const canon = await readCanon(projectDir);
  canon.entities.push(entity);
  await writeCanon(projectDir, canon);
  return entity;
}

export async function updateCanonEntity(
  projectDir: string,
  entityId: string,
  patch: Partial<Pick<CanonEntity, 'name' | 'aliases' | 'summary' | 'character' | 'world'>>,
): Promise<CanonEntity> {
  const canon = await readCanon(projectDir);
  const index = canon.entities.findIndex((entity) => entity.id === entityId);
  if (index === -1) throw new Error(`No such canon entity: ${entityId}`);
  const current = canon.entities[index];
  const updated: CanonEntity = {
    ...current,
    ...(patch.name !== undefined ? { name: String(patch.name).trim() } : {}),
    ...(patch.aliases !== undefined ? { aliases: strings(patch.aliases) } : {}),
    ...(patch.summary !== undefined ? { summary: String(patch.summary).trim() || undefined } : {}),
    ...(patch.character !== undefined && current.type === 'character'
      ? { character: cleanCharacterProfile(patch.character) }
      : {}),
    ...(patch.world !== undefined && current.type !== 'character'
      ? { world: cleanWorldProfile(patch.world) }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  if (!updated.name) throw new Error('entity name is required');
  canon.entities[index] = updated;
  await writeCanon(projectDir, canon);
  return updated;
}

export async function updateCanonFact(
  projectDir: string,
  factId: string,
  patch: Partial<Pick<CanonFact, 'subject' | 'subjectId' | 'predicate' | 'value' | 'status' | 'evidence'>>,
): Promise<CanonFact> {
  const canon = await readCanon(projectDir);
  const index = canon.facts.findIndex((fact) => fact.id === factId);
  if (index === -1) throw new Error(`No such canon fact: ${factId}`);
  if (patch.status !== undefined && !CANON_STATUSES.includes(patch.status)) {
    throw new Error(`status must be one of: ${CANON_STATUSES.join(' | ')}`);
  }
  const current = canon.facts[index];
  const updated: CanonFact = {
    ...current,
    ...(patch.subject !== undefined ? { subject: String(patch.subject).trim() } : {}),
    ...(patch.subjectId !== undefined ? { subjectId: String(patch.subjectId).trim() || undefined } : {}),
    ...(patch.predicate !== undefined ? { predicate: String(patch.predicate).trim() } : {}),
    ...(patch.value !== undefined ? { value: patch.value } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.evidence !== undefined ? { evidence: cleanEvidence(patch.evidence) } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (!updated.subject || !updated.predicate) throw new Error('subject and predicate are required');
  canon.facts[index] = updated;
  await writeCanon(projectDir, canon);
  return updated;
}

const CONTEXT_STATUS_ORDER: Record<CanonStatus, number> = {
  canonical: 0,
  established: 1,
  proposed: 2,
  idea: 3,
  retconned: 4,
  deprecated: 5,
};

export function renderCanonContext(canon: CanonStore): string {
  const entities = canon.entities.map((entity) => {
    const aliases = entity.aliases.length ? `; aliases: ${entity.aliases.join(', ')}` : '';
    const summary = entity.summary ? ` — ${entity.summary}` : '';
    const character = entity.character;
    if (!character) {
      const world = entity.world;
      if (!world) return `[ENTITY:${entity.type.toUpperCase()}] ${entity.name}${aliases}${summary}`;
      const categories = world.categories.length ? `\n  categories: ${world.categories.join(', ')}` : '';
      const era = world.attributes.era ? `\n  era: ${world.attributes.era}` : '';
      const atmosphere = world.attributes.atmosphere ? `\n  atmosphere: ${world.attributes.atmosphere}` : '';
      const significance = world.attributes.significance ? `\n  significance: ${world.attributes.significance}` : '';
      return `[ENTITY:${entity.type.toUpperCase()}] ${entity.name}${aliases}${summary}${categories}${era}${atmosphere}${significance}`;
    }
    const categories = character.categories.length ? `\n  categories: ${character.categories.join(', ')}` : '';
    const role = character.attributes.role ? `\n  role: ${character.attributes.role}` : '';
    const senses = (['vision', 'audio', 'proximity'] as const)
      .map((key) => {
        const sense = character.senses[key];
        const subtags = sense.subtags.map((tag) => `${tag.label}=${tag.value || tag.indicator} [${tag.status}]`).join(', ');
        if (!sense.summary && !subtags) return '';
        return `\n  ${key}: ${[sense.summary, subtags].filter(Boolean).join('; ')}`;
      })
      .join('');
    return `[ENTITY:CHARACTER] ${entity.name}${aliases}${summary}${categories}${role}${senses}`;
  });
  const facts = [...canon.facts]
    .sort((a, b) => CONTEXT_STATUS_ORDER[a.status] - CONTEXT_STATUS_ORDER[b.status])
    .map((fact) => {
      const evidence = fact.evidence.map((item) => {
        const quote = item.quote ? ` — “${item.quote}”` : '';
        return `  evidence: ${item.documentId}${quote}`;
      });
      return [`[${fact.status.toUpperCase()}] ${fact.subject} — ${fact.predicate}: ${String(fact.value)}`, ...evidence].join('\n');
    });
  return [...entities, ...facts].join('\n');
}
