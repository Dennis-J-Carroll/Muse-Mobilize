import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-binder-'));
process.env.MUSE_CONFIG_DIR = path.join(root, 'config');
await fs.mkdir(process.env.MUSE_CONFIG_DIR);
await fs.writeFile(path.join(process.env.MUSE_CONFIG_DIR, 'settings.json'), JSON.stringify({ workspaceRoot: root, defaultProvider: 'mock' }));
const { createProject, writeDocument, readDocument, readAgent, projectDir } = await import('../src/projects.js');
const { previewBinder, saveBinder, readBinder, verifyBinderSnapshot, packageBinder } = await import('../src/binder.js');
const { importSource } = await import('../src/sources.js');
const { saveAgent, saveArrangement, readArrangements } = await import('../src/agent-config.js');
const { exportProjectBackup, restoreProjectBackup } = await import('../src/backups.js');
const { parseRecipe } = await import('../../shared/project-tools.js');
after(() => fs.rm(root, { recursive: true, force: true }));

async function fixture() {
  const project = await createProject(`Binder ${crypto.randomUUID()}`);
  await writeDocument(project.id, 'chapter-01', '# Étoile\n\nStory Unicode — 狐.\n\n<script>alert("unsafe")</script>\n\n**Bold prose.**');
  await writeDocument(project.id, 'notes', 'PRIVATE_NOTE');
  const source = await importSource(await projectDir(project.id), { name: 'secret-source.md', data: Buffer.from('PRIVATE_SOURCE_ORIGINAL').toString('base64') });
  const recipe = parseRecipe({ format: 'muse-project-binder', version: 1, title: 'Étoile <script>bad()</script>', introduction: 'A binder of the world.', sections: [{ id: 'story', title: 'Story', kind: 'document', selection: { mode: 'selected', ids: ['chapter-01'] } }], pageSize: 'letter', includeImages: true });
  return { project, recipe, source: source.source };
}

test('binder renders only selected content, escapes executable HTML, and preserves source bytes', async () => {
  const { project, recipe } = await fixture();
  const original = await readDocument(project.id, 'chapter-01');
  const preview = await previewBinder(project.id, recipe);
  assert.match(preview.html, /Étoile/);
  assert.match(preview.html, /狐/);
  assert.match(preview.html, /<strong>Bold prose\.<\/strong>/);
  assert.ok(!preview.html.includes('<script>'));
  assert.ok(!preview.html.includes('PRIVATE_NOTE'));
  assert.ok(!preview.html.includes('PRIVATE_SOURCE_ORIGINAL'));
  assert.equal(preview.included, 1);
  assert.deepEqual(await readDocument(project.id, 'chapter-01'), original);
  await verifyBinderSnapshot(project.id, preview.receipt.snapshotHash);
});

test('selected IDs define reading order, missing IDs warn, and empty selection remains empty', async () => {
  const { project, recipe } = await fixture();
  recipe.sections[0].selection = { mode: 'selected', ids: ['notes', 'chapter-01', 'missing'] };
  const preview = await previewBinder(project.id, recipe);
  assert.ok(preview.html.indexOf('PRIVATE_NOTE') < preview.html.indexOf('Story Unicode'));
  assert.match(preview.warnings.join(' '), /missing record missing/);
  recipe.sections[0].selection = { mode: 'selected', ids: [] };
  const empty = await previewBinder(project.id, recipe);
  assert.equal(empty.included, 0);
  assert.ok(!empty.html.includes('PRIVATE_NOTE'));
});

test('changed project invalidates preview before download or packaging', async () => {
  const { project, recipe } = await fixture();
  const preview = await previewBinder(project.id, recipe);
  await writeDocument(project.id, 'chapter-01', 'Revised story.');
  await assert.rejects(verifyBinderSnapshot(project.id, preview.receipt.snapshotHash), /changed/);
  await assert.rejects(packageBinder(project.id, recipe, preview.receipt.snapshotHash), /changed/);
});

