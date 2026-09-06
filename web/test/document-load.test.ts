import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../src/api.ts';
import { useStore } from '../src/store.ts';
import type { ProjectManifest } from '../src/types.ts';

const project: ProjectManifest = { id: 'one', name: 'One', createdAt: '', updatedAt: '', documents: [] };
const meta = { id: 'chapter', title: 'Chapter', kind: 'manuscript' as const, path: 'chapter.md', order: 1 };

test('a late document read never overwrites a draft already loaded or edited', async (t) => {
  const previous = useStore.getState();
  t.after(() => useStore.setState(previous));
  let release!: (value: { meta: typeof meta; content: string }) => void;
  t.mock.method(api, 'readDoc', () => new Promise((resolve) => { release = resolve; }));
  useStore.setState({ project, docs: {} });
  const pending = useStore.getState().loadDoc('chapter');
  useStore.setState({ docs: { chapter: { title: 'Chapter', content: 'Latest writing', dirty: true } } });
  release({ meta, content: 'Old read' });
  await pending;
  assert.equal(useStore.getState().docs.chapter.content, 'Latest writing');
  assert.equal(useStore.getState().docs.chapter.dirty, true);
});

test('a document read from the previous project cannot enter the next desk', async (t) => {
  const previous = useStore.getState();
  t.after(() => useStore.setState(previous));
  let release!: (value: { meta: typeof meta; content: string }) => void;
  t.mock.method(api, 'readDoc', () => new Promise((resolve) => { release = resolve; }));
  useStore.setState({ project, docs: {} });
  const pending = useStore.getState().loadDoc('chapter');
  useStore.setState({ project: { ...project, id: 'two' }, docs: {} });
  release({ meta, content: 'Previous story' });
  await pending;
  assert.deepEqual(useStore.getState().docs, {});
});
