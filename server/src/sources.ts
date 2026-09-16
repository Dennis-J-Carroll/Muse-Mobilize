import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { safeJoin, ensureDir, exists } from './paths.js';
import type {
  StorySource, SourceChunk, SourceSearchHit, SourceCitation, SourceLocation,
  SourceClassification, SourceAuthority,
} from './types.js';

/**
 * Sources (handoff Phase B–C): imported story material kept as evidence.
 *
 * A Source is NOT Canon. Nothing here promotes source claims into the canon
 * store; agents may only retrieve passages through the scoped context engine.
 *
 * Storage layout (all inside the project, all portable):
 *   sources/index.json      — source records (metadata only)
 *   sources/originals/<id>  — exact uploaded bytes (the authoritative artifact)
 *   sources/extracted/<id>.txt — reproducible plain-text extraction
 *   sources/search/<id>.json   — regenerable chunk index
 *
 * The lexical search index is derived data: it can be rebuilt from extracted
 * text, which itself can be regenerated from the original where possible.
 */

export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_SOURCES = 500;

const CLASSIFICATIONS: SourceClassification[] = ['manuscript', 'notes', 'research', 'reference', 'archive', 'other'];
const AUTHORITIES: SourceAuthority[] = ['unknown', 'historical', 'working', 'authoritative'];

const EXTENSION_TYPES: Record<string, StorySource['sourceType']> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.docx': 'docx',
  '.pdf': 'pdf',
};

interface SourcesIndex {
  version: 1;
  sources: StorySource[];
}

/* ------------------------------------------------------------------- paths */

export function sourcesDir(projectDir: string): string {
  return safeJoin(projectDir, 'sources');
}

function originalPath(projectDir: string, sourceId: string): string {
  return safeJoin(projectDir, path.join('sources', 'originals', sourceId));
}

function extractedPath(projectDir: string, sourceId: string): string {
  return safeJoin(projectDir, path.join('sources', 'extracted', `${sourceId}.txt`));
}

function searchIndexPath(projectDir: string, sourceId: string): string {
  return safeJoin(projectDir, path.join('sources', 'search', `${sourceId}.json`));
}

function indexPath(projectDir: string): string {
  return safeJoin(projectDir, path.join('sources', 'index.json'));
}

/* ------------------------------------------------------------------ hashing */

export function hashBytes(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/* ------------------------------------------------------------------ reading */

async function readIndex(projectDir: string): Promise<SourcesIndex> {
  const file = indexPath(projectDir);
  if (!(await exists(file))) return { version: 1, sources: [] };
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as SourcesIndex;
    if (parsed?.version !== 1 || !Array.isArray(parsed.sources)) return { version: 1, sources: [] };
    return { version: 1, sources: parsed.sources.filter((s) => s && typeof s.id === 'string') };
  } catch {
    // A damaged index must not take the project down; treated as empty.
    return { version: 1, sources: [] };
  }
}

async function writeIndex(projectDir: string, index: SourcesIndex): Promise<void> {
  await ensureDir(sourcesDir(projectDir));
  await fs.writeFile(indexPath(projectDir), JSON.stringify(index, null, 2), 'utf8');
}

export async function readSources(projectDir: string): Promise<StorySource[]> {
  return (await readIndex(projectDir)).sources.sort((a, b) => a.importedAt.localeCompare(b.importedAt));
}

export async function readSource(projectDir: string, sourceId: string): Promise<StorySource> {
  const found = (await readIndex(projectDir)).sources.find((s) => s.id === sourceId);
  if (!found) throw new Error(`No such source: ${sourceId}`);
  return found;
}

/** The extracted plain text behind a source (never the original binary). */
export async function readSourceText(projectDir: string, sourceId: string): Promise<string> {
  await readSource(projectDir, sourceId);
  return fs.readFile(extractedPath(projectDir, sourceId), 'utf8');
}

/** The original uploaded bytes, for download/provenance inspection. */
export async function readSourceOriginal(projectDir: string, sourceId: string): Promise<Buffer> {
  const source = await readSource(projectDir, sourceId);
  const bytes = await fs.readFile(originalPath(projectDir, sourceId));
  if (hashBytes(bytes) !== source.sourceHash) {
    throw new Error('Source original does not match its recorded hash.');
  }
  return bytes;
}

/* ------------------------------------------------------------- extraction */

