import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldGuard } from '../src/selectionGuard.ts';

const text = 'one two three four five six seven eight';
test('guards Space and Enter over a selection of more than five words', () => {
  const end = text.indexOf('seven');
  assert.equal(shouldGuard(text, 0, end, 'insertText', ' '), true);
  assert.equal(shouldGuard(text, 0, end, 'insertParagraph', null), true);
  assert.equal(shouldGuard(text, 0, end, 'insertLineBreak', null), true);
});
test('leaves small selections, other characters, deletes and pastes alone', () => {
  const end = text.indexOf('seven');
  assert.equal(shouldGuard(text, 0, text.indexOf('three'), 'insertText', ' '), false); // two words
  assert.equal(shouldGuard(text, 0, end, 'insertText', 'a'), false);
  assert.equal(shouldGuard(text, 0, end, 'deleteContentBackward', null), false);
  assert.equal(shouldGuard(text, 0, end, 'insertFromPaste', null), false);
  assert.equal(shouldGuard(text, 5, 5, 'insertText', ' '), false);
});
