import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readConstraints, writeConstraints, CONSTRAINT_TEXT_MAX } from '../src/constraints.js';

const temp = async (t: { after: (fn: () => unknown) => void }) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-constraints-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
};

test('a missing constraints store reads as unpinned', async (t) => {
  assert.deepEqual(await readConstraints(await temp(t)), { version: 1, pinned: null });
});

test('writeConstraints keeps one known item per slot, in slot order, and persists', async (t) => {
  const dir = await temp(t);
  const saved = await writeConstraints(dir, {
    pinned: {
      id: '', pinnedAt: 'nope',
      items: [
        { slot: 'pressure', text: ' Someone lies. ', done: 'yes' as any },
        { slot: 'bogus' as any, text: 'dropped', done: false },
        { slot: 'pov', text: 'Tell it from Mara’s point of view.', done: false, entityId: 'mara' },
        { slot: 'pov', text: 'second pov is dropped', done: false },
        { slot: 'place', text: '   ', done: false },
        { slot: 'restriction', text: 'x'.repeat(CONSTRAINT_TEXT_MAX + 20), done: false, entityId: 'y'.repeat(81) },
      ],
    },
  } as any);
  assert.ok(saved.pinned);
  assert.deepEqual(saved.pinned!.items.map((item) => [item.slot, item.done]), [['pov', false], ['restriction', false], ['pressure', true]]);
  assert.equal(saved.pinned!.items[0].entityId, 'mara');
  assert.equal(saved.pinned!.items[1].text.length, CONSTRAINT_TEXT_MAX);
  assert.equal(saved.pinned!.items[1].entityId, undefined, 'over-long entity ids are dropped');
  assert.equal(saved.pinned!.items[2].text, 'Someone lies.');
  assert.ok(saved.pinned!.id, 'pinned sets get an id');
  assert.ok(!Number.isNaN(Date.parse(saved.pinned!.pinnedAt)), 'pinned sets get a timestamp');
  assert.deepEqual(await readConstraints(dir), saved);
});

test('a pinned set with no surviving items, or no pin at all, stores as unpinned', async (t) => {
  const dir = await temp(t);
  assert.deepEqual(await writeConstraints(dir, { pinned: { id: 'a', pinnedAt: '', items: [{ slot: 'pov', text: ' ', done: false }] } } as any), { version: 1, pinned: null });
  assert.deepEqual(await writeConstraints(dir, {} as any), { version: 1, pinned: null });
});
