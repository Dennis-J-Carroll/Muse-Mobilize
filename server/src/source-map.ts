/**
 * Depth map for a writer-attached source. Deterministic and model-free: it
 * finds section headings, counts the words under each, and flags the thin
 * ones, so "the more shallow the subject, the more ripe" is measured rather
 * than guessed by the model.
 */

export interface SourceSection {
  title: string;
  level: number; // 1 = part, 2 = numbered section, #-headings use their depth
  line: number; // 1-based line of the heading
  words: number; // words up to the next heading of the same or a higher level
  thin: boolean;
  manuscriptMentions?: number;
}

const SENTENCE_END = /[.!?;,]$/;
const SEPARATOR = /^(\*\s*){3,}$|^-{3,}$|^_{3,}$/;
const HEADING_MAX = 80;

function headingOf(line: string): { title: string; level: number } | null {
  const text = line.trim();
  if (!text || text.length > HEADING_MAX + 10) return null;
  const hash = /^(#{1,6})\s+(.+?)\s*#*$/.exec(text);
  if (hash) return { title: hash[2].trim(), level: hash[1].length };
  const part = /^PART\s+([IVXLC]+|\d+)\b\s*[:.\-—–]?\s*(.*)$/i.exec(text);
  if (part) return { title: text, level: 1 };
  const numbered = /^\d{1,2}\\?\.\s+(.+)$/.exec(text);
  if (numbered && text.length <= HEADING_MAX && !SENTENCE_END.test(numbered[1])) return { title: numbered[1].trim(), level: 2 };
  return null;
}

const blank = (line: string | undefined) => line === undefined || !line.trim() || SEPARATOR.test(line.trim());
const countWords = (text: string) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

const NUMBERED = /^\s*\d{1,2}\\?\.\s/;

/** A heading starts after a blank or separator line; a numbered line followed by another numbered line is a list, not a heading. */
export function sourceSections(text: string): SourceSection[] {
  const lines = text.split(/\r?\n/);
  const found: { title: string; level: number; index: number }[] = [];
  lines.forEach((line, index) => {
    const heading = headingOf(line);
    if (!heading) return;
    const hashed = /^#{1,6}\s/.test(line.trim());
    if (!hashed && (!blank(lines[index - 1]) || NUMBERED.test(lines[index + 1] ?? ''))) return;
    found.push({ ...heading, index });
  });
  const sections: SourceSection[] = found.map((heading, i) => {
    let end = lines.length;
    for (let j = i + 1; j < found.length; j++) if (found[j].level <= heading.level) { end = found[j].index; break; }
    return { title: heading.title, level: heading.level, line: heading.index + 1, words: countWords(lines.slice(heading.index + 1, end).join('\n')), thin: false };
  });
  // Thin = well under the typical size of its siblings (same parent, same level).
  // Parts are containers, so only the deepest populated levels are compared.
  const levels = [...new Set(sections.map((s) => s.level))];
  const compared = new Set(levels.length > 1 ? levels.filter((l) => l !== Math.min(...levels)) : levels);
  const parent = sections.map((s, i) => { for (let j = i - 1; j >= 0; j--) if (sections[j].level < s.level) return j; return -1; });
  const groups = new Map<string, SourceSection[]>();
  sections.forEach((s, i) => { if (compared.has(s.level)) groups.set(`${s.level}:${parent[i]}`, [...(groups.get(`${s.level}:${parent[i]}`) ?? []), s]); });
  const median = (items: SourceSection[]) => { const sorted = items.map((s) => s.words).sort((x, y) => x - y); return sorted[Math.floor(sorted.length / 2)]; };
  for (const level of compared) {
    const all = sections.filter((s) => s.level === level);
    if (all.length < 3) continue;
    for (const [key, peers] of groups) {
      if (!key.startsWith(`${level}:`)) continue;
      // Thin against its siblings, or against the whole document when a family of sections is uniformly short.
      const overall = median(all);
      const siblings = peers.length >= 3 ? median(peers) : overall;
      for (const s of peers) s.thin = s.words <= Math.max(siblings, overall) * 0.6;
    }
  }
  return sections;
}

/** The name a section is "about": "House Varek — Full Lore Entry" → "Varek", "Lathios — The Meritocrat" → "Lathios". */
export function sectionSubject(title: string): string | null {
  const head = title.split(/\s+[—–-]\s+|:|\(/)[0].replace(/^(House|The)\s+/i, '').replace(/[“”"]/g, '').trim();
  if (!head || head.length < 3 || head.split(/\s+/).length > 3 || /[&\d/]/.test(head)) return null;
  if (!head.split(/\s+/).every((word) => /^\p{Lu}/u.test(word))) return null;
  return head;
}

export function countMentions(subject: string, manuscript: string): number {
  const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (manuscript.match(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu')) ?? []).length;
}

export function addManuscriptMentions(sections: SourceSection[], manuscript: string): SourceSection[] {
  return sections.map((s) => {
    const subject = s.level >= 2 ? sectionSubject(s.title) : null;
    return subject ? { ...s, manuscriptMentions: countMentions(subject, manuscript) } : s;
  });
}

export function renderDepthMap(sections: SourceSection[]): string {
  if (!sections.length) return 'No section headings were detected in this source, so there is no depth map. Judge depth from the text itself.';
  const rows = sections.map((s) => {
    const indent = '  '.repeat(Math.max(0, s.level - 1));
    const mentions = s.manuscriptMentions === undefined ? '' : ` · chapters mention it ${s.manuscriptMentions}×`;
    return `${indent}- ${s.title} — ${s.words} words${s.thin ? ' · THIN' : ''}${mentions}`;
  });
  return ['Sections with word counts. THIN = short compared with its sibling sections or the document as a whole. Chapter mentions are an approximate name count.', ...rows].join('\n');
}
