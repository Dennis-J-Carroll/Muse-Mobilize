import assert from 'node:assert/strict';
import test from 'node:test';
import { hasMuseMention, splitMentions, mergeThreadMessages, sameTarget, targetKey } from '../../shared/threads.ts';
import type { Thread } from '../../shared/threads.ts';

test('hasMuseMention fires on @Muse at the start or after space, any case, and not inside emails or longer words', () => {
  assert.equal(hasMuseMention('@Muse is her oath too thin?'), true);
  assert.equal(hasMuseMention('what do you think, @MUSE?'), true);
  assert.equal(hasMuseMention('mail bob@muse.com'), false);
  assert.equal(hasMuseMention('see @museum'), false);
  assert.equal(hasMuseMention('no mention here'), false);
});

test('splitMentions marks only the mention and keeps all text', () => {
  const parts = splitMentions('hey @Muse, thoughts?');
  assert.deepEqual(parts, [{ text: 'hey ', mention: false }, { text: '@Muse', mention: true }, { text: ', thoughts?', mention: false }]);
  assert.equal(parts.map((p) => p.text).join(''), 'hey @Muse, thoughts?');
  assert.deepEqual(splitMentions('plain'), [{ text: 'plain', mention: false }]);
  assert.deepEqual(splitMentions(''), []);
});

const msg = (id: string, createdAt: string) => ({ id, author: { kind: 'user' as const }, text: id, createdAt });
const thread = (id: string, messages: ReturnType<typeof msg>[]): Thread => ({
  id, target: { kind: 'canon', id: 'c1' }, status: 'open', messages, createdAt: messages[0].createdAt, updatedAt: messages[0].createdAt,
});

test('mergeThreadMessages interleaves by time and keeps order stable for ties', () => {
  const a = thread('a', [msg('a1', '2026-10-06T10:00:00.000Z'), msg('a2', '2026-10-06T10:05:00.000Z')]);
  const b = thread('b', [msg('b1', '2026-10-06T10:02:00.000Z'), msg('b2', '2026-10-06T10:05:00.000Z')]);
  assert.deepEqual(mergeThreadMessages([a, b]).map((m) => m.id), ['a1', 'b1', 'a2', 'b2']);
});

test('target helpers compare by kind and id', () => {
  assert.equal(targetKey({ kind: 'canon', id: 'x' }), 'canon:x');
  assert.equal(sameTarget({ kind: 'canon', id: 'x' }, { kind: 'canon', id: 'x' }), true);
  assert.equal(sameTarget({ kind: 'canon', id: 'x' }, { kind: 'scene', id: 'x' }), false);
  assert.equal(sameTarget({ kind: 'canon', id: 'x' }, undefined), false);
});
