import { createResponsesProvider } from './responses.js';

export const openaiProvider = createResponsesProvider({
  id: 'openai',
  label: 'OpenAI',
  endpoint: 'https://api.openai.com/v1/responses',
  keySetting: 'openaiApiKey',
  modelSetting: 'openaiModel',
  envKeys: ['OPENAI_API_KEY'],
  models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'],
});