function stripMarkdown(text: string): string {
  return text
    .replace(/^---\n[\s\S]*?\n---\n/, '') // frontmatter
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*> \??/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/(\*\*\*|\*\*|__|\*|_)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/^\s*([-*_]\s*){3,}\s*$/gm, '* * *')
    .replace(/\n{3,}/g, '\n\n');
}

interface ExtractedDoc {
  text: string;
  status: StorySource['extractionStatus'];
  warning?: string;
  locations: { paragraph: number; page?: number; heading?: string }[];
}

function extractMarkdown(bytes: Buffer): ExtractedDoc {
  const raw = bytes.toString('utf8');
  const text = stripMarkdown(raw);
  // Locations must describe the STRIPPED text the chunker actually sees, so
  // derive them from its paragraph structure. stripMarkdown preserves the
  // paragraph order of the raw Markdown (minus frontmatter), and a heading
  // is always its own paragraph — so paragraph k in maps to paragraph k out.
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const rawBlocks = raw.replace(/^---\n[\s\S]*?\n---\n/, '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const locations: ExtractedDoc['locations'] = [];
  let heading: string | undefined;
  paragraphs.forEach((paragraph, index) => {
    const rawBlock = rawBlocks[index];
    const h = rawBlock ? /^#{1,6}\s+(.*)$/.exec(rawBlock) : null;
    if (h) heading = h[1].trim();
    locations.push({ paragraph: index + 1, heading });
  });
  return { text, status: 'ready', locations };
}

function extractText(bytes: Buffer): ExtractedDoc {
  const raw = bytes.toString('utf8');
  const locations: ExtractedDoc['locations'] = [];
  let paragraph = 0;
  for (const line of raw.split('\n')) {
    if (line.trim()) paragraph += 1;
    locations.push({ paragraph });
  }
  return { text: raw, status: 'ready', locations };
}

/**
 * DOCX is a ZIP of XML parts. Extract word/document.xml with a tiny, trusted
 * inflate (RFC 1951 raw DEFLATE) and pull paragraph text from the XML —
 * enough for prose retrieval, not pixel-perfect Word reconstruction.
 */
function inflateRaw(data: Buffer): Buffer {
  const out: number[] = [];
  let bitPos = 0;
  const readBits = (count: number): number => {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byte = data[bitPos >> 3] ?? 0;
      value |= ((byte >> (bitPos & 7)) & 1) << i;
      bitPos += 1;
    }
    return value;
  };
  const LENS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DISTS = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

  interface Huff { counts: number[]; symbols: number[] }
  const table = (lengths: number[]): Huff => {
    const counts = new Array(16).fill(0);
    for (const l of lengths) counts[l] += 1;
    counts[0] = 0;
    const offsets = new Array(16).fill(0);
    for (let i = 1; i < 16; i++) offsets[i] = offsets[i - 1] + counts[i - 1];
    const symbols = new Array(lengths.filter((l) => l !== 0).length);
    for (let sym = 0; sym < lengths.length; sym++) if (lengths[sym]) symbols[offsets[lengths[sym]]++] = sym;
    return { counts, symbols };
  };
  const decode = (t: Huff): number => {
    let code = 0; let first = 0; let index = 0;
    for (let len = 1; len < 16; len++) {
      code |= readBits(1);
      const count = t.counts[len];
      if (code - first < count) return t.symbols[index + (code - first)];
      index += count; first += count; first <<= 1; code <<= 1;
    }
    throw new Error('Invalid compressed data in DOCX archive.');
  };

  for (;;) {
    const final = readBits(1);
    const type = readBits(2);
    if (type === 0) {
      bitPos = (bitPos + 7) & ~7;
      const len = data[bitPos >> 3] | (data[(bitPos >> 3) + 1] << 8);
      bitPos += 32;
      for (let i = 0; i < len; i++) out.push(data[bitPos >> 3]);
      bitPos += len * 8;
    } else {
      let litLens: number[]; let distLens: number[];
      if (type === 1) {
        litLens = new Array(288).fill(8); litLens.fill(9, 144, 256); litLens.fill(7, 256, 280); litLens.fill(8, 280, 288);
        distLens = new Array(30).fill(5);
      } else if (type === 2) {
        const nlit = readBits(5) + 257;
        const ndist = readBits(5) + 1;
        const ncode = readBits(4) + 4;
        const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        const codeLens = new Array(19).fill(0);
        for (let i = 0; i < ncode; i++) codeLens[order[i]] = readBits(3);
        const codeTable = table(codeLens);
        const lens: number[] = [];
        while (lens.length < nlit + ndist) {
          const sym = decode(codeTable);
          if (sym < 16) lens.push(sym);
          else if (sym === 16) { const prev = lens[lens.length - 1]; const n = 3 + readBits(2); for (let i = 0; i < n; i++) lens.push(prev); }
          else if (sym === 17) { const n = 3 + readBits(3); for (let i = 0; i < n; i++) lens.push(0); }
          else { const n = 11 + readBits(7); for (let i = 0; i < n; i++) lens.push(0); }
        }
        litLens = lens.slice(0, nlit);
        distLens = lens.slice(nlit, nlit + ndist);
      } else throw new Error('Invalid DOCX compression block.');
      const litTable = table(litLens);
      const distTable = table(distLens);
      for (;;) {
        const sym = decode(litTable);
        if (sym < 256) out.push(sym);
        else if (sym === 256) break;
        else {
          const li = sym - 257;
          const length = LENS[li] + readBits(LEXT[li]);
          const dsym = decode(distTable);
          const dist = DISTS[dsym] + readBits(DEXT[dsym]);
          for (let i = 0; i < length; i++) out.push(out[out.length - dist]);
        }
      }
    }
    if (final) break;
    bitPos = (bitPos + 7) & ~7;
  }
  return Buffer.from(out);
}

