import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToPlainText, markdownToDocx, renderExport } from '../src/export.js';

/**
 * Quick Export (handoff Phase F): deterministic, offline rendering only.
 * The renderer never sees a model, never mutates the manuscript, and never
 * includes anything beyond the exported document itself.
 */

const SAMPLE = `# Chapter One

The seal is on the **door**, and Kiala *counts* the boats twice.

- first item
- second item

1. ordered one
2. ordered two

> A quoted line from the archive.

\`\`\`
const raw = "code";
\`\`\`

---

[A link](https://example.com) and an ![image alt](img.png) stay readable.
`;

test('markdown passthrough preserves the text exactly', () => {
  const rendered = renderExport('Chapter One', SAMPLE, 'markdown');
  assert.equal(rendered.mimeType, 'text/markdown; charset=utf-8');
  assert.equal(rendered.body, SAMPLE);
  assert.equal(rendered.fileName, 'chapter-one.md');
});

test('plain text export strips syntax but keeps prose, lists, and breaks', () => {
  const rendered = renderExport('Chapter One', SAMPLE, 'txt');
  assert.equal(rendered.mimeType, 'text/plain; charset=utf-8');
  assert.equal(rendered.fileName, 'chapter-one.txt');
  const text = rendered.body as string;
  assert.ok(text.includes('The seal is on the door, and Kiala counts the boats twice.'));
  assert.ok(!text.includes('**') && !text.includes('*Kiala*'));
  assert.ok(text.includes('• first item'));
  assert.ok(text.includes('• ordered one'));
  assert.ok(text.includes('A quoted line from the archive.'));
  assert.ok(text.includes('A link (https://example.com)'));
  assert.ok(text.includes('code'));
  assert.ok(!text.includes('```'));
});

test('docx export produces a valid, restrained OPC package', () => {
  const rendered = renderExport('Chapter One', SAMPLE, 'docx');
  assert.equal(rendered.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(rendered.fileName, 'chapter-one.docx');
  const buf = rendered.body as Buffer;
  // ZIP signature + End Of Central Directory marker present.
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  assert.ok(buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) > 0);
  const xml = buf.toString('latin1');
  assert.ok(xml.includes('word/document.xml'));
  assert.ok(xml.includes('Chapter One'));
  assert.ok(xml.includes('w:pStyle w:val="Title"'));
  assert.ok(xml.includes('w:styleId="Heading1"'));
  assert.ok(xml.includes('Muse Mobilize'));
});

test('docx escapes XML-sensitive text so odd prose cannot corrupt the package', () => {
  const rendered = renderExport('Odd <&> Title', '# Odd <&> Title\\n\\nFish & chips <today>', 'docx');
  const xml = (rendered.body as Buffer).toString('utf8');
  assert.ok(xml.includes('Fish &amp; chips &lt;today&gt;'));
  assert.ok(xml.includes('Odd &lt;&amp;&gt; Title'));
  assert.ok(!xml.includes('Fish & chips <today>'));
});

test('export is deterministic: same content and timestamp produce identical bytes', () => {
  const a = markdownToDocx('T', '# T\\n\\nOne paragraph.', { createdAt: new Date(0) });
  const b = markdownToDocx('T', '# T\\n\\nOne paragraph.', { createdAt: new Date(0) });
  assert.deepEqual(a, b);
});

test('slugs keep export filenames filesystem-safe and bounded', () => {
  const rendered = renderExport('What?! A Chapter: "Very/Long" Name (draft) — 2026', '# x\\n', 'markdown');
  assert.equal(rendered.fileName, 'what-a-chapter-very-long-name-draft-2026.md');
});

test('unsupported formats are rejected', () => {
  assert.throws(() => renderExport('T', '# x\\n', 'epub' as never), /format/i);
});
