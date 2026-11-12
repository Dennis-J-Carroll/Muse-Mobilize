import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../src/api.ts';
import { draftJournal } from '../src/draftRecovery.ts';
import { useStore } from '../src/store.ts';
import type { ProjectManifest } from '../src/types.ts';

const current: ProjectManifest = { id: 'current', name: 'Current', createdAt: '', updatedAt: '', documents: [] };
const created: ProjectManifest = { id: 'created', name: 'Created', createdAt: '', updatedAt: '', documents: [] };

test('a new story is refused before it is created when the open story cannot be left', async (t) => {
  const previous = useStore.getState();
  t.after(() => useStore.setState(previous));
  t.mock.method(draftJournal, 'hasProjectIssues', (id: string) => id === 'current');
  const create = t.mock.method(api, 'createProject', async () => ({ project: created }));
  const open = t.mock.method(api, 'openProject', async () => { throw new Error('not reached'); });
  useStore.setState({ project: current, projects: [current], error: null });

  const result = await useStore.getState().newProject('Created', 'an idea');

  assert.equal(result, null);
  assert.equal(create.mock.callCount(), 0);
  assert.equal(open.mock.callCount(), 0);
  assert.match(useStore.getState().error ?? '', /Save or copy your unfinished writing/);
  assert.deepEqual(useStore.getState().projects.map((p) => p.id), ['current']);
  assert.equal(useStore.getState().project?.id, 'current');
});

test('a story created but not opened is reported as created, so the form never creates it twice', async (t) => {
  const previous = useStore.getState();
  t.after(() => useStore.setState(previous));
  t.mock.method(draftJournal, 'hasProjectIssues', () => false);
  const create = t.mock.method(api, 'createProject', async () => ({ project: created }));
  t.mock.method(api, 'openProject', async () => { throw new Error('Runtime unavailable'); });
  useStore.setState({ project: current, projects: [current], error: null });

  const result = await useStore.getState().newProject('Created');

  assert.equal(result, 'created');
  assert.equal(create.mock.callCount(), 1);
  assert.equal(useStore.getState().error, 'Runtime unavailable');
  assert.deepEqual(useStore.getState().projects.map((p) => p.id), ['created', 'current']);
  assert.equal(useStore.getState().project?.id, 'current');
});

test('a creation failure reports nothing created and keeps the error for the form', async (t) => {
  const previous = useStore.getState();
  t.after(() => useStore.setState(previous));
  t.mock.method(draftJournal, 'hasProjectIssues', () => false);
  t.mock.method(api, 'createProject', async () => { throw new Error('Disk full'); });
  useStore.setState({ project: null, projects: [], error: null });

  assert.equal(await useStore.getState().newProject('Created'), null);
  assert.equal(useStore.getState().error, 'Disk full');
});
