import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  attachConnection, createTag, readConnections, removeConnection, renameTag,
} from '../src/connections.js';
import { makePassageAnchor, resolvePassageAnchor } from '../../shared/connections.js';
import type { ConnectionTarget } from '../../shared/connections.js';
import { createCanonEntity } from '../src/canon.js';
import { createPlotNode } from '../src/plot.js';
import { createScene, createSceneTheme } from '../src/scenes.js';
import { createReference } from '../src/references.js';
import { writeGoals } from '../src/goals.js';

const documentTarget: ConnectionTarget = { kind: 'document', id: 'chapter-1' };
const manuscript = 'At dawn, Kiala opened the gate. The bells rang.';

async function fixture(t: TestContext) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-connections-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'manuscript'));
  await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify({
    id: 'test-project', name: 'Test', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    documents: [{ id: 'chapter-1', title: 'Chapter 1', kind: 'manuscript', path: 'manuscript/chapter-1.md', order: 0 }],
  }));
  await fs.writeFile(path.join(dir, 'manuscript/chapter-1.md'), manuscript);
  return dir;
}

test('an absent connection store reads empty without writing project files', async (t) => {
  const dir = await fixture(t);
  assert.deepEqual(await readConnections(dir), { version: 1, tags: [], attachments: [] });
  await assert.rejects(fs.access(path.join(dir, 'connections')), { code: 'ENOENT' });
});

test('tag creation trims labels and reuses case-insensitive identity on retry', async (t) => {
  const dir = await fixture(t);
  const tag = await createTag(dir, { label: '  Foreshadowing  ' });
  const retried = await createTag(dir, { label: 'foRESHADOWING' });
  assert.equal(tag.label, 'Foreshadowing');
  assert.equal(retried.id, tag.id);
  assert.deepEqual((await readConnections(dir)).tags, [tag]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'connections/connections.json'), 'utf8')).tags, [tag]);
});

test('renaming a tag preserves its identity and every existing attachment', async (t) => {
  const dir = await fixture(t);
  const tag = await createTag(dir, { label: 'Old label' });
  const attachment = await attachConnection(dir, { target: documentTarget, tagId: tag.id });
  const renamed = await renameTag(dir, tag.id, { label: '  New label  ' });
  assert.equal(renamed.id, tag.id);
  assert.equal(renamed.createdAt, tag.createdAt);
  assert.equal(renamed.label, 'New label');
  assert.deepEqual(await readConnections(dir), { version: 1, tags: [renamed], attachments: [attachment] });
});

test('invalid or colliding tag labels do not change the saved store', async (t) => {
  const dir = await fixture(t);
  const tag = await createTag(dir, { label: 'First' });
  await createTag(dir, { label: 'Second' });
  const before = await fs.readFile(path.join(dir, 'connections/connections.json'), 'utf8');
  for (const label of ['', '  ', 'x'.repeat(81), 12, null]) {
    await assert.rejects(createTag(dir, { label: label as string }));
    await assert.rejects(renameTag(dir, tag.id, { label: label as string }));
  }
  await assert.rejects(renameTag(dir, tag.id, { label: 'SECOND' }), /already exists/i);
  await assert.rejects(renameTag(dir, 'unknown', { label: 'Third' }), /No such tag/i);
  assert.equal(await fs.readFile(path.join(dir, 'connections/connections.json'), 'utf8'), before);
});

