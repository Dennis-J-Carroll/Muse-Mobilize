export const GUARD_NOTICE = 'Selection kept — press Delete or Backspace to remove it.';
const THRESHOLD_WORDS = 5;

/** A stray touchpad selection plus Space/Enter silently replaces a whole passage; this stops only that case. */
export function shouldGuard(value: string, start: number, end: number, inputType: string, data: string | null): boolean {
  if (end <= start) return false;
  const whitespace = (inputType === 'insertText' && data === ' ') || inputType === 'insertParagraph' || inputType === 'insertLineBreak';
  if (!whitespace) return false;
  return value.slice(start, end).split(/\s+/).filter(Boolean).length > THRESHOLD_WORDS;
}
