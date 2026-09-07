import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { api } from '../src/api.ts';
import { useStore } from '../src/store.ts';
import type { Patch, ProjectManifest } from '../src/types.ts';

const project: ProjectManifest = { id: 'recovery-one', name: 'One', createdAt: '', updatedAt: '', documents: [] };
const meta = { id: 'chapter', title: 'Chapter', kind: 'manuscript' as const, path: 'chapter.md', order: 1 };
const saved = { meta, savedAt: '2026-09-06T12:00:00.000Z' };

function setup(t: TestContext) {
  const previous = useStore.getState();
  const data = new Map<string, string>();
  const storage = {
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
  };
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => {
    useStore.setState(previous);
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  useStore.setState({ project, docs: { chapter: { title: 'Chapter', content: 'Saved words.', baseContent: 'Saved words.', dirty: false } }, error: null });
  return { storage, data };
}

test('typing journals the manuscript synchronously before autosave can run', (t) => {
  const { data } = setup(t);
  useStore.getState().editDoc('chapter', 'Unsaved words.');
  const entries = [...data.values()].map((raw) => JSON.parse(raw));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].value, 'Unsaved words.');
  assert.equal(entries[0].base, 'Saved words.');
  assert.equal(entries[0].scope.projectId, 'recovery-one');
  assert.equal(entries[0].scope.entityId, 'chapter');
});

test('reloading a conflicting manuscript waits for the writer to choose recovery', async (t) => {
  setup(t);
  useStore.getState().editDoc('chapter', 'Recovered writing.');
  useStore.setState({ docs: {} });
  t.mock.method(api, 'readDoc', async () => ({ meta, content: 'Newer saved version.' }));
  await useStore.getState().loadDoc('chapter');
  const doc = useStore.getState().docs.chapter;
  assert.equal(doc.content, 'Newer saved version.');
  assert.equal(doc.dirty, false);
  assert.equal(doc.recovery?.value, 'Recovered writing.');
  useStore.getState().resolveDocRecovery('chapter', 'restore');
  assert.equal(useStore.getState().docs.chapter.content, 'Recovered writing.');
  assert.equal(useStore.getState().docs.chapter.dirty, true);
});

test('keeping the saved manuscript clears only its recovery journal', async (t) => {
  const { data } = setup(t);
  useStore.getState().editDoc('chapter', 'Discard this draft.');
  useStore.setState({ docs: {} });
  t.mock.method(api, 'readDoc', async () => ({ meta, content: 'Saved words.' }));
  await useStore.getState().loadDoc('chapter');
  assert.ok(useStore.getState().docs.chapter.recovery);
  useStore.getState().resolveDocRecovery('chapter', 'discard');
  assert.equal(useStore.getState().docs.chapter.content, 'Saved words.');
  assert.equal(useStore.getState().docs.chapter.dirty, false);
  assert.equal(data.size, 0);
});

test('concurrent saves cannot put an older manuscript on disk after a newer one', async (t) => {
  const { data } = setup(t);
  let disk = 'Saved words.';
  const writes: Array<() => void> = [];
  t.mock.method(api, 'writeDoc', (_project: string, _doc: string, content: string) => new Promise((resolve) => {
    writes.push(() => { disk = content; resolve(saved); });
  }));
  useStore.getState().editDoc('chapter', 'First edit.');
  const first = useStore.getState().flushDoc('chapter');
  await Promise.resolve();
  useStore.getState().editDoc('chapter', 'Second edit.');
  const second = useStore.getState().flushDoc('chapter');
  await Promise.resolve();
  const concurrent = writes.length;
  writes[0]();
  await first;
  assert.equal(useStore.getState().docs.chapter.dirty, true);
  assert.equal([...data.values()].map((raw) => JSON.parse(raw))[0]?.value, 'Second edit.');
  await Promise.resolve();
  writes[1]?.();
  await second;
  assert.equal(concurrent, 1, 'second disk write must wait for the first');
  assert.equal(disk, 'Second edit.');
  assert.equal(useStore.getState().docs.chapter.dirty, false);
  assert.equal(data.size, 0);
});

