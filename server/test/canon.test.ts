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
