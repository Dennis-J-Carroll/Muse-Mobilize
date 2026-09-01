import fs from 'node:fs/promises';
import { CONFIG_DIR, SETTINGS_FILE, DEFAULT_WORKSPACE_ROOT, ensureDir, exists } from './paths.js';
import type { Settings } from './types.js';

const DEFAULTS: Settings = {
  workspaceRoot: DEFAULT_WORKSPACE_ROOT,
  anthropicModel: 'claude-sonnet-4-5-20250929',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1',
  defaultProvider: 'mock',
};

let cache: Settings | null = null;

export async function readSettings(): Promise<Settings> {
  if (cache) return cache;
  if (await exists(SETTINGS_FILE)) {
    try {
      const raw = JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8'));
      cache = { ...DEFAULTS, ...raw };
    } catch {
      cache = { ...DEFAULTS };
    }
  } else {
    cache = { ...DEFAULTS };
  }
  return cache!;
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await readSettings();
  const next = { ...current, ...patch };
  await ensureDir(CONFIG_DIR);
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  cache = next;
  return next;
}

/** Never send secrets back to the browser — only whether they are set. */
export function redact(s: Settings) {
  return {
    workspaceRoot: s.workspaceRoot,
    anthropicModel: s.anthropicModel,
    anthropicKeySet: Boolean(s.anthropicApiKey),
    ollamaBaseUrl: s.ollamaBaseUrl,
    ollamaModel: s.ollamaModel,
    defaultProvider: s.defaultProvider,
  };
}
