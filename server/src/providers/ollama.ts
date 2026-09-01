import { readSettings } from '../settings.js';
import type { ModelProvider, ModelRequest, ModelResult } from '../types.js';

export const ollamaProvider: ModelProvider = {
  id: 'ollama',
  label: 'Ollama (local)',
  async available() {
    const s = await readSettings();
    try {
      const res = await fetch(`${s.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  },
  async models() {
    const s = await readSettings();
    try {
      const res = await fetch(`${s.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return [];
      const json: any = await res.json();
      return (json.models ?? []).map((m: any) => m.name);
    } catch {
      return [];
    }
  },
  async complete(req: ModelRequest): Promise<ModelResult> {
    const s = await readSettings();
    const model = req.model || s.ollamaModel || 'llama3.1';
    const res = await fetch(`${s.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        options: { num_predict: req.maxTokens },
        messages: [{ role: 'system', content: req.system }, ...req.messages],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama ${res.status}: ${body.slice(0, 400)}`);
    }
    const json: any = await res.json();
    return { text: json.message?.content ?? '', model };
  },
};
