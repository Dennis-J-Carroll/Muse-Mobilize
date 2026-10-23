import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeWindow, type ResizeEdge } from '../src/windowResize';

const box = { x: 200, y: 150, width: 500, height: 400 };
const viewport = { width: 1440, height: 1000 };
for (const edge of ['n', 'e', 's', 'w', 'nw', 'ne', 'sw', 'se'] as ResizeEdge[]) {
  test(`${edge} resize keeps opposite edges fixed`, () => {
    const next = resizeWindow(box, edge, -30, -20, viewport);
    assert.equal(next.x, edge.includes('w') ? 170 : 200);
    assert.equal(next.y, edge.includes('n') ? 130 : 150);
    assert.equal(next.x + next.width, edge.includes('e') ? 670 : 700);
    assert.equal(next.y + next.height, edge.includes('s') ? 530 : 550);
  });
}
test('clamps minimum size and viewport without moving anchored edges', () => {
  assert.deepEqual(resizeWindow(box, 'nw', 9999, 9999, viewport), { x: 380, y: 350, width: 320, height: 200 });
  assert.deepEqual(resizeWindow(box, 'se', 9999, 9999, viewport), { x: 200, y: 150, width: 1192, height: 842 });
  assert.deepEqual(resizeWindow(box, 'nw', -9999, -9999, viewport), { x: 8, y: 8, width: 692, height: 542 });
});
test('narrow screens retain reachable borders', () => {
  const next = resizeWindow({ x: 8, y: 8, width: 264, height: 300 }, 'se', -999, -999, { width: 320, height: 600 });
  assert.equal(next.width, 264); assert.equal(next.height, 200);
});
