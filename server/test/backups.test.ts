import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { exportProjectBackup, restoreProjectBackup } from '../src/backups.js';

const stamp = '2026-01-02T03:04:05.000Z';
const imageUrl = '/api/projects/backup-fixture/assets/images/pixel.png';
const manifest = {
  id: 'backup-fixture', name: 'Backup Fixture', createdAt: stamp, updatedAt: stamp,
  documents: [
    { id: 'one', title: 'One', kind: 'manuscript', path: 'manuscript/one.md', order: 1 },
  ],
};

async function fixture(t: TestContext) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-backup-test-'));
  t.after(() => fs.rm(workspaceRoot, { recursive: true, force: true }));
  const projectDir = path.join(workspaceRoot, 'backup-fixture.muse');
  const save = async (relativePath: string, value: string | Buffer | object) => {
    const destination = path.join(projectDir, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  };
  await save('project.json', manifest);
  await save('manuscript/one.md', `Literal saved prose: ${imageUrl}\n`);
  return { workspaceRoot, projectDir, save };
}

test('saved stores and binary files restore under a fresh identity without changing the original', async (t) => {
  // Catches omitted stores, binary corruption, destructive restore, and retained source identity.
  const { workspaceRoot, projectDir, save } = await fixture(t);
  const binary = Buffer.from([0, 255, 1, 128, 13, 10, 0]);
  const saved = {
    'assets/images/pixel.png': binary,
    'outline/outline.md': '# Outline\n',
    'notes/scratchpad.md': '# Scratchpad\n',
    'canon/characters/person.md': '# Person\n',
    'canon/canon.json': { version: 1, entities: [], facts: [] },
    'plot/plot.json': { version: 1, nodes: [], edges: [] },
    'scenes/scenes.json': { version: 1, scenes: [], themes: [{ id: 'theme-one', name: 'Belonging' }] },
    'references/references.json': { version: 1, items: [] },
    'goals/goals.json': { version: 1, milestones: [{ id: 'goal-one', title: 'Finish' }] },
    'world/map.json': { version: 1, image: null, visible: true, opacity: 0.8 },
    'connections/connections.json': { version: 1, tags: [{ id: 'red', name: 'Red' }], connections: [] },
    'agents/editor.yaml': 'id: editor\nname: Editor\n',
    'workspaces/writing.json': { id: 'writing', name: 'Writing' },
    '.muse/events.jsonl': '{"id":"event-one","type":"document.saved"}\n',
    '.muse/snapshots/one-before.md': 'Earlier manuscript\n',
  };
  for (const [file, value] of Object.entries(saved)) await save(file, value);

  const backup = await exportProjectBackup('backup-fixture', { workspaceRoot });
  assert.equal(backup.format, 'muse-project-backup');
  assert.equal(backup.version, 1);
  assert.equal(backup.sourceProjectId, 'backup-fixture');
  assert.ok(Number.isFinite(Date.parse(backup.capturedAt)));
  assert.deepEqual(backup.files.map((file) => file.path).sort(), [...Object.keys(saved), 'project.json', 'manuscript/one.md'].sort());
  const restored = await restoreProjectBackup(Buffer.from(JSON.stringify(backup)), { workspaceRoot });
  const again = await restoreProjectBackup(JSON.stringify(backup), { workspaceRoot });
  assert.match(restored.id, /^backup-fixture-restored-[a-f0-9-]{36}$/);
  assert.notEqual(again.id, restored.id);
  assert.equal(restored.name, 'Backup Fixture (restored)');
  assert.deepEqual(restored.documents, manifest.documents);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(projectDir, 'project.json'), 'utf8')), manifest);
  for (const file of backup.files.filter((file) => file.path !== 'project.json')) {
    const actual = await fs.readFile(path.join(workspaceRoot, `${restored.id}.muse`, file.path));
    assert.deepEqual(actual, Buffer.from(file.data, 'base64'), file.path);
    assert.equal(file.size, actual.length);
    assert.equal(file.sha256, createHash('sha256').update(actual).digest('hex'));
  }
  assert.equal((await fs.readdir(workspaceRoot)).length, 3);
});

