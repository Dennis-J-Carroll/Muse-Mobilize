import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMeasure, measureCss } from '../src/writingView.ts';

test('stored measure parses to default, full or a whole number of ch in range', () => {
  assert.equal(parseMeasure(null), null);
  assert.equal(parseMeasure('full'), 'full');
  assert.equal(parseMeasure('90'), 90);
  assert.equal(parseMeasure('45'), 45);
  assert.equal(parseMeasure('120'), 120);
  for (const bad of ['abc', '999', '44', '121', '0', '72.5', '']) assert.equal(parseMeasure(bad), null, bad);
});

test('css value: default leaves the stylesheet fallback, full is 100%, never 0', () => {
  assert.equal(measureCss(null), undefined);
  assert.equal(measureCss('full'), '100%');
  assert.equal(measureCss(90), '90ch');
});
