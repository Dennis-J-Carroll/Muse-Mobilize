import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTags } from '../src/panes/CharactersPane.tsx';

test('parsed sense subtag carries no status or evidence field', () => {
  const [tag] = parseTags('- low light: poor');
  assert.deepEqual(tag, { id: 'low-light-0', label: 'low light', value: 'poor', indicator: 'limitation' });
});

test('parsing does not require or consult prior subtags', () => {
  const tags = parseTags('+ keen ears, ! loud noises');
  assert.deepEqual(tags, [
    { id: 'keen-ears-0', label: 'keen ears', value: '', indicator: 'strength' },
    { id: 'loud-noises-1', label: 'loud noises', value: '', indicator: 'sensitivity' },
  ]);
});
