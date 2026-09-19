import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EMPTY_REVISION, createMediaCanvasNode } from '../src/media.js';
import { mediaAssetPath, saveMediaAsset } from '../src/mediaAssets.js';
import { collectManagedMediaFileNames, deleteOrphanedMedia } from '../src/mediaGc.js';
import { collectManagedImageFileNames } from '../src/imageGc.js';
import { imageAssetPath, saveImageAsset } from '../src/assets.js';

async function fixture(t: any) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-media-gc-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('a media asset still referenced by a canvas node is not collected as orphaned', async (t) => {
  const dir = await fixture(t);
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.from('sound')]);
  const stored = await saveMediaAsset(dir, { name: 'ambience.wav', mimeType: 'audio/wav', data: wav.toString('base64') });
  const src = `/api/projects/p/assets/media/${stored.fileName}`;
  await createMediaCanvasNode(dir, EMPTY_REVISION, { kind: 'audio', assetSrc: src, x: 0, y: 0, width: 100, height: 100 });

  assert.deepEqual(await collectManagedMediaFileNames(dir), new Set([stored.fileName]));
  await deleteOrphanedMedia(dir, [stored.fileName]);
  await assert.doesNotReject(fs.access(mediaAssetPath(dir, stored.fileName)));
});

test('a media asset with no remaining canvas reference is deleted', async (t) => {
  const dir = await fixture(t);
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.from('sound')]);
  const stored = await saveMediaAsset(dir, { name: 'ambience.wav', mimeType: 'audio/wav', data: wav.toString('base64') });

  await deleteOrphanedMedia(dir, [stored.fileName]);
  await assert.rejects(fs.access(mediaAssetPath(dir, stored.fileName)));
});

test('an image placed on the media canvas is not treated as an orphaned image', async (t) => {
  const dir = await fixture(t);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const stored = await saveImageAsset(dir, { name: 'cover.png', mimeType: 'image/png', data: png.toString('base64') });
  const src = `/api/projects/p/assets/images/${stored.fileName}`;
  await createMediaCanvasNode(dir, EMPTY_REVISION, { kind: 'image', assetSrc: src, x: 0, y: 0, width: 100, height: 100 });

  const stillUsed = await collectManagedImageFileNames(dir);
  assert.equal(stillUsed.has(stored.fileName), true);
  await assert.doesNotReject(fs.access(imageAssetPath(dir, stored.fileName)));
});