function unzipStored(zip: Buffer) {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(zip.readUInt16LE(offset + 8), 0);
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength;
    files.set(name, zip.subarray(start, start + size)); offset = start + size;
  }
  return files;
}

test('project package restores Sources, recipe, agent assignments, and saved arrangements independently', async () => {
  const { project, recipe, source } = await fixture();
  await saveBinder(project.id, recipe);
  const base = await readAgent(project.id, 'muse');
  const managed = await saveAgent(project.id, { ...base, access: { version: 1, revision: 'draft', allow: [{ kind: 'source', selection: { mode: 'selected', ids: [source.id] } }], deny: [], selection: false, proposeEdits: false } }, 'legacy');
  await saveArrangement(project.id, 'Source adviser', [managed.id]);
  const preview = await previewBinder(project.id, recipe);
  const files = unzipStored(await packageBinder(project.id, recipe, preview.receipt.snapshotHash));
  assert.equal(files.size, 5);
  assert.ok(!files.get('binder.html')!.toString().includes('PRIVATE_SOURCE_ORIGINAL'));
  const restored = await restoreProjectBackup(files.get('project-backup.json')!);
  assert.notEqual(restored.id, project.id);
  assert.deepEqual(await readBinder(restored.id), recipe);
  assert.deepEqual((await readAgent(restored.id, 'muse')).access, managed.access);
  assert.equal((await readArrangements(restored.id))[0].name, 'Source adviser');
  const backup = await exportProjectBackup(restored.id);
  const original = backup.files.find((f) => f.path === `sources/originals/${source.id}`);
  assert.equal(Buffer.from(original!.data, 'base64').toString(), 'PRIVATE_SOURCE_ORIGINAL');
});

test('recipe parser rejects unsupported versions, paths-as-kinds, and duplicate sections', () => {
  const valid = { format: 'muse-project-binder', version: 1, title: 'A', introduction: '', sections: [], pageSize: 'a4', includeImages: false };
  assert.throws(() => parseRecipe({ ...valid, version: 99 }));
  assert.throws(() => parseRecipe({ ...valid, sections: [{ id: 'x', title: 'x', kind: '../../settings', selection: { mode: 'all' } }] }));
  const section = { id: 'x', title: 'x', kind: 'document', selection: { mode: 'all' } };
  assert.throws(() => parseRecipe({ ...valid, sections: [section, section] }), /Duplicate/);
});

test('binder embeds selected local images, preserves captions, and omits remote image requests', async () => {
  const { project, recipe } = await fixture();
  const { saveImageAsset } = await import('../src/assets.js');
  const { createCanonEntity } = await import('../src/canon.js');
  const dir = await projectDir(project.id);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const asset = await saveImageAsset(dir, { name: 'portrait.png', mimeType: 'image/png', data: png });
  const local = { id: 'portrait', src: `/api/projects/${project.id}/assets/images/${asset.fileName}`, caption: 'Portrait — 狐', tags: [] };
  const external = { ...local, id: 'remote', src: 'https://example.invalid/private-tracker.png', caption: 'Remote portrait' };
  const entity = await createCanonEntity(dir, { name: 'Mara', type: 'character', character: { references: { images: [local, external] } } as any });
  recipe.sections = [{ id: 'cast', title: 'Cast', kind: 'character', selection: { mode: 'selected', ids: [entity.id] } }];
  const preview = await previewBinder(project.id, recipe);
  assert.match(preview.html, /data:image\/png;base64,/);
  assert.ok(preview.html.includes('Portrait — 狐'));
  assert.ok(!preview.html.includes('src="https://'));
  assert.match(preview.warnings.join(' '), /external or unsupported image omitted/);
  const textOnly = await previewBinder(project.id, { ...recipe, includeImages: false });
  assert.ok(!textOnly.html.includes('data:image/png;base64,'));
});
