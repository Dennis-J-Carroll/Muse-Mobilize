import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-idea-'));
process.env.MUSE_CONFIG_DIR = path.join(root, 'config');
await fs.mkdir(process.env.MUSE_CONFIG_DIR);
await fs.writeFile(path.join(process.env.MUSE_CONFIG_DIR, 'settings.json'), JSON.stringify({ workspaceRoot: root, defaultProvider: 'mock' }));
const { createProject, readDocument, projectDir } = await import('../src/projects.js');
const { readPremise, PREMISE_WORKING_MAX } = await import('../src/premise.js');
after(() => fs.rm(root, { recursive: true, force: true }));

test('createProject stores the idea as the working premise and in the scratchpad', async () => {
  const project = await createProject(`Idea ${crypto.randomUUID()}`, 'A lighthouse keeper hears the sea answer back.');
  const dir = await projectDir(project.id);
  assert.equal((await readPremise(dir)).working, 'A lighthouse keeper hears the sea answer back.');
  const notes = await readDocument(project.id, 'notes');
  assert.ok(notes.content.startsWith('## The idea\n\nA lighthouse keeper hears the sea answer back.\n'));
  const chapter = await readDocument(project.id, 'chapter-01');
  assert.ok(!chapter.content.includes('lighthouse'));
});

test('createProject without an idea leaves the premise empty', async () => {
  const project = await createProject(`Plain ${crypto.randomUUID()}`);
  assert.equal((await readPremise(await projectDir(project.id))).working, '');
});

test('createProject rejects an idea longer than the premise limit instead of truncating it', async () => {
  const name = `Long ${crypto.randomUUID()}`;
  await assert.rejects(createProject(name, 'x'.repeat(PREMISE_WORKING_MAX + 1)), /longer than 1200 characters/);
  const atLimit = await createProject(`${name} ok`, 'y'.repeat(PREMISE_WORKING_MAX));
  assert.equal((await readPremise(await projectDir(atLimit.id))).working.length, PREMISE_WORKING_MAX);
});
