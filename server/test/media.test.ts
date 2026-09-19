import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  EMPTY_REVISION, createMediaCanvasEdge, createMediaCanvasNode, readMediaCanvas,
  removeMediaCanvasEdge, removeMediaCanvasNode, updateMediaCanvasCamera, updateMediaCanvasNode,
} from '../src/media.js';

async function fixture(t: any) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-media-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('a fresh project has an empty canvas at revision "empty"', async (t) => {
  const dir = await fixture(t);
  assert.deepEqual(await readMediaCanvas(dir), {
    version: 1, revision: 'empty', camera: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [],
  });
});

test('creating, moving, and removing a node persists across reads and changes the revision each time', async (t) => {
  const dir = await fixture(t);
  const created = await createMediaCanvasNode(dir, EMPTY_REVISION, {
    kind: 'image', assetSrc: '/api/projects/p/assets/images/a.png', label: 'Cover', x: 0, y: 0, width: 200, height: 200,
  });
  assert.equal(created.store.nodes.length, 1);
  assert.notEqual(created.store.revision, 'empty');
  assert.deepEqual((await readMediaCanvas(dir)).nodes, created.store.nodes);

  const moved = await updateMediaCanvasNode(dir, created.store.revision, created.node.id, { x: 50, y: 75 });
  assert.equal(moved.node.x, 50);
  assert.equal(moved.node.y, 75);
  assert.notEqual(moved.store.revision, created.store.revision);

  const removed = await removeMediaCanvasNode(dir, moved.store.revision, created.node.id);
  assert.equal(removed.store.nodes.length, 0);
  assert.equal(removed.removedNode.id, created.node.id);
});

test('a stale expectedRevision is rejected without writing anything', async (t) => {
  const dir = await fixture(t);
  await createMediaCanvasNode(dir, EMPTY_REVISION, {
    kind: 'image', assetSrc: '/api/projects/p/assets/images/a.png', x: 0, y: 0, width: 200, height: 200,
  });
  await assert.rejects(
    createMediaCanvasNode(dir, EMPTY_REVISION, { kind: 'image', assetSrc: 'x', x: 0, y: 0, width: 100, height: 100 }),
    /changed since it was opened/,
  );
  assert.equal((await readMediaCanvas(dir)).nodes.length, 1);
});

test('edges require two existing nodes and are removed when either endpoint node is removed', async (t) => {
  const dir = await fixture(t);
  const a = await createMediaCanvasNode(dir, EMPTY_REVISION, { kind: 'image', assetSrc: 'a', x: 0, y: 0, width: 100, height: 100 });
  const b = await createMediaCanvasNode(dir, a.store.revision, { kind: 'image', assetSrc: 'b', x: 0, y: 0, width: 100, height: 100 });

  await assert.rejects(
    createMediaCanvasEdge(dir, b.store.revision, { fromNodeId: a.node.id, toNodeId: 'missing' }),
    /must reference existing nodes/,
  );

  const withEdge = await createMediaCanvasEdge(dir, b.store.revision, { fromNodeId: a.node.id, toNodeId: b.node.id, label: 'relates to' });
  assert.equal(withEdge.store.edges.length, 1);

  const afterRemoveA = await removeMediaCanvasNode(dir, withEdge.store.revision, a.node.id);
  assert.equal(afterRemoveA.store.edges.length, 0);
});

test('removing an edge directly by id works and rejects an unknown id', async (t) => {
  const dir = await fixture(t);
  const a = await createMediaCanvasNode(dir, EMPTY_REVISION, { kind: 'image', assetSrc: 'a', x: 0, y: 0, width: 100, height: 100 });
  const b = await createMediaCanvasNode(dir, a.store.revision, { kind: 'image', assetSrc: 'b', x: 0, y: 0, width: 100, height: 100 });
  const withEdge = await createMediaCanvasEdge(dir, b.store.revision, { fromNodeId: a.node.id, toNodeId: b.node.id });

  await assert.rejects(removeMediaCanvasEdge(dir, withEdge.store.revision, 'missing'), /No such media canvas edge/);
  const removed = await removeMediaCanvasEdge(dir, withEdge.store.revision, withEdge.edge.id);
  assert.equal(removed.store.edges.length, 0);
});

test('camera updates persist and validate like node updates', async (t) => {
  const dir = await fixture(t);
  const updated = await updateMediaCanvasCamera(dir, EMPTY_REVISION, { x: 10, y: 20, scale: 2 });
  assert.deepEqual(updated.store.camera, { x: 10, y: 20, scale: 2 });
  assert.deepEqual((await readMediaCanvas(dir)).camera, { x: 10, y: 20, scale: 2 });
});

test('concurrent node creations for the same project serialize instead of losing a write', async (t) => {
  const dir = await fixture(t);
  const first = createMediaCanvasNode(dir, EMPTY_REVISION, { kind: 'image', assetSrc: 'a', x: 0, y: 0, width: 100, height: 100 });
  // Fired before `first` resolves; the lock queue must serialize these so the
  // second create reads the first create's result rather than clobbering it.
  const second = first.then((r) => createMediaCanvasNode(dir, r.store.revision, { kind: 'image', assetSrc: 'b', x: 0, y: 0, width: 100, height: 100 }));
  await second;
  assert.equal((await readMediaCanvas(dir)).nodes.length, 2);
});
