import type { SourceCitation } from './types.js';

/**
 * Quick Export (handoff Phase F). Deterministic rendering only: the current
 * document becomes an external representation — nothing more. No model is
 * involved, the manuscript is never modified, and unrelated project material
 * (Sources, notes, canon, seeds) is never included.
 *
 * Formats: Markdown passthrough, readable plain text, and a restrained
 * DOCX built from raw OOXML (Word/Google Docs/LibreOffice/Pages compatible).
 */

export interface RenderedExport {
  fileName: string;
  mimeType: string;
  body: string | Buffer;
}

const slug = (name: string): string =>
  (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document');

/* ------------------------------------------------------------- plain text */

/** Markdown → readable prose. Paragraphs, breaks and Unicode survive. */
export function markdownToPlainText(markdown: string): string {
  const text = markdown
    .replace(/^---\n[\s\S]*?\n---\n/, '') // frontmatter
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1 ($2)') // readable prose keeps the target
    .replace(/^([ \t]*)([-*+]|\d+\.)\s+/gm, '$1• ')
    .replace(/^#{1,6}\s+(.*)$/gm, '$1')
    .replace(/^> \??/gm, '')
    .replace(/(\*\*\*|\*\*|__|\*|_)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/^\s*([-*_]\s*){3,}\s*$/gm, '* * *');
  // Collapse the 2-space hard breaks but keep real paragraph separation.
  return text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* ------------------------------------------------------------------- docx */

const xmlEscape = (text: string): string => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const emuTwip = 20; // 1pt = 20 twips

interface Block {
  type: 'heading' | 'paragraph' | 'list' | 'quote' | 'rule';
  level?: number;
  ordered?: boolean;
  items: string[];
  text?: string;
}

/** Block-level Markdown parser — deliberately small and predictable. */
function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```/.exec(line);
    if (fence) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i += 1; }
      i += 1;
      for (const codeLine of code) blocks.push({ type: 'paragraph', items: [], text: codeLine });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, items: [], text: heading[2].trim() });
      i += 1;
      continue;
    }
    if (/^\s*([-*_]\s*){3,}\s*$/.test(line)) {
      blocks.push({ type: 'rule', items: [] });
      i += 1;
      continue;
    }
    const bullet = /^(\s*)([-*+])\s+(.*)$/.exec(line);
    const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const indent = (bullet ?? numbered)![1].length;
      const items: string[] = [(bullet ?? numbered)![3]];
      i += 1;
      while (i < lines.length) {
        const next = /^(\s*)([-*+]|\d+)[.)]\s+(.*)$/.exec(lines[i]);
        if (next && (next[2] === '-' || next[2] === '*' || next[2] === '+') === !ordered && next[1].length >= indent) {
          items.push(next[3]);
          i += 1;
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i])) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i += 1;
        } else break;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      blocks.push({ type: 'quote', items: [], text: quote.join(' ').trim() });
      continue;
    }
    if (!line.trim()) { i += 1; continue; }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|\s*([-*+]|\d+)[.)]\s|```|\s*([-*_]\s*){3,}\s*$)/.test(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', items: [], text: paragraph.join(' ') });
  }
  return blocks;
}

/** Inline Markdown → Word runs. Bold, italic, code; prose text untouched. */
function runs(text: string): string {
  const out: string[] = [];
  const pattern = /(\*\*\*|___)(.+?)\1|(\*\*|__)(.+?)\3|(\*|_)(?=\S)(.+?)(?<=\S)\5|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(`<w:r><w:t xml:space="preserve">${xmlEscape(text.slice(last, m.index))}</w:t></w:r>`);
    if (m[2] !== undefined) out.push(`<w:r><w:rPr><w:b/><w:i/></w:rPr><w:t xml:space="preserve">${xmlEscape(m[2])}</w:t></w:r>`);
    else if (m[4] !== undefined) out.push(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xmlEscape(m[4])}</w:t></w:r>`);
    else if (m[6] !== undefined) out.push(`<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${xmlEscape(m[6])}</w:t></w:r>`);
    else out.push(`<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${xmlEscape(m[7])}</w:t></w:r>`);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(`<w:r><w:t xml:space="preserve">${xmlEscape(text.slice(last))}</w:t></w:r>`);
  return out.join('') || `<w:r><w:t xml:space="preserve"></w:t></w:r>`;
}

function headingStyle(level: number): string {
  return `Heading${Math.min(6, Math.max(1, level))}`;
}

function body(b: Block, docTitle: string): string {
  switch (b.type) {
    case 'heading': {
      const style = headingStyle(b.level ?? 1);
      return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${runs(b.text ?? '')}</w:p>`;
    }
    case 'paragraph':
      return `<w:p>${runs(b.text ?? '')}</w:p>`;
    case 'quote':
      return `<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>${runs(b.text ?? '')}</w:p>`;
    case 'rule':
      return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>`;
    case 'list': {
      // Style-free lists: numPr requires numbering.xml, so plain indented
      // markers keep the file minimal and fully valid everywhere.
      return b.items.map((item, index) => {
        const marker = b.ordered ? `${index + 1}.` : '•';
        return `<w:p><w:pPr><w:ind w:left="${2 * emuTwip * 180}"/></w:pPr><w:r><w:t xml:space="preserve">${marker} </w:t></w:r>${runs(item)}</w:p>`;
      }).join('');
    }
    default:
      return '';
  }
  void docTitle;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const WORD_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

function escXmlHeader(text: string): string { return xmlEscape(text); }

/**
 * Markdown → DOCX. A minimal valid OPC package with a restrained, neutral
 * manuscript look: readable body, real heading styles, standard spacing.
 * Rendering is deterministic; two exports of the same content match bytes
 * except for the creation timestamp.
 */
export function markdownToDocx(title: string, markdown: string, options: { createdAt?: Date } = {}): Buffer {
  const created = (options.createdAt ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z');
  const blocks = parseBlocks(markdown);
  const firstHeading = blocks.find((b) => b.type === 'heading');
  const docTitle = title || (firstHeading?.text ?? 'Untitled');

  const sections: string[] = [];
  // A real document title when the document doesn't already open with one.
  if (firstHeading && firstHeading.level === 1 && firstHeading.text?.trim() === docTitle.trim()) {
    sections.push(`<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${runs(docTitle)}</w:p>`);
    sections.push(...blocks.filter((b) => b !== firstHeading).map((b) => body(b, docTitle)));
  } else {
    sections.push(`<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${runs(docTitle)}</w:p>`);
    sections.push(...blocks.map((b) => body(b, docTitle)));
  }

  const styles = ['Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6']
    .map((id, index) => `
<w:style w:type="paragraph" w:styleId="${id}">
<w:name w:val="heading ${index + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
<w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="${index}"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="${32 - index * 2}"/></w:rPr>
</w:style>`).join('');
  const quoteStyle = `
<w:style w:type="paragraph" w:styleId="Quote">
<w:name w:val="Quote"/><w:basedOn w:val="Normal"/>
<w:pPr><w:ind w:left="576"/><w:spacing w:before="120" w:after="120"/></w:pPr>
<w:rPr><w:i/></w:rPr>
</w:style>`;
  const titleStyle = `
<w:style w:type="paragraph" w:styleId="Title">
<w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
<w:pPr><w:spacing w:before="0" w:after="240"/><w:jc w:val="left"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="40"/></w:rPr>
</w:style>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${sections.join('\n')}
<w:sectPr>
<w:pgSz w:w="12240" w:h="15840"/>
<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${titleStyle}${styles}${quoteStyle}
</w:styles>`;

  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${escXmlHeader(docTitle)}</dc:title><dc:creator>Muse Mobilize</dc:creator><cp:lastModifiedBy>Muse Mobilize</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>
</cp:coreProperties>`;

  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Muse Mobilize</Application></Properties>`;

  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(ROOT_RELS, 'utf8') },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(WORD_RELS, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(document, 'utf8') },
    { name: 'word/styles.xml', data: Buffer.from(stylesXml, 'utf8') },
    { name: 'docProps/core.xml', data: Buffer.from(core, 'utf8') },
    { name: 'docProps/app.xml', data: Buffer.from(app, 'utf8') },
  ]);
}

/* -------------------------------------------------------------------- zip */

/** Minimal ZIP writer (stored entries + CRC-32). DOCX accepts these fine. */
function buildZip(files: { name: string; data: Buffer }[]): Buffer {
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

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0, 12); // date (fixed → deterministic)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, file.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);
    offset += 30 + nameBuf.length + file.data.length;
  }
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

/* ----------------------------------------------------------------- render */

export function renderExport(title: string, markdown: string, format: string): RenderedExport {
  const base = slug(title);
  switch (format) {
    case 'markdown':
      return { fileName: `${base}.md`, mimeType: 'text/markdown; charset=utf-8', body: markdown };
    case 'txt':
      return { fileName: `${base}.txt`, mimeType: 'text/plain; charset=utf-8', body: markdownToPlainText(markdown) };
    case 'docx':
      return { fileName: `${base}.docx`, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: markdownToDocx(title, markdown) };
    default:
      throw new Error('Supported export formats are markdown, txt, and docx.');
  }
}
