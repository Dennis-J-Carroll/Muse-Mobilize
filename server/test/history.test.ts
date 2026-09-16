import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { historyStatus, recordEdit, restoreEdit, withProjectEdit } from '../src/history.js';
import { SEED_AGENTS, SEED_CHAPTER, SEED_NOTES, SEED_OUTLINE } from '../src/seed.js';

async function fixture(t: any) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-history-'));
  t.after(() => fs.rm(dir, { force: true, recursive: true }));
  await fs.writeFile(path.join(dir, 'draft.md'), 'before');
  const write = (text: string, session = 'phone-session') => withProjectEdit(dir, () => recordEdit(dir, session, 'Write draft', ['draft.md'], () => fs.writeFile(path.join(dir, 'draft.md'), text)));
  const travel = (direction: 'undo' | 'redo', session = 'phone-session') => restoreEdit(dir, session, direction, historyStatus(dir, session)[direction]!.id);
  const read = () => fs.readFile(path.join(dir, 'draft.md'), 'utf8');
  return { dir, write, travel, read };
}

test('undo and redo round trip, skip no-op saves, clear redo after a new edit', async (t) => {
  const f = await fixture(t);
  await f.write('after'); const id = historyStatus(f.dir, 'phone-session').undo!.id;
  await f.write('after'); assert.equal(historyStatus(f.dir, 'phone-session').undo!.id, id);
  await f.travel('undo'); assert.equal(await f.read(), 'before');
  await f.travel('redo'); assert.equal(await f.read(), 'after');
  await f.travel('undo'); await f.write('branch');
  assert.equal(historyStatus(f.dir, 'phone-session').redo, null);
  await f.travel('undo'); assert.equal(await f.read(), 'before');
});

test('history is scoped by project and browser; stale tokens and newer file edits are refused', async (t) => {
  const f = await fixture(t); const other = await fixture(t);
  await f.write('phone edit');
  assert.equal(historyStatus(f.dir, 'desktop-session').undo, null);
  assert.equal(historyStatus(other.dir, 'phone-session').undo, null);
  await assert.rejects(restoreEdit(f.dir, 'phone-session', 'undo', 'old-token'), /history changed/);
  await f.write('desktop edit', 'desktop-session');
  await assert.rejects(f.travel('undo'), /changed elsewhere/);
  assert.equal(await f.read(), 'desktop edit');
});

test('multi-file restores validate every file before writing any file', async (t) => {
  const f = await fixture(t);
  await recordEdit(f.dir, 'phone-session', 'Two files', ['draft.md', 'new.md'], async () => {
    await fs.writeFile(path.join(f.dir, 'draft.md'), 'after'); await fs.writeFile(path.join(f.dir, 'new.md'), 'new');
  });
  await fs.writeFile(path.join(f.dir, 'new.md'), 'external edit');
  await assert.rejects(f.travel('undo'), /changed elsewhere/);
  assert.equal(await f.read(), 'after');
});

test('queued rapid writes retain distinct undo steps', async (t) => {
  const f = await fixture(t);
  await Promise.all([f.write('first'), f.write('second'), f.write('third')]);
  for (const text of ['second', 'first', 'before']) { await f.travel('undo'); assert.equal(await f.read(), text); }
});

test('restoring permission assignments always creates a fresh policy revision', async (t) => {
  const f = await fixture(t); await fs.mkdir(path.join(f.dir, 'agents'));
  const file = path.join(f.dir, 'agents/test.yml');
  const original = { id: 'test', access: { revision: 'old', allow: [] } };
  await fs.writeFile(file, yaml.dump(original));
  await recordEdit(f.dir, 'phone-session', 'Agent access', ['agents'], () => fs.writeFile(file, yaml.dump({ id: 'test', access: { revision: 'new', allow: ['character'] } })));
  await f.travel('undo'); const restored = yaml.load(await fs.readFile(file, 'utf8')) as any;
  assert.deepEqual(restored.access.allow, []); assert.notEqual(restored.access.revision, 'old');
  await f.travel('redo'); const redone = yaml.load(await fs.readFile(file, 'utf8')) as any;
  assert.deepEqual(redone.access.allow, ['character']); assert.notEqual(redone.access.revision, 'new');
  await f.travel('undo'); assert.notEqual((yaml.load(await fs.readFile(file, 'utf8')) as any).access.revision, restored.access.revision);
});

test('deleted image bytes restore and remain reusable after redo', async (t) => {
  const f = await fixture(t); await fs.mkdir(path.join(f.dir, 'assets'));
  const image = path.join(f.dir, 'assets/image.png'); const bytes = Buffer.from([0, 1, 2, 255]);
  await fs.writeFile(image, bytes);
  await recordEdit(f.dir, 'phone-session', 'Remove reference', ['draft.md', 'assets'], async () => {
    await fs.writeFile(path.join(f.dir, 'draft.md'), 'removed reference'); await fs.rm(image);
  });
  await f.travel('undo'); assert.deepEqual(await fs.readFile(image), bytes);
  await f.travel('redo'); assert.equal(await f.read(), 'removed reference'); assert.deepEqual(await fs.readFile(image), bytes);
  await f.travel('undo'); assert.equal(await f.read(), 'before');
});

test('source-like files retain their exact bytes across deletion and restoration', async (t) => {
  const f = await fixture(t); await fs.mkdir(path.join(f.dir, 'sources/originals'), { recursive: true });
  const file = path.join(f.dir, 'sources/originals/one'); const original = Buffer.from([255, 0, 10, 34]);
  await fs.writeFile(file, original);
  await recordEdit(f.dir, 'phone-session', 'Delete Source', ['sources'], () => fs.rm(file));
  await f.travel('undo'); assert.deepEqual(await fs.readFile(file), original);
  await f.travel('redo'); await assert.rejects(fs.readFile(file), { code: 'ENOENT' });
});

test('undo refuses symlink replacement and preserves its target', async (t) => {
  const f = await fixture(t); await f.write('after');
  await fs.writeFile(path.join(f.dir, 'elsewhere'), 'private'); await fs.rm(path.join(f.dir, 'draft.md'));
  await fs.symlink(path.join(f.dir, 'elsewhere'), path.join(f.dir, 'draft.md'));
  await assert.rejects(f.travel('undo'), /symbolic links/);
  assert.equal(await fs.readFile(path.join(f.dir, 'elsewhere'), 'utf8'), 'private');
});

test('starter project has a neutral character persona and valid contact IDs', () => {
  const text = JSON.stringify([SEED_AGENTS, SEED_CHAPTER, SEED_NOTES, SEED_OUTLINE]);
  assert.doesNotMatch(text, /kiala|senna/i); assert.match(text, /character-1/);
  const agents = SEED_AGENTS.map((agent) => yaml.load(agent.yaml) as any);
  assert.equal(agents.find((a) => a.role === 'character').name, 'character-1');
  for (const agent of agents) for (const id of [...agent.communication?.may_contact ?? [], ...agent.communication?.may_be_contacted_by ?? []]) assert.ok(agents.some((a) => a.id === id), id);
});
