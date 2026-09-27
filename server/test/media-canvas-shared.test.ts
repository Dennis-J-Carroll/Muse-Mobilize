import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanMediaCanvasCamera, cleanMediaCanvasEdgeShape, cleanMediaCanvasNode, clampMediaCanvasScale,
} from '../../shared/mediaCanvas.js';

test('clampMediaCanvasScale bounds to the supported zoom range', () => {
  assert.equal(clampMediaCanvasScale(0), .05);
  assert.equal(clampMediaCanvasScale(100), 4);
  assert.equal(clampMediaCanvasScale(1), 1);
});

test('cleanMediaCanvasCamera falls back to defaults for missing or invalid fields', () => {
  assert.deepEqual(cleanMediaCanvasCamera(undefined), { x: 0, y: 0, scale: 1 });
  assert.deepEqual(cleanMediaCanvasCamera({ x: 12, y: -5, scale: 2 }), { x: 12, y: -5, scale: 2 });
  assert.deepEqual(cleanMediaCanvasCamera({ x: 'nope', y: NaN, scale: -1 }), { x: 0, y: 0, scale: .05 });
});

test('cleanMediaCanvasNode accepts a well-formed node and rejects malformed ones', () => {
  const node = cleanMediaCanvasNode({
    id: 'node-1', kind: 'image', assetSrc: '/api/projects/p/assets/images/a.png',
    label: '  Cover art  ', x: 10, y: 20, width: 200, height: 150,
  });
  assert.deepEqual(node, {
    id: 'node-1', kind: 'image', assetSrc: '/api/projects/p/assets/images/a.png',
    label: 'Cover art', x: 10, y: 20, width: 200, height: 150,
  });

  assert.throws(() => cleanMediaCanvasNode({ kind: 'image', assetSrc: 'x', x: 0, y: 0, width: 100, height: 100 }), /requires an id/);
  assert.throws(() => cleanMediaCanvasNode({ id: 'n', kind: 'movie', assetSrc: 'x', x: 0, y: 0, width: 100, height: 100 }), /kind must be one of/);
  assert.throws(() => cleanMediaCanvasNode({ id: 'n', kind: 'image', assetSrc: '', x: 0, y: 0, width: 100, height: 100 }), /asset reference/);
  assert.throws(() => cleanMediaCanvasNode({ id: 'n', kind: 'image', assetSrc: 'x', x: Infinity, y: 0, width: 100, height: 100 }), /position must be finite/);
  assert.throws(() => cleanMediaCanvasNode({ id: 'n', kind: 'image', assetSrc: 'x', x: 0, y: 0, width: 10, height: 100 }), /dimensions must be between/);
});

test('cleanMediaCanvasNode keeps a valid resumeAt and drops an invalid one', () => {
  const withResume = cleanMediaCanvasNode({ id: 'n', kind: 'video', assetSrc: 'x', x: 0, y: 0, width: 100, height: 100, resumeAt: 42 });
  assert.equal(withResume.resumeAt, 42);
  const withoutResume = cleanMediaCanvasNode({ id: 'n', kind: 'video', assetSrc: 'x', x: 0, y: 0, width: 100, height: 100, resumeAt: -1 });
  assert.equal('resumeAt' in withoutResume, false);
});

test('cleanMediaCanvasEdgeShape requires two distinct node ids', () => {
  assert.deepEqual(cleanMediaCanvasEdgeShape({ fromNodeId: 'a', toNodeId: 'b', label: '  link  ' }), { fromNodeId: 'a', toNodeId: 'b', label: 'link' });
  assert.throws(() => cleanMediaCanvasEdgeShape({ fromNodeId: '', toNodeId: 'b' }), /requires two node ids/);
  assert.throws(() => cleanMediaCanvasEdgeShape({ fromNodeId: 'a', toNodeId: 'a' }), /cannot connect a node to itself/);
});
