import { mockProvider } from './mock.js';
import { anthropicProvider } from './anthropic.js';
import { ollamaProvider } from './ollama.js';
import { readSettings } from '../settings.js';
import type { ModelProvider } from '../types.js';

/**
 * Models are engines; agents are roles (§5). Nothing above this module knows
 * which vendor is answering — swapping Anthropic for a local Qwen changes a
 * setting, not an agent definition.
 */
export const providers: Record<string, ModelProvider> = {
  mock: mockProvider,
  anthropic: anthropicProvider,
  ollama: ollamaProvider,
};

/** `default` in an agent file means "whatever the writer chose in Settings". */
export async function resolveProvider(requested: string): Promise<ModelProvider> {
  if (requested && requested !== 'default' && providers[requested]) return providers[requested];
  const s = await readSettings();
  return providers[s.defaultProvider ?? 'mock'] ?? mockProvider;
}

export async function providerStatus() {
  const out = [];
  for (const p of Object.values(providers)) {
    let available = false;
    let models: string[] = [];
    try {
      available = await p.available();
      if (available) models = await p.models();
    } catch {
      available = false;
    }
    out.push({ id: p.id, label: p.label, available, models });
  }
  return out;
}
