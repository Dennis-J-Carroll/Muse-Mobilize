import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../src/settings.js';
import { createResponsesProvider } from '../src/providers/responses.js';
import { createGoogleProvider } from '../src/providers/google.js';
import { testProvider } from '../src/providers/index.js';

test('settings expose provider readiness without returning API keys', () => {
  const view = redact({
    workspaceRoot: '/stories',
    defaultProvider: 'openai',
    anthropicApiKey: 'anthropic-secret',
    openaiApiKey: 'openai-secret',
    googleApiKey: 'google-secret',
    xaiApiKey: 'xai-secret',
  });

  assert.deepEqual(
    {
      anthropic: view.anthropicKeySet,
      openai: view.openaiKeySet,
      google: view.googleKeySet,
      xai: view.xaiKeySet,
    },
    { anthropic: true, openai: true, google: true, xai: true },
  );
  assert.equal(JSON.stringify(view).includes('secret'), false);
});

test('Responses-compatible provider sends stateless conversation and returns text usage', async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const provider = createResponsesProvider(
    {
      id: 'fast', label: 'Fast model', endpoint: 'https://models.example/v1/responses',
      keySetting: 'openaiApiKey', modelSetting: 'openaiModel', models: ['gpt-fast'],
    },
    {
      readSettings: async () => ({ workspaceRoot: '/stories', openaiApiKey: 'secret-key', openaiModel: 'gpt-fast' }),
      fetch: async (url, init) => {
        request = { url: String(url), init };
        return new Response(JSON.stringify({
          model: 'gpt-fast-2026-08-01',
          output: [{ type: 'message', content: [{ type: 'output_text', text: 'Focused reply.' }] }],
          usage: { input_tokens: 12, output_tokens: 4 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  );

  const result = await provider.complete({
    system: 'You are a story editor.',
    messages: [{ role: 'user', content: 'Read this beat.' }, { role: 'assistant', content: 'Ready.' }],
    maxTokens: 350,
  });
  const body = JSON.parse(String(request?.init?.body));

  assert.equal(request?.url, 'https://models.example/v1/responses');
  assert.equal((request?.init?.headers as Record<string, string>).authorization, 'Bearer secret-key');
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 350);
  assert.deepEqual(body.input.map((item: { role: string }) => item.role), ['system', 'user', 'assistant']);
  assert.deepEqual(result, {
    text: 'Focused reply.', model: 'gpt-fast-2026-08-01', usage: { inputTokens: 12, outputTokens: 4 },
  });
});

test('Responses-compatible provider accepts standard environment credential', async () => {
  let authorization = '';
  const provider = createResponsesProvider(
    {
      id: 'env', label: 'Environment model', endpoint: 'https://models.example/v1/responses',
      keySetting: 'openaiApiKey', modelSetting: 'openaiModel', envKeys: ['OPENAI_API_KEY'], models: ['gpt-fast'],
    },
    {
      readSettings: async () => ({ workspaceRoot: '/stories', openaiModel: 'gpt-fast' }),
      env: { OPENAI_API_KEY: 'environment-secret' },
      fetch: async (_url, init) => {
        authorization = (init?.headers as Record<string, string>).authorization;
        return new Response(JSON.stringify({
          model: 'gpt-fast', output: [{ content: [{ type: 'output_text', text: 'Ready.' }] }],
        }), { status: 200 });
      },
    },
  );

  assert.equal(await provider.available(), true);
  await provider.complete({ system: 'Check.', messages: [{ role: 'user', content: 'Ready?' }], maxTokens: 20 });
  assert.equal(authorization, 'Bearer environment-secret');
});

test('Google provider uses stateless Interactions API and reads model output steps', async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const provider = createGoogleProvider({
    readSettings: async () => ({ workspaceRoot: '/stories', googleApiKey: 'google-secret', googleModel: 'gemini-3.7-flash' }),
    fetch: async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({
        model: 'gemini-3.7-flash',
        steps: [{ type: 'thought', signature: 'opaque' }, { type: 'model_output', content: [{ type: 'text', text: 'Gemini reply.' }] }],
        usage: { total_input_tokens: 21, total_output_tokens: 7 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const result = await provider.complete({
    system: 'Protect manuscript sovereignty.',
    messages: [{ role: 'user', content: 'Review this scene.' }],
    maxTokens: 500,
  });
  const body = JSON.parse(String(request?.init?.body));

  assert.equal(request?.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal((request?.init?.headers as Record<string, string>)['x-goog-api-key'], 'google-secret');
  assert.equal(body.store, false);
  assert.equal(body.system_instruction, 'Protect manuscript sovereignty.');
  assert.equal(body.generation_config.max_output_tokens, 500);
  assert.match(body.input, /user: Review this scene\./);
  assert.deepEqual(result, {
    text: 'Gemini reply.', model: 'gemini-3.7-flash', usage: { inputTokens: 21, outputTokens: 7 },
  });
});

test('hosted provider turns rejected credentials into useful Settings guidance', async () => {
  const provider = createResponsesProvider(
    {
      id: 'openai', label: 'OpenAI', endpoint: 'https://api.openai.com/v1/responses',
      keySetting: 'openaiApiKey', modelSetting: 'openaiModel', models: ['gpt-5'],
    },
    {
      readSettings: async () => ({ workspaceRoot: '/stories', openaiApiKey: 'bad-key' }),
      fetch: async () => new Response('{"error":"invalid_api_key"}', { status: 401 }),
    },
  );

  await assert.rejects(
    provider.complete({ system: 'Be useful.', messages: [{ role: 'user', content: 'Hello' }], maxTokens: 20 }),
    /OpenAI rejected API key.*Settings/,
  );
});

test('manual connection check uses normalized provider contract', async () => {
  const result = await testProvider('mock');

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'mock');
  assert.equal(result.model, 'mock-writer-1');
  assert.equal(typeof result.ms, 'number');
});
