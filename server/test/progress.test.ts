import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { emit } from '../src/events.js';
import { readProgress } from '../src/progress.js';
import { createScene } from '../src/scenes.js';

test('progress projects manuscript words, word flow, completed scenes, and unresolved revisions', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-progress-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(projectDir, 'manuscript'), { recursive: true });
  await fs.writeFile(path.join(projectDir, 'manuscript', 'one.md'), Array(145).fill('one').join(' '));
  await fs.writeFile(path.join(projectDir, 'manuscript', 'two.md'), Array(40).fill('two').join(' '));
  await fs.writeFile(path.join(projectDir, 'project.json'), JSON.stringify({
    documents: [
      { id: 'one', title: 'One', kind: 'manuscript', path: 'manuscript/one.md', order: 0 },
      { id: 'two', title: 'Two', kind: 'manuscript', path: 'manuscript/two.md', order: 1 },
      { id: 'notes', title: 'Notes', kind: 'notes', path: 'notes.md', order: 2 },
    ],
  }));
  await emit(projectDir, 'document.saved', { documentId: 'one', words: 100 });
  await emit(projectDir, 'document.saved', { documentId: 'one', words: 145 });
  await emit(projectDir, 'document.saved', { documentId: 'two', words: 40 });
  await emit(projectDir, 'patch.proposed', { patchId: 'open-patch', documentId: 'one', reason: 'Clarify Kiala’s choice.' }, 'critic');
  await emit(projectDir, 'patch.proposed', { patchId: 'accepted-patch', documentId: 'two', reason: 'Tighten.' });
  await emit(projectDir, 'patch.accepted', { patchId: 'accepted-patch', documentId: 'two' });
  await emit(projectDir, 'patch.proposed', { patchId: 'rejected-patch', documentId: 'one' });
  await emit(projectDir, 'patch.rejected', { patchId: 'rejected-patch' });
  await createScene(projectDir, { title: 'Opening', status: 'planned' });
  await createScene(projectDir, { title: 'Council', status: 'revised' });
  await createScene(projectDir, { title: 'Departure', status: 'locked' });

  const progress = await readProgress(projectDir);

  assert.equal(progress.currentWords, 185);
  assert.deepEqual(progress.wordFlow.map(({ words, delta, totalWords }) => ({ words, delta, totalWords })), [
    { words: 100, delta: 100, totalWords: 100 },
    { words: 145, delta: 45, totalWords: 145 },
    { words: 40, delta: 40, totalWords: 185 },
  ]);
  assert.deepEqual(progress.scenes, {
    total: 3,
    completed: 2,
    byStatus: { planned: 1, drafting: 0, revised: 1, locked: 1 },
  });
  assert.deepEqual(progress.unresolvedRevisions.map(({ patchId, documentId, reason, actor }) => ({ patchId, documentId, reason, actor })), [
    { patchId: 'open-patch', documentId: 'one', reason: 'Clarify Kiala’s choice.', actor: 'critic' },
  ]);
});

test('unresolved revisions carry beforeText/afterText when the proposing event recorded them, and omit them otherwise', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-progress-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  await fs.writeFile(path.join(projectDir, 'project.json'), JSON.stringify({ documents: [] }));

  await emit(projectDir, 'patch.proposed', {
    patchId: 'with-body', documentId: 'one', reason: 'Tighten.',
    beforeText: 'the door', afterText: 'the heavy door',
  }, 'critic');
  await emit(projectDir, 'patch.proposed', { patchId: 'legacy-no-body', documentId: 'one', reason: 'Older event, pre-body.' });

  const progress = await readProgress(projectDir);
  const byId = new Map(progress.unresolvedRevisions.map((r) => [r.patchId, r]));

  assert.deepEqual(byId.get('with-body'), {
    patchId: 'with-body', documentId: 'one', reason: 'Tighten.', actor: 'critic',
    beforeText: 'the door', afterText: 'the heavy door',
    proposedAt: byId.get('with-body')!.proposedAt,
  });
  assert.equal('beforeText' in byId.get('legacy-no-body')!, false);
  assert.equal('afterText' in byId.get('legacy-no-body')!, false);
});

test('progress returns empty projection when optional stores and history are missing', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-progress-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  await fs.writeFile(path.join(projectDir, 'project.json'), JSON.stringify({ documents: [] }));

  assert.deepEqual(await readProgress(projectDir), {
    currentWords: 0,
    wordFlow: [],
    scenes: { total: 0, completed: 0, byStatus: { planned: 0, drafting: 0, revised: 0, locked: 0 } },
    unresolvedRevisions: [],
  });
});
