import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCanonEntity, cleanCharacterProfile, cleanWorldProfile, readCanon, updateCanonEntity } from '../src/canon.js';
import { createScene, readScenes } from '../src/scenes.js';
import { createPlotNode, readPlot } from '../src/plot.js';
import { applyRecordProposal, previewRecordProposal } from '../src/record-proposals.js';
import { historyStatus, restoreEdit, withProjectEdit } from '../src/history.js';
import { RECORD_FIELDS, type RecordKind } from '../../shared/record-proposals.js';

async function fixture(t: any) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-record-proposals-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const character = await createCanonEntity(dir, { type: 'character', name: 'Witness', summary: 'Original function.', character: cleanCharacterProfile({ attributes: { goals: ['Survive'], fears: ['Forget'] }, senses: { vision: { summary: 'Sharp sight', subtags: [{ id: 'eye', label: 'Left eye', value: 'cloudy' }] } } }) });
  const world = await createCanonEntity(dir, { type: 'location', name: 'Harbour', summary: 'Original harbour.', world: cleanWorldProfile({ attributes: { era: 'Late empire', atmosphere: 'Cold', significance: 'Trade' }, canvas: { x: 52, y: 79 }, referenceDocumentId: 'lore-doc' }) });
  const plot = await createPlotNode(dir, { title: 'Betrayal', summary: 'Original beat.', position: { x: 30, y: 40 }, worldRefs: [{ entityId: world.id, role: 'setting' }], details: { goal: 'Survive', conflict: 'Oath', stakes: 'Lives', outcome: 'Flight', notes: 'Keep this' } });
  const scene = await createScene(dir, { title: 'Hearing', summary: 'Original scene.', purpose: 'Pressure.', status: 'drafting', assets: [{ kind: 'character', refId: character.id, role: 'present' }], beats: [{ id: 'beat', title: 'Arrival', summary: 'Doors open', order: 0 }], dialogue: [{ id: 'line', speakerId: character.id, text: 'I swear.', subtext: '', knowledgeState: '', voiceStatus: 'unchecked', voiceNote: '', order: 0 }] });
  const records = { characters: character, world, plot, scenes: scene };
  const read = async (kind: RecordKind) => kind === 'characters' || kind === 'world'
    ? (await readCanon(dir)).entities.find(item => item.id === records[kind].id)!
    : kind === 'plot' ? (await readPlot(dir)).nodes[0] : (await readScenes(dir)).scenes[0];
  return { dir, records, read };
}

for (const kind of Object.keys(RECORD_FIELDS) as RecordKind[]) test(`${kind}: every allowed field patches one leaf and preserves surrounding records`, async t => {
  const f = await fixture(t);
  for (const field of RECORD_FIELDS[kind]) {
    const original = await f.read(kind);
    const proposal = await previewRecordProposal(f.dir, { kind, recordId: original.id, field: field.id, mode: 'replace', excerpt: field.list ? 'First, with comma\nSecond\nSecond' : 'Reviewed change.' });
    assert.deepEqual(await f.read(kind), original, 'Preview must not write');
    await applyRecordProposal(f.dir, 'review-session', proposal);
    const saved = await f.read(kind);
    const expected: any = structuredClone(original);
    const keys = field.id.split('.'); let parent = expected;
    for (const key of keys.slice(0, -1)) parent = parent[key];
    parent[keys.at(-1)!] = field.list ? ['First, with comma', 'Second'] : 'Reviewed change.';
    expected.updatedAt = saved.updatedAt;
    assert.deepEqual(saved, expected);
  }
});

test('stale/repeated proposals reject without clearing Undo; Undo and Redo restore exact content', async t => {
  const f = await fixture(t); const original = f.records.characters;
  const proposal = await previewRecordProposal(f.dir, { kind: 'characters', recordId: original.id, field: 'character.attributes.goals', mode: 'append', excerpt: 'Survive\nExpose the oath' });
  assert.deepEqual(proposal.after, ['Survive', 'Expose the oath']);
  const accepted = await Promise.allSettled([applyRecordProposal(f.dir, 'review-session', proposal), applyRecordProposal(f.dir, 'review-session', proposal)]);
  assert.equal(accepted.filter(result => result.status === 'fulfilled').length, 1);
  const undo = historyStatus(f.dir, 'review-session').undo!;
  await restoreEdit(f.dir, 'review-session', 'undo', undo.id);
  assert.deepEqual(await f.read('characters'), original);
  await restoreEdit(f.dir, 'review-session', 'redo', historyStatus(f.dir, 'review-session').redo!.id);
  assert.deepEqual((await f.read('characters') as typeof original).character!.attributes.goals, ['Survive', 'Expose the oath']);
  const pending = await previewRecordProposal(f.dir, { ...proposal, field: 'summary', excerpt: 'New summary.' });
  await withProjectEdit(f.dir, () => updateCanonEntity(f.dir, original.id, { aliases: ['A newer name'] }));
  await assert.rejects(applyRecordProposal(f.dir, 'review-session', pending), /changed after preview/);
  assert.equal((await f.read('characters') as typeof original).summary, original.summary);
});

test('invalid paths, wrong record kinds, empty/oversized text, and missing records cannot write', async t => {
  const f = await fixture(t);
  const input = { kind: 'characters', recordId: f.records.characters.id, field: 'summary', mode: 'replace', excerpt: 'New' };
  for (const patch of [{ field: '__proto__.polluted' }, { field: 'name' }, { field: 'character.references.images' }, { kind: '__proto__' }, { kind: 'world' }, { excerpt: '' }, { excerpt: 'x'.repeat(12001) }, { recordId: 'missing' }]) {
    await assert.rejects(previewRecordProposal(f.dir, { ...input, ...patch }));
  }
  assert.deepEqual(await f.read('characters'), f.records.characters);
  assert.equal(historyStatus(f.dir, 'review-session').undo, null);
});

test('legacy records without profiles gain complete defaults when first nested field is accepted', async t => {
  const f = await fixture(t);
  for (const [type, kind, field] of [['character', 'characters', 'character.attributes.role'], ['location', 'world', 'world.attributes.era']] as const) {
    const entity = await createCanonEntity(f.dir, { type, name: 'Legacy' });
    const proposal = await previewRecordProposal(f.dir, { kind, recordId: entity.id, field, mode: 'replace', excerpt: 'New baseline' });
    await applyRecordProposal(f.dir, 'review-session', proposal);
    const saved = (await readCanon(f.dir)).entities.find(item => item.id === entity.id)!;
    if (type === 'character') { assert.deepEqual(saved.character!.references.images, []); assert.equal(saved.character!.attributes.role, 'New baseline'); }
    else { assert.deepEqual(saved.world!.canvas, { x: 0, y: 0 }); assert.equal(saved.world!.attributes.era, 'New baseline'); }
  }
});
