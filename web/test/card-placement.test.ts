import assert from 'node:assert/strict';
import test from 'node:test';
import { placementBounds, sideBySideBounds } from '../src/cardPlacement.ts';

const viewport = { width: 1280, height: 800, gutter: 48 };

test('halves split the usable desk with an 8px gap', () => {
  assert.deepEqual(placementBounds('left', viewport), { x: 8, y: 8, width: 604, height: 784 });
  assert.deepEqual(placementBounds('right', viewport), { x: 620, y: 8, width: 604, height: 784 });
  assert.deepEqual(placementBounds('top', viewport), { x: 8, y: 8, width: 1216, height: 388 });
  assert.deepEqual(placementBounds('bottom', viewport), { x: 8, y: 404, width: 1216, height: 388 });
});
test('fill covers the usable desk and leaves the recall gutter free', () => {
  assert.deepEqual(placementBounds('fill', viewport), { x: 8, y: 8, width: 1216, height: 784 });
});
test('a narrow viewport never pushes a card off screen', () => {
  const small = { width: 500, height: 400, gutter: 48 };
  for (const placement of ['left', 'right', 'top', 'bottom', 'fill'] as const) {
    const b = placementBounds(placement, small);
    assert.ok(b.x >= 8 && b.y >= 8 && b.x + b.width <= 500 - 48 && b.y + b.height <= 400 - 8, placement);
  }
});
test('side by side tiles equal columns left to right', () => {
  const [a, b, c] = sideBySideBounds(3, viewport);
  assert.equal(a.x, 8);
  assert.equal(a.width, b.width);
  assert.equal(b.x, a.x + a.width + 8);
  assert.equal(c.x + c.width, 1224);
  assert.deepEqual(sideBySideBounds(0, viewport), []);
});
