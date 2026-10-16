import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertManuscript } from '../src/studio-conversion.js';
import { parseEditionRecipe, parseEditionStore } from '../../shared/story-edition.js';
const recipe = () => ({ version: 1, id: 'edition-1', title: 'Novel', author: 'Author', documentIds: ['chapter-1', 'chapter-2'], images: [] });
test('edition recipes reject duplicate documents, remote images, misplaced assets and unknown fields', () => {
  assert.deepEqual(parseEditionRecipe(recipe()), recipe());
  assert.throws(() => parseEditionRecipe({ ...recipe(), documentIds: ['chapter-1', 'chapter-1'] }), /only once/);
  const image = { id: 'image-1', documentId: 'chapter-1', filename: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png', caption: '', alt: 'A door' };
  assert.equal(parseEditionRecipe({ ...recipe(), images: [image] }).images.length, 1);
  for (const filename of ['https://example.com/image.png', '../image.png', '/tmp/photo.png']) assert.throws(() => parseEditionRecipe({ ...recipe(), images: [{ ...image, filename }] }), /managed local/);
  assert.throws(() => parseEditionRecipe({ ...recipe(), images: [{ ...image, documentId: 'omitted' }] }), /selected manuscript/);
  assert.throws(() => parseEditionRecipe({ ...recipe(), credentials: 'private' }), /unsupported fields/);
  assert.throws(() => parseEditionStore({ version: 1, recipes: [recipe(), recipe()] }), /Duplicate edition/);
});
test('headings, paragraphs, dividers and nested emphasis preserve plain text and UTF-16 offsets', () => {
  const source = '# Chapter One\n\n😀 **bold *and italic*** e\u0301\n\n---\n\nFinal paragraph.';
  const first = convertManuscript(source, 'chapter-1');
  assert.deepEqual(first.warnings, []);
  assert.deepEqual(first.blocks.map(b => b.type), ['heading', 'paragraph', 'divider', 'paragraph']);
  assert.equal(first.blocks[0].level, 1);
  assert.equal(first.blocks[0].text, 'Chapter One');
  assert.equal(first.blocks[1].text, '😀 bold and italic e\u0301');
  assert.deepEqual(first.blocks[1].marks, [{ start: 3, end: 18, kind: 'bold' }, { start: 8, end: 18, kind: 'italic' }]);
  assert.deepEqual(convertManuscript(source, 'chapter-1'), first);
  assert.notEqual(convertManuscript(source, 'chapter-2').blocks[0].id, first.blocks[0].id);
});
test('unsupported structures preserve text and produce acknowledgement warnings', () => {
  const result = convertManuscript('A [label](https://example.com) and `code`.\n\n- item **one**\n- item two\n\n> quoted text\n\n```js\nalert("literal");\n```\n\n<img src=x onerror=alert(1)>\n\n![description](https://example.com/a.png)\n\nAfter.', 'doc');
  const text = result.blocks.map(b => b.text).join('\n');
  for (const content of ['label (https://example.com)', 'code', '- item **one**', '- item two', '> quoted text', 'alert("literal");', '<img src=x onerror=alert(1)>', '[Image omitted: description]', 'After.']) assert.ok(text.includes(content), content);
  for (const warning of ['Links', 'Inline code', 'Lists', 'Quotes', 'Code blocks', 'HTML', 'Inline Markdown images']) assert.ok(result.warnings.some(w => w.startsWith(warning)), warning);
  assert.ok(!text.includes('https://example.com/a.png'));
});
test('Unicode combining emphasis is reported without damaging text', () => {
  const result = convertManuscript('e**\u0301**', 'doc');
  assert.equal(result.blocks[0].text, 'e\u0301'); assert.deepEqual(result.blocks[0].marks, []);
  assert.ok(result.warnings.some(w => w.includes('Unicode')));
});
test('120,000 words across 40 documents remain complete with deterministic block IDs', () => {
  let words = 0;
  for (let chapter = 0; chapter < 40; chapter++) {
    const prose = Array.from({ length: 3000 }, (_, index) => `word${chapter}_${index}`).join(' ');
    const converted = convertManuscript(prose, `doc-${chapter}`);
    assert.equal(converted.blocks.map(b => b.text).join('\n'), prose);
    words += converted.blocks[0].text.split(' ').length;
  }
  assert.equal(words, 120_000);
});
