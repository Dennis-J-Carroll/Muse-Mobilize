import { createResponsesProvider } from './responses.js';

export const xaiProvider = createResponsesProvider({
  id: 'xai',
  label: 'xAI / Grok',
  endpoint: 'https://api.x.ai/v1/responses',
  keySetting: 'xaiApiKey',
  modelSetting: 'xaiModel',
  envKeys: ['XAI_API_KEY'],
  models: ['grok-4.6', 'grok-4.5', 'grok-4.3'],
});
