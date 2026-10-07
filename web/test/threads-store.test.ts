import assert from 'node:assert/strict';
import test from 'node:test';
import { useStore } from '../src/store.ts';
import { useThreads } from '../src/threads.ts';

const T = '2026-10-06T10:00:00.000Z';
const thread = (id: string) => ({ id, target: { kind: 'scene' as const, id: 's' }, status: 'open' as const, createdAt: T, updatedAt: T,
  messages: [{ id: `${id}-m`, author: { kind: 'user' as const }, text: 'x', createdAt: T }] });
const asProject = (id: string) => useStore.setState({ project: { id } as any });
const reset = () => useThreads.setState({ projectId: null, threads: [], loaded: false, busy: false, thinking: false, error: '' });
const target = { kind: 'scene' as const, id: 's' };

/** Answers every fetch; POSTs to a project wait on that project's gate so a test controls when they finish. */
function stubFetch(gates: Record<string, Promise<void>>, reply: (id: string) => unknown) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const project = /\/projects\/([^/]+)/.exec(String(url))?.[1] ?? '';
    if (init?.method === 'POST') await gates[project];
    const body = init?.method === 'POST' ? { thread: reply(project) } : { threads: [] };
    return { ok: true, status: 200, text: async () => JSON.stringify(body), headers: { get: () => null } };
  }) as unknown as typeof fetch;
}

test('switching project mid-request neither strands the buttons disabled nor leaks the old reply into the new project', async () => {
  reset(); asProject('A');
  let releaseA!: () => void; let releaseB!: () => void;
  const gates = { A: new Promise<void>((resolve) => { releaseA = resolve; }), B: new Promise<void>((resolve) => { releaseB = resolve; }) };
  stubFetch(gates, (project) => thread(`from-${project}`));

  const pendingA = useThreads.getState().create(target, 'hello from A');
  assert.equal(useThreads.getState().busy, true);

  asProject('B');
  await useThreads.getState().ensureLoaded();
  assert.equal(useThreads.getState().busy, false, 'a new project starts idle');

  const pendingB = useThreads.getState().create(target, 'hello from B');
  assert.equal(useThreads.getState().busy, true);
  releaseA();
  assert.equal(await pendingA, null, 'the old project reply is dropped');
  assert.equal(useThreads.getState().busy, true, 'a finished old request must not clear the new request busy flag');

  releaseB();
  assert.equal((await pendingB)?.id, 'from-B');
  assert.equal(useThreads.getState().busy, false);
  assert.deepEqual(useThreads.getState().threads.map((item) => item.id), ['from-B']);
});

test('only a request that mentions @Muse shows the thinking state', async () => {
  reset(); asProject('C');
  let release!: () => void;
  stubFetch({ C: new Promise<void>((resolve) => { release = resolve; }) }, () => thread('t'));
  const plain = useThreads.getState().create(target, 'just a note');
  assert.equal(useThreads.getState().thinking, false);
  release(); await plain;
  reset();
  let release2!: () => void;
  stubFetch({ C: new Promise<void>((resolve) => { release2 = resolve; }) }, () => thread('t'));
  const asking = useThreads.getState().create(target, '@Muse what now?');
  assert.equal(useThreads.getState().thinking, true);
  release2(); await asking;
  assert.equal(useThreads.getState().thinking, false);
});

test('a note created from a selection sends its range to the server', async () => {
  reset(); asProject('D');
  let sent = '';
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') sent = String(init.body);
    return { ok: true, status: 200, text: async () => JSON.stringify(init?.method === 'POST' ? { thread: thread('t') } : { threads: [] }), headers: { get: () => null } };
  }) as unknown as typeof fetch;
  await useThreads.getState().create({ kind: 'document', id: 'd1' }, 'why a lantern?', { range: { start: 13, end: 20, quote: 'lantern' } });
  assert.equal(JSON.parse(sent).range.quote, 'lantern');
  assert.equal(JSON.parse(sent).text, 'why a lantern?');
});
