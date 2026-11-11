import assert from 'node:assert/strict';
import test from 'node:test';
import { IDEA_MAX, titleFromIdea } from '../src/startIdea.ts';

test('titleFromIdea keeps the first five words, title-cased, without trailing punctuation', () => {
  assert.equal(titleFromIdea('a lighthouse keeper hears the sea answer back.'), 'A Lighthouse Keeper Hears The');
  assert.equal(titleFromIdea('Oathbreaker!'), 'Oathbreaker');
});
test('titleFromIdea falls back when nothing usable is left', () => {
  assert.equal(titleFromIdea(''), 'Untitled Story');
  assert.equal(titleFromIdea('  …?!  '), 'Untitled Story');
});
test('titleFromIdea caps the name at 60 characters', () => {
  assert.ok(titleFromIdea('Supercalifragilistic '.repeat(8)).length <= 60);
});
test('IDEA_MAX matches the server premise limit', () => assert.equal(IDEA_MAX, 1200));
