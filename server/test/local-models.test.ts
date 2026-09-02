import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalModelInstaller } from '../src/providers/local-models.js';

test('one-click local install streams progress then makes model default engine', async () => {
  let request: { url: string; body: any } | undefined;
  let saved: Record<string, unknown> | undefined;
  const progress: Array<{ status: string; percent?: number }> = [];
  const stream = [
    '{"status":"pulling manifest"}\n',
    '{"status":"downloading","completed":25,"total":100}\n',
    '{"status":"downloading","completed":100,"total":100}\n',
    '{"status":"success"}\n',
  ].join('');
  const installer = createLocalModelInstaller({
    readSettings: async () => ({ workspaceRoot: '/stories', ollamaBaseUrl: 'http://local-ollama:11434' }),
    writeSettings: async (patch) => {
      saved = patch;
      return { workspaceRoot: '/stories', ...patch } as any;
    },
    fetch: async (url, init) => {
      request = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
    },
  });

  const result = await installer.install('qwen-story', (update) => progress.push(update));

  assert.deepEqual(request, {
    url: 'http://local-ollama:11434/api/pull',
    body: { model: 'qwen3.5:4b', stream: true },
  });
  assert.deepEqual(progress.map((item) => item.percent), [undefined, 25, 100, 100]);
  assert.deepEqual(saved, { ollamaModel: 'qwen3.5:4b', defaultProvider: 'ollama' });
  assert.deepEqual(result, { id: 'qwen-story', model: 'qwen3.5:4b' });
});

test('failed local download never changes active engine', async () => {
  let saved = false;
  const installer = createLocalModelInstaller({
    readSettings: async () => ({ workspaceRoot: '/stories', defaultProvider: 'mock' }),
    writeSettings: async () => {
      saved = true;
      throw new Error('should not save');
    },
    fetch: async () => new Response('{"status":"downloading","completed":5,"total":100}\n{"error":"disk full"}\n', { status: 200 }),
  });

  await assert.rejects(installer.install('phi-light'), /disk full/);
  assert.equal(saved, false);
});
