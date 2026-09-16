import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinchCamera, zoomCamera } from '../src/atlasCamera';
import { emptyValueHistory, rememberValue, travelValue } from '../src/editHistory';

test('pinch zoom keeps world point beneath moving midpoint and supports zooming back out', () => {
  const origin = { x: 20, y: 30, scale: .5 };
  const next = pinchCamera(origin, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 70, y: 130 }, { x: 270, y: 130 }]);
  assert.equal(next.scale, 1);
  assert.equal((170 - next.x) / next.scale, (150 - origin.x) / origin.scale);
  assert.equal((130 - next.y) / next.scale, (100 - origin.y) / origin.scale);
  const back = pinchCamera(next, [{ x: 70, y: 130 }, { x: 270, y: 130 }], [{ x: 100, y: 100 }, { x: 200, y: 100 }]);
  assert.deepEqual(back, origin);
});

test('camera clamps extremes without losing its anchor or producing NaN', () => {
  assert.deepEqual(zoomCamera({ x: 0, y: 0, scale: 1 }, 50, { x: 100, y: 100 }), { x: -100, y: -100, scale: 2 });
  assert.equal(zoomCamera({ x: 0, y: 0, scale: .01 }, .00001, { x: 0, y: 0 }).scale, .001);
  assert.ok(Object.values(pinchCamera({ x: 0, y: 0, scale: 1 }, [{ x: 1, y: 1 }, { x: 1, y: 1 }], [{ x: 1, y: 1 }, { x: 2, y: 2 }])).every(Number.isFinite));
});

test('typing groups, pause boundaries, redo, and edits after undo preserve expected writing', () => {
  let history = rememberValue(emptyValueHistory<string>(), '', 1000);
  history = rememberValue(history, 'a', 1200);
  history = rememberValue(history, 'ab', 2200);
  const undone = travelValue(history, 'abc', 'undo')!;
  assert.equal(undone.value, 'ab');
  assert.equal(travelValue(undone.history, undone.value, 'redo')!.value, 'abc');
  const branch = rememberValue(undone.history, undone.value, 2300);
  assert.equal(branch.future.length, 0);
  assert.equal(travelValue(branch, 'branch', 'undo')!.value, 'ab');
});
