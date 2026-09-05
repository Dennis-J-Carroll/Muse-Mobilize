import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createReference, deleteReference, readReferences, updateReference } from '../src/references.js';

test('reference moodboard persists images, source details, and stable story links', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-references-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  assert.deepEqual(await readReferences(projectDir), { version: 1, items: [] });
  const reference = await createReference(projectDir, {
    kind: 'image',
    title: 'Salt-battered lighthouse',
    images: [{ id: 'lighthouse', src: '/api/projects/story/assets/images/image.png', caption: 'Cold horizon', tags: ['coast', '  blue '] }],
    attribution: 'Mara Vale',
    sourceUrl: 'https://example.com/lighthouse',
    notes: 'Palette for western reach.',
    entityRefs: [
      { kind: 'canon', refId: 'western-reach' },
      { kind: 'theme', refId: 'isolation' },
      { kind: 'theme', refId: 'isolation' },
    ],
  });
  const updated = await updateReference(projectDir, reference.id, {
    notes: 'Palette and weather language for western reach.',
  });

  assert.equal(updated.notes, 'Palette and weather language for western reach.');
  assert.deepEqual(updated.images[0].tags, ['coast', 'blue']);
  assert.deepEqual(updated.entityRefs, [
    { kind: 'canon', refId: 'western-reach' },
    { kind: 'theme', refId: 'isolation' },
  ]);
  assert.deepEqual((await readReferences(projectDir)).items, [updated]);
});

test('reference validation rejects unknown kinds and malformed story links', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-references-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  await assert.rejects(createReference(projectDir, { kind: 'audio' as any, title: 'Storm' }), /reference kind must be one of/);
  await assert.rejects(createReference(projectDir, {
    kind: 'quote', title: 'Duty', quote: 'We carry what survived us.',
    entityRefs: [{ kind: 'chapter' as any, refId: 'chapter-1' }],
  }), /story entity kind must be one of/);
  await assert.rejects(createReference(projectDir, {
    kind: 'link', title: 'Unsafe link', url: 'javascript:alert(1)',
  }), /http\(s\) URL/);
  await assert.rejects(createReference(projectDir, {
    kind: 'image', title: 'Unsafe image', images: [{ id: '', src: 'data:image/png;base64,abc', caption: '', tags: [] }],
  }), /managed project image or http\(s\) URL/);
  assert.deepEqual((await readReferences(projectDir)).items, []);
});

test('deleting a reference removes it from the store and returns the removed item', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-references-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const kept = await createReference(projectDir, { kind: 'quote', title: 'Kept', quote: 'stays' });
  const removed = await createReference(projectDir, { kind: 'quote', title: 'Removed', quote: 'goes' });

  const result = await deleteReference(projectDir, removed.id);

  assert.equal(result.id, removed.id);
  assert.deepEqual((await readReferences(projectDir)).items, [kept]);
});

test('deleting an unknown reference is rejected', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-references-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  await assert.rejects(deleteReference(projectDir, 'missing'), /No such reference/);
});