test('backup excludes account settings, keys, and unsaved browser cache', async (t) => {
  // Catches traversing arbitrary project/config folders instead of saved-project stores.
  const { workspaceRoot, save } = await fixture(t);
  for (const file of ['settings.json', '.env', '.muse/settings.json', '.muse/api-keys.json', 'cache/unsaved.json', '.git/config']) {
    await save(file, 'DO-NOT-EXPORT');
  }
  await fs.writeFile(path.join(workspaceRoot, 'settings.json'), 'OUTSIDE-PROJECT');
  const backup = await exportProjectBackup('backup-fixture', { workspaceRoot });
  assert.deepEqual(backup.files.map((file) => file.path).sort(), ['manuscript/one.md', 'project.json']);
  assert.ok(!JSON.stringify(backup).includes(Buffer.from('DO-NOT-EXPORT').toString('base64')));
});

test('restore remaps only managed image fields in the four image stores', async (t) => {
  // Catches broad replacement in prose/quotes and missed character/world/plot/reference/map images.
  const { workspaceRoot, save } = await fixture(t);
  const image = { id: 'pixel', src: imageUrl, caption: imageUrl, tags: [imageUrl] };
  await save('assets/images/pixel.png', Buffer.from([0, 255]));
  await save('canon/canon.json', { version: 1, entities: [{ id: 'person', summary: imageUrl, character: { references: { images: [image] } }, world: { images: [image] } }], facts: [{ value: imageUrl }] });
  await save('plot/plot.json', { version: 1, nodes: [{ id: 'plot-one', summary: imageUrl, images: [image, { ...image, src: '/api/projects/other/assets/images/pixel.png' }] }], edges: [] });
  await save('references/references.json', { version: 1, items: [{ id: 'reference-one', quote: imageUrl, url: imageUrl, notes: JSON.stringify({ src: imageUrl }), images: [image] }] });
  await save('world/map.json', { version: 1, image });
  const backup = await exportProjectBackup('backup-fixture', { workspaceRoot });
  const restored = await restoreProjectBackup(backup, { workspaceRoot });
  const newUrl = `/api/projects/${restored.id}/assets/images/pixel.png`;
  const read = async (file: string) => JSON.parse(await fs.readFile(path.join(workspaceRoot, `${restored.id}.muse`, file), 'utf8'));
  const canon = await read('canon/canon.json');
  const plot = await read('plot/plot.json');
  const references = await read('references/references.json');
  const world = await read('world/map.json');
  assert.equal(canon.entities[0].character.references.images[0].src, newUrl);
  assert.equal(canon.entities[0].world.images[0].src, newUrl);
  assert.equal(plot.nodes[0].images[0].src, newUrl);
  assert.equal(references.items[0].images[0].src, newUrl);
  assert.equal(world.image.src, newUrl);
  assert.equal(plot.nodes[0].images[1].src, '/api/projects/other/assets/images/pixel.png');
  assert.equal(canon.entities[0].summary, imageUrl);
  assert.equal(canon.facts[0].value, imageUrl);
  assert.equal(references.items[0].quote, imageUrl);
  assert.equal(references.items[0].url, imageUrl);
  assert.equal(references.items[0].notes, JSON.stringify({ src: imageUrl }));
  assert.equal(world.image.caption, imageUrl);
  assert.deepEqual(world.image.tags, [imageUrl]);
  assert.equal(await fs.readFile(path.join(workspaceRoot, `${restored.id}.muse`, 'manuscript/one.md'), 'utf8'), `Literal saved prose: ${imageUrl}\n`);
});

function archiveEntry(file: string, content: string | object) {
  const bytes = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content));
  return { path: file, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), data: bytes.toString('base64') };
}

function minimalBackup() {
  return {
    format: 'muse-project-backup', version: 1, sourceProjectId: 'backup-fixture', capturedAt: stamp,
    files: [archiveEntry('project.json', manifest), archiveEntry('manuscript/one.md', 'A saved chapter.')],
  };
}