test('one tag can attach to each supported persisted record type', async (t) => {
  const dir = await fixture(t);
  const canon = await createCanonEntity(dir, { type: 'character', name: 'Kiala' });
  const plot = await createPlotNode(dir, { title: 'Arrival' });
  const scene = await createScene(dir, { title: 'Gatehouse' });
  const theme = await createSceneTheme(dir, { name: 'Trust' });
  const reference = await createReference(dir, { kind: 'quote', title: 'Epigraph', quote: 'Remember.' });
  const goals = await writeGoals(dir, { milestones: [{ title: 'Finish draft' }] });
  const targets: ConnectionTarget[] = [
    documentTarget, { kind: 'canon', id: canon.id }, { kind: 'plot', id: plot.id },
    { kind: 'scene', id: scene.id }, { kind: 'theme', id: theme.id },
    { kind: 'reference', id: reference.id }, { kind: 'goal', id: goals.milestones[0].id },
  ];
  const tag = await createTag(dir, { label: 'Act one' });
  for (const target of targets) await attachConnection(dir, { target, tagId: tag.id });
  const saved = await readConnections(dir);
  assert.deepEqual(saved.attachments.map((item) => item.target), targets);
  assert.ok(saved.attachments.every((item) => item.tagId === tag.id && !item.entity));
});

test('typed entity links retain both ends for backlinks and deduplicate retries', async (t) => {
  const dir = await fixture(t);
  const canon = await createCanonEntity(dir, { type: 'character', name: 'Kiala' });
  const entity: ConnectionTarget = { kind: 'canon', id: canon.id };
  const input = { target: documentTarget, entity, range: { start: 9, end: 14, quote: 'Kiala' } };
  const attachment = await attachConnection(dir, input);
  assert.deepEqual(await attachConnection(dir, input), attachment);
  const backlinks = (await readConnections(dir)).attachments.filter((item) => item.entity?.id === canon.id);
  assert.deepEqual(backlinks, [attachment]);
  assert.deepEqual(attachment.target, documentTarget);
  assert.equal(attachment.anchor?.quote, 'Kiala');
});

test('attachment removal is persisted and safe to retry', async (t) => {
  const dir = await fixture(t);
  const tag = await createTag(dir, { label: 'Review' });
  const whole = await attachConnection(dir, { target: documentTarget, tagId: tag.id });
  const passage = await attachConnection(dir, { target: documentTarget, tagId: tag.id, range: { start: 9, end: 14, quote: 'Kiala' } });
  await removeConnection(dir, whole.id);
  await removeConnection(dir, whole.id);
  assert.deepEqual((await readConnections(dir)).attachments, [passage]);
  assert.deepEqual((await readConnections(dir)).tags, [tag]);
});

test('invalid targets and destinations cannot create dangling attachments', async (t) => {
  const dir = await fixture(t);
  const tag = await createTag(dir, { label: 'Review' });
  const before = await fs.readFile(path.join(dir, 'connections/connections.json'), 'utf8');
  for (const kind of ['document', 'canon', 'plot', 'scene', 'theme', 'reference', 'goal', 'unsupported']) {
    const missing = { kind, id: 'does-not-exist' } as ConnectionTarget;
    await assert.rejects(attachConnection(dir, { target: missing, tagId: tag.id }));
    await assert.rejects(attachConnection(dir, { target: documentTarget, entity: missing }));
  }
  await assert.rejects(attachConnection(dir, { target: documentTarget, tagId: 'unknown' }));
  await assert.rejects(attachConnection(dir, { target: documentTarget }));
  await assert.rejects(attachConnection(dir, { target: documentTarget, tagId: tag.id, entity: documentTarget }));
  assert.equal(await fs.readFile(path.join(dir, 'connections/connections.json'), 'utf8'), before);
});

test('passage attachments validate the saved text and reject invalid ranges before mutation', async (t) => {
  const dir = await fixture(t);
  const tag = await createTag(dir, { label: 'Review' });
  const before = await fs.readFile(path.join(dir, 'connections/connections.json'), 'utf8');
  const invalid = [
    { start: -1, end: 5, quote: 'At da' }, { start: 9, end: 9, quote: '' },
    { start: 14, end: 9, quote: 'Kiala' }, { start: 9.5, end: 14, quote: 'Kiala' },
    { start: 9, end: 10000, quote: 'Kiala' }, { start: 9, end: 14, quote: 'Other' },
    { start: 9, end: 14, quote: undefined as unknown as string },
  ];
  for (const range of invalid) await assert.rejects(attachConnection(dir, { target: documentTarget, tagId: tag.id, range }));
  const canon = await createCanonEntity(dir, { type: 'character', name: 'Kiala' });
  await assert.rejects(attachConnection(dir, { target: { kind: 'canon', id: canon.id }, tagId: tag.id, range: { start: 0, end: 5, quote: 'Kiala' } }));
  assert.equal(await fs.readFile(path.join(dir, 'connections/connections.json'), 'utf8'), before);
});

