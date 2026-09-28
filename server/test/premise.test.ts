import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-premise-'));
process.env.MUSE_CONFIG_DIR = path.join(root, 'config');
await fs.mkdir(process.env.MUSE_CONFIG_DIR);
await fs.writeFile(path.join(process.env.MUSE_CONFIG_DIR, 'settings.json'), JSON.stringify({ workspaceRoot: root, defaultProvider: 'mock' }));
const { createProject, projectDir, readAgent } = await import('../src/projects.js');
const { buildContext } = await import('../src/context.js');
const { readPremise, writePremise, PREMISE_WORKING_MAX, PREMISE_VARIANT_MAX, PREMISE_VARIANTS_MAX } = await import('../src/premise.js');
const { parseWhatIfs, generateWhatIfs } = await import('../src/premise-what-ifs.js');
const { mockProvider } = await import('../src/providers/mock.js');
after(() => fs.rm(root, { recursive: true, force: true }));

test('a missing premise store reads as empty', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-premise-empty-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await readPremise(dir), {
    version: 1, working: '', slots: { protagonist: '', want: '', obstacle: '', stakes: '', twist: '' }, variants: [],
  });
});

test('writePremise normalizes untrusted input and persists it', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-premise-write-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const saved = await writePremise(dir, {
    working: `  ${'w'.repeat(PREMISE_WORKING_MAX + 50)}  `,
    slots: { protagonist: ' Traven ', want: 'the throne', obstacle: 42 as any, stakes: undefined as any, twist: 'he is not royal' },
    variants: [
      { id: '', text: '  A traitor crowned.  ', source: 'muse', createdAt: '' },
      { id: 'x', text: 'A traitor crowned.', source: 'manual', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'y', text: '   ', source: 'manual', createdAt: '' },
      { id: 'z', text: 'v'.repeat(PREMISE_VARIANT_MAX + 10), source: 'bogus' as any, createdAt: 'not a date' },
    ],
    extra: 'ignored',
  } as any);

  assert.equal(saved.working.length, PREMISE_WORKING_MAX);
  assert.deepEqual(saved.slots, { protagonist: 'Traven', want: 'the throne', obstacle: '42', stakes: '', twist: 'he is not royal' });
  assert.deepEqual(saved.variants.map((v) => v.text.slice(0, 20)), ['A traitor crowned.', 'v'.repeat(20)]);
  assert.equal(saved.variants[0].source, 'muse');
  assert.ok(saved.variants[0].id, 'new variants get an id');
  assert.ok(!Number.isNaN(Date.parse(saved.variants[0].createdAt)), 'new variants get a timestamp');
  assert.equal(saved.variants[1].text.length, PREMISE_VARIANT_MAX);
  assert.equal(saved.variants[1].source, 'manual', 'unknown sources fall back to manual');
  assert.deepEqual(await readPremise(dir), saved);
});

test('the variant list is capped, keeping the newest', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-premise-cap-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const variants = Array.from({ length: PREMISE_VARIANTS_MAX + 5 }, (_, i) => ({ id: `v${i}`, text: `variant ${i}`, source: 'manual' as const, createdAt: '' }));
  const saved = await writePremise(dir, { working: '', slots: {} as any, variants });
  assert.equal(saved.variants.length, PREMISE_VARIANTS_MAX);
  assert.equal(saved.variants[0].text, 'variant 0');
});

test('parseWhatIfs reads tagged blocks, falls back to list lines, and keeps at most three', () => {
  assert.deepEqual(parseWhatIfs('<what-if> One. </what-if>\n<what-if>Two.</what-if><what-if>Three.</what-if><what-if>Four.</what-if>'), ['One.', 'Two.', 'Three.']);
  assert.deepEqual(parseWhatIfs('Here you go:\n1. What if A?\n2) What if B?\n- What if C?'), ['What if A?', 'What if B?', 'What if C?']);
  assert.deepEqual(parseWhatIfs('<what-if>  </what-if>'), []);
  assert.deepEqual(parseWhatIfs(''), []);
});

test('the mock provider answers what-if prompts with three deterministic variants', async () => {
  const whatIfs = await generateWhatIfs(mockProvider, 'Traven must win the oath duel. Otherwise the realm burns.');
  assert.deepEqual(whatIfs, [
    'What if Traven must win the oath duel… but the ally is the obstacle?',
    'What if Traven must win the oath duel… but winning costs the thing they wanted?',
    'What if Traven must win the oath duel… but the stakes were a lie?',
  ]);
});

test('every agent receives the working premise; none when it is empty', async () => {
  const project = await createProject(`Premise ${crypto.randomUUID()}`);
  const dir = await projectDir(project.id);
  const legacy = await readAgent(project.id, 'muse');
  const assigned = { ...legacy, id: 'assigned', access: { version: 1 as const, revision: 'r1', allow: [], deny: [], selection: false, proposeEdits: false } };

  for (const agent of [legacy, assigned]) {
    const bundle = await buildContext(project.id, agent, {});
    assert.ok(!bundle.sections.some((s) => s.name === 'premise'), 'no premise section before one is set');
  }

  await writePremise(dir, { working: `PREMISE_TEXT ${'p'.repeat(PREMISE_WORKING_MAX)}`, slots: {} as any, variants: [] });
  for (const agent of [legacy, assigned]) {
    const bundle = await buildContext(project.id, agent, {});
    const premise = bundle.sections.find((s) => s.name === 'premise');
    assert.ok(premise, `${agent.id} gets the premise`);
    assert.ok(premise!.body.startsWith('PREMISE_TEXT'));
    assert.ok(premise!.body.length <= PREMISE_WORKING_MAX);
  }
  const receipt = (await buildContext(project.id, assigned, {})).receipt!;
  assert.ok(receipt.records.some((r) => r.kind === 'premise' && r.id === 'working'), 'assigned-agent receipts record the premise');
});
