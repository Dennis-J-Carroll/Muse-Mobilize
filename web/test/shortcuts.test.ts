import assert from 'node:assert/strict';
import test from 'node:test';
import { matchShortcut, SHORTCUTS } from '../src/shortcuts.ts';

const key = (code: string, extra: Partial<Parameters<typeof matchShortcut>[0]> = {}) =>
  ({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, code, ...extra });

test('Alt+Shift combinations map to actions by physical key', () => {
  assert.deepEqual(matchShortcut(key('KeyF')), { kind: 'focus-toggle' });
  assert.deepEqual(matchShortcut(key('KeyD')), { kind: 'desk-switcher' });
  assert.deepEqual(matchShortcut(key('Slash')), { kind: 'legend' });
  assert.deepEqual(matchShortcut(key('Digit0')), { kind: 'desk-previous' });
  assert.deepEqual(matchShortcut(key('Digit1')), { kind: 'desk', index: 0 });
  assert.deepEqual(matchShortcut(key('Digit9')), { kind: 'desk', index: 8 });
});

test('other modifiers, composition and handled events never match', () => {
  assert.equal(matchShortcut(key('KeyF', { shiftKey: false })), null);
  assert.equal(matchShortcut(key('Digit1', { shiftKey: false })), null); // Alt+1 is floating-card recall
  assert.equal(matchShortcut(key('KeyF', { ctrlKey: true })), null);
  assert.equal(matchShortcut(key('KeyF', { metaKey: true })), null);
  assert.equal(matchShortcut(key('KeyF', { isComposing: true })), null);
  assert.equal(matchShortcut(key('KeyF', { defaultPrevented: true })), null);
  assert.equal(matchShortcut(key('KeyK')), null); // Story cards stay owned by App.tsx
});

test('registry lists every shortcut the legend must show, grouped', () => {
  const ids = SHORTCUTS.map((item) => item.id);
  for (const id of ['focus-toggle', 'focus-exit', 'undo', 'tag', 'story-cards', 'ask-muse', 'desk-n', 'desk-previous', 'desk-switcher', 'recall-card', 'legend']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(SHORTCUTS.every((item) => item.group === 'Writing' || item.group === 'Desks and cards'));
});
