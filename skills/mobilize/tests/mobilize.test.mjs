import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { preparePlan, createBundle, runCli } from '../scripts/mobilize.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mobilize-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'story');
  await fs.mkdir(path.join(source, 'lore'), { recursive: true });
  const text = Buffer.from('\uFEFF---\r\nstatus: stub\r\n---\r\n# Glass City\r\nCONTESTED: A says dusk; B says dawn.\r\nOPEN GROUND: unknown.\r\n[PLAY] is not canon.\r\n');
  await fs.writeFile(path.join(source, 'lore/city.md'), text);
  const spec = {
    version: 1, sourceId: 'fixture-story', projectName: 'Glass City',
    documents: [{ sourcePath: 'lore/city.md', title: 'Glass City', kind: 'canon',
      provenance: { maturity: 'stub', reviewState: null, authority: 'Structured lore page', notes: ['Competing accounts remain in source; no claim extraction.'] } }],
  };
  return { dir, source, text, spec };
}

test('preview and approved bundle preserve exact source bytes and separate provenance from canon claims', async (t) => {
  const { source, text, spec } = await fixture(t);
  const plan = await preparePlan(source, spec);
  assert.equal(plan.format, 'muse-mobilize-plan');
  assert.equal(plan.documents[0].sha256, hash(text));
  assert.equal(plan.documents[0].provenance.maturity, 'stub');
  assert.ok(!JSON.stringify(plan).includes(source));
  const { backup, receipt } = await createBundle(source, plan, plan.approvalHash);
  assert.equal(backup.format, 'muse-project-backup');
  const doc = plan.documents[0];
  assert.deepEqual(Buffer.from(backup.files.find((file) => file.path === doc.destinationPath).data, 'base64'), text);
  assert.equal(receipt.documents[0].sourcePath, 'lore/city.md');
  assert.equal(receipt.documents[0].sha256, hash(text));
  assert.equal(receipt.claimExtraction, 'none');
  assert.ok(!backup.files.some((file) => file.path === 'canon/canon.json'));
  assert.ok(backup.files.some((file) => file.path === 'notes/mobilize-receipt.md'));
  assert.deepEqual(await fs.readFile(path.join(source, 'lore/city.md')), text);
});

test('bundle requires the reviewed plan hash and refuses changed sources or modified destinations', async (t) => {
  const { source, spec } = await fixture(t);
  const plan = await preparePlan(source, spec);
  await assert.rejects(createBundle(source, plan, undefined), /approval/i);
  await assert.rejects(createBundle(source, plan, '0'.repeat(64)), /approval/i);
  const tampered = structuredClone(plan);
  tampered.documents[0].destinationPath = '../escaped.md';
  await assert.rejects(createBundle(source, tampered, plan.approvalHash), /plan/i);
  await fs.appendFile(path.join(source, 'lore/city.md'), 'A changed source.');
  await assert.rejects(createBundle(source, plan, plan.approvalHash), /changed/i);
});

test('preview refuses traversal, symlinks, duplicate identities, malformed specs, and non-text input', async (t) => {
  const { dir, source, spec } = await fixture(t);
  await fs.writeFile(path.join(dir, 'outside.md'), 'PRIVATE');
  await fs.symlink(path.join(dir, 'outside.md'), path.join(source, 'lore/link.md'));
  await fs.symlink(dir, path.join(source, 'linked'));
  await fs.writeFile(path.join(source, 'lore/binary.md'), Buffer.from([0xff, 0x00]));
  const badPaths = ['../outside.md', '/etc/passwd', 'lore/../lore/city.md', 'lore\\city.md', 'lore/link.md', 'linked/outside.md', '.env', 'lore/binary.md'];
  for (const sourcePath of badPaths) {
    const bad = structuredClone(spec); bad.documents[0].sourcePath = sourcePath;
    await assert.rejects(preparePlan(source, bad), undefined, sourcePath);
  }
  const duplicate = structuredClone(spec); duplicate.documents.push(duplicate.documents[0]);
  await assert.rejects(preparePlan(source, duplicate), /duplicate/i);
  for (const bad of [null, { ...spec, version: 9 }, { ...spec, sourceId: '../bad' }, { ...spec, documents: [] },
    { ...spec, documents: [{ ...spec.documents[0], kind: 'character' }] },
    { ...spec, documents: [{ ...spec.documents[0], execute: 'not-an-option' }] }]) {
    await assert.rejects(preparePlan(source, bad));
  }
});

test('CLI writes reviewed artifacts outside the source only, never replaces files, and preserves identities on repeats', async (t) => {
  const { dir, source, spec, text } = await fixture(t);
  const specFile = path.join(dir, 'selection.json');
  const planFile = path.join(dir, 'preview.json');
  const bundleFile = path.join(dir, 'story.json');
  await fs.writeFile(specFile, JSON.stringify(spec));
  await runCli(['preview', '--source', source, '--spec', specFile, '--out', planFile]);
  const plan = JSON.parse(await fs.readFile(planFile, 'utf8'));
  const repeated = await preparePlan(source, spec);
  assert.deepEqual(repeated, plan);
  await runCli(['bundle', '--source', source, '--plan', planFile, '--approve', plan.approvalHash, '--out', bundleFile]);
  const bytes = await fs.readFile(bundleFile);
  assert.equal(JSON.parse(bytes).format, 'muse-project-backup');
  await assert.rejects(runCli(['bundle', '--source', source, '--plan', planFile, '--approve', plan.approvalHash, '--out', bundleFile]), /exist/i);
  assert.deepEqual(await fs.readFile(bundleFile), bytes);
  await assert.rejects(runCli(['preview', '--source', source, '--spec', specFile, '--out', path.join(source, 'preview.json')]), /outside/i);
  await fs.symlink(source, path.join(dir, 'source-alias'));
  await assert.rejects(runCli(['preview', '--source', source, '--spec', specFile, '--out', path.join(dir, 'source-alias/preview.json')]), /outside/i);
  assert.deepEqual(await fs.readFile(path.join(source, 'lore/city.md')), text);
  assert.deepEqual(await fs.readdir(source), ['lore']);
});

test('changed text keeps source identity but requires fresh approval; another source namespace gets different IDs', async (t) => {
  const { source, spec } = await fixture(t);
  const before = await preparePlan(source, spec);
  await fs.appendFile(path.join(source, 'lore/city.md'), 'Still contested.');
  const after = await preparePlan(source, spec);
  assert.equal(before.documents[0].id, after.documents[0].id);
  assert.notEqual(before.approvalHash, after.approvalHash);
  const other = await preparePlan(source, { ...spec, sourceId: 'other-story' });
  assert.notEqual(after.documents[0].id, other.documents[0].id);
});

test('bounded inputs reject oversized files, excessive selections, and oversized provenance before packaging', async (t) => {
  const { source, spec } = await fixture(t);
  const file = await fs.open(path.join(source, 'lore/city.md'), 'r+');
  await file.truncate(8 * 1024 * 1024 + 1); await file.close();
  await assert.rejects(preparePlan(source, spec), /8 MiB/i);
  await assert.rejects(preparePlan(source, { ...spec, documents: Array(1001).fill(spec.documents[0]) }), /1000/);
  const document = { ...spec.documents[0], provenance: { maturity: null, reviewState: null, authority: null, notes: Array(20).fill('x'.repeat(2000)) } };
  await assert.rejects(preparePlan(source, { ...spec, documents: Array.from({ length: 120 }, (_, index) => ({ ...document, sourcePath: `lore/large-${index}.md` })) }), /4 MiB/);
});