test('restore rejects unsafe, ambiguous, duplicate, and file-directory colliding paths before writing', async (t) => {
  // Catches traversal, portable filename collisions, and unsafe manifest-controlled document writes.
  const { workspaceRoot } = await fixture(t);
  const before = await fs.readdir(workspaceRoot);
  const cases = [
    '../escaped.md', '/tmp/escaped.md', 'C:/escaped.md', 'manuscript/../escaped.md',
    'manuscript//escaped.md', 'manuscript/./escaped.md', 'manuscript\\escaped.md',
    'manuscript/bad\0name.md', 'manuscript/bad:stream.md', 'manuscript/CON.md',
    'manuscript/trailing.md.', 'manuscript/trailing.md ', 'settings.json', '.muse/settings.json',
    'canon/nested/project.json',
  ];
  for (const unsafe of cases) {
    const backup = minimalBackup();
    backup.files.push(archiveEntry(unsafe, 'unsafe'));
    await assert.rejects(restoreProjectBackup(backup, { workspaceRoot }), { status: 400 }, unsafe);
  }
  for (const pair of [
    ['notes/duplicate.md', 'notes/duplicate.md'],
    ['notes/Name.md', 'notes/name.md'],
    ['notes/caf\u00e9.md', 'notes/cafe\u0301.md'],
    ['notes/file.md', 'notes/file.md/nested.md'],
    ['notes/Folder/one.md', 'notes/folder/two.md'],
  ]) {
    const backup = minimalBackup();
    backup.files.push(...pair.map((file) => archiveEntry(file, 'collision')));
    await assert.rejects(restoreProjectBackup(backup, { workspaceRoot }), { status: 400 }, pair.join(' and '));
  }
  assert.deepEqual(await fs.readdir(workspaceRoot), before);
});

test('restore validates the manifest and every document path before creating a destination', async (t) => {
  // Catches invalid manifests that make a later editor save target a store, external file, or missing document.
  const { workspaceRoot } = await fixture(t);
  const badManifests = [
    null, {}, { ...manifest, id: 'someone-else' }, { ...manifest, name: '' },
    { ...manifest, createdAt: 'not-a-date' }, { ...manifest, documents: {} },
    { ...manifest, documents: [{ ...manifest.documents[0], path: '../outside.md' }] },
    { ...manifest, documents: [{ ...manifest.documents[0], path: 'canon/canon.json' }] },
    { ...manifest, documents: [{ ...manifest.documents[0], path: 'notes/missing.md' }] },
    { ...manifest, documents: [{ ...manifest.documents[0], path: 'manuscript/one.md', documents: [{ path: '../outside.md' }] }] },
    { ...manifest, documents: [manifest.documents[0], manifest.documents[0]] },
  ];
  for (const invalid of badManifests) {
    const backup = minimalBackup();
    backup.files[0] = archiveEntry('project.json', JSON.stringify(invalid));
    await assert.rejects(restoreProjectBackup(backup, { workspaceRoot }), { status: 400 });
  }
  const absent = minimalBackup();
  absent.files.shift();
  await assert.rejects(restoreProjectBackup(absent, { workspaceRoot }), { status: 400 });
  assert.deepEqual(await fs.readdir(workspaceRoot), ['backup-fixture.muse']);
});

test('restore rejects unsupported versions, invalid base64, hash/size mismatches, and malformed structured stores', async (t) => {
  // Catches accepting corrupted or noncanonical file payloads and silently losing malformed stores.
  const { workspaceRoot } = await fixture(t);
  const malformed: unknown[] = [null, [], {}, '{', Buffer.from('{'), { ...minimalBackup(), version: 2 }, { ...minimalBackup(), sourceProjectId: '../escape' }];
  for (const data of ['YQ=', 'Y Q==', 'YQ==\n', 'YR==', 'YQ===', '_w==']) {
    const backup = minimalBackup();
    backup.files[1] = { ...archiveEntry('manuscript/one.md', 'a'), data };
    malformed.push(backup);
  }
  for (const patch of [{ size: 999 }, { sha256: '0'.repeat(64) }, { type: 'symlink', target: '/tmp' }]) {
    const backup = minimalBackup();
    backup.files[1] = { ...backup.files[1], ...patch };
    malformed.push(backup);
  }
  const store = minimalBackup();
  store.files.push(archiveEntry('canon/canon.json', '{broken'));
  malformed.push(store);
  for (const invalid of malformed) await assert.rejects(restoreProjectBackup(invalid, { workspaceRoot }), { status: 400 });
  assert.deepEqual(await fs.readdir(workspaceRoot), ['backup-fixture.muse']);
});