test('concurrent mutations preserve every tag and attachment and serialize duplicate retries', async (t) => {
  const dir = await fixture(t);
  const tags = await Promise.all(Array.from({ length: 12 }, (_, i) => createTag(dir, { label: `Tag ${i}` })));
  await Promise.all(tags.flatMap((tag) => [
    attachConnection(dir, { target: documentTarget, tagId: tag.id }),
    attachConnection(dir, { target: documentTarget, tagId: tag.id }),
  ]));
  const saved = await readConnections(dir);
  assert.equal(saved.tags.length, 12);
  assert.equal(saved.attachments.length, 12);
  assert.deepEqual(new Set(saved.attachments.map((item) => item.tagId)), new Set(tags.map((tag) => tag.id)));
  assert.deepEqual(await fs.readdir(path.join(dir, 'connections')), ['connections.json']);
});

test('corrupt stores are reported and preserved instead of silently reset', async (t) => {
  const dir = await fixture(t);
  await fs.mkdir(path.join(dir, 'connections'));
  const file = path.join(dir, 'connections/connections.json');
  for (const corrupt of ['{broken', JSON.stringify({ version: 2, tags: [], attachments: [] }), JSON.stringify({ version: 1, tags: 'bad', attachments: [] })]) {
    await fs.writeFile(file, corrupt);
    await assert.rejects(readConnections(dir), /connection.*store/i);
    await assert.rejects(createTag(dir, { label: 'Fresh' }), /connection.*store/i);
    assert.equal(await fs.readFile(file, 'utf8'), corrupt);
  }
});

test('anchors retain exact text and reject stale quotes or malformed ranges', () => {
  const anchor = makePassageAnchor(manuscript, 9, 14, 'Kiala');
  assert.equal(anchor.quote, 'Kiala');
  assert.equal(anchor.prefix, 'At dawn, ');
  assert.equal(anchor.suffix, ' opened the gate. The bells rang');
  assert.deepEqual(resolvePassageAnchor(manuscript, anchor), { status: 'resolved', start: 9, end: 14 });
  assert.throws(() => makePassageAnchor(manuscript, 9, 14, 'Other'));
  assert.throws(() => makePassageAnchor(manuscript, 9, 9));
  assert.throws(() => makePassageAnchor(manuscript, -1, 14));
});

test('anchors follow earlier insertions when the quote and adjacent context survive', () => {
  const anchor = makePassageAnchor(manuscript, 9, 14);
  assert.deepEqual(resolvePassageAnchor(`Preface. ${manuscript}`, anchor), { status: 'resolved', start: 18, end: 23 });
});

test('context disambiguates repeated quotes without preferring the stale original offset', () => {
  const context = 'A'.repeat(40);
  const content = `${context}Kiala${'B'.repeat(40)}`;
  const anchor = makePassageAnchor(content, 40, 45);
  const changed = `${'X'.repeat(40)}Kiala${'Y'.repeat(40)}\n${content}`;
  assert.deepEqual(resolvePassageAnchor(changed, anchor), { status: 'resolved', start: 126, end: 131 });
  assert.deepEqual(resolvePassageAnchor(`${content}\n${content}`, anchor), { status: 'ambiguous' });
});

test('removed passages never attach to a remaining unique quote with different context', () => {
  const anchor = makePassageAnchor(manuscript, 9, 14);
  assert.deepEqual(resolvePassageAnchor('At dusk, Kiala closed the door.', anchor), { status: 'missing' });
  assert.deepEqual(resolvePassageAnchor('At dawn, Mara opened the gate. The bells rang.', anchor), { status: 'missing' });
});
