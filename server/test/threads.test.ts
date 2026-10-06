import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  addMessage, completeMuseMessage, createThread, deleteForever, editMessage, listThreads, mergeThreads,
  readThreads, removeMessage, setStatus, setTrashed, ThreadConflictError,
} from '../src/threads.js';
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
  const muse = await addMessage(dir, thread.id, { author: { kind: 'muse', agentId: 'muse' }, text: '', state: 'pending' });
  await assert.rejects(editMessage(dir, thread.id, muse.message.id, { text: 'hijack' }), /Only your own notes/);
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

test('Muse messages complete or fail, and failed ones can be removed for retry', async (t) => {
  const { dir, canon } = await fixture(t);
  const thread = await createThread(dir, { target: canon, text: '@Muse thoughts?' });
  const pending = await addMessage(dir, thread.id, { author: { kind: 'muse', agentId: 'muse' }, text: '', state: 'pending' });
  const done = await completeMuseMessage(dir, thread.id, pending.message.id, { text: 'Pin down her fear.' });
  const reply = done.messages.find((m) => m.id === pending.message.id)!;
  assert.equal(reply.text, 'Pin down her fear.');
  assert.equal(reply.state, undefined);
  const second = await addMessage(dir, thread.id, { author: { kind: 'muse', agentId: 'muse' }, text: '', state: 'pending' });
  const failed = await completeMuseMessage(dir, thread.id, second.message.id, { text: 'provider down', failed: true });
  assert.equal(failed.messages.find((m) => m.id === second.message.id)!.state, 'failed');
  const removed = await removeMessage(dir, thread.id, second.message.id, 'failed');
  assert.equal(removed.messages.some((m) => m.id === second.message.id), false);
  await assert.rejects(removeMessage(dir, thread.id, pending.message.id, 'failed'), /failed/i);
});

test('merge combines same-card threads, keeps the earliest, and refuses mixed cards or pending replies', async (t) => {
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
  const c = await createThread(dir, { target: canon, text: 'c1' });
  await addMessage(dir, c.id, { author: { kind: 'muse', agentId: 'muse' }, text: '', state: 'pending' });
  await assert.rejects(mergeThreads(dir, [a.id, c.id]), /Muse to finish/);
});

test('a malformed store fails loudly instead of being reset', async (t) => {
  const { dir } = await fixture(t);
  await fs.mkdir(path.join(dir, 'threads'));
  await fs.writeFile(path.join(dir, 'threads/threads.json'), '{"version":2}');
  await assert.rejects(readThreads(dir), /Invalid threads store/);
  assert.equal(await fs.readFile(path.join(dir, 'threads/threads.json'), 'utf8'), '{"version":2}');
});
