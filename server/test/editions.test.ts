import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveEditionAt, readEditionsAt } from '../src/editions.js';
import { captureSavedProject, writeBackupArchive, readBackupArchive, installSavedProject, validateSavedProject } from '../src/backup-archive.js';
import { recordEdit, restoreEdit, withProjectEdit, historyStatus } from '../src/history.js';
const recipe = { version: 1, id: 'edition', title: 'Selected novel', author: '', documentIds: ['chapter'], images: [] };
test('saved editions round trip through archive, restore and edit history', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-edition-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'); await fs.mkdir(path.join(source, 'manuscript'), { recursive: true });
  await fs.writeFile(path.join(source, 'project.json'), JSON.stringify({ id: 'sample', name: 'Sample', createdAt: '2026-01-01', updatedAt: '2026-01-01', documents: [
    { id: 'chapter', title: 'Chapter', kind: 'manuscript', path: 'manuscript/chapter.md', order: 0 },
  ] }));
  await fs.writeFile(path.join(source, 'manuscript/chapter.md'), 'Saved prose.');
  assert.deepEqual(await readEditionsAt(source), { version: 1, recipes: [] });
  await withProjectEdit(source, () => recordEdit(source, 'edition-session', 'Save edition', ['editions'], () => saveEditionAt(source, 'edition', recipe)));
  assert.deepEqual((await readEditionsAt(source)).recipes, [recipe]);
  await assert.rejects(saveEditionAt(source, 'edition', { ...recipe, documentIds: ['missing'] }), /saved manuscript/);
  await assert.rejects(saveEditionAt(source, 'wrong', recipe), /must match/);
  const snapshot = path.join(root, 'snapshot'), archive = path.join(root, 'backup.zip');
  const manifest = await captureSavedProject(source, 'sample', snapshot);
  assert.ok(manifest.files.some(file => file.path === 'editions/recipes.json'));
  await writeBackupArchive(snapshot, manifest, archive);
  const extracted = path.join(root, 'extracted'); await readBackupArchive(archive, extracted);
  const restored = await installSavedProject(extracted, manifest, path.join(root, 'workspace'));
  assert.deepEqual((await readEditionsAt(path.join(root, 'workspace', `${restored.id}.muse`))).recipes, [recipe]);
  await restoreEdit(source, 'edition-session', 'undo', historyStatus(source, 'edition-session').undo!.id);
  assert.deepEqual((await readEditionsAt(source)).recipes, []);
  await restoreEdit(source, 'edition-session', 'redo', historyStatus(source, 'edition-session').redo!.id);
  assert.deepEqual((await readEditionsAt(source)).recipes, [recipe]);
  await fs.writeFile(path.join(snapshot, 'editions/recipes.json'), JSON.stringify({ version: 1, recipes: [{ ...recipe, documentIds: ['chapter', 'chapter'] }] }));
  await assert.rejects(validateSavedProject(snapshot, manifest), /only once/);
});
