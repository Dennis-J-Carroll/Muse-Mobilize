import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CanonEntityType, CanonStatus } from '../src/types.js';
import {
  createCanonEntity,
  createCanonFact,
  readCanon,
  renderCanonContext,
  updateCanonEntity,
  updateCanonFact,
} from '../src/canon.js';

test('captured fact persists as proposed until writer promotes it', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-canon-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const created = await createCanonFact(projectDir, {
    subject: 'Kiala',
    predicate: 'birthplace',
    value: 'Veyr',
    evidence: [{ documentId: 'chapter-03', quote: 'She was born in Veyr.' }],
  });

  const reopened = await readCanon(projectDir);
  assert.equal(created.status, 'proposed');
  assert.deepEqual(reopened.facts, [created]);
});

test('character facts link to stable entity identity', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-canon-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const kiala = await createCanonEntity(projectDir, {
    type: 'character',
    name: 'Kiala',
    aliases: ['The Envoy'],
  });
  const fact = await createCanonFact(projectDir, {
    subject: kiala.name,
    subjectId: kiala.id,
    predicate: 'recognizes',
    value: 'imperial seal',
  });

  const reopened = await readCanon(projectDir);
  assert.equal(reopened.entities[0].type, 'character');
  assert.equal(reopened.facts[0].subjectId, kiala.id);
  assert.equal(fact.subjectId, kiala.id);
});

test('unknown entity type is rejected before corrupting portable canon', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-canon-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  await assert.rejects(
    createCanonEntity(projectDir, { type: 'person' as CanonEntityType, name: 'Kiala' }),
    /entity type must be one of/,
  );
});

test('character profile and sensory subtags persist through updates', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-canon-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const kiala = await createCanonEntity(projectDir, {
    type: 'character',
    name: 'Kiala',
    character: {
      categories: ['protagonist', 'active cast'],
      attributes: { role: 'envoy', pronouns: 'she/her', age: '', goals: ['Find her brother'], fears: [] },
      physical: { description: 'Council-worn travel clothes.', distinguishingFeatures: [], clothing: ['grey cloak'] },
      senses: {
        vision: { summary: 'Reads rooms quickly.', subtags: [{ id: 'low-light', label: 'Low light', value: 'poor', indicator: 'limitation', status: 'canonical', evidence: ['chapter-01'] }] },
        audio: { summary: '', subtags: [] },
        proximity: { summary: '', subtags: [] },
      },
      references: { images: [] },
    },
  });

  await updateCanonEntity(projectDir, kiala.id, {
    character: { ...kiala.character!, categories: [...kiala.character!.categories, 'council'] },
  });
  const reopened = await readCanon(projectDir);
  assert.deepEqual(reopened.entities[0].character?.categories, ['protagonist', 'active cast', 'council']);
  assert.equal(reopened.entities[0].character?.senses.vision.subtags[0].indicator, 'limitation');
});

test('world profile and canvas position persist without losing atlas details', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-canon-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const veyr = await createCanonEntity(projectDir, {
    type: 'location',
    name: 'Veyr',
    summary: 'Council city built above tidal caverns.',
    world: {
      categories: ['capital', 'coastal'],
      attributes: { era: 'late empire', atmosphere: 'salt, bells, and political pressure', significance: 'Kiala’s birthplace' },
      canvas: { x: 180.25, y: -42.75 },
      images: [],
      referenceDocumentId: 'world-veyr',
    },
  });

  await updateCanonEntity(projectDir, veyr.id, {
    world: { ...veyr.world!, canvas: { x: 420.44, y: 118.86 } },
  });
  const reopened = await readCanon(projectDir);
  assert.deepEqual(reopened.entities[0].world?.categories, ['capital', 'coastal']);
  assert.deepEqual(reopened.entities[0].world?.canvas, { x: 420.4, y: 118.9 });
  assert.equal(reopened.entities[0].world?.attributes.atmosphere, 'salt, bells, and political pressure');
  assert.equal(reopened.entities[0].world?.referenceDocumentId, 'world-veyr');
});

test('character and world profiles persist multiple image references', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-canon-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  const images = [
    { id: 'portrait', src: '/assets/portrait.png', caption: 'Portrait', tags: ['face'] },
    { id: 'costume', src: '/assets/costume.webp', caption: 'Travel clothes', tags: ['costume'] },
  ];

  const character = await createCanonEntity(projectDir, {
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
      references: { images },
    },
  });
  const world = await createCanonEntity(projectDir, {
    type: 'location',
    name: 'Veyr',
    world: {
      categories: [],
      attributes: { era: '', atmosphere: '', significance: '' },
      canvas: { x: 0, y: 0 },
      images,
    },
  });

  assert.deepEqual(character.character?.references.images, images);
  assert.deepEqual(world.world?.images, images);
  const reopened = await readCanon(projectDir);
  assert.deepEqual(reopened.entities.find((entity) => entity.id === world.id)?.world?.images, images);
});

test('world relationship fact connects stable atlas entities', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-canon-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const veyr = await createCanonEntity(projectDir, { type: 'location', name: 'Veyr' });
  const council = await createCanonEntity(projectDir, { type: 'organization', name: 'Tide Council' });
  const relationship = await createCanonFact(projectDir, {
    subject: council.name,
    subjectId: council.id,
    predicate: 'governs',
    value: veyr.name,
  });

  assert.equal(relationship.subjectId, council.id);
  assert.equal(relationship.value, veyr.name);
  assert.match(renderCanonContext(await readCanon(projectDir)), /\[PROPOSED\] Tide Council — governs: Veyr/);
});

test('writer explicitly promotes fact status', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-canon-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const proposed = await createCanonFact(projectDir, {
    subject: 'Emperor',
    predicate: 'secretly alive',
    value: true,
  });
  const canonical = await updateCanonFact(projectDir, proposed.id, { status: 'canonical' });

  const reopened = await readCanon(projectDir);
  assert.equal(canonical.status, 'canonical');
  assert.equal(reopened.facts[0].status, 'canonical');
  assert.equal(canonical.createdAt, proposed.createdAt);
});

test('unknown fact status is rejected instead of silently becoming truth', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-canon-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  await assert.rejects(
    createCanonFact(projectDir, {
      subject: 'Emperor', predicate: 'secretly alive', value: true, status: 'confirmed' as CanonStatus,
    }),
    /status must be one of/,
  );
});

test('fact without value is rejected before persistence', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-canon-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  await assert.rejects(
    createCanonFact(projectDir, {
      subject: 'Kiala', predicate: 'birthplace', value: undefined as unknown as string,
    }),
    /value is required/,
  );
});

test('agent context privileges trusted facts and labels speculation', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-canon-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  await createCanonFact(projectDir, {
    subject: 'Emperor', predicate: 'secretly alive', value: true, status: 'proposed',
  });
  await createCanonFact(projectDir, {
    subject: 'Kiala', predicate: 'recognizes', value: 'imperial seal', status: 'canonical',
    evidence: [{ documentId: 'chapter-01', quote: 'She recognized the imperial seal immediately.' }],
  });

  const context = renderCanonContext(await readCanon(projectDir));
  assert.match(context, /\[CANONICAL\] Kiala — recognizes: imperial seal/);
  assert.match(context, /evidence: chapter-01 — “She recognized the imperial seal immediately\.”/);
  assert.match(context, /\[PROPOSED\] Emperor — secretly alive: true/);
  assert.ok(context.indexOf('[CANONICAL]') < context.indexOf('[PROPOSED]'));
});