/** List local-file entries of a ZIP central directory. */
function zipEntries(bytes: Buffer): { name: string; start: number; compressedSize: number; method: number }[] {
  // Find the End Of Central Directory record from the tail.
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_536); i--) {
    if (bytes[i] === sig[0] && bytes[i + 1] === sig[1] && bytes[i + 2] === sig[2] && bytes[i + 3] === sig[3]) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('This DOCX could not be read: not a valid DOCX (ZIP) file.');
  const count = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  const entries: { name: string; start: number; compressedSize: number; method: number }[] = [];
  const central = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== central.readUInt32LE(0)) break;
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const nameLen = bytes.readUInt16LE(offset + 28);
    const extraLen = bytes.readUInt16LE(offset + 30);
    const commentLen = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLen);
    // Local header: fixed 30 bytes + name + extra.
    const localNameLen = bytes.readUInt16LE(localOffset + 26);
    const localExtraLen = bytes.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    entries.push({ name, start, compressedSize, method });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function xmlToText(xml: string): { text: string; locations: ExtractedDoc['locations'] } {
  // Paragraphs first, then runs; w:tab becomes a space, w:br a newline.
  const paragraphs = xml.split(/<\/w:p>/).slice(0, -1);
  const lines: string[] = [];
  const locations: ExtractedDoc['locations'] = [];
  let paragraph = 0;
  for (const p of paragraphs) {
    paragraph += 1;
    const headingMatch = /<w:pStyle[^>]*w:val="(?:Heading|heading|Title|Subtitle)(\d?)"?/.exec(p);
    const text = p
      .replace(/<w:tab\b[^>]*\/>/g, ' ')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
    const heading = headingMatch ? text.trim() : undefined;
    if (text.trim()) {
      lines.push(heading ? `## ${heading}` : text);
      locations.push({ paragraph, heading });
    }
  }
  return { text: lines.join('\n\n'), locations };
}

function extractDocx(bytes: Buffer): ExtractedDoc {
  const entries = zipEntries(bytes);
  const doc = entries.find((e) => e.name === 'word/document.xml');
  if (!doc) throw new Error('This DOCX could not be read: word/document.xml is missing.');
  const slice = bytes.subarray(doc.start, doc.start + doc.compressedSize);
  const xmlBytes = doc.method === 0 ? slice : inflateRaw(slice);
  const { text, locations } = xmlToText(xmlBytes.toString('utf8'));
  if (!text.trim()) {
    return { text: '', status: 'partial', warning: 'This DOCX opened, but no readable text was found in its document body.', locations };
  }
  return { text, status: 'ready', locations };
}

/**
 * PDF: extract text from uncompressed or Flate-compressed content streams.
 * Handles plain Tj/TJ operators; images and exotic encodings yield little
 * text and are reported honestly as `partial` (never silently OCR'd).
 */
