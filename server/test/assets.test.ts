import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { imageAssetPath, saveImageAsset } from '../src/assets.js';

test('managed image upload writes decoded bytes inside project assets', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-assets-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const stored = await saveImageAsset(projectDir, {
    name: 'Kiala portrait.png',
    mimeType: 'image/png',
    data: bytes.toString('base64'),
  });

  assert.equal(stored.originalName, 'Kiala portrait.png');
  assert.equal(stored.mimeType, 'image/png');
  assert.equal(stored.size, 8);
  assert.match(stored.fileName, /^[a-f0-9-]+\.png$/);
  assert.deepEqual(await fs.readFile(imageAssetPath(projectDir, stored.fileName)), bytes);
});

test('managed image upload rejects unsafe formats and paths', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-assets-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  await assert.rejects(
    saveImageAsset(projectDir, { name: 'notes.txt', mimeType: 'text/plain', data: 'aGVsbG8=' }),
    /supported image/,
  );
  assert.throws(() => imageAssetPath(projectDir, '../project.json'), /valid image asset name/);
});
