export interface BangSnapshot { content: string; start: number; end: number }
export interface BangConnection { content: string; start: number; end: number; quote: string }

/** Treat a deliberately typed !# as a command, never pasted manuscript text. */
export function resolveBangHash(content: string, caret: number, snapshot: BangSnapshot | null): BangConnection | null {
  if (!snapshot || caret !== snapshot.start + 1
    || content !== snapshot.content.slice(0, snapshot.start) + '!' + snapshot.content.slice(snapshot.end)) return null;
  let { start, end } = snapshot;
  if (start === end) {
    const before = snapshot.content.slice(0, start).match(/[\p{L}\p{N}_'’\-]+$/u);
    const after = snapshot.content.slice(end).match(/^[\p{L}\p{N}_'’\-]+/u);
    if (before) start -= before[0].length;
    if (after) end += after[0].length;
  }
  return { content: snapshot.content, start, end, quote: snapshot.content.slice(start, end) };
}
