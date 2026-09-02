import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createScene, createSceneTheme, readScenes, updateScene } from '../src/scenes.js';

test('scene storyboard persists typed story assets and ordered beat lane', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-scenes-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const theme = await createSceneTheme(projectDir, { name: 'Duty versus kinship', description: 'Public role strains private loyalty.' });
  const scene = await createScene(projectDir, {
    title: 'Council summons Kiala', section: 'Act I', purpose: 'Force Kiala to choose a public mask.',
    assets: [
      { kind: 'character', refId: 'kiala-id', role: 'viewpoint' },
      { kind: 'location', refId: 'council-id', role: 'setting' },
      { kind: 'theme', refId: theme.id, role: 'pressure' },
      { kind: 'plot', refId: 'summons-beat-id', role: 'dramatizes' },
      { kind: 'character', refId: 'kiala-id', role: 'duplicate ignored' },
    ],
    beats: [
      { id: '', title: 'Enter under scrutiny', summary: '', order: 3 },
      { id: '', title: 'Seal reaches table', summary: 'Recognition changes objective.', order: 9 },
    ],
  });

  assert.equal(scene.assets.length, 4);
  assert.deepEqual(scene.beats.map((beat) => beat.order), [0, 1]);
  const reopened = await readScenes(projectDir);
  assert.equal(reopened.scenes[0].assets.find((asset) => asset.kind === 'theme')?.refId, theme.id);
  assert.equal(reopened.scenes[0].beats[1].title, 'Seal reaches table');
});

test('dialogue lines retain speaker, subtext, knowledge state, and voice check', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-dialogue-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const scene = await createScene(projectDir, { title: 'The summons' });
  const updated = await updateScene(projectDir, scene.id, {
    dialogue: [
      {
        id: '', speakerId: 'warden-id', text: 'You recognize this mark.',
        subtext: 'I know you are hiding something.', knowledgeState: 'Knows Kiala saw the seal before.',
        voiceStatus: 'review', voiceNote: 'Too direct for his established tactics.', order: 4,
      },
      {
        id: '', speakerId: 'kiala-id', text: 'Should I?', subtext: 'Do not give him certainty.',
        knowledgeState: 'Recognizes the imperial seal; does not know why it is here.',
        voiceStatus: 'in_voice', voiceNote: 'Deflects with compressed question.', order: 8,
      },
    ],
  });

  assert.deepEqual(updated.dialogue.map((line) => line.order), [0, 1]);
  assert.equal(updated.dialogue[0].subtext, 'I know you are hiding something.');
  assert.equal(updated.dialogue[1].voiceStatus, 'in_voice');
  assert.equal((await readScenes(projectDir)).scenes[0].dialogue[1].knowledgeState, 'Recognizes the imperial seal; does not know why it is here.');
});

test('scene update rejects invalid status without changing persisted scene', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-scenes-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  const scene = await createScene(projectDir, { title: 'Crossing' });

  await assert.rejects(updateScene(projectDir, scene.id, { status: 'lost' as any }), /scene status must be one of/);
  assert.equal((await readScenes(projectDir)).scenes[0].status, 'planned');
});
