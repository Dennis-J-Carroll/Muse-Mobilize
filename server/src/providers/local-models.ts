import { readSettings, writeSettings } from '../settings.js';
import type { Settings } from '../types.js';

export interface LocalModelRecipe {
  id: string;
  model: string;
  label: string;
  size: string;
  ram: string;
  role: string;
  note: string;
  recommended?: boolean;
  heavyweight?: boolean;
}

export interface LocalModelProgress {
  status: string;
  percent?: number;
}

export const LOCAL_MODEL_RECIPES: LocalModelRecipe[] = [
  {
    id: 'qwen-tiny', model: 'qwen3.5:0.8b', label: 'Qwen 3.5 · Tiny', size: '1.0GB', ram: '4GB+ RAM',
    role: 'Quick notes', note: 'Smallest download. Fast helpers and short passes.',
  },
  {
    id: 'phi-light', model: 'phi4-mini', label: 'Phi-4 Mini', size: '2.5GB', ram: '8GB+ RAM',
    role: 'Reasoning light', note: 'Compact instruction-following and structured thinking.',
  },
  {
    id: 'qwen-story', model: 'qwen3.5:4b', label: 'Qwen 3.5 · 4B', size: '3.4GB', ram: '8GB+ RAM',
    role: 'Story room', note: 'Best starting balance for drafting and story agents.', recommended: true,
  },
  {
    id: 'muse-agent', model: 'muse-glimmer', label: 'Muse Glimmer · 30B', size: '18GB', ram: '32GB+ RAM',
    role: 'Agent specialist', note: 'Meta local agent model. Stronger, slower, hardware-heavy.', heavyweight: true,
  },
];

const normalizedModel = (name: string) => name.replace(/:latest$/, '');

export function localModelShelf(installedNames: string[], activeModel?: string) {
  const installed = new Set(installedNames.map(normalizedModel));
  const active = normalizedModel(activeModel ?? '');
  return LOCAL_MODEL_RECIPES.map((recipe) => ({
    ...recipe,
    installed: installed.has(normalizedModel(recipe.model)),
    active: active === normalizedModel(recipe.model),
  }));
}

interface LocalModelInstallerDependencies {
  readSettings: () => Promise<Settings>;
  writeSettings: (patch: Partial<Settings>) => Promise<Settings>;
  fetch: typeof fetch;
}

function progressFrom(payload: any): LocalModelProgress {
  if (payload.status === 'success') return { status: 'Ready', percent: 100 };
  if (Number.isFinite(payload.completed) && Number.isFinite(payload.total) && payload.total > 0) {
    return { status: String(payload.status ?? 'Downloading'), percent: Math.round((payload.completed / payload.total) * 100) };
  }
  return { status: String(payload.status ?? 'Preparing') };
}

export function createLocalModelInstaller(dependencies: Partial<LocalModelInstallerDependencies> = {}) {
  const settings = dependencies.readSettings ?? readSettings;
  const saveSettings = dependencies.writeSettings ?? writeSettings;
  const fetcher = dependencies.fetch ?? fetch;

  return {
    async install(id: string, onProgress: (update: LocalModelProgress) => void = () => {}) {
      const recipe = LOCAL_MODEL_RECIPES.find((item) => item.id === id);
      if (!recipe) throw new Error('Unknown local model recipe. Choose one from Local Fast Start.');
      const configured = await settings();
      const baseUrl = configured.ollamaBaseUrl ?? 'http://localhost:11434';
      let response: Response;
      try {
        response = await fetcher(`${baseUrl.replace(/\/$/, '')}/api/pull`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: recipe.model, stream: true }),
        });
      } catch {
        throw new Error('Ollama is not running. Install or start Ollama, then try again.');
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama could not download ${recipe.label}: ${body.slice(0, 300) || response.status}`);
      }
      if (!response.body) throw new Error('Ollama returned no download stream.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let succeeded = false;
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const payload = JSON.parse(line);
          if (payload.error) throw new Error(`Ollama could not download ${recipe.label}: ${payload.error}`);
          if (payload.status === 'success') succeeded = true;
          onProgress(progressFrom(payload));
        }
        if (done) break;
      }
      if (buffer.trim()) {
        const payload = JSON.parse(buffer);
        if (payload.error) throw new Error(`Ollama could not download ${recipe.label}: ${payload.error}`);
        if (payload.status === 'success') succeeded = true;
        onProgress(progressFrom(payload));
      }
      if (!succeeded) throw new Error(`Ollama stopped before ${recipe.label} finished downloading.`);

      await saveSettings({ ollamaModel: recipe.model, defaultProvider: 'ollama' });
      return { id: recipe.id, model: recipe.model };
    },
  };
}

export const localModelInstaller = createLocalModelInstaller();
