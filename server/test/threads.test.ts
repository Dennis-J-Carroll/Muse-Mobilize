import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  addMessage, addMuseMessage, createThread, deleteForever, editMessage, listThreads, mergeThreads,
  readThreads, setConnections, setStatus, setTrashed, ThreadConflictError,
} from '../src/threads.js';
import { createTag } from '../src/connections.js';
import { createCanonEntity } from '../src/canon.js';
import { createPlotNode } from '../src/plot.js';

async function fixture(t: TestContext) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-threads-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify({
    id: 'test-project', name: 'Test', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', documents: [],
  }));
  const mara = await createCanonEntity(dir, { type: 'character', name: 'Mara' });
  const arrival = await createPlotNode(dir, { title: 'Arrival' });
  return { dir, canon: { kind: 'canon' as const, id: mara.id }, plot: { kind: 'plot' as const, id: arrival.id } };
}

test('an absent store reads empty without writing files', async (t) => {
  const { dir } = await fixture(t);
  assert.deepEqual(await readThreads(dir), { version: 1, threads: [] });
  await assert.rejects(fs.access(path.join(dir, 'threads')), { code: 'ENOENT' });
});

test('createThread trims text, requires a real card, and persists', async (t) => {
  const { dir, canon } = await fixture(t);
  const thread = await createThread(dir, { target: canon, text: '  her oath feels thin  ' });
  assert.equal(thread.status, 'open');
  assert.equal(thread.messages.length, 1);
  assert.equal(thread.messages[0].text, 'her oath feels thin');
  assert.deepEqual(thread.messages[0].author, { kind: 'user' });
  assert.deepEqual((await listThreads(dir, canon)).map((x) => x.id), [thread.id]);
  await assert.rejects(createThread(dir, { target: { kind: 'canon', id: 'nope' }, text: 'x' }), /No such canon/);
});

test('empty, whitespace-only, and oversize notes are rejected', async (t) => {
  const { dir, canon } = await fixture(t);
  await assert.rejects(createThread(dir, { target: canon, text: '   ' }), /cannot be empty/);
  await assert.rejects(createThread(dir, { target: canon, text: 'x'.repeat(4001) }), /at most 4000/);
  const thread = await createThread(dir, { target: canon, text: 'ok' });
  await assert.rejects(addMessage(dir, thread.id, { author: { kind: 'user' }, text: '' }), /cannot be empty/);
  assert.deepEqual((await readThreads(dir)).threads.length, 1);
});

test('concurrent writes all persist', async (t) => {
  const { dir, canon } = await fixture(t);
  const thread = await createThread(dir, { target: canon, text: 'first' });
  await Promise.all([
    addMessage(dir, thread.id, { author: { kind: 'user' }, text: 'second' }),
    addMessage(dir, thread.id, { author: { kind: 'user' }, text: 'third' }),
    setStatus(dir, thread.id, 'resolved'),
  ]);
  const [stored] = (await readThreads(dir)).threads;
  assert.equal(stored.messages.length, 3);
  assert.equal(stored.status, 'resolved');
});

test('status, edit, and stale-write conflict', async (t) => {
  const { dir, canon } = await fixture(t);
  const thread = await createThread(dir, { target: canon, text: 'note' });
  const resolved = await setStatus(dir, thread.id, 'resolved', thread.updatedAt);
  assert.equal(resolved.status, 'resolved');
  await assert.rejects(setStatus(dir, thread.id, 'open', thread.updatedAt), ThreadConflictError);
  const edited = await editMessage(dir, thread.id, thread.messages[0].id, { text: 'note, revised' });
  assert.equal(edited.messages[0].text, 'note, revised');
  assert.ok(edited.messages[0].editedAt);
  const withMuse = await addMuseMessage(dir, thread.id, { agentId: 'muse', text: 'a reply' });
  await assert.rejects(editMessage(dir, thread.id, withMuse.messages.at(-1)!.id, { text: 'hijack' }), /Only your own notes/);
});

test('trashed threads take no replies; delete forever needs trash first', async (t) => {
  const { dir, canon } = await fixture(t);
  const thread = await createThread(dir, { target: canon, text: 'note' });
  await assert.rejects(deleteForever(dir, thread.id), /trash/i);
  const trashed = await setTrashed(dir, thread.id, true);
  assert.ok(trashed.trashedAt);
  await assert.rejects(addMessage(dir, thread.id, { author: { kind: 'user' }, text: 'more' }), /Restore/);
  const restored = await setTrashed(dir, thread.id, false);
  assert.equal(restored.trashedAt, undefined);
  await setTrashed(dir, thread.id, true);
  await deleteForever(dir, thread.id);
  assert.deepEqual((await readThreads(dir)).threads, []);
});

