import assert from 'node:assert/strict';
import test from 'node:test';
import { typewriterScrollTop } from '../src/typewriter.ts';

test('typewriter puts the caret line at the anchor height', () => {
  // caret at 1000, line 30, page 600 tall, anchor .45 → 1000 + 15 − 270
  assert.equal(typewriterScrollTop(1000, 30, 600, 0), 745);
});

test('typewriter leaves the page still while the caret stays on the anchor line', () => {
  assert.equal(typewriterScrollTop(1000, 30, 600, 740), null);
});

test('typewriter never scrolls above the top of the manuscript', () => {
  assert.equal(typewriterScrollTop(40, 30, 600, 100), 0);
  assert.equal(typewriterScrollTop(40, 30, 600, 0), null);
});