test('an old project save cannot change the new project document or its saved status', async (t) => {
  setup(t);
  let release!: () => void;
  t.mock.method(api, 'writeDoc', () => new Promise((resolve) => { release = () => resolve(saved); }));
  useStore.getState().editDoc('chapter', 'Old project writing.');
  const pending = useStore.getState().flushDoc('chapter');
  await Promise.resolve();
  useStore.setState({ project: { ...project, id: 'recovery-two' }, docs: { chapter: { title: 'Other chapter', content: 'Other story.', dirty: true } } });
  release();
  await pending;
  assert.deepEqual(useStore.getState().docs.chapter, { title: 'Other chapter', content: 'Other story.', dirty: true });
});

test('an autosave timer from the previous project never saves the next project', async (t) => {
  setup(t);
  const writes: string[] = [];
  t.mock.method(api, 'writeDoc', async (projectId: string) => { writes.push(projectId); return saved; });
  useStore.getState().editDoc('chapter', 'Previous project.');
  useStore.setState({ project: { ...project, id: 'recovery-two' }, docs: { chapter: { title: 'Other chapter', content: 'Other story.', dirty: true } } });
  t.mock.timers.tick(1000);
  await Promise.resolve();
  assert.deepEqual(writes, []);
});

const patch = { id: 'patch-one', documentId: 'chapter', beforeText: 'Saved words.', afterText: 'Patched words.' } as Patch;

test('patch acceptance stops when manuscript saving fails', async (t) => {
  setup(t);
  useStore.getState().editDoc('chapter', 'Not yet saved.');
  t.mock.method(api, 'writeDoc', async () => { throw new Error('Disk unavailable'); });
  let applied = 0;
  t.mock.method(api, 'applyPatch', async () => { applied++; return { content: 'Patched words.' }; });
  t.mock.method(api, 'events', async () => ({ events: [] }));
  await useStore.getState().acceptPatch(patch);
  assert.equal(applied, 0);
  assert.equal(useStore.getState().docs.chapter.content, 'Not yet saved.');
});

test('patch responses cannot overwrite edits typed while acceptance was pending', async (t) => {
  const { data } = setup(t);
  let release!: () => void;
  t.mock.method(api, 'applyPatch', () => new Promise((resolve) => { release = () => resolve({ content: 'Patched words.' }); }));
  t.mock.method(api, 'events', async () => ({ events: [] }));
  const accepting = useStore.getState().acceptPatch(patch);
  await Promise.resolve(); await Promise.resolve();
  useStore.getState().editDoc('chapter', 'New keystrokes during patch.');
  release(); await accepting;
  const doc = useStore.getState().docs.chapter;
  assert.equal(doc.recovery?.value, 'New keystrokes during patch.');
  assert.equal(doc.content, 'Patched words.');
  assert.ok([...data.values()].some((raw) => JSON.parse(raw).value === 'New keystrokes during patch.'));
});

test('accepted patches become the next manuscript recovery baseline', async (t) => {
  setup(t);
  t.mock.method(api, 'applyPatch', async () => ({ content: 'Patched words.' }));
  t.mock.method(api, 'events', async () => ({ events: [] }));
  await useStore.getState().acceptPatch(patch);
  assert.equal(useStore.getState().docs.chapter.baseContent, 'Patched words.');
});

test('project switching cannot release writing when browser recovery storage failed', async (t) => {
  const { storage } = setup(t);
  t.mock.method(storage, 'setItem', () => { throw new Error('Quota exceeded'); });
  useStore.getState().editDoc('chapter', 'Only live in this page.');
  t.mock.method(api, 'openProject', async () => ({ project: { ...project, id: 'other' }, agents: [], workspaces: [] }));
  t.mock.method(api, 'events', async () => ({ events: [] }));
  await useStore.getState().openProject('other');
  assert.equal(useStore.getState().project?.id, project.id);
  assert.equal(useStore.getState().docs.chapter.content, 'Only live in this page.');
  assert.match(useStore.getState().error ?? '', /recovery/i);
});
