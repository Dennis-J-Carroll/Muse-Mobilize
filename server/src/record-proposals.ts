import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { recordRejectable, withProjectEdit } from './history.js';
import { cleanCharacterProfile, cleanWorldProfile } from './canon.js';
import { isRecordKind, PROPOSAL_TEXT_MAX, RECORD_FIELDS, type FieldValue, type RecordKind, type RecordProposal, type RecordProposalInput } from '../../shared/record-proposals.js';

const locations: Record<RecordKind, { file: string; collection: string }> = {
  characters: { file: 'canon/canon.json', collection: 'entities' }, world: { file: 'canon/canon.json', collection: 'entities' },
  scenes: { file: 'scenes/scenes.json', collection: 'scenes' }, plot: { file: 'plot/plot.json', collection: 'nodes' },
};
export class RecordProposalError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function inputFrom(value: any): RecordProposalInput {
  const kind: unknown = value?.kind;
  if (!isRecordKind(kind)) throw new RecordProposalError('Choose a supported record kind.');
  if (typeof value.recordId !== 'string' || !value.recordId || value.recordId.length > 200
    || typeof value.field !== 'string' || !RECORD_FIELDS[kind].some(field => field.id === value.field)
    || !['append', 'replace'].includes(value.mode) || typeof value.excerpt !== 'string' || !value.excerpt.trim()
    || value.excerpt.trim().length > PROPOSAL_TEXT_MAX) {
    throw new RecordProposalError(`Choose a supported record and field, with 1–${PROPOSAL_TEXT_MAX} characters of text.`);
  }
  return { kind, recordId: value.recordId, field: value.field, mode: value.mode, excerpt: value.excerpt.trim() };
}

async function readTarget(dir: string, input: RecordProposalInput) {
  const location = locations[input.kind];
  let store: any;
  try { store = JSON.parse(await fs.readFile(path.join(dir, location.file), 'utf8')); }
  catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  const record = store?.[location.collection]?.find((item: any) => item.id === input.recordId);
  if (!record || (input.kind === 'characters' && record.type !== 'character') || (input.kind === 'world' && record.type === 'character')) {
    throw new RecordProposalError('This record is no longer available. Choose another record.', 409);
  }
  const revision = createHash('sha256').update(dir).update(input.kind).update(JSON.stringify(record)).digest('hex');
  return { location, store, record, revision };
}

function proposalFor(input: RecordProposalInput, record: any, revision: string): RecordProposal {
  const field = RECORD_FIELDS[input.kind].find(field => field.id === input.field)!;
  const raw = input.field.split('.').reduce((value, key) => value?.[key], record);
  const before: FieldValue = field.list ? (Array.isArray(raw) ? raw : []) : (typeof raw === 'string' ? raw : '');
  let after: FieldValue;
  if (field.list) {
    // Newlines are deliberate item boundaries; commas may belong to the prose.
    const lines = input.excerpt.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    after = [...new Set([...(input.mode === 'append' ? before as string[] : []), ...lines])];
  } else {
    after = input.mode === 'append' && before ? `${before}\n\n${input.excerpt}` : input.excerpt;
  }
  if (JSON.stringify(after) === JSON.stringify(before)) throw new RecordProposalError('This field already contains that text. No change to apply.');
  return { ...input, revision, title: record.name ?? record.title, fieldLabel: field.label, before, after };
}

export async function previewRecordProposal(dir: string, value: unknown): Promise<RecordProposal> {
  const input = inputFrom(value);
  return withProjectEdit(dir, async () => { const { record, revision } = await readTarget(dir, input); return proposalFor(input, record, revision); });
}

/** Validate inside the same queue as other project writes; only an allowlisted leaf changes. */
export async function applyRecordProposal(dir: string, session: string | null, value: unknown): Promise<RecordProposal> {
  const input = inputFrom(value);
  const expected = (value as RecordProposal).revision;
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) throw new RecordProposalError('Preview this field change before applying.');
  const location = locations[input.kind];
  const field = RECORD_FIELDS[input.kind].find(field => field.id === input.field)!;
  return recordRejectable(dir, session, `Apply Muse proposal: ${field.label}`, [location.file], async () => {
    const { record, store, revision } = await readTarget(dir, input);
    if (revision !== expected) throw new RecordProposalError('Record changed after preview. Preview again before applying.', 409);
    const proposal = proposalFor(input, record, revision);
    if (input.field.startsWith('character.') && !record.character) record.character = cleanCharacterProfile({});
    if (input.field.startsWith('world.') && !record.world) record.world = cleanWorldProfile({});
    const keys = input.field.split('.');
    let parent = record;
    for (const key of keys.slice(0, -1)) parent = parent[key] ??= {};
    parent[keys.at(-1)!] = proposal.after;
    record.updatedAt = new Date().toISOString();
    const file = path.join(dir, location.file);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(store, null, 2) + '\n', 'utf8'); await fs.rename(temporary, file); }
    finally { await fs.rm(temporary, { force: true }); }
    return proposal;
  });
}
