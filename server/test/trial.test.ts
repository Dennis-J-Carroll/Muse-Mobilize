import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrialBudget, trialProvider, trialSettings, trialGuard } from '../src/trial.js';
import type { ModelRequest, ModelProvider } from '../src/types.js';

test('trial AI budget counts failures, prevents overlap, and resets after an hour', async () => {
  let now = 0;
  const budget = createTrialBudget(2, () => now);
  let finish!: () => void;
  const pending = budget(() => new Promise<void>(resolve => { finish = resolve; }));
  await assert.rejects(budget(async () => 1), /Another trial AI request/);
  finish(); await pending;
  await assert.rejects(budget(async () => { throw new Error('Provider failed'); }), /Provider failed/);
  await assert.rejects(budget(async () => 1), /allowance reached/);
  now = 3_600_000;
  assert.equal(await budget(async () => 9), 9);
});

test('trial pins configured model and bounds output even if an agent requests a different model', async () => {
  let received: ModelRequest | undefined;
  const provider: ModelProvider = { id: 'openai', label: 'Fake', available: async () => true, models: async () => [], complete: async request => { received = request; return { text: 'ok', model: request.model! }; } };
  const wrapped = trialProvider(provider, { workspaceRoot: '/trial', openaiModel: 'host-chosen-model' });
  await wrapped.complete({ system: 'Test', messages: [{ role: 'user', content: 'Hello' }], maxTokens: 50000, model: 'agent-override' });
  assert.equal(received?.model, 'host-chosen-model'); assert.equal(received?.maxTokens, 2000);
  await assert.rejects(wrapped.complete({ system: 'x'.repeat(100001), messages: [], maxTokens: 10 }), /100,000/);
});

test('trial storage cannot be redirected through saved settings; setup and public routes are restricted', () => {
  const saved = { ...process.env };
  try {
    process.env.MUSE_TRIAL = '1'; delete process.env.MUSE_TRIAL_ROOT; delete process.env.MUSE_CONFIG_DIR;
    assert.throws(() => trialSettings({ workspaceRoot: '/personal' }), /separate/);
    process.env.MUSE_TRIAL_ROOT = '/isolated/projects'; process.env.MUSE_CONFIG_DIR = '/isolated/config';
    assert.equal(trialSettings({ workspaceRoot: '/personal', defaultProvider: 'mock' }).workspaceRoot, '/isolated/projects');
    assert.throws(() => trialSettings({ workspaceRoot: '/personal', defaultProvider: 'ollama' }), /hosted provider/);
    const route = (url: string, method: string, origin?: string, host = 'trial.trycloudflare.com') => {
      let status = 200, next = false;
      trialGuard({ path: url, method, get: (name: string) => name === 'origin' ? origin : name === 'host' ? host : undefined } as any,
        { set() {}, status(code: number) { status = code; return this; }, json() {} } as any, () => { next = true; });
      return { status, next };
    };
    delete process.env.MUSE_TRIAL_SETUP;
    assert.equal(route('/api/settings', 'PUT').status, 403);
    assert.equal(route('/api/SETTINGS/', 'PUT').status, 403);
    assert.equal(route('/api/local-models/qwen/install', 'POST').status, 403);
    assert.equal(route('/api/providers/openai/test', 'POST').status, 403);
    assert.equal(route('/api/projects/test/documents/chapter-01', 'PUT', 'https://evil.test').status, 403);
    assert.equal(route('/api/projects/test/documents/chapter-01', 'PUT', 'https://trial.trycloudflare.com').next, true);
    process.env.MUSE_TRIAL_SETUP = '1';
    assert.equal(route('/api/settings', 'PUT').status, 403);
    assert.equal(route('/api/settings', 'PUT', 'http://127.0.0.1:5379', '127.0.0.1:5379').next, true);
  } finally {
    for (const key of ['MUSE_TRIAL', 'MUSE_TRIAL_ROOT', 'MUSE_CONFIG_DIR', 'MUSE_TRIAL_SETUP']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
