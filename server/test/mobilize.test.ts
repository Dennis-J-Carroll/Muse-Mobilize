import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportProjectBackup, restoreProjectBackup } from '../src/backups.js';

const helperUrl = new URL('../../skills/mobilize/scripts/mobilize.mjs', import.meta.url);
// The standalone skill intentionally uses Node built-ins without a TypeScript runtime dependency.
const { preparePlan, createBundle } = await import(helperUrl.href);

test('Mobilize bundle restores through Muse and re-exports source documents and receipt without loss', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-mobilize-integration-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const source = path.join(temp, 'source');
  const workspaceRoot = path.join(temp, 'workspace');
  await fs.mkdir(source);
  await fs.mkdir(workspaceRoot);
  const manuscript = Buffer.from('# Chapter\r\n\r\nShe kept the two accounts separate.\r\n');
  const lore = Buffer.from('---\nstatus: stub\n---\nCONTESTED: Dawn / dusk.\nOPEN GROUND: unanswered.\n');
  await fs.writeFile(path.join(source, 'chapter.md'), manuscript);
  await fs.writeFile(path.join(source, 'lore.md'), lore);
  const plan = await preparePlan(source, { version: 1, sourceId: 'roundtrip', projectName: 'Roundtrip', documents: [
    { sourcePath: 'chapter.md', title: 'Chapter', kind: 'manuscript' },
    { sourcePath: 'lore.md', title: 'Lore', kind: 'canon' },
  ] });
  const { backup, receipt } = await createBundle(source, plan, plan.approvalHash);
  const restored = await restoreProjectBackup(JSON.stringify(backup), { workspaceRoot });
  const exported = await exportProjectBackup(restored.id, { workspaceRoot });
  assert.equal(restored.documents.length, 3);
  assert.equal(restored.documents[0].id, plan.documents[0].id);
  for (const original of backup.files.filter((file: { path: string }) => file.path !== 'project.json')) {
    assert.deepEqual(exported.files.find((file) => file.path === original.path), original);
  }
  const receiptFile = exported.files.find((file) => file.path === 'notes/mobilize-receipt.md')!;
  assert.ok(Buffer.from(receiptFile.data, 'base64').toString('utf8').includes(receipt.planHash));
  assert.deepEqual(await fs.readFile(path.join(source, 'chapter.md')), manuscript);
  assert.deepEqual(await fs.readFile(path.join(source, 'lore.md')), lore);
  const again = await restoreProjectBackup(backup, { workspaceRoot });
  assert.notEqual(again.id, restored.id, 'Repeat restore is a separate copy, not an in-place sync.');
});
