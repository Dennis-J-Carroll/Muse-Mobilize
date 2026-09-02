import { readSettings } from '../settings.js';
import type { ModelProvider, ModelRequest, ModelResult, Settings } from '../types.js';
import { providerHttpError } from './errors.js';

const GOOGLE_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-pro'];
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

interface GoogleProviderDependencies {
  readSettings: () => Promise<Settings>;
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
}

function interactionText(payload: any): string {
  return (payload.steps ?? [])
    .filter((step: any) => step.type === 'model_output')
    .flatMap((step: any) => step.content ?? [])
    .filter((item: any) => item.type === 'text' && typeof item.text === 'string')
    .map((item: any) => item.text)
    .join('\n');
}

export function createGoogleProvider(dependencies: Partial<GoogleProviderDependencies> = {}): ModelProvider {
  const settings = dependencies.readSettings ?? readSettings;
  const fetcher = dependencies.fetch ?? fetch;
  const env = dependencies.env ?? process.env;
  const credential = async () => (await settings()).googleApiKey ?? env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  return {
    id: 'google',
    label: 'Google Gemini',
    async available() {
      return Boolean(await credential());
    },
    async models() {
      return GOOGLE_MODELS;
    },
    async complete(req: ModelRequest): Promise<ModelResult> {
      const configured = await settings();
      const apiKey = configured.googleApiKey ?? env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
      if (!apiKey) throw new Error('Google Gemini API key missing. Add one in Settings or environment.');
      const model = req.model || configured.googleModel || GOOGLE_MODELS[0];
      const response = await fetcher(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          model,
          store: false,
          system_instruction: req.system,
          input: req.messages.map((message) => `${message.role}: ${message.content}`).join('\n\n'),
          generation_config: { max_output_tokens: req.maxTokens },
        }),
      });
      if (!response.ok) {
        throw await providerHttpError('Google Gemini', response);
      }
      const payload: any = await response.json();
      return {
        text: interactionText(payload),
        model: payload.model ?? model,
        usage: {
          inputTokens: payload.usage?.total_input_tokens,
          outputTokens: payload.usage?.total_output_tokens,
        },
      };
    },
  };
}

export const googleProvider = createGoogleProvider();
