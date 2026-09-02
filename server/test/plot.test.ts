import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPlotEdge, createPlotNode, readPlot, updatePlotEdge, updatePlotNode } from '../src/plot.js';

test('branching through-line persists and merges into one later beat', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-plot-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const seal = await createPlotNode(projectDir, {
    title: 'Imperial seal revealed', kind: 'reveal', section: 'Act I', position: { x: 160, y: 220 },
  });
  const confront = await createPlotNode(projectDir, {
    title: 'Confront the Warden', kind: 'turn', section: 'Act II', position: { x: 430, y: 120 },
  });
  const investigate = await createPlotNode(projectDir, {
    title: 'Search the sealed archive', kind: 'beat', section: 'Act II', position: { x: 430, y: 320 },
  });
  const truth = await createPlotNode(projectDir, {
    title: 'Brother’s message decoded', kind: 'reveal', section: 'Act III', position: { x: 720, y: 220 },
  });

  await createPlotEdge(projectDir, { from: seal.id, to: confront.id, relation: 'branch', label: 'direct path' });
  await createPlotEdge(projectDir, { from: seal.id, to: investigate.id, relation: 'branch', label: 'quiet path' });
  await createPlotEdge(projectDir, { from: confront.id, to: truth.id, relation: 'merge' });
  await createPlotEdge(projectDir, { from: investigate.id, to: truth.id, relation: 'merge' });

  const reopened = await readPlot(projectDir);
  assert.equal(reopened.nodes.length, 4);
  assert.equal(reopened.edges.filter((edge) => edge.relation === 'branch').length, 2);
  assert.equal(reopened.edges.filter((edge) => edge.relation === 'merge').length, 2);
  assert.deepEqual(reopened.nodes.find((node) => node.id === truth.id)?.position, { x: 720, y: 220 });
});

test('connection to a missing plot node is rejected before persistence', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-plot-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const opening = await createPlotNode(projectDir, { title: 'Opening image' });
  await assert.rejects(
    createPlotEdge(projectDir, { from: opening.id, to: 'missing-node', relation: 'sequence' }),
    /No such plot node/,
  );
  assert.deepEqual((await readPlot(projectDir)).edges, []);
});

test('story thread label and relation can be revised after creation', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-plot-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const opening = await createPlotNode(projectDir, { title: 'Council summons Kiala' });
  const archive = await createPlotNode(projectDir, { title: 'Search the sealed archive' });
  const edge = await createPlotEdge(projectDir, {
    from: opening.id, to: archive.id, relation: 'sequence', label: 'first idea',
  });

  const updated = await updatePlotEdge(projectDir, edge.id, {
    relation: 'branch', label: 'quiet path',
  });

  assert.equal(updated.id, edge.id);
  assert.equal(updated.relation, 'branch');
  assert.equal(updated.label, 'quiet path');
  assert.deepEqual((await readPlot(projectDir)).edges, [updated]);
});

test('plot folio persists optional world anchors by stable ID and role', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-plot-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const node = await createPlotNode(projectDir, { title: 'Council confrontation', kind: 'turn' });
  const updated = await updatePlotNode(projectDir, node.id, {
    summary: 'Kiala chooses silence while council factions expose themselves.',
    details: {
      goal: 'Learn why she was summoned', conflict: 'Warden controls the room',
      stakes: 'Her brother becomes suspect', outcome: 'Imperial seal changes her objective', notes: 'Keep exposition indirect.',
    },
    documentId: 'chapter-01',
    worldRefs: [
      { entityId: 'veyr-id', role: 'setting' },
      { entityId: 'tide-council-id', role: 'catalyst' },
    ],
  });

  const reopened = await readPlot(projectDir);
  assert.deepEqual(updated.worldRefs, [
    { entityId: 'veyr-id', role: 'setting' },
    { entityId: 'tide-council-id', role: 'catalyst' },
  ]);
  assert.equal(reopened.nodes[0].details.outcome, 'Imperial seal changes her objective');
  assert.equal(reopened.nodes[0].documentId, 'chapter-01');
});

test('plot node rejects more than three world anchors', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-plot-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const node = await createPlotNode(projectDir, { title: 'Crossing the city' });
  await assert.rejects(
    updatePlotNode(projectDir, node.id, {
      worldRefs: [
        { entityId: 'one', role: 'setting' },
        { entityId: 'two', role: 'constraint' },
        { entityId: 'three', role: 'catalyst' },
        { entityId: 'four', role: 'affected' },
      ],
    }),
    /at most 3 world anchors/,
  );
  assert.deepEqual((await readPlot(projectDir)).nodes[0].worldRefs, []);
});

test('new plot folio is created atomically with details and sparse world anchors', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-plot-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const node = await createPlotNode(projectDir, {
    title: 'Seal on the table', summary: 'Recognition changes Kiala’s objective.', kind: 'reveal', section: 'Opening',
    position: { x: 240, y: 180 }, documentId: 'chapter-01',
    details: { goal: 'Stay unreadable', conflict: 'Warden watches', stakes: 'Brother accused', outcome: 'New objective', notes: '' },
    worldRefs: [{ entityId: 'veyr-id', role: 'setting' }],
  });

  assert.equal(node.details.goal, 'Stay unreadable');
  assert.equal(node.documentId, 'chapter-01');
  assert.deepEqual(node.worldRefs, [{ entityId: 'veyr-id', role: 'setting' }]);
});
