import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cardSnapshot, pickAgent, respondAsMuse } from '../src/thread-reply.js';
import { createThread, readThreads, addMessage, addMuseMessage, setConnections } from '../src/threads.js';
import { createCanonEntity } from '../src/canon.js';
import { createPlotNode } from '../src/plot.js';
import { attachConnection, createTag } from '../src/connections.js';
import { mockProvider } from '../src/providers/mock.js';
import type { AgentDef, ModelProvider } from '../src/types.js';

const agent = (id: string, role: string): AgentDef => ({
  id, name: id === 'muse' ? 'Muse' : id, role, instructions: { system_prompt: 'You are a writing partner.' },
  model: { provider: 'mock' }, state: { mode: 'live' },
} as AgentDef);

async function fixture(t: TestContext) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-thread-reply-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify({
    id: 'p', name: 'T', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', documents: [],
  }));
  const mara = await createCanonEntity(dir, { type: 'character', name: 'Mara', summary: 'Keeper of the lantern.' });
  return { dir, target: { kind: 'canon' as const, id: mara.id } };
}

test('pickAgent prefers the requested agent, then the muse role, then the first agent, else throws', () => {
  const agents = [agent('continuity', 'continuity'), agent('muse', 'muse')];
  assert.equal(pickAgent(agents, 'continuity').id, 'continuity');
  assert.equal(pickAgent(agents).id, 'muse');
  assert.equal(pickAgent([agent('only', 'editor')]).id, 'only');
  assert.throws(() => pickAgent([]), /No agent is configured/);
  assert.throws(() => pickAgent(agents, 'ghost'), /No such agent/);
});

test('cardSnapshot labels the card and includes its saved fields', async (t) => {
  const { dir, target } = await fixture(t);
  const snapshot = await cardSnapshot(dir, target);
  assert.equal(snapshot.label, 'Mara');
  assert.match(snapshot.body, /Keeper of the lantern/);
});

test('respondAsMuse fills the pending message from the provider (mock)', async (t) => {
  const { dir, target } = await fixture(t);
  const thread = await createThread(dir, { target, text: '@Muse is her oath too thin? Hard to say.' });
  const result = await respondAsMuse(dir, thread.id, agent('muse', 'muse'), mockProvider);
  const reply = result.messages.at(-1)!;
  assert.deepEqual(reply.author, { kind: 'muse', agentId: 'muse' });
  assert.equal(reply.state, undefined);
  assert.match(reply.text, /^Muse \(mock\) on "Mara": is her oath too thin\?/);
});

test('a provider failure leaves the note saved and marks the Muse message failed; retry replaces it', async (t) => {
  const { dir, target } = await fixture(t);
  const thread = await createThread(dir, { target, text: '@Muse thoughts?' });
  const broken: ModelProvider = { id: 'broken', complete: async () => { throw new Error('provider down'); } } as unknown as ModelProvider;
  const failed = await respondAsMuse(dir, thread.id, agent('muse', 'muse'), broken);
  assert.equal(failed.messages.length, 2);
  assert.equal(failed.messages[0].text, '@Muse thoughts?');
  assert.equal(failed.messages[1].state, 'failed');
  assert.match(failed.messages[1].text, /provider down/);
  const retried = await respondAsMuse(dir, thread.id, agent('muse', 'muse'), mockProvider, { replacingMessageId: failed.messages[1].id });
  assert.equal(retried.messages.length, 2, 'retry replaces the failed message, no duplicates');
  assert.equal(retried.messages[1].state, undefined);
});

test('failed Muse messages stay out of the prompt, and the latest user note is called out', async (t) => {
  const { dir, target } = await fixture(t);
  const thread = await createThread(dir, { target, text: 'plain note' });
  await addMuseMessage(dir, thread.id, { agentId: 'muse', text: 'old error', failed: true });
  let seen = '';
  const spy: ModelProvider = { id: 'spy', complete: async (req: { messages: { content: string }[] }) => { seen = req.messages.map((m) => m.content).join('\n'); return { text: 'ok', model: 'spy' }; } } as unknown as ModelProvider;
  await addMessage(dir, thread.id, { author: { kind: 'user' }, text: '@Muse now?' });
  await respondAsMuse(dir, thread.id, agent('muse', 'muse'), spy);
  assert.doesNotMatch(seen, /old error/);
  assert.match(seen, /plain note/);
  assert.match(seen, /<latest-note>\s*@Muse now\?/);
  assert.equal((await readThreads(dir)).threads[0].messages.at(-1)!.text, 'ok');
});

test('a provider that never answers times out into a failed reply instead of hanging', { timeout: 3000 }, async (t) => {
  const { dir, target } = await fixture(t);
  const thread = await createThread(dir, { target, text: '@Muse hello?' });
  const hung: ModelProvider = { id: 'hung', complete: () => new Promise(() => {}) } as unknown as ModelProvider;
  const result = await respondAsMuse(dir, thread.id, agent('muse', 'muse'), hung, { timeoutMs: 50 });
  assert.equal(result.messages.at(-1)!.state, 'failed');
  assert.match(result.messages.at(-1)!.text, /took too long/);
});

test('the model call runs outside the recorded write, and the reply is recorded as its own write', async (t) => {
  const { dir, target } = await fixture(t);
  const thread = await createThread(dir, { target, text: '@Muse go' });
  const events: string[] = [];
  const spy: ModelProvider = { id: 'spy', complete: async () => { events.push('model'); return { text: 'ok', model: 'spy' }; } } as unknown as ModelProvider;
  await respondAsMuse(dir, thread.id, agent('muse', 'muse'), spy, {
    record: async (label, write) => { events.push(`record:${label}:start`); const value = await write(); events.push(`record:${label}:end`); return value; },
  });
  assert.deepEqual(events, ['model', 'record:Muse reply:start', 'record:Muse reply:end']);
});

