import type { RequestHandler } from 'express';
import type { ModelProvider, Settings } from './types.js';

export const trialEnabled = () => process.env.MUSE_TRIAL === '1';
export const trialSetup = () => trialEnabled() && process.env.MUSE_TRIAL_SETUP === '1';
export const TRIAL_PROVIDERS = ['mock', 'openai', 'google', 'anthropic', 'xai'];

/** Register before every route, including archive routes and large body parsers. */
export const trialGuard: RequestHandler = (req, res, next) => {
  if (!trialEnabled()) return next();
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Content-Security-Policy', "frame-ancestors 'none'");
  const origin = req.get('origin');
  if (origin) {
    try { if (new URL(origin).host !== req.get('host')) throw new Error('Cross-origin'); }
    catch { res.status(403).json({ error: 'Cross-origin trial requests are not allowed.' }); return; }
  }
  if (trialSetup()) {
    // Setup is loopback-only and never the tunnel origin. Reject DNS rebinding and cross-origin writes.
    const host = req.get('host') ?? '';
    if (!/^127\.0\.0\.1:\d+$/.test(host) || (req.get('origin') && req.get('origin') !== `http://${host}`)) {
      res.status(403).json({ error: 'Open trial setup through its local 127.0.0.1 address.' }); return;
    }
  }
  if (/^\/api\/local-models(?:\/|$)/i.test(req.path)
    || (!trialSetup() && /^\/api\/(settings|providers)(?:\/|$)/i.test(req.path) && !['GET', 'HEAD'].includes(req.method))) {
    res.status(403).json({ error: 'Trial settings are managed by the host. Project editing remains available.' }); return;
  }
  next();
};

export function trialSettings(settings: Settings): Settings {
  if (!trialEnabled()) return settings;
  const root = process.env.MUSE_TRIAL_ROOT;
  if (!root || !process.env.MUSE_CONFIG_DIR) throw new Error('Trial requires separate project and configuration folders.');
  if (!TRIAL_PROVIDERS.includes(settings.defaultProvider ?? 'mock')) throw new Error('Choose a hosted provider or offline demo for the trial.');
  return { ...settings, workspaceRoot: root, ...(process.env.MUSE_TRIAL_OFFLINE === '1' ? { defaultProvider: 'mock' } : {}) };
}

/** Limits provider calls, including consultations, rather than just browser requests. */
export function createTrialBudget(limit = 60, now = Date.now) {
  let started = now(), used = 0, active = false;
  return async <T>(call: () => Promise<T>): Promise<T> => {
    if (now() - started >= 3_600_000) { started = now(); used = 0; }
    if (active) throw new Error('Another trial AI request is running. Try again when it finishes.');
    if (used >= limit) throw new Error('Trial AI allowance reached. Try again after the hourly reset.');
    used++; active = true;
    try { return await call(); } finally { active = false; }
  };
}
const configuredLimit = Number(process.env.MUSE_TRIAL_AI_LIMIT ?? 60);
const budget = createTrialBudget(Number.isInteger(configuredLimit) && configuredLimit > 0 ? Math.min(configuredLimit, 1000) : 60);

export function trialProvider(provider: ModelProvider, settings: Settings): ModelProvider {
  if (provider.id === 'mock') return provider;
  const model = settings[`${provider.id}Model` as keyof Settings];
  return { ...provider, complete: request => budget(() => {
    if (request.system.length + request.messages.reduce((sum, item) => sum + item.content.length, 0) > 100000) {
      throw new Error('Trial question and context exceed 100,000 characters. Use a smaller selection or fewer assignments.');
    }
    return provider.complete({ ...request, model, maxTokens: Math.min(request.maxTokens, 2000) });
  }) };
}