function extractPdf(bytes: Buffer): ExtractedDoc {
  let pdf: string;
  try { pdf = bytes.toString('latin1'); } catch { throw new Error('This PDF could not be read.'); }
  if (!pdf.startsWith('%PDF')) throw new Error('This PDF could not be read: not a PDF file.');

  const chunks: { page?: number; text: string }[] = [];
  // Content streams, newest objects first is unnecessary; order by appearance.
  const streamRe = /stream\r?\n?/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(pdf))) {
    const start = match.index + match[0].length;
    const end = pdf.indexOf('endstream', start);
    if (end === -1) break;
    const raw = bytes.subarray(Buffer.byteLength(pdf.slice(0, start), 'latin1'), Buffer.byteLength(pdf.slice(0, end), 'latin1'));
    streamRe.lastIndex = end;
    let content: string;
    if (pdf.slice(Math.max(0, match.index - 20), match.index).includes('FlateDecode')) {
      try { content = inflateRaw(raw).toString('latin1'); } catch { continue; }
    } else {
      content = raw.toString('latin1');
    }
    // Page number: count /Type /Page occurrences before this stream.
    const before = pdf.slice(0, match.index);
    const page = (before.match(/\/Type\s*\/Page[^s]/g) ?? []).length || undefined;
    chunks.push({ page, text: content });
  }

  const decodePdfString = (s: string): string => s
    .replace(/\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\t/g, ' ')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));

  const lines: string[] = [];
  const locations: ExtractedDoc['locations'] = [];
  let paragraph = 0;
  for (const chunk of chunks) {
    let pageText = '';
    const showRe = /\((?:\\.|[^\\()])*\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ/g;
    let m: RegExpExecArray | null;
    while ((m = showRe.exec(chunk.text))) {
      const piece = m[0].endsWith('Tj')
        ? decodePdfString(/^\((.*)\)\s*Tj$/.exec(m[0])?.[1] ?? '')
        : (m[1].match(/\((?:\\.|[^\\()])*\)/g) ?? []).map((s) => decodePdfString(s.slice(1, -1))).join('');
      pageText += piece;
      if (/(Tj|TJ)$/.test(m[0].trim())) pageText += '\n';
    }
    if (/\/Type\s*\/Page[^s]/.test(chunk.text) === false && pageText.trim() && chunks.length === 1) {
      // single-page docs without page objects in streams
    }
    if (pageText.trim()) {
      paragraph += 1;
      lines.push(pageText.replace(/[ \t]+\n/g, '\n').trim());
      locations.push({ paragraph, page: chunk.page });
    }
  }

  const text = lines.join('\n\n').trim();
  if (!text) {
    return {
      text: '', status: 'failed',
      warning: 'Text extraction was limited. This may be a scanned PDF, or its text may use an encoding this importer cannot read. No searchable text was extracted.',
      locations,
    };
  }
  if (text.length < Math.max(200, bytes.length / 200)) {
    return { text, status: 'partial', warning: 'Text extraction was limited. This may be a scanned PDF with little embedded text.', locations };
  }
  return { text, status: 'ready', locations };
}

function extractionFor(type: StorySource['sourceType']): ((bytes: Buffer) => ExtractedDoc) | null {
  switch (type) {
    case 'markdown': return extractMarkdown;
    case 'text': return extractText;
    case 'docx': return extractDocx;
    case 'pdf': return extractPdf;
    default: return null;
  }
}

/* ---------------------------------------------------------------- chunking */

const MAX_CHUNK_CHARS = 1400;
const MIN_CHUNK_CHARS = 120;

/** Deterministic structure-aware chunks: paragraphs grouped under MAX size. */
export function chunkSourceText(sourceId: string, text: string, locations: ExtractedDoc['locations'] = []): SourceChunk[] {
  const chunks: SourceChunk[] = [];
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let ordinal = 0;
  let buffer: string[] = [];
  let bufferStart = 0;
  let lastHeading: string | undefined;
  let lastPage: number | undefined;

  const flush = () => {
    if (!buffer.length) return;
    const joined = buffer.join('\n\n');
    const location: SourceLocation = {};
    if (lastHeading) location.heading = lastHeading;
    if (lastPage !== undefined) location.page = lastPage;
    location.paragraph = bufferStart + 1;
    chunks.push({
      id: `${sourceId}-c${String(ordinal).padStart(4, '0')}`,
      sourceId,
      text: joined,
      ordinal,
      location,
      hash: hashBytes(joined),
    });
    ordinal += 1;
    buffer = [];
  };

  paragraphs.forEach((paragraph, index) => {
    const location = locations[index];
    const isHeading = Boolean(location?.heading) && lastHeading !== location.heading;
    if (isHeading) {
      // A new heading starts a new chunk so retrieval keeps section boundaries.
      flush();
      lastHeading = location.heading;
    }
    if (location?.page !== undefined && location.page !== lastPage) {
      flush();
      lastPage = location.page;
    }
    if (buffer.length && (buffer.join('\n\n').length + paragraph.length) > MAX_CHUNK_CHARS) flush();
    if (!buffer.length) bufferStart = index;
    buffer.push(paragraph);
  });
  flush();
  return chunks;
}