test('an agent whose access rules exclude the card never sees its contents', async (t) => {
  const { dir, target } = await fixture(t);
  const thread = await createThread(dir, { target, text: '@Muse thoughts?' });
  let seen = '';
  const spy: ModelProvider = { id: 'spy', complete: async (req: { messages: { content: string }[] }) => { seen = req.messages.map((m) => m.content).join('\n'); return { text: 'ok', model: 'spy' }; } } as unknown as ModelProvider;
  const restricted = { ...agent('muse', 'muse'), access: { version: 1, revision: 'r1', allow: [{ kind: 'scene', selection: { mode: 'all' } }], deny: [], selection: false, proposeEdits: false } } as unknown as AgentDef;
  await respondAsMuse(dir, thread.id, restricted, spy);
  assert.doesNotMatch(seen, /Keeper of the lantern/);
  assert.match(seen, /withheld/i);
  const open = { ...restricted, access: { ...(restricted.access as object), allow: [{ kind: 'character', selection: { mode: 'all' } }] } } as unknown as AgentDef;
  await respondAsMuse(dir, thread.id, open, spy);
  assert.match(seen, /Keeper of the lantern/);
});

test("Muse sees the card's tags, outgoing links, and backlinks, but never titles the agent may not read", async (t) => {
  const { dir, target } = await fixture(t);
  const arrival = await createPlotNode(dir, { title: 'Arrival' });
  const gate = await createPlotNode(dir, { title: 'Burning Gate' });
  const fear = await createTag(dir, { label: 'fear' });
  await attachConnection(dir, { target, tagId: fear.id });
  await attachConnection(dir, { target, entity: { kind: 'plot', id: gate.id } });
  await attachConnection(dir, { target: { kind: 'plot', id: arrival.id }, entity: target });
  const thread = await createThread(dir, { target, text: '@Muse how does she connect?' });
  let seen = '';
  const spy: ModelProvider = { id: 'spy', complete: async (req: { messages: { content: string }[] }) => { seen = req.messages.map((m) => m.content).join('\n'); return { text: 'ok', model: 'spy' }; } } as unknown as ModelProvider;

  await respondAsMuse(dir, thread.id, agent('muse', 'muse'), spy);
  assert.match(seen, /<connections>[\s\S]*#fear[\s\S]*<\/connections>/);
  assert.match(seen, /links to:.*Burning Gate/);
  assert.match(seen, /linked from:.*Arrival/);

  const noPlot = { ...agent('muse', 'muse'), access: { version: 1, revision: 'r1', allow: [{ kind: 'character', selection: { mode: 'all' } }], deny: [], selection: false, proposeEdits: false } } as unknown as AgentDef;
  await respondAsMuse(dir, thread.id, noPlot, spy);
  assert.match(seen, /#fear/);
  assert.doesNotMatch(seen, /Burning Gate|Arrival/);

  const plain = await createThread(dir, { target: { kind: 'plot', id: gate.id }, text: '@Muse and this?' });
  await respondAsMuse(dir, plain.id, agent('muse', 'muse'), spy);
  assert.doesNotMatch(seen, /#fear/, 'tags on another card do not leak in');
});

test('a malformed connections file does not stop Muse from replying', async (t) => {
  const { dir, target } = await fixture(t);
  await fs.mkdir(path.join(dir, 'connections'));
  await fs.writeFile(path.join(dir, 'connections/connections.json'), '{"version":9}');
  const thread = await createThread(dir, { target, text: '@Muse still there?' });
  const result = await respondAsMuse(dir, thread.id, agent('muse', 'muse'), mockProvider);
  assert.equal(result.messages.at(-1)!.state, undefined);
  assert.match(result.messages.at(-1)!.text, /^Muse \(mock\)/);
});

test("Muse sees a note's own tags and a short excerpt of the cards it links, and nothing the agent may not read", async (t) => {
  const { dir, target } = await fixture(t);
  const gate = await createPlotNode(dir, { title: 'Burning Gate', summary: 'The gate burns at dawn.' });
  const pace = await createTag(dir, { label: 'pacing' });
  const thread = await createThread(dir, { target, text: '@Muse how does this tie in?' });
  await setConnections(dir, thread.id, { tagIds: [pace.id], links: [{ kind: 'plot', id: gate.id }] });
  let seen = '';
  const spy: ModelProvider = { id: 'spy', complete: async (req: { messages: { content: string }[] }) => { seen = req.messages.map((m) => m.content).join('\n'); return { text: 'ok', model: 'spy' }; } } as unknown as ModelProvider;
  await respondAsMuse(dir, thread.id, agent('muse', 'muse'), spy);
  assert.match(seen, /<note-context>[\s\S]*note tags: #pacing[\s\S]*<\/note-context>/);
  assert.match(seen, /<linked-card [^>]*label="Burning Gate"[\s\S]*The gate burns at dawn/);
  const noPlot = { ...agent('muse', 'muse'), access: { version: 1, revision: 'r1', allow: [{ kind: 'character', selection: { mode: 'all' } }], deny: [], selection: false, proposeEdits: false } } as unknown as AgentDef;
  await respondAsMuse(dir, thread.id, noPlot, spy);
  assert.match(seen, /#pacing/);
  assert.doesNotMatch(seen, /Burning Gate|burns at dawn/);
});
