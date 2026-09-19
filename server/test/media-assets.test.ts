import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mediaAssetPath, managedMediaFileName, saveMediaAsset } from '../src/mediaAssets.js';

test('managed media upload writes decoded bytes inside project assets', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-media-assets-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  const bytes = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.from('extra sound bytes')]);

  const stored = await saveMediaAsset(projectDir, {
    name: 'storm ambience.wav',
    mimeType: 'audio/wav',
    data: bytes.toString('base64'),
  });

  assert.equal(stored.originalName, 'storm ambience.wav');
  assert.equal(stored.mimeType, 'audio/wav');
  assert.equal(stored.size, bytes.length);
  assert.match(stored.fileName, /^[a-f0-9-]+\.wav$/);
  assert.deepEqual(await fs.readFile(mediaAssetPath(projectDir, stored.fileName)), bytes);
});

test('managed media upload rejects content that does not match the declared type', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-media-assets-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const samples = [
    { name: 'clip.mp3', mimeType: 'audio/mpeg', bytes: Buffer.from('not an mp3 frame') },
    { name: 'clip.wav', mimeType: 'audio/wav', bytes: Buffer.from('RIFFxxxxNOPE') },
    { name: 'clip.mp4', mimeType: 'video/mp4', bytes: Buffer.from('not an mp4 box header!!') },
    { name: 'clip.webm', mimeType: 'video/webm', bytes: Buffer.from([0x00, 0x00, 0x00, 0x00]) },
  ];
  for (const sample of samples) {
    await assert.rejects(
      saveMediaAsset(projectDir, { name: sample.name, mimeType: sample.mimeType, data: sample.bytes.toString('base64') }),
      /file contents do not match media type/,
      sample.name,
    );
  }
});

test('managed media upload rejects unsupported types, oversized files, and unsafe paths', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-media-assets-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  await assert.rejects(
    saveMediaAsset(projectDir, { name: 'notes.txt', mimeType: 'text/plain', data: 'aGVsbG8=' }),
    /supported media/,
  );

  const tooLarge = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(26 * 1024 * 1024)]);
  await assert.rejects(
    saveMediaAsset(projectDir, { name: 'big.wav', mimeType: 'audio/wav', data: tooLarge.toString('base64') }),
    /25 MB or smaller/,
  );

  assert.throws(() => mediaAssetPath(projectDir, '../project.json'), /valid media asset name/);
  assert.equal(managedMediaFileName('/api/projects/p/assets/media/abc.mp3'), 'abc.mp3');
  assert.equal(managedMediaFileName('/api/projects/p/assets/images/abc.png'), null);
});