async function writeSearchIndex(projectDir: string, sourceId: string, chunks: SourceChunk[]): Promise<void> {
  await ensureDir(path.dirname(searchIndexPath(projectDir, sourceId)));
  await fs.writeFile(searchIndexPath(projectDir, sourceId), JSON.stringify({ version: 1, chunks }, null, 2), 'utf8');
}

/* -------------------------------------------------------------- import etc */

function extensionOf(name: string): string {
  return path.extname(name).toLowerCase();
}

export function sourceTypeForName(name: string): StorySource['sourceType'] | null {
  return EXTENSION_TYPES[extensionOf(name)] ?? null;
}

export interface ImportSourceInput {
  name: string;
  data: string; // base64
  classification?: SourceClassification;
  authority?: SourceAuthority;
}

/**
 * Import one file. Duplicate content hashes are detected and reused rather
 * than re-extracted; same name + different content stays a distinct source.
 */
export async function importSource(projectDir: string, input: ImportSourceInput): Promise<{ source: StorySource; duplicate: boolean }> {
  const name = String(input.name ?? '').trim();
  const base = path.basename(name).replace(/[\\/\u0000-\u001f]/g, '_');
  if (!base || base === '.' || base === '..') throw new Error('A readable file name is required.');
  const type = sourceTypeForName(base);
  if (!type) throw new Error('Supported source types are .md, .txt, .docx, and .pdf.');
  const data = String(input.data ?? '').replace(/\s+/g, '');
  if (!data || !/^[a-z0-9+/]+={0,2}$/i.test(data)) throw new Error('Valid base64 file data is required.');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length) throw new Error('The file is empty.');
  if (bytes.length > MAX_SOURCE_BYTES) throw new Error('Source files must be 20 MB or smaller.');

  const hash = hashBytes(bytes);
  const existing = await readIndex(projectDir);
  if (existing.sources.length >= MAX_SOURCES) throw new Error('This project has reached its Sources limit.');
  const duplicate = existing.sources.find((s) => s.sourceHash === hash);
  if (duplicate) return { source: duplicate, duplicate: true };

  const now = new Date().toISOString();
  const source: StorySource = {
    id: randomUUID(),
    title: base.replace(/\.[^.]+$/, ''),
    originalName: base,
    sourceType: type,
    classification: CLASSIFICATIONS.includes(input.classification as SourceClassification) ? input.classification as SourceClassification : 'other',
    authority: AUTHORITIES.includes(input.authority as SourceAuthority) ? input.authority as SourceAuthority : 'unknown',
    importedAt: now,
    updatedAt: now,
    sourceHash: hash,
    extractionStatus: 'pending',
    textLength: 0,
    chunkCount: 0,
  };

  const extract = extractionFor(type);
  let doc: ExtractedDoc;
  try {
    doc = extract ? extract(bytes) : { text: '', status: 'failed', warning: 'This file type has no extractor.', locations: [] };
  } catch (err: any) {
    // Parser failure must not corrupt the project: record, keep the original.
    doc = { text: '', status: 'failed', warning: `This file could not be read: ${String(err?.message ?? err)}`, locations: [] };
  }

  source.extractionStatus = doc.status;
  if (doc.warning) source.extractionWarning = doc.warning;
  source.textLength = doc.text.length;
  const chunks = doc.text ? chunkSourceText(source.id, doc.text, doc.locations) : [];
  source.chunkCount = chunks.length;

  await ensureDir(sourcesDir(projectDir));
  await ensureDir(path.dirname(originalPath(projectDir, source.id)));
  await ensureDir(path.dirname(extractedPath(projectDir, source.id)));
  await fs.writeFile(originalPath(projectDir, source.id), bytes);
  await fs.writeFile(extractedPath(projectDir, source.id), doc.text, 'utf8');
  if (chunks.length) await writeSearchIndex(projectDir, source.id, chunks);

  existing.sources.push(source);
  await writeIndex(projectDir, existing);
  return { source, duplicate: false };
}

