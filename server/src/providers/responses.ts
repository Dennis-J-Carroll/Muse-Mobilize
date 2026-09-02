import { readSettings } from '../settings.js';
import type { ModelProvider, ModelRequest, ModelResult, Settings } from '../types.js';
import { providerHttpError } from './errors.js';

type KeySetting = 'openaiApiKey' | 'xaiApiKey';
type ModelSetting = 'openaiModel' | 'xaiModel';

interface ResponsesProviderDefinition {
  id: string;
  label: string;
  endpoint: string;
  keySetting: KeySetting;
  modelSetting: ModelSetting;
  envKeys?: string[];
  models: string[];
}

interface ResponsesProviderDependencies {
  readSettings: () => Promise<Settings>;
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
}

function responseText(payload: any): string {
  return (payload.output ?? [])
    .flatMap((item: any) => item.content ?? [])
    .filter((item: any) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item: any) => item.text)
    .join('\n');
}

export function createResponsesProvider(
  definition: ResponsesProviderDefinition,
  dependencies: Partial<ResponsesProviderDependencies> = {},
): ModelProvider {
  const settings = dependencies.readSettings ?? readSettings;
  const fetcher = dependencies.fetch ?? fetch;
  const env = dependencies.env ?? process.env;
  const credential = async () => {
    const configured = await settings();
    return configured[definition.keySetting]
      ?? definition.envKeys?.map((name) => env[name]).find(Boolean);
  };

  return {
    id: definition.id,
    label: definition.label,
    async available() {
      return Boolean(await credential());
    },
    async models() {
      return definition.models;
    },
    async complete(req: ModelRequest): Promise<ModelResult> {
      const configured = await settings();
      const key = configured[definition.keySetting]
        ?? definition.envKeys?.map((name) => env[name]).find(Boolean);
      if (!key) throw new Error(`${definition.label} API key missing. Add one in Settings or environment.`);
      const model = req.model || configured[definition.modelSetting] || definition.models[0];
      const response = await fetcher(definition.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          store: false,
          max_output_tokens: req.maxTokens,
          input: [
            { role: 'system', content: req.system },
            ...req.messages.map((message) => ({ role: message.role, content: message.content })),
          ],
        }),
      });
      if (!response.ok) {
        throw await providerHttpError(definition.label, response);
      }
      const payload: any = await response.json();
      return {
        text: responseText(payload),
        model: payload.model ?? model,
        usage: {
          inputTokens: payload.usage?.input_tokens,
          outputTokens: payload.usage?.output_tokens,
        },
      };
    },
  };
}
