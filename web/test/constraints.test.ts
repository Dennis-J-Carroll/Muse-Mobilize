import assert from 'node:assert/strict';
import test from 'node:test';
import { rollSlot, rollAll, SLOT_ORDER, DECK } from '../src/constraints.ts';

const entity = (id: string, type: string, name: string) => ({ id, type, name }) as any;
const canon = [entity('mara', 'character', 'Mara'), entity('tonnell', 'location', 'Tonnell'), entity('hammer', 'object', 'the war hammer'), entity('oath', 'rule', 'Oaths bind by blood')];
/** Deterministic rng cycling through the given values. */
const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

test('canon slots name real entities and carry their id', () => {
  assert.deepEqual(rollSlot('pov', canon, undefined, seq(0)), { slot: 'pov', text: "Tell it from Mara's point of view.", done: false, entityId: 'mara' });
  assert.deepEqual(rollSlot('place', canon, undefined, seq(0)), { slot: 'place', text: 'Set it in Tonnell.', done: false, entityId: 'tonnell' });
  const anchor = rollSlot('anchor', canon, undefined, seq(0));
  assert.equal(anchor.entityId, 'hammer', 'anchor prefers objects');
  assert.match(anchor.text, /the war hammer/i);
});

test('anchor falls back to rules, then every canon slot falls back to the deck', () => {
  const rulesOnly = canon.filter((item) => item.type === 'rule');
  assert.deepEqual(rollSlot('anchor', rulesOnly, undefined, seq(0)), { slot: 'anchor', text: 'The scene must test a rule: Oaths bind by blood.', done: false, entityId: 'oath' });
  for (const slot of ['pov', 'place', 'anchor'] as const) {
    const item = rollSlot(slot, [], undefined, seq(0));
    assert.equal(item.text, DECK[slot][0]);
    assert.equal(item.entityId, undefined);
  }
});

test('a reroll never repeats the text it replaces when there is an alternative', () => {
  const first = DECK.restriction[0];
  for (let i = 0; i < 20; i++) assert.notEqual(rollSlot('restriction', canon, first, seq(0)).text, first);
  const onlyMara = [entity('mara', 'character', 'Mara')];
  assert.equal(rollSlot('pov', onlyMara, "Tell it from Mara's point of view.", seq(0)).text, "Tell it from Mara's point of view.", 'no alternative: same text is allowed');
});

test('rollAll keeps locked slots and returns all five in slot order', () => {
  const current = rollAll(canon, null, new Set(), seq(0.1, 0.6, 0.3, 0.8));
  assert.deepEqual(current.map((item) => item.slot), SLOT_ORDER);
  assert.ok(current.every((item) => item.text && item.done === false));
  const locked = { ...current[1], done: true };
  const next = rollAll(canon, [current[0], locked, ...current.slice(2)], new Set(['place']), seq(0.9, 0.2));
  assert.deepEqual(next[1], locked, 'locked slot is kept exactly');
  assert.deepEqual(next.map((item) => item.slot), SLOT_ORDER);
});

test('the built-in decks are substantial and distinct', () => {
  assert.ok(DECK.restriction.length >= 18 && DECK.pressure.length >= 18);
  for (const slot of ['pov', 'place', 'anchor'] as const) assert.ok(DECK[slot].length >= 5);
  for (const slot of SLOT_ORDER) assert.equal(new Set(DECK[slot]).size, DECK[slot].length, `${slot} deck has duplicates`);
});
