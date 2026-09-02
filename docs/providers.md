# Provider adapter guide

Muse keeps agent roles separate from model engines. Every engine implements
`ModelProvider` from `server/src/types.ts`; agent code never imports vendor SDKs.

## Responses-compatible provider

OpenAI and xAI use `createResponsesProvider` in
`server/src/providers/responses.ts`. New compatible provider usually needs one
small definition:

```ts
export const exampleProvider = createResponsesProvider({
  id: 'example',
  label: 'Example AI',
  endpoint: 'https://api.example.com/v1/responses',
  keySetting: 'exampleApiKey',
  modelSetting: 'exampleModel',
  envKeys: ['EXAMPLE_API_KEY'],
  models: ['example-fast'],
});
```

Extend key/model setting unions first. Factory already handles bearer auth,
stateless requests, message mapping, usage, and useful HTTP errors.

## Native provider

For different wire formats, copy shape of `server/src/providers/google.ts`:

1. Implement `available`, `models`, and `complete`.
2. Inject `readSettings` and `fetch` so tests need no real key or network.
3. Return normalized `{ text, model, usage }`.
4. Reuse `providerHttpError` when status meanings match.

## Local model recipe

Curated Ollama choices live in `server/src/providers/local-models.ts`. Each
recipe contains stable UI identity, exact Ollama tag, download size, RAM hint,
and short fit guidance. Add a recipe there instead of hard-coding model choices
inside React.

`createLocalModelInstaller` keeps download behavior testable through injected
settings and `fetch`. It parses Ollama's NDJSON pull stream and activates the
model only after a terminal `success` event. Preserve that transaction boundary:
failed or interrupted downloads must not change the room's active provider.

The browser endpoint streams normalized NDJSON progress from
`POST /api/local-models/:id/install`; vendor-specific pull events stay behind
the server adapter.

## Register and expose setup

1. Add key/model fields to `Settings` in `server/src/types.ts` and defaults in
   `server/src/settings.ts`.
2. Add key to redaction. Browser receives `keySet`, never secret value.
3. Allow fields through `PUT /api/settings` in `server/src/index.ts`.
4. Register provider and `setup` metadata (including standard environment keys)
   in `server/src/providers/index.ts`.
   Settings UI reads registry metadata, so no vendor-specific component is needed.

## Safety and acceptance checklist

- API key exists only in owner-readable server settings/environment and request authorization header.
- Hosted storage disabled explicitly when API supports it.
- Health check runs only after user clicks **Save & check**.
- Check copy warns tiny request may bill.
- Model presets appear without credentials.
- 401/403, 404, 429, and 5xx errors give an action, not raw vendor noise.
- Fake-fetch test asserts endpoint, auth, request body, response parsing, and errors.
- Local pull test asserts streamed progress and no activation after failed download.
- `npm test`, `npx tsc -p server/tsconfig.json --noEmit`, and `npm run build` pass.

## Official references

- [OpenAI Responses quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request)
- [Google Gemini Interactions API](https://ai.google.dev/api/interactions-api)
- [xAI text generation](https://docs.x.ai/developers/model-capabilities/text/generate-text)
- [Ollama pull API](https://docs.ollama.com/api/pull)
- [Ollama Qwen 3.5 tags](https://ollama.com/library/qwen3.5/tags)
- [Ollama Phi-4 Mini](https://ollama.com/library/phi4-mini)
- [Ollama Muse Glimmer](https://ollama.com/library/muse-glimmer)
