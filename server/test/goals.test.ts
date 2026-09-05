import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readGoals, writeGoals } from '../src/goals.js';

test('writing goals persist session target and normalize ordered milestones', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-goals-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  assert.deepEqual(await readGoals(projectDir), {
    version: 1,
    sessionTarget: { wordTarget: 0, minutesTarget: 0, focus: '' },
    milestones: [],
  });
  const goals = await writeGoals(projectDir, {
    sessionTarget: { wordTarget: 750.4, minutesTarget: 45, focus: 'Draft council reversal' },
    milestones: [
      { id: 'draft-end', title: 'Complete first draft', description: 'Reach final image.', status: 'not_started', targetWords: 80000, dueDate: '2026-11-30', order: 8 },
      { id: '', title: 'Finish Act I', description: '', status: 'in_progress', targetWords: 22000, order: 2 },
    ],
  });

  assert.deepEqual(goals.sessionTarget, { wordTarget: 750, minutesTarget: 45, focus: 'Draft council reversal' });
  assert.deepEqual(goals.milestones.map((milestone) => [milestone.title, milestone.order]), [
    ['Finish Act I', 0],
    ['Complete first draft', 1],
  ]);
  assert.ok(goals.milestones[0].id);
  assert.equal((await readGoals(projectDir)).milestones[1].dueDate, '2026-11-30');
});

test('goal update rejects invalid milestone status without replacing persisted goals', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-goals-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  await writeGoals(projectDir, { sessionTarget: { wordTarget: 300, minutesTarget: 20, focus: 'Opening' } });

  await assert.rejects(writeGoals(projectDir, {
    milestones: [{ id: '', title: 'Impossible', description: '', status: 'blocked' as any, order: 0 }],
  }), /milestone status must be one of/);
  assert.equal((await readGoals(projectDir)).sessionTarget.wordTarget, 300);
});
