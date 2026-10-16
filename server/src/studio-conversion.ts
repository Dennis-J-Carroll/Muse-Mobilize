import MarkdownIt, { type Token } from 'markdown-it';
import { createHash } from 'node:crypto';
import { EDITION_MAX_BYTES, type InlineMark, type StudioBlock } from '../../shared/story-edition.js';

const markdown = new MarkdownIt('commonmark', { html: false, linkify: false, typographer: false });
export const STUDIO_CONVERSION_VERSION = 'muse-studio-1';
export const contentHash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const studioId = (kind: string, ...parts: unknown[]) => `${kind}-${contentHash(JSON.stringify(parts)).slice(0, 32)}`;

/** Convert tokens to data only. No raw HTML, remote fetch, generated choices or summaries. */
export function convertManuscript(source: string, namespace: string): { blocks: StudioBlock[]; warnings: string[] } {
  if (Buffer.byteLength(source) > EDITION_MAX_BYTES) throw new Error('Selected manuscript exceeds the 64 MiB Story Studio export limit.');
  const warnings = new Set<string>(), blocks: StudioBlock[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const tokens = markdown.parse(source, {});
  const add = (type: StudioBlock['type'], text: string, marks: InlineMark[] = [], level?: number) => {
    const data = { type, text, marks, ...(level ? { level } : {}), condition: null };
    blocks.push({ id: studioId('block', namespace, blocks.length, data), ...data });
  };
  function inline(children: Token[]): { text: string; marks: InlineMark[] } {
    let text = ''; const marks: InlineMark[] = [], opened: { kind: InlineMark['kind']; start: number }[] = [], links: string[] = [];
    for (const token of children) {
      switch (token.type) {
        case 'text': text += token.content; break;
        case 'softbreak': case 'hardbreak': text += '\n'; break;
        case 'strong_open': case 'em_open': opened.push({ kind: token.type === 'strong_open' ? 'bold' : 'italic', start: text.length }); break;
        case 'strong_close': case 'em_close': {
          const mark = opened.pop();
          if (mark && text.length > mark.start) marks.push({ ...mark, end: text.length });
          break;
        }
        case 'link_open': links.push(String(token.attrGet('href') || '')); warnings.add('Links become their visible label followed by the destination.'); break;
        case 'link_close': { const target = links.pop(); if (target) text += ` (${target})`; break; }
        case 'code_inline': text += token.content; warnings.add('Inline code becomes literal text without code styling.'); break;
        case 'image': text += `[Image omitted${token.content ? `: ${token.content}` : ''}]`; warnings.add('Inline Markdown images are omitted; choose managed images explicitly.'); break;
        default: text += token.content; warnings.add(`Unsupported inline formatting (${token.type}) becomes literal text.`);
      }
    }
    // Markdown can put emphasis inside a combining sequence. Preserve prose and
    // warn instead of emitting a mark the Studio grapheme validator must reject.
    const edges = marks.length ? new Set([0, text.length, ...[...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(s => s.index)]) : null;
    const safe = marks.filter(mark => edges!.has(mark.start) && edges!.has(mark.end));
    if (safe.length !== marks.length) warnings.add('Emphasis inside a Unicode character is removed; visible text is preserved.');
    return { text, marks: safe.sort((a, b) => a.start - b.start || b.end - a.end || a.kind.localeCompare(b.kind)) };
  }
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (['blockquote_open', 'bullet_list_open', 'ordered_list_open'].includes(token.type)) {
      warnings.add(token.type === 'blockquote_open' ? 'Quotes retain their visible text and quote markers as literal text.' : 'Lists retain their markers and item text as literal text.');
      if (token.map) add('paragraph', lines.slice(token.map[0], token.map[1]).join('\n').replace(/\n$/, ''));
      let depth = 1;
      while (++index < tokens.length && depth) depth += tokens[index].nesting;
      index--; continue;
    }
    if (token.type === 'paragraph_open' || token.type === 'heading_open') {
      const body = tokens[index + 1];
      if (body?.type !== 'inline') throw new Error('Unexpected Markdown paragraph token sequence.');
      const converted = inline(body.children || []);
      add(token.type === 'heading_open' ? 'heading' : 'paragraph', converted.text, converted.marks, token.type === 'heading_open' ? Number(token.tag.slice(1)) : undefined);
      index += 2; continue;
    }
    if (token.type === 'hr') add('divider', '');
    else if (token.type === 'fence' || token.type === 'code_block') {
      add('paragraph', token.content.replace(/\n$/, '')); warnings.add('Code blocks become literal text without code styling.');
    } else if (token.nesting === 0 && token.content) {
      add('paragraph', token.content); warnings.add(`Unsupported block formatting (${token.type}) becomes literal text.`);
    }
  }
  if (/<\/?[A-Za-z][^>]*>/.test(source)) warnings.add('HTML remains inert literal text.');
  if (/^\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}/m.test(source)) warnings.add('Tables retain their Markdown markers as literal text.');
  if (!blocks.length) add('paragraph', '');
  return { blocks, warnings: [...warnings] };
}
