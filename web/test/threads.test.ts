import assert from 'node:assert/strict';
import test from 'node:test';
import { canCombine, cardLabel, filterThreads, openCount, placePopover, relativeTime, threadsForTarget } from '../src/threadView.ts';
import type { Thread } from '../../shared/threads.ts';

const T0 = '2026-10-06T10:00:00.000Z';
const make = (id: string, over: Partial<Thread> = {}): Thread => ({
  id, target: { kind: 'canon', id: 'mara' }, status: 'open', createdAt: T0, updatedAt: T0,
  messages: [{ id: `${id}-m`, author: { kind: 'user' }, text: id, createdAt: T0 }], ...over,
});

test('threadsForTarget hides trash and lists open before resolved, newest first', () => {
  const list = [
    make('old-open', { createdAt: '2026-10-06T09:00:00.000Z' }),
    make('resolved', { status: 'resolved', createdAt: '2026-10-06T11:00:00.000Z' }),
    make('new-open', { createdAt: '2026-10-06T10:30:00.000Z' }),
    make('trashed', { trashedAt: T0 }),
    make('elsewhere', { target: { kind: 'scene', id: 's1' } }),
  ];
  assert.deepEqual(threadsForTarget(list, { kind: 'canon', id: 'mara' }).map((t) => t.id), ['new-open', 'old-open', 'resolved']);
  assert.equal(openCount(list, { kind: 'canon', id: 'mara' }), 2);
});

test('filterThreads: session keeps notes touched since start, trash is its own lane', () => {
  const list = [
    make('before', { updatedAt: '2026-10-06T09:00:00.000Z' }),
    make('during', { updatedAt: '2026-10-06T10:30:00.000Z' }),
    make('done', { status: 'resolved', updatedAt: '2026-10-06T10:31:00.000Z' }),
    make('bin', { trashedAt: T0, updatedAt: '2026-10-06T10:32:00.000Z' }),
  ];
  const ids = (f: Parameters<typeof filterThreads>[1]) => filterThreads(list, f, T0).map((t) => t.id);
  assert.deepEqual(ids('session'), ['during', 'done']);
  assert.deepEqual(ids('open'), ['before', 'during']);
  assert.deepEqual(ids('resolved'), ['done']);
  assert.deepEqual(ids('all'), ['before', 'during', 'done']);
  assert.deepEqual(ids('trash'), ['bin']);
});

test('canCombine needs two or more live notes on one card', () => {
  assert.equal(canCombine([make('a')]).ok, false);
  assert.equal(canCombine([make('a'), make('b')]).ok, true);
  const mixed = canCombine([make('a'), make('b', { target: { kind: 'scene', id: 's1' } })]);
  assert.deepEqual([mixed.ok, mixed.reason], [false, 'Combine works within one card']);
  assert.equal(canCombine([make('a'), make('b', { trashedAt: T0 })]).ok, false);
});

test('placePopover goes beside the card when there is room, else overlaps its right edge, always on screen', () => {
  assert.deepEqual(placePopover({ left: 100, top: 80, right: 500, bottom: 600 }, 1400, 900), { left: 508, top: 80 });
  assert.deepEqual(placePopover({ left: 600, top: 80, right: 1300, bottom: 600 }, 1400, 900), { left: 952, top: 80 });
  assert.deepEqual(placePopover({ left: 0, top: 700, right: 300, bottom: 890 }, 1400, 900, 340, 420), { left: 308, top: 472 });
});

test('relativeTime reads like a margin comment', () => {
  const now = Date.parse('2026-10-06T12:00:00.000Z');
  assert.equal(relativeTime('2026-10-06T11:59:40.000Z', now), 'just now');
  assert.equal(relativeTime('2026-10-06T11:48:00.000Z', now), '12m ago');
  assert.equal(relativeTime('2026-10-06T09:00:00.000Z', now), '3h ago');
  assert.equal(relativeTime('2026-10-04T12:00:00.000Z', now), '2d ago');
});

test('cardLabel returns null for a card that no longer exists', () => {
  const records = [{ target: { kind: 'canon' as const, id: 'mara' }, label: 'Mara', group: 'Character' }];
  assert.deepEqual(cardLabel(records, { kind: 'canon', id: 'mara' }), { label: 'Mara', group: 'Character' });
  assert.equal(cardLabel(records, { kind: 'canon', id: 'gone' }), null);
});
