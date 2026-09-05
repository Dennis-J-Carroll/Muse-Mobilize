import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createScene, createSceneTheme, readScenes, updateScene, updateSceneTheme } from '../src/scenes.js';

test('scene storyboard persists typed story assets and ordered beat lane', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-scenes-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const theme = await createSceneTheme(projectDir, { name: 'Duty versus kinship', description: 'Public role strains private loyalty.' });
  const scene = await createScene(projectDir, {
    title: 'Council summons Kiala', section: 'Act I', purpose: 'Force Kiala to choose a public mask.',
    assets: [
      { kind: 'character', refId: 'kiala-id', role: 'viewpoint' },
      { kind: 'location', refId: 'council-id', role: 'setting' },
      { kind: 'theme', refId: theme.id, role: 'appears' },
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

test('theme map persists motif metadata and typed occurrences across scenes', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-themes-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const theme = await createSceneTheme(projectDir, {
    name: 'Inherited duty',
    description: 'What family asks us to carry.',
    question: 'When does loyalty become surrender?',
    motif: 'A cracked silver seal',
  });
  const updated = await updateSceneTheme(projectDir, theme.id, { motif: 'Cracked seals and broken rings' });
  const scene = await createScene(projectDir, {
    title: 'The seal returns',
    assets: [{ kind: 'theme', refId: theme.id, role: 'echoes' }],
  });

  assert.equal(updated.question, 'When does loyalty become surrender?');
  assert.equal(updated.motif, 'Cracked seals and broken rings');
  assert.equal(scene.assets[0].role, 'echoes');
  await assert.rejects(
    updateScene(projectDir, scene.id, { assets: [{ kind: 'theme', refId: theme.id, role: 'intensifies' } as any] }),
    /theme occurrence must be one of/,
  );
  assert.equal((await readScenes(projectDir)).scenes[0].assets[0].role, 'echoes');
});

test('unrelated scene edit normalizes legacy theme pressure role to appears', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-legacy-theme-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  const theme = await createSceneTheme(projectDir, { name: 'Duty' });
  const scene = await createScene(projectDir, {
    title: 'Old scene',
    assets: [{ kind: 'theme', refId: theme.id, role: 'appears' }],
  });
  const file = path.join(projectDir, 'scenes', 'scenes.json');
  const legacy = JSON.parse(await fs.readFile(file, 'utf8'));
  legacy.scenes[0].assets[0].role = 'pressure';
  await fs.writeFile(file, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');

  const updated = await updateScene(projectDir, scene.id, { summary: 'Unrelated summary edit.' });

  assert.equal(updated.summary, 'Unrelated summary edit.');
  assert.equal(updated.assets[0].role, 'appears');
  assert.equal((await readScenes(projectDir)).scenes[0].assets[0].role, 'appears');
});
