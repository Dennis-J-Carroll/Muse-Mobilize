import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { imageAssetPath } from '../src/assets.js';
import { createCanonEntity } from '../src/canon.js';
import { createReference, deleteReference } from '../src/references.js';
import { writeWorldMap } from '../src/world-map.js';
import { deleteOrphanedImages } from '../src/imageGc.js';

async function plantManagedImage(projectDir: string, fileName: string): Promise<string> {
  const dest = imageAssetPath(projectDir, fileName);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, Buffer.from([0]));
  return dest;
}

test('deleting a reference garbage collects an image used nowhere else', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-imagegc-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  const fileName = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png';
  const filePath = await plantManagedImage(projectDir, fileName);
  const reference = await createReference(projectDir, {
    kind: 'image',
    title: 'Lighthouse',
    images: [{ id: 'img', src: `/api/projects/story/assets/images/${fileName}`, caption: '', tags: [] }],
  });

  await deleteReference(projectDir, reference.id);
  await deleteOrphanedImages(projectDir, [fileName]);

  await assert.rejects(fs.access(filePath));
});

test('image still used by another reference survives garbage collection', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-imagegc-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  const fileName = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png';
  const filePath = await plantManagedImage(projectDir, fileName);
  const shared = { id: 'img', src: `/api/projects/story/assets/images/${fileName}`, caption: '', tags: [] };
  const first = await createReference(projectDir, { kind: 'image', title: 'A', images: [shared] });
  await createReference(projectDir, { kind: 'image', title: 'B', images: [shared] });

  await deleteReference(projectDir, first.id);
  await deleteOrphanedImages(projectDir, [fileName]);

  await assert.doesNotReject(fs.access(filePath));
});

test('image still used by a character survives garbage collection after its reference is deleted', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-imagegc-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  const fileName = 'cccccccc-cccc-cccc-cccc-cccccccccccc.png';
  const filePath = await plantManagedImage(projectDir, fileName);
  const shared = { id: 'img', src: `/api/projects/story/assets/images/${fileName}`, caption: '', tags: [] };

  const reference = await createReference(projectDir, { kind: 'image', title: 'Portrait study', images: [shared] });
  await createCanonEntity(projectDir, {
    type: 'character',
    name: 'Kiala',
    character: {
      categories: [],
      attributes: { role: '', pronouns: '', age: '', goals: [], fears: [] },
      physical: { description: '', distinguishingFeatures: [], clothing: [] },
      senses: {
        vision: { summary: '', subtags: [] },
        audio: { summary: '', subtags: [] },
        proximity: { summary: '', subtags: [] },
      },
      references: { images: [shared] },
    },
  });

  await deleteReference(projectDir, reference.id);
  await deleteOrphanedImages(projectDir, [fileName]);

  await assert.doesNotReject(fs.access(filePath));
});

test('image used as the hidden world-map background survives garbage collection after its reference is deleted', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-imagegc-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  const fileName = 'dddddddd-dddd-dddd-dddd-dddddddddddd.png';
  const filePath = await plantManagedImage(projectDir, fileName);
  const shared = { id: 'img', src: `/api/projects/story/assets/images/${fileName}`, caption: '', tags: [] };

  const reference = await createReference(projectDir, { kind: 'image', title: 'Atlas source', images: [shared] });
  await writeWorldMap(projectDir, { image: shared, visible: false });

  await deleteReference(projectDir, reference.id);
  await deleteOrphanedImages(projectDir, [fileName]);

  await assert.doesNotReject(fs.access(filePath));
});
