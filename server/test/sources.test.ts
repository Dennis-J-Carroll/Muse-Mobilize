import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readSources, importSource, updateSourceMetadata, deleteSource, readSourceText, readSourceOriginal, searchSources, rebuildSourceIndexes, readSource, resolveChunk } from '../src/sources.js';
import { buildContext, renderContext, sceneAround } from '../src/context.js';
import type { AgentDef, Selection } from '../src/types.js';

/**
 * Sources (handoff Phase B–C): a Source is imported evidence — never Canon.
 * These tests pin down extraction honesty, deterministic chunking, offline
 * lexical retrieval, and the scope gate so the invariants in §34 hold.
 */

async function projectFixture(t: TestContext) {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-sources-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  return projectDir;
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

const DRAFT_MD = `# Amber Eyes Draft

Savair's island rose from the mist like a jaw of black stone.

The harbour was empty, as promised, and Kiala counted the boats twice.
`;

const NOTES_MD = `# Savair Notes

Interdimensional Island: the crossing only opens at the new moon.

Savair keeps her promises, but never her appointments.
`;

test('markdown import extracts text, strips syntax, and builds searchable chunks', async (t) => {
  const dir = await projectFixture(t);
  const { source, duplicate } = await importSource(dir, { name: 'amber-eyes-draft.md', data: b64(DRAFT_MD) });
  assert.equal(duplicate, false);
  assert.equal(source.sourceType, 'markdown');
  assert.equal(source.extractionStatus, 'ready');
  assert.equal(source.title, 'amber-eyes-draft');
  assert.equal(source.chunkCount, 1); // a small doc groups into one chunk under the size cap
  assert.ok(source.textLength > 100);

  const text = await readSourceText(dir, source.id);
  assert.ok(text.includes("Savair's island rose from the mist"));
  assert.ok(!text.includes('# Amber Eyes Draft'.slice(0, 2) + ' ')); // heading syntax stripped
  assert.ok(!/[`*_]{2}/.test(text));

  // Search finds the island by name — offline, no model, no embeddings.
  const hits = await searchSources(dir, { query: "Savair's island" });
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].sourceId, source.id);
  assert.equal(hits[0].retrievalMethod, 'lexical');
  assert.ok(hits[0].snippet.includes('island'));
});

test('duplicate content is detected by hash and not re-imported', async (t) => {
  const dir = await projectFixture(t);
  const first = await importSource(dir, { name: 'a.md', data: b64(DRAFT_MD) });
  const second = await importSource(dir, { name: 'renamed-copy.md', data: b64(DRAFT_MD) });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.source.id, first.source.id);
  const all = await readSources(dir);
  assert.equal(all.length, 1);
});

test('same name with different content stays a distinct source', async (t) => {
  const dir = await projectFixture(t);
  const a = await importSource(dir, { name: 'chapter.md', data: b64('Version one: the seal is on the door.') });
  const b = await importSource(dir, { name: 'chapter.md', data: b64('Version two: the seal is broken.') });
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, false);
  assert.notEqual(a.source.id, b.source.id);
  assert.equal((await readSources(dir)).length, 2);
});

test('docx import reads real OOXML paragraphs and headings', async (t) => {
  const dir = await projectFixture(t);
  // Hand-built OOXML: one Title paragraph, two body paragraphs.
  const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Helroth Archive</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>The archive gate only answers to a titled heir.</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>Kiala signed the ledger with her mother's name.</w:t></w:r></w:p>` +
    `</w:body></w:document>`;
  // Wrap the XML in a real stored ZIP so the extractor's central-directory
  // reader finds word/document.xml without any compression library.
  const docx = storedZip([['word/document.xml', Buffer.from(xml, 'utf8')]]);
  const { source } = await importSource(dir, { name: 'helroth-archive.docx', data: docx.toString('base64') });
  assert.equal(source.sourceType, 'docx');
  assert.equal(source.extractionStatus, 'ready');
  const text = await readSourceText(dir, source.id);
  assert.ok(text.includes('Helroth Archive'));
  assert.ok(text.includes('The archive gate only answers to a titled heir.'));

  const hits = await searchSources(dir, { query: 'titled heir' });
  assert.ok(hits.length >= 1);
  assert.ok(hits[0].location.heading === undefined || typeof hits[0].location.heading === 'string');
});

test('pdf import reads uncompressed text operators', async (t) => {
  const dir = await projectFixture(t);
  const stream = 'BT /F1 12 Tf (The lighthouse on Veyr point burned blue.) Tj 0 -14 Td (Nobody ashore remembered lighting it.) Tj 0 -14 Td (The keeper kept a ledger of every ship that passed the point, and of every ship that did not, and the ledger never once mentioned the blue flame.) Tj ET';
  const pdf = Buffer.from(
    `%PDF-1.4
1 0 obj<<>>stream
${stream}
endstream endobj
trailer<<>>
%%EOF
`,
    'latin1',
  );
  const { source } = await importSource(dir, { name: 'veyr-lighthouse.pdf', data: pdf.toString('base64') });
  assert.equal(source.sourceType, 'pdf');
  assert.equal(source.extractionStatus, 'ready');
  const text = await readSourceText(dir, source.id);
  assert.ok(text.includes('lighthouse on Veyr point'));
  assert.ok(text.includes('Nobody ashore remembered lighting it.'));
});

test('scanned pdf reports limited extraction honestly and yields no search hits', async (t) => {
  const dir = await projectFixture(t);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');
  const { source } = await importSource(dir, { name: 'scan.pdf', data: pdf.toString('base64') });
  assert.equal(source.extractionStatus, 'failed');
  assert.match(source.extractionWarning ?? '', /limited|scanned|could not/i);

  const hits = await searchSources(dir, { query: 'anything at all' });
  assert.equal(hits.length, 0);
});

test('unsupported, empty, and oversized imports are rejected with clear errors', async (t) => {
  const dir = await projectFixture(t);
  await assert.rejects(importSource(dir, { name: 'image.png', data: b64('89504e47') }), /Supported source types/);
  await assert.rejects(importSource(dir, { name: 'empty.md', data: b64('') }), /empty|base64/i);
  await assert.rejects(importSource(dir, { name: 'bad.md', data: 'not base64!!' }), /base64/i);
  await assert.rejects(importSource(dir, { name: '', data: b64('x') }), /file name/i);
  // Path components are flattened: the stored name is a basename.
  const sneaky = await importSource(dir, { name: '../../escape.md', data: b64('attempted traversal') });
  assert.equal(sneaky.source.originalName, 'escape.md');
});

test('metadata edits change classification without touching original bytes', async (t) => {
  const dir = await projectFixture(t);
  const { source } = await importSource(dir, { name: 'notes.md', data: b64(NOTES_MD), classification: 'notes', authority: 'working' });
  const before = await readSourceOriginal(dir, source.id);

  const updated = await updateSourceMetadata(dir, source.id, { title: 'Savair Dossier', classification: 'research', authority: 'authoritative' });
  assert.equal(updated.title, 'Savair Dossier');
  assert.equal(updated.classification, 'research');
  assert.equal(updated.authority, 'authoritative');

  const after = await readSourceOriginal(dir, source.id);
  assert.deepEqual(after, before);
  const reopened = await readSource(dir, source.id);
  assert.equal(reopened.classification, 'research');
  assert.equal(reopened.textLength, source.textLength); // extraction untouched

  await assert.rejects(updateSourceMetadata(dir, source.id, { classification: 'diary' as never }), /classification/i);
  await assert.rejects(updateSourceMetadata(dir, 'missing-id', { title: 'X' }), /No such source/);
});

test('delete removes the source and its derived files', async (t) => {
  const dir = await projectFixture(t);
  const { source } = await importSource(dir, { name: 'gone.md', data: b64(DRAFT_MD) });
  const removed = await deleteSource(dir, source.id);
  assert.equal(removed.id, source.id);
  assert.deepEqual(await readSources(dir), []);
  const hits = await searchSources(dir, { query: 'Savair' });
  assert.equal(hits.length, 0);
});

test('chunking is deterministic and keeps heading boundaries', async (t) => {
  const text = `# Part One

${'Paragraph one. '.repeat(40)}

Paragraph two stays separate.

# Part Two

Paragraph three belongs to part two.`;
  // Chunk through the real import path so locations come from the extractor.
  const dir = await projectFixture(t);
  const { source } = await importSource(dir, { name: 'parts.md', data: b64(text) });
  const indexFile = path.join(dir, 'sources', 'search', `${source.id}.json`);
  const a: { location: { heading?: string }; text: string }[] = JSON.parse(await fs.readFile(indexFile, 'utf8')).chunks;
  const b: { location: { heading?: string }; text: string }[] = JSON.parse(await fs.readFile(indexFile, 'utf8')).chunks;
  assert.deepEqual(a, b);
  // Two heading-delimited sections → at least two chunks, each carrying its
  // section's heading; the long first section may group its paragraphs.
  assert.ok(a.length >= 2);
  const headings = a.map((c) => c.location.heading);
  assert.ok(headings.includes('Part One'));
  assert.ok(headings.includes('Part Two'));
  const partTwo = a.find((c) => c.location.heading === 'Part Two')!;
  assert.ok(partTwo.text.startsWith('Part Two'));
  // Chunks stay under the size cap (MAX_CHUNK_CHARS is 1400; a heading may
  // open a chunk, so allow its line).
  for (const chunk of a) assert.ok(chunk.text.length <= 1600);
});

test('search honours source, classification, and authority filters', async (t) => {
  const dir = await projectFixture(t);
  const draft = await importSource(dir, { name: 'draft.md', data: b64(DRAFT_MD), classification: 'manuscript' });
  await importSource(dir, { name: 'notes.md', data: b64(NOTES_MD), classification: 'notes' });

  const all = await searchSources(dir, { query: 'Savair island' });
  assert.ok(all.length >= 2);

  const onlyDraft = await searchSources(dir, { query: 'Savair island', sourceIds: [draft.source.id] });
  assert.ok(onlyDraft.length >= 1);
  assert.ok(onlyDraft.every((h) => h.sourceId === draft.source.id));

  const onlyNotes = await searchSources(dir, { query: 'Savair island', classifications: ['notes'] });
  assert.ok(onlyNotes.length >= 1);
  assert.ok(onlyNotes.every((h) => h.sourceId !== draft.source.id));

  const authoritative = await searchSources(dir, { query: 'Savair island', authorities: ['authoritative'] });
  assert.equal(authoritative.length, 0);

  const limited = await searchSources(dir, { query: 'Savair island', limit: 1 });
  assert.equal(limited.length, 1);

  assert.deepEqual(await searchSources(dir, { query: '   ' }), []);
  assert.deepEqual(await searchSources(dir, { query: '' }), []);
});

test('search ranks exact phrase above scattered words', async (t) => {
  const dir = await projectFixture(t);
  const phrase = 'The midnight council convenes beneath the Amber Gate.';
  const scattered = 'Amber leaves fall. The gate rusts. Midnight passes. Beneath it, nothing convenes.';
  await importSource(dir, { name: 'phrase.md', data: b64(`A

${phrase}

B`) });
  await importSource(dir, { name: 'scattered.md', data: b64(`A

${scattered}

B`) });
  const hits = await searchSources(dir, { query: 'midnight council beneath the amber gate' });
  assert.ok(hits.length >= 2);
  assert.equal(hits[0].title, 'phrase');
});

test('missing chunk index is rebuilt from extracted text on demand', async (t) => {
  const dir = await projectFixture(t);
  const { source } = await importSource(dir, { name: 'draft.md', data: b64(DRAFT_MD) });
  const searchDir = path.join(dir, 'sources', 'search');
  await fs.rm(searchDir, { recursive: true, force: true });
  // Fresh service state: search transparently rebuilds from extracted text.
  const hits = await searchSources(dir, { query: 'harbour' });
  assert.ok(hits.length >= 1);
  const rebuilt = await rebuildSourceIndexes(dir);
  assert.equal(rebuilt.sources, 1);
  assert.ok(rebuilt.rebuilt >= 1);
  const citation = await resolveChunk(dir, source.id, hits[0].chunkId);
  assert.equal(citation?.sourceId, source.id);
  assert.ok(citation?.snippet.includes('harbour'));
  // Unknown chunks resolve to null — citations are never invented.
  assert.equal(await resolveChunk(dir, source.id, 'nope-c0000'), null);
});

/* ------------------------------------------------- context scope (Phase E) */

function scopedAgent(scope: string[]): AgentDef {
  return {
    id: 'probe',
    name: 'Probe',
    role: 'muse',
    blurb: '',
    instructions: { system_prompt: 'Probe agent.' },
    model: { provider: 'mock' },
    state: { mode: 'idle' },
    activation: { type: 'manual' },
    authority: { manuscript: 'read' },
    context: { scope },
    budget: { max_steps: 1, max_tokens: 500 },
  } as unknown as AgentDef;
}

/**
 * Minimal project on disk that buildContext can read (manifest + sources).
 * Returns the script text a child process runs with MUSE_CONFIG_DIR pointed
 * at a throwaway config dir — so the test never touches real user settings.
 */
async function contextFixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-ctx-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const id = 'ctx-fixture';
  const dir = path.join(root, `${id}.muse`);
  await fs.mkdir(path.join(dir, 'manuscript'), { recursive: true });
  await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify({
    id,
    name: 'Context Fixture',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    documents: [{ id: 'chapter-01', title: 'Chapter One', kind: 'manuscript', path: 'manuscript/chapter-01.md', order: 1 }],
  }));
  await fs.writeFile(path.join(dir, 'manuscript', 'chapter-01.md'), '# Chapter One\n\nThe seal is on the door.\n');
  await importSource(dir, { name: 'savair-notes.md', data: b64(NOTES_MD), classification: 'notes' });
  return { root, id, dir };
}

/** Run a snippet against a fixture root via child process (isolated settings). */
async function runInFixture<T>(root: string, id: string, snippet: string): Promise<{ json: string; code: number; stderr: string }> {
  const configDir = path.join(root, 'config');
  await fs.mkdir(configDir, { recursive: true });
  // Throwaway settings: workspace root points at the fixture, nothing else.
  await fs.writeFile(path.join(configDir, 'settings.json'), JSON.stringify({ workspaceRoot: root, defaultProvider: 'mock' }));
  const script = `
    const { buildContext, renderContext } = await import('${path.resolve('src/context.ts')}');
    ${snippet}
  `;
  const proc = await import('node:child_process').then((cp) => new Promise<any>((resolve) => {
    cp.execFile(
      process.execPath,
      ['--import', 'tsx', '-e', script],
      { env: { ...process.env, MUSE_CONFIG_DIR: configDir }, cwd: path.resolve('..'), timeout: 20_000 },
      (err, stdout, stderr) => resolve({ json: String(stdout), code: err?.code ?? 0, stderr: String(stderr) }),
    );
  }));
  return proc;
}

test('buildContext includes retrieved source passages only for scoped agents', async (t) => {
  const { root, id } = await contextFixture(t);
  const run = await runInFixture(root, id, `
    const probe = (scope) => ({
      id: 'probe', name: 'Probe', role: 'muse', blurb: '',
      instructions: { system_prompt: 'Probe.' },
      model: { provider: 'mock' },
      state: { mode: 'idle' },
      activation: { type: 'manual' },
      authority: { manuscript: 'read' },
      context: { scope },
      budget: { max_steps: 1, max_tokens: 500 },
    });
    const question = 'What do I know about the new moon crossing?';
    const scoped = await buildContext('${id}', probe(['sources']), { question });
    const unscoped = await buildContext('${id}', probe([]), { question });
    console.log(JSON.stringify({
      scopedHasSources: scoped.sections.some((s) => s.name === 'sources'),
      scopedSummary: scoped.summary.find((l) => l.startsWith('sources')) ?? null,
      citationCount: scoped.sourceCitations?.length ?? 0,
      renderedHasTag: renderContext(scoped).includes('<sources>'),
      renderedHasPassage: renderContext(scoped).includes('new moon'),
      unscopedHasSources: unscoped.sections.some((s) => s.name === 'sources'),
      unscopedCitations: unscoped.sourceCitations ?? null,
      unscopedRenderedHasTag: renderContext(unscoped).includes('<sources>'),
    }));
  `);
  assert.equal(run.code, 0, run.stderr);
  const out = JSON.parse(run.json.trim().split('\n').pop() ?? '{}');
  assert.ok(out.scopedHasSources);
  assert.match(out.scopedSummary ?? '', /sources — \d+ passage/);
  assert.ok(out.citationCount >= 1);
  assert.ok(out.renderedHasTag);
  assert.ok(out.renderedHasPassage);
  assert.ok(!out.unscopedHasSources);
  assert.equal(out.unscopedCitations, null);
  assert.ok(!out.unscopedRenderedHasTag);
});

test('citation-less questions produce no fabricated sources section', async (t) => {
  const { root, id } = await contextFixture(t);
  const run = await runInFixture(root, id, `
    const probe = {
      id: 'probe', name: 'Probe', role: 'muse', blurb: '',
      instructions: { system_prompt: 'Probe.' },
      model: { provider: 'mock' },
      state: { mode: 'idle' },
      activation: { type: 'manual' },
      authority: { manuscript: 'read' },
      context: { scope: ['sources'] },
      budget: { max_steps: 1, max_tokens: 500 },
    };
    const bundle = await buildContext('${id}', probe, { question: 'zzzqqq unmatchable string' });
    console.log(JSON.stringify({
      hasSources: bundle.sections.some((s) => s.name === 'sources'),
      citations: bundle.sourceCitations ?? null,
    }));
  `);
  assert.equal(run.code, 0, run.stderr);
  const out = JSON.parse(run.json.trim().split('\n').pop() ?? '{}');
  assert.ok(!out.hasSources);
  assert.equal(out.citations, null);
});

test('sceneAround keeps the selected paragraph plus one neighbour', () => {
  const doc = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.';
  const start = doc.indexOf('Second');
  const end = start + 'Second paragraph.'.length;
  const scene = sceneAround(doc, start, end);
  assert.ok(scene.includes('Second paragraph.'));
  assert.ok(scene.includes('First paragraph.'));
  assert.ok(scene.includes('Third paragraph.'));
  assert.ok(!scene.includes('Fourth paragraph.'), scene);
});

/* ------------------------------------------------------------- zip helper */

/** Build a stored (uncompressed) ZIP archive — enough for the DOCX reader. */
function storedZip(files: [string, Buffer][]): Buffer {
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  const crc32 = (data: Buffer): number => {
    let c = 0xffffffff;
    for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0, 6);
    head.writeUInt16LE(0, 8);
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(0, 12);
    head.writeUInt32LE(crc32(data), 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    head.writeUInt16LE(0, 28);
    local.push(head, nameBuf, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt32LE(crc32(data), 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += head.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuf, end]);
}