export interface SourceMetadataPatch {
  title?: string;
  classification?: SourceClassification;
  authority?: SourceAuthority;
}

/** Metadata edits never touch the original file bytes or the extraction. */
export async function updateSourceMetadata(projectDir: string, sourceId: string, patch: SourceMetadataPatch): Promise<StorySource> {
  const index = await readIndex(projectDir);
  const source = index.sources.find((s) => s.id === sourceId);
  if (!source) throw new Error(`No such source: ${sourceId}`);
  if (patch.title !== undefined) {
    const title = String(patch.title).trim().slice(0, 300);
    if (!title) throw new Error('Title cannot be empty.');
    source.title = title;
  }
  if (patch.classification !== undefined) {
    if (!CLASSIFICATIONS.includes(patch.classification)) throw new Error('Unknown classification.');
    source.classification = patch.classification;
  }
  if (patch.authority !== undefined) {
    if (!AUTHORITIES.includes(patch.authority)) throw new Error('Unknown authority.');
    source.authority = patch.authority;
  }
  source.updatedAt = new Date().toISOString();
  await writeIndex(projectDir, index);
  return source;
}

/** Remove a source and its managed index data. Originals go with it. */
export async function deleteSource(projectDir: string, sourceId: string): Promise<StorySource> {
  const index = await readIndex(projectDir);
  const found = index.sources.find((s) => s.id === sourceId);
  if (!found) throw new Error(`No such source: ${sourceId}`);
  index.sources = index.sources.filter((s) => s.id !== sourceId);
  await writeIndex(projectDir, index);
  await fs.rm(originalPath(projectDir, sourceId), { force: true });
  await fs.rm(extractedPath(projectDir, sourceId), { force: true });
  await fs.rm(searchIndexPath(projectDir, sourceId), { force: true });
  return found;
}

/* ------------------------------------------------------------------ search */

const WORD = /[^\s]+/g;

/**
 * Function words drown out names in natural-language questions ("Did I ever
 * establish how old character-1 was here?"). Retrieval runs on content words.
 */
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be',
  'because', 'been', 'before', 'being', 'but', 'by', 'can', 'could', 'did', 'do', 'does',
  'does', 'doing', 'down', 'during', 'each', 'ever', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'him', 'his', 'how', 'i', 'if', 'in',
  'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'no', 'nor', 'not',
  'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'out', 'over', 'own', 'same',
  'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why',
  'will', 'with', 'would', 'you', 'your',
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? [])
    .map((t) => (t.endsWith("'s") ? t.slice(0, -2) : t))
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

async function loadChunks(projectDir: string, sourceId: string): Promise<SourceChunk[]> {
  const file = searchIndexPath(projectDir, sourceId);
  if (await exists(file)) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as { version: number; chunks: SourceChunk[] };
      if (parsed.version === 1 && Array.isArray(parsed.chunks)) return parsed.chunks;
    } catch { /* rebuild below */ }
  }
  // Derived data: rebuild from extracted text when the chunk index is missing.
  const extractedFile = extractedPath(projectDir, sourceId);
  if (!(await exists(extractedFile))) return [];
  const text = await fs.readFile(extractedFile, 'utf8');
  const chunks = chunkSourceText(sourceId, text);
  if (chunks.length) await writeSearchIndex(projectDir, sourceId, chunks);
  return chunks;
}

export interface SourceSearchRequest {
  query: string;
  sourceIds?: string[];
  classifications?: SourceClassification[];
  authorities?: SourceAuthority[];
  limit?: number;
}

/**
 * Offline lexical retrieval. Exact fictional names, multi-word queries, and
 * phrases all work with no model, no embeddings, and no network. Ranked by
 * term frequency with a phrase bonus; snippets show the match in context.
 */
