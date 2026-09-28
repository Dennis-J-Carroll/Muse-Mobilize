import assert from 'node:assert/strict';
import test from 'node:test';
import { composeLogline, promote, keepVariant, removeVariant, emptyPremise } from '../src/premise.ts';

const slots = { protagonist: 'Traven', want: 'to keep his oath', obstacle: 'Creedies Hjaar', stakes: 'the realm falls to a usurper', twist: 'Traven is no true heir' };

test('composeLogline builds one sentence and drops empty slots', () => {
  assert.equal(composeLogline(slots),
    'When Traven wants to keep his oath, Creedies Hjaar stands in the way. If they fail, the realm falls to a usurper. But Traven is no true heir.');
  assert.equal(composeLogline({ ...slots, obstacle: '', twist: '  ' }),
    'When Traven wants to keep his oath. If they fail, the realm falls to a usurper.');
  assert.equal(composeLogline({ protagonist: '', want: '', obstacle: '', stakes: '', twist: '' }), '');
  assert.equal(composeLogline({ ...emptyPremise().slots, twist: 'the ally betrays them' }), 'But the ally betrays them.');
});

test('promote never loses the previous working premise', () => {
  const start = { ...emptyPremise(), working: 'Old premise', variants: [{ id: 'a', text: 'New premise', source: 'muse' as const, createdAt: '2026-09-28T00:00:00.000Z' }] };
  const next = promote(start, 'New premise', () => ({ id: 'n', createdAt: '2026-09-28T01:00:00.000Z' }));
  assert.equal(next.working, 'New premise');
  assert.deepEqual(next.variants.map((v) => v.text), ['Old premise'], 'old working saved; promoted text leaves the list');
  assert.equal(next.variants[0].source, 'manual');
  assert.equal(start.working, 'Old premise', 'input is not mutated');

  const blank = promote(emptyPremise(), 'First', () => ({ id: 'n', createdAt: '' }));
  assert.deepEqual(blank.variants, [], 'an empty working premise is not saved as a variant');

  const same = promote({ ...emptyPremise(), working: 'Same' }, 'Same', () => ({ id: 'n', createdAt: '' }));
  assert.deepEqual(same.variants, [], 're-promoting the current premise adds nothing');
});

test('keepVariant adds newest-first without duplicates; removeVariant drops by id', () => {
  const stamp = () => ({ id: 'k', createdAt: '2026-09-28T00:00:00.000Z' });
  const one = keepVariant(emptyPremise(), '  What if A?  ', 'muse', stamp);
  assert.deepEqual(one.variants.map((v) => [v.text, v.source]), [['What if A?', 'muse']]);
  assert.equal(keepVariant(one, 'What if A?', 'manual', stamp), one, 'duplicate text is a no-op');
  assert.equal(keepVariant(one, '   ', 'manual', stamp), one, 'blank text is a no-op');
  assert.deepEqual(removeVariant(one, 'k').variants, []);
});
