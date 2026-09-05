import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { imageAssetPath, saveImageAsset } from '../src/assets.js';

test('managed image upload writes decoded bytes inside project assets', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-assets-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

  const stored = await saveImageAsset(projectDir, {
    name: 'Kiala portrait.png',
    mimeType: 'image/png',
    data: bytes.toString('base64'),
  });

  assert.equal(stored.originalName, 'Kiala portrait.png');
  assert.equal(stored.mimeType, 'image/png');
  assert.equal(stored.size, bytes.length);
  assert.match(stored.fileName, /^[a-f0-9-]+\.png$/);
  assert.deepEqual(await fs.readFile(imageAssetPath(projectDir, stored.fileName)), bytes);
});

test('managed image upload rejects truncated image containers, not only bad magic bytes', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-assets-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const truncated = [
    { name: 'header.png', mimeType: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    { name: 'header.jpg', mimeType: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff]) },
    { name: 'header.gif', mimeType: 'image/gif', bytes: Buffer.from('GIF89a') },
    { name: 'header.webp', mimeType: 'image/webp', bytes: Buffer.from('RIFF\0\0\0\0WEBP') },
    { name: 'header.avif', mimeType: 'image/avif', bytes: Buffer.from('\0\0\0\u0018ftypavif') },
  ];

  for (const sample of truncated) {
    await assert.rejects(
      saveImageAsset(projectDir, { name: sample.name, mimeType: sample.mimeType, data: sample.bytes.toString('base64') }),
      /file contents do not match image type/,
      sample.name,
    );
  }
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