export async function searchSources(projectDir: string, request: SourceSearchRequest): Promise<SourceSearchHit[]> {
  const query = normalize(String(request.query ?? ''));
  if (!query) return [];
  const terms = tokenize(query);
  if (!terms.length) return [];

  const sources = await readSources(projectDir);
  const wanted = new Set(request.sourceIds ?? []);
  const classes = request.classifications?.length ? new Set(request.classifications) : null;
  const authorities = request.authorities?.length ? new Set(request.authorities) : null;

  type Scored = { hit: SourceSearchHit; source: StorySource };
  const scored: Scored[] = [];

  for (const source of sources) {
    if (wanted.size && !wanted.has(source.id)) continue;
    if (classes && !classes.has(source.classification)) continue;
    if (authorities && !authorities.has(source.authority)) continue;
    if (source.extractionStatus === 'failed' || source.extractionStatus === 'pending') continue;

    for (const chunk of await loadChunks(projectDir, source.id)) {
      const hay = normalize(chunk.text);
      let score = 0;
      let firstIndex = -1;
      let matchedTerms = 0;
      for (const term of terms) {
        let from = 0;
        let count = 0;
        for (;;) {
          const at = hay.indexOf(term, from);
          if (at === -1) break;
          if (firstIndex === -1) firstIndex = at;
          count += 1;
          from = at + term.length;
        }
        if (!count) continue;
        matchedTerms += 1;
        score += 1 + Math.min(4, count - 1) * 0.35;
      }
      if (!score) continue;
      // Natural-language questions carry filler words; a chunk that answers
      // them rarely repeats every term. Require most terms, rank by coverage.
      const needed = terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.6);
      if (matchedTerms < needed) continue;
      score += matchedTerms / terms.length; // full coverage outranks partial
      // Multi-word queries: reward adjacency and exact phrase presence.
      if (terms.length > 1) {
        if (hay.includes(query)) score += 3.5;
        else {
          const positions = terms.map((t) => hay.indexOf(t)).filter((p) => p !== -1);
          if (positions.length === terms.length) {
            const spread = Math.max(...positions) - Math.min(...positions);
            if (spread < 160) score += 1.2;
          }
        }
      }
      const snippetStart = Math.max(0, firstIndex - 60);
      const snippet = (snippetStart > 0 ? '…' : '') + chunk.text.slice(snippetStart, snippetStart + 240).replace(/\s+/g, ' ').trim() + (snippetStart + 240 < chunk.text.length ? '…' : '');
      scored.push({
        source,
        hit: {
          sourceId: source.id,
          chunkId: chunk.id,
          score,
          title: source.title,
          snippet,
          location: chunk.location,
          retrievalMethod: 'lexical',
        },
      });
    }
  }

  scored.sort((a, b) => b.hit.score - a.hit.score || a.source.title.localeCompare(b.source.title));
  return scored.slice(0, Math.min(Math.max(1, request.limit ?? 12), 50)).map(({ hit }) => hit);
}

/* ---------------------------------------------------------------- citation */

/** Resolve one chunk for citation display; proves the chunk actually exists. */
export async function resolveChunk(projectDir: string, sourceId: string, chunkId: string): Promise<SourceCitation | null> {
  const source = await readSource(projectDir, sourceId);
  const chunk = (await loadChunks(projectDir, sourceId)).find((c) => c.id === chunkId);
  if (!chunk) return null;
  return {
    sourceId,
    title: source.title,
    chunkId,
    location: chunk.location,
    snippet: chunk.text.slice(0, 240).replace(/\s+/g, ' ').trim() + (chunk.text.length > 240 ? '…' : ''),
  };
}

/** Full chunk text for context assembly. Returns null for unknown chunks. */
export async function readSourceChunk(projectDir: string, sourceId: string, chunkId: string): Promise<SourceChunk | null> {
  await readSource(projectDir, sourceId);
  return (await loadChunks(projectDir, sourceId)).find((c) => c.id === chunkId) ?? null;
}

/** Rebuild every derived index from extracted text (backup restore path). */
export async function rebuildSourceIndexes(projectDir: string): Promise<{ rebuilt: number; sources: number }> {
  const index = await readIndex(projectDir);
  let rebuilt = 0;
  for (const source of index.sources) {
    const file = extractedPath(projectDir, source.id);
    if (!(await exists(file))) continue;
    const text = await fs.readFile(file, 'utf8');
    const chunks = chunkSourceText(source.id, text);
    if (chunks.length) {
      await writeSearchIndex(projectDir, source.id, chunks);
      rebuilt += 1;
    }
  }
  return { rebuilt, sources: index.sources.length };
}
