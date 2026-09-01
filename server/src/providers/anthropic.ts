import { readSettings } from '../settings.js';
import type { ModelProvider, ModelRequest, ModelResult } from '../types.js';

const KNOWN_MODELS = [
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-1-20250805',
  'claude-haiku-4-5-20251001',
];

export const anthropicProvider: ModelProvider = {
  id: 'anthropic',
  label: 'Anthropic',
  async available() {
    const s = await readSettings();
    return Boolean(s.anthropicApiKey);
  },
  async models() {
    return KNOWN_MODELS;
  },
  async complete(req: ModelRequest): Promise<ModelResult> {
    const s = await readSettings();
    if (!s.anthropicApiKey) throw new Error('No Anthropic API key set. Add one in Settings.');
    const model = req.model || s.anthropicModel || KNOWN_MODELS[0];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 400)}`);
    }
    const json: any = await res.json();
    const text = (json.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
    return {
      text,
      model,
      usage: { inputTokens: json.usage?.input_tokens, outputTokens: json.usage?.output_tokens },
    };
  },
};