test('Muse replies append atomically; a failed reply is replaced in one write, never stacked', async (t) => {
  const { dir, canon } = await fixture(t);
  const thread = await createThread(dir, { target: canon, text: '@Muse thoughts?' });
  const replied = await addMuseMessage(dir, thread.id, { agentId: 'muse', text: 'Pin down her fear.' });
  assert.deepEqual(replied.messages.at(-1)!.author, { kind: 'muse', agentId: 'muse' });
  assert.equal(replied.messages.at(-1)!.state, undefined);
  const failed = await addMuseMessage(dir, thread.id, { agentId: 'muse', text: 'provider down', failed: true });
  const failedId = failed.messages.at(-1)!.id;
  assert.equal(failed.messages.at(-1)!.state, 'failed');
  const retried = await addMuseMessage(dir, thread.id, { agentId: 'muse', text: 'second try', replacingMessageId: failedId });
  assert.equal(retried.messages.length, 3, 'user note + first reply + replacement; failed one is gone');
  assert.equal(retried.messages.some((m) => m.id === failedId), false);
  await assert.rejects(addMuseMessage(dir, thread.id, { agentId: 'muse', text: 'x', replacingMessageId: replied.messages[1].id }), /failed Muse reply/);
  assert.equal((await readThreads(dir)).threads[0].messages.length, 3, 'a rejected replacement changes nothing');
  await setTrashed(dir, thread.id, true);
  await assert.rejects(addMuseMessage(dir, thread.id, { agentId: 'muse', text: 'late' }), /Restore/);
});