test('backup enforces raw size, decoded size, and file-count limits before restore writes or large file reads', async (t) => {
  // Catches parsing/allocating oversized input before applying the public limits.
  const { workspaceRoot, projectDir } = await fixture(t);
  await assert.rejects(restoreProjectBackup(Buffer.alloc(80 * 1024 * 1024 + 1, 32), { workspaceRoot }), { status: 413 });
  await assert.rejects(restoreProjectBackup(' '.repeat(80 * 1024 * 1024 + 1), { workspaceRoot }), { status: 413 });
  const oversized = minimalBackup();
  oversized.files[1].size = 50 * 1024 * 1024 + 1;
  await assert.rejects(restoreProjectBackup(oversized, { workspaceRoot }), { status: 413 });
  const tooMany = minimalBackup();
  tooMany.files = Array(10_001).fill(tooMany.files[1]);
  await assert.rejects(restoreProjectBackup(tooMany, { workspaceRoot }), { status: 413 });
  const largeFile = await fs.open(path.join(projectDir, 'manuscript/one.md'), 'r+');
  await largeFile.truncate(50 * 1024 * 1024 + 1);
  await largeFile.close();
  await assert.rejects(exportProjectBackup('backup-fixture', { workspaceRoot }), { status: 413 });
  assert.deepEqual(await fs.readdir(workspaceRoot), ['backup-fixture.muse']);
});

test('export refuses symlinked project roots, directories, and files', async (t) => {
  // Catches following links into other projects or account files during export.
  const { workspaceRoot, projectDir } = await fixture(t);
  const outside = path.join(workspaceRoot, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'private.md'), 'private');
  await fs.symlink(outside, path.join(projectDir, 'notes'));
  await assert.rejects(exportProjectBackup('backup-fixture', { workspaceRoot }), { status: 400 });
  await fs.unlink(path.join(projectDir, 'notes'));
  await fs.symlink(path.join(outside, 'private.md'), path.join(projectDir, 'manuscript/private.md'));
  await assert.rejects(exportProjectBackup('backup-fixture', { workspaceRoot }), { status: 400 });
  await fs.symlink(projectDir, path.join(workspaceRoot, 'linked.muse'));
  await assert.rejects(exportProjectBackup('linked', { workspaceRoot }), { status: 400 });
});

test('export aborts when a captured file changes before the capture completes', async (t) => {
  // Catches returning a mixed saved state while another writer changes the project.
  const { workspaceRoot, projectDir, save } = await fixture(t);
  await save('notes/last.md', 'A later file.');
  const originalOpen = fs.open.bind(fs);
  let changed = false;
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    const handle = await originalOpen(...args);
    if (!changed && String(args[0]).endsWith('/notes/last.md')) {
      changed = true;
      await fs.writeFile(path.join(projectDir, 'manuscript/one.md'), 'Changed during capture.');
    }
    return handle;
  });
  await assert.rejects(exportProjectBackup('backup-fixture', { workspaceRoot }), { status: 409, code: 'PROJECT_CHANGED' });
});

test('restore preserves a colliding destination, including when it is empty', async (t) => {
  // Catches POSIX rename replacing an existing empty project directory.
  const { workspaceRoot } = await fixture(t);
  const originalMkdir = fs.mkdir.bind(fs);
  let occupied = '';
  t.mock.method(fs, 'mkdir', async (...args: Parameters<typeof fs.mkdir>) => {
    if (String(args[0]).includes('-restored-') && String(args[0]).endsWith('.muse')) {
      occupied = String(args[0]);
      await originalMkdir(occupied);
    }
    return originalMkdir(...args);
  });
  await assert.rejects(restoreProjectBackup(minimalBackup(), { workspaceRoot }), { status: 409, code: 'RESTORE_COLLISION' });
  assert.ok(occupied);
  assert.deepEqual(await fs.readdir(occupied), []);
  assert.deepEqual((await fs.readdir(workspaceRoot)).sort(), ['backup-fixture.muse', path.basename(occupied)].sort());
});

test('failed atomic installation removes only its own staging directory and reservation', async (t) => {
  // Catches leaked partial projects or broad cleanup that deletes somebody else's staging data.
  const { workspaceRoot } = await fixture(t);
  const unrelated = path.join(workspaceRoot, '.muse-restore-unrelated');
  await fs.mkdir(unrelated);
  await fs.writeFile(path.join(unrelated, 'keep.txt'), 'Another operation');
  t.mock.method(fs, 'rename', async () => { throw Object.assign(new Error('Fixture installation failure'), { code: 'EIO' }); });
  await assert.rejects(restoreProjectBackup(minimalBackup(), { workspaceRoot }), { code: 'EIO' });
  assert.equal(await fs.readFile(path.join(unrelated, 'keep.txt'), 'utf8'), 'Another operation');
  assert.deepEqual((await fs.readdir(workspaceRoot)).sort(), ['.muse-restore-unrelated', 'backup-fixture.muse']);
});
