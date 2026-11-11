/** Longest idea the server keeps as a working premise (server PREMISE_WORKING_MAX). */
export const IDEA_MAX = 1200;

const NAME_WORDS = 5;
const NAME_MAX = 60;
const FALLBACK_NAME = 'Untitled Story';

/** A story name from the first few words of an idea, e.g. "A Lighthouse Keeper Hears The". */
export function titleFromIdea(idea: string): string {
  const words = idea
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
    .slice(0, NAME_WORDS)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(' ').slice(0, NAME_MAX).trim() || FALLBACK_NAME;
}
