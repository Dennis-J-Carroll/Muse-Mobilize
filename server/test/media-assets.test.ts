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

test('managed media upload writes decoded bytes for a genuine MP3 (ID3 header and bare frame-sync)', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-media-assets-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  // The MP3 signature check accepts either of two shapes (see
  // matchesMediaSignature in mediaAssets.ts): an ID3v2 tag, or a bare MPEG
  // frame-sync bit pattern with no container at all. The frame-sync branch
  // (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) is the looser of the
  // two -- it has real false-accept risk on arbitrary binary data -- so it's
  // the one most worth a positive fixture proving the intended-accept case
  // actually works. Both fixtures are covered here.
  const samples = [
    {
      label: 'ID3-tagged',
      // ID3v2 header is 10 bytes: 'ID3' + 2 version bytes + 1 flags byte + 4
      // size bytes; Buffer.alloc(7) covers the remaining 7 as zeros, a
      // valid-enough header shape since matchesMediaSignature only checks
      // the first 3 bytes for 'ID3'.
      bytes: Buffer.concat([Buffer.from('ID3'), Buffer.alloc(7), Buffer.from('minimal mp3 frame payload')]),
    },
    {
      label: 'bare frame-sync',
      // 0xff, 0xfb: 11-bit frame sync (0xff plus the top 3 bits of 0xfb, all
      // set) followed by MPEG version / layer bits -- a genuine MPEG audio
      // frame header, no container.
      bytes: Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.from('frame payload')]),
    },
  ];

  for (const sample of samples) {
    const stored = await saveMediaAsset(projectDir, {
      name: 'theme.mp3',
      mimeType: 'audio/mpeg',
      data: sample.bytes.toString('base64'),
    });

    assert.equal(stored.originalName, 'theme.mp3', sample.label);
    assert.equal(stored.mimeType, 'audio/mpeg', sample.label);
    assert.equal(stored.size, sample.bytes.length, sample.label);
    assert.match(stored.fileName, /^[a-f0-9-]+\.mp3$/, sample.label);
    assert.deepEqual(await fs.readFile(mediaAssetPath(projectDir, stored.fileName)), sample.bytes, sample.label);
  }
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
  assert.equal(
    managedMediaFileName('/api/projects/p/assets/media/3f9a2b7e-1c4d-4e5f-8a6b-9d0c1e2f3a4b.mp3'),
    '3f9a2b7e-1c4d-4e5f-8a6b-9d0c1e2f3a4b.mp3',
  );
  assert.equal(managedMediaFileName('/api/projects/p/assets/images/abc.png'), null);
});

test('managedMediaFileName rejects non-UUID media file names (agrees with mediaAssetPath\'s strict shape)', () => {
  // A loose match here would let deleteOrphanedMedia hand a bogus name to
  // mediaAssetPath, which throws on anything that is not a UUID-shaped
  // media file name (see server/src/mediaGc.ts's deleteOrphanedMedia).
  assert.equal(managedMediaFileName('/api/projects/p/assets/media/evil.mp3'), null);
  assert.equal(
    managedMediaFileName('/api/projects/p/assets/media/3f9a2b7e-1c4d-4e5f-8a6b-9d0c1e2f3a4b.mp3'),
    '3f9a2b7e-1c4d-4e5f-8a6b-9d0c1e2f3a4b.mp3',
  );
});
