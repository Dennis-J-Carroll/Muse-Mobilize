import type { ModelProvider } from './types.js';

/** Marker the offline mock provider recognizes to answer deterministically. */
export const WHAT_IF_MARKER = 'premise-what-ifs';

const SYSTEM = `<task>${WHAT_IF_MARKER}</task>
You help a novelist pressure-test a story premise. Write exactly three escalating "What if…" variants of the premise you are given.
Each variant is one or two sentences, keeps the same protagonist, and changes the want, the obstacle, the stakes, or the twist.
Answer with the three variants only, each wrapped in <what-if>…</what-if> tags.`;

/** Tagged blocks first; otherwise numbered or bulleted lines. At most three, never empty strings. */
export function parseWhatIfs(output: string): string[] {
  const tagged = [...output.matchAll(/<what-if>([\s\S]*?)<\/what-if>/gi)].map((m) => m[1].trim());
  const found = tagged.length
    ? tagged
    : output.split('\n').map((line) => /^\s*(?:\d+[.)]|[-*•])\s+(.+)$/.exec(line)?.[1]?.trim() ?? '');
  return found.filter(Boolean).slice(0, 3);
}

export async function generateWhatIfs(provider: ModelProvider, basis: string): Promise<string[]> {
  const result = await provider.complete({
    system: SYSTEM,
    messages: [{ role: 'user', content: `<premise>${basis}</premise>` }],
    maxTokens: 600,
  });
  return parseWhatIfs(result.text);
}
