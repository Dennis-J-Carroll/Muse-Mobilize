import { mockProvider } from './mock.js';
import { anthropicProvider } from './anthropic.js';
import { ollamaProvider } from './ollama.js';
import { openaiProvider } from './openai.js';
import { googleProvider } from './google.js';
import { xaiProvider } from './xai.js';
import { localModelShelf } from './local-models.js';
import { readSettings } from '../settings.js';
import type { ModelProvider } from '../types.js';

/**
 * Models are engines; agents are roles (§5). Nothing above this module knows
 * which vendor is answering — swapping Anthropic for a local Qwen changes a
 * setting, not an agent definition.
 */
export const providers: Record<string, ModelProvider> = {
  openai: openaiProvider,
  google: googleProvider,
  xai: xaiProvider,
  mock: mockProvider,
  anthropic: anthropicProvider,
  ollama: ollamaProvider,
};

interface ProviderMeta {
  featured: boolean;
  kind: 'hosted' | 'local' | 'offline';
  note: string;
  setup?: { keyField: string; modelField: string; keyPlaceholder: string; keyUrl: string; envKeys: string[] };
}

const providerMeta: Record<string, ProviderMeta> = {
  openai: {
    featured: true, kind: 'hosted', note: 'GPT models through OpenAI Responses API.',
    setup: { keyField: 'openaiApiKey', modelField: 'openaiModel', keyPlaceholder: 'sk-proj-…', keyUrl: 'https://platform.openai.com/api-keys', envKeys: ['OPENAI_API_KEY'] },
  },
  google: {
    featured: true, kind: 'hosted', note: 'Gemini through Google Interactions API.',
    setup: { keyField: 'googleApiKey', modelField: 'googleModel', keyPlaceholder: 'AIza…', keyUrl: 'https://aistudio.google.com/app/apikey', envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
  },
  xai: {
    featured: true, kind: 'hosted', note: 'Grok through xAI Responses API.',
    setup: { keyField: 'xaiApiKey', modelField: 'xaiModel', keyPlaceholder: 'xai-…', keyUrl: 'https://console.x.ai/', envKeys: ['XAI_API_KEY'] },
  },
  anthropic: {
    featured: false, kind: 'hosted', note: 'Claude through Anthropic Messages API.',
    setup: { keyField: 'anthropicApiKey', modelField: 'anthropicModel', keyPlaceholder: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys', envKeys: [] },
  },
  ollama: { featured: false, kind: 'local', note: 'Models running on your machine.' },
  mock: { featured: false, kind: 'offline', note: 'Deterministic demo. No key, network, or cost.' },
};

/** `default` in an agent file means "whatever the writer chose in Settings". */
export async function resolveProvider(requested: string): Promise<ModelProvider> {
  if (requested && requested !== 'default' && providers[requested]) return providers[requested];
  const s = await readSettings();
  return providers[s.defaultProvider ?? 'mock'] ?? mockProvider;
}

export async function providerStatus() {
  const out = [];
  const configured = await readSettings();
  for (const p of Object.values(providers)) {
    let available = false;
    let models: string[] = [];
    try {
      available = await p.available();
      models = await p.models();
    } catch {
      available = false;
    }
    const meta = providerMeta[p.id];
    const credentialSource = meta.setup
      ? configured[meta.setup.keyField as keyof typeof configured]
        ? 'settings'
        : meta.setup.envKeys.some((name) => Boolean(process.env[name]))
          ? 'environment'
          : null
      : null;
    out.push({
      id: p.id, label: p.label, available, models, credentialSource, ...meta,
      localModels: p.id === 'ollama'
        ? localModelShelf(models, configured.defaultProvider === 'ollama' ? configured.ollamaModel : undefined)
        : undefined,
    });
  }
  return out;
}

export async function testProvider(providerId: string) {
  const provider = providers[providerId];
  if (!provider) throw new Error(`Unknown model provider: ${providerId}`);
  if (!(await provider.available())) throw new Error(`${provider.label} is not configured. Add credentials in Settings first.`);
  const started = Date.now();
  const result = await provider.complete({
    system: 'This is a connection check. Follow the user instruction exactly.',
    messages: [{ role: 'user', content: 'Reply with READY only.' }],
    maxTokens: 64,
  });
  return { ok: true as const, provider: provider.id, model: result.model, ms: Date.now() - started };
}
