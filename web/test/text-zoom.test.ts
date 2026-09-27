import assert from 'node:assert/strict';
import test from 'node:test';
import { parseZoom, stepZoom, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN } from '../src/textZoom.ts';

test('stored zoom is untrusted: anything unexpected falls back to 100%', () => {
  assert.equal(parseZoom(null), ZOOM_DEFAULT);
  assert.equal(parseZoom('abc'), ZOOM_DEFAULT);
  assert.equal(parseZoom('-20'), ZOOM_DEFAULT);
  assert.equal(parseZoom('5000'), ZOOM_DEFAULT);
  assert.equal(parseZoom('150'), 150);
});

test('zoom steps by 10% and stays inside the supported range', () => {
  assert.equal(stepZoom(100, 1), 110);
  assert.equal(stepZoom(100, -1), 90);
  assert.equal(stepZoom(ZOOM_MAX, 1), ZOOM_MAX);
  assert.equal(stepZoom(ZOOM_MIN, -1), ZOOM_MIN);
  assert.equal(stepZoom(113, 1), 120);
});