test('merge combines same-card threads, keeps the earliest, and refuses mixed cards', async (t) => {
  const { dir, canon, plot } = await fixture(t);
  const a = await createThread(dir, { target: canon, text: 'a1' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const b = await createThread(dir, { target: canon, text: 'b1' });
  const other = await createThread(dir, { target: plot, text: 'plot note' });
  await assert.rejects(mergeThreads(dir, [a.id, other.id]), /within one card/);
  await assert.rejects(mergeThreads(dir, [a.id]), /at least two/i);
  const merged = await mergeThreads(dir, [b.id, a.id]);
  assert.equal(merged.id, a.id);
  assert.deepEqual(merged.messages.map((m) => m.text), ['a1', 'b1']);
  assert.deepEqual(merged.mergedFrom, [b.id]);
  assert.deepEqual((await listThreads(dir, canon)).map((x) => x.id), [a.id]);
});

test('a malformed store fails loudly instead of being reset', async (t) => {
  const { dir } = await fixture(t);
  await fs.mkdir(path.join(dir, 'threads'));
  await fs.writeFile(path.join(dir, 'threads/threads.json'), '{"version":2}');
  await assert.rejects(readThreads(dir), /Invalid threads store/);
  assert.equal(await fs.readFile(path.join(dir, 'threads/threads.json'), 'utf8'), '{"version":2}');
});

test('notes take tags and links; unknown or self links are refused; limits and duplicates are enforced', async (t) => {
  const { dir, canon, plot } = await fixture(t);
  const fear = await createTag(dir, { label: 'fear' });
  const thread = await createThread(dir, { target: canon, text: 'note' });
  const tagged = await setConnections(dir, thread.id, { tagIds: [fear.id, fear.id], links: [plot, plot] });
  assert.deepEqual(tagged.tagIds, [fear.id]);
  assert.deepEqual(tagged.links, [plot]);
  await assert.rejects(setConnections(dir, thread.id, { tagIds: ['nope'] }), /No such tag/);
  await assert.rejects(setConnections(dir, thread.id, { links: [canon] }), /its own card/);
  await assert.rejects(setConnections(dir, thread.id, { links: [{ kind: 'plot', id: 'gone' }] }), /No such plot/);
  await assert.rejects(setConnections(dir, thread.id, { tagIds: Array.from({ length: 13 }, (_, i) => `t${i}`) }), /at most 12/);
  const cleared = await setConnections(dir, thread.id, { tagIds: [], links: [] });
  assert.equal(cleared.tagIds, undefined);
  assert.equal(cleared.links, undefined);
});

test('a tag that disappeared (created then undone) is dropped, not a lock on the note', async (t) => {
  const { dir, canon } = await fixture(t);
  const fear = await createTag(dir, { label: 'fear' });
  const thread = await createThread(dir, { target: canon, text: 'note' });
  await setConnections(dir, thread.id, { tagIds: [fear.id] });
  await fs.rm(path.join(dir, 'connections'), { recursive: true });
  const next = await createTag(dir, { label: 'pacing' });
  const resaved = await setConnections(dir, thread.id, { tagIds: [fear.id, next.id] });
  assert.deepEqual(resaved.tagIds, [next.id], 'the vanished tag is dropped; the new one is kept');
});

test('a link to a card that was removed stays on the note instead of blocking edits', async (t) => {
  const { dir, canon, plot } = await fixture(t);
  const thread = await createThread(dir, { target: canon, text: 'note' });
  await setConnections(dir, thread.id, { links: [plot] });
  await fs.rm(path.join(dir, 'plot'), { recursive: true });
  const fear = await createTag(dir, { label: 'fear' });
  const resaved = await setConnections(dir, thread.id, { tagIds: [fear.id], links: [plot] });
  assert.deepEqual(resaved.links, [plot]);
  assert.deepEqual(resaved.tagIds, [fear.id]);
});

test('create accepts tags and links; merge unions them', async (t) => {
  const { dir, canon, plot } = await fixture(t);
  const fear = await createTag(dir, { label: 'fear' });
  const pace = await createTag(dir, { label: 'pacing' });
  const a = await createThread(dir, { target: canon, text: 'a', tagIds: [fear.id] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const b = await createThread(dir, { target: canon, text: 'b', tagIds: [pace.id, fear.id], links: [plot] });
  const merged = await mergeThreads(dir, [a.id, b.id]);
  assert.deepEqual(merged.tagIds, [fear.id, pace.id]);
  assert.deepEqual(merged.links, [plot]);
});

test('an old store file without the new fields still reads', async (t) => {
  const { dir, canon } = await fixture(t);
  const thread = await createThread(dir, { target: canon, text: 'note' });
  const stored = (await readThreads(dir)).threads[0];
  assert.equal(stored.tagIds, undefined);
  assert.equal(stored.id, thread.id);
});

async function withDocument(dir: string) {
  await fs.mkdir(path.join(dir, 'manuscript'), { recursive: true });
  await fs.writeFile(path.join(dir, 'manuscript/one.md'), 'Mara lit the lantern at dusk.');
  await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify({ id: 'test-project', name: 'Test', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    documents: [{ id: 'one', title: 'One', kind: 'manuscript', path: 'manuscript/one.md', order: 0 }] }));
  return { kind: 'document' as const, id: 'one' };
}

test('a passage note stores an anchor built from the saved text; stale, empty and non-document ranges are refused', async (t) => {
  const { dir, canon } = await fixture(t);
  const doc = await withDocument(dir);
  const start = 'Mara lit the '.length;
  const thread = await createThread(dir, { target: doc, text: 'why a lantern?', range: { start, end: start + 7, quote: 'lantern' } });
  assert.equal(thread.anchor?.quote, 'lantern');
  assert.equal(thread.anchor?.start, start);
  await assert.rejects(createThread(dir, { target: doc, text: 'x', range: { start, end: start + 7, quote: 'lanterns' } }), /no longer matches/);
  await assert.rejects(createThread(dir, { target: doc, text: 'x', range: { start: 3, end: 3, quote: '' } }), /nonempty/);
  await assert.rejects(createThread(dir, { target: canon, text: 'x', range: { start: 0, end: 1, quote: 'a' } }), /document/);
  const whole = await createThread(dir, { target: doc, text: 'whole document note' });
  assert.equal(whole.anchor, undefined);
});

test('combine refuses different passages of one document', async (t) => {
  const { dir } = await fixture(t);
  const doc = await withDocument(dir);
  const a = await createThread(dir, { target: doc, text: 'a', range: { start: 0, end: 4, quote: 'Mara' } });
  const b = await createThread(dir, { target: doc, text: 'b', range: { start: 13, end: 20, quote: 'lantern' } });
  await assert.rejects(mergeThreads(dir, [a.id, b.id]), /within one passage/);
});
