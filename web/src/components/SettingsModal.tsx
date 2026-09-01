import { useEffect, useState } from 'react';
import { useStore } from '../store';

/**
 * Models are engines (§5). Choosing one is a setting, not an architectural
 * change — every agent in the project follows whatever is picked here unless
 * its own file names a provider.
 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const providers = useStore((s) => s.providers);
  const load = useStore((s) => s.loadSettings);
  const save = useStore((s) => s.saveSettings);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const v = (k: string, fallback = '') => form[k] ?? (settings as any)?.[k] ?? fallback;
  const set = (k: string, val: string) => setForm((f) => ({ ...f, [k]: val }));

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <section>
          <h3>Model provider</h3>
          <p className="hint">Agents are roles; models are engines. Change this and every agent keeps its identity.</p>
          <div className="provider-list">
            {providers.map((p) => (
              <label key={p.id} className={`provider ${p.available ? '' : 'is-down'}`}>
                <input
                  type="radio"
                  name="provider"
                  checked={v('defaultProvider', 'mock') === p.id}
                  onChange={() => set('defaultProvider', p.id)}
                />
                <span className="provider-name">{p.label}</span>
                <span className={`provider-dot ${p.available ? 'up' : 'down'}`} />
                <span className="provider-status">{p.available ? `${p.models.length} model(s)` : 'unavailable'}</span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3>Anthropic</h3>
          <label className="field">
            <span>API key {settings?.anthropicKeySet ? '(a key is saved)' : '(none saved)'}</span>
            <input
              type="password"
              placeholder="sk-ant-…"
              value={form.anthropicApiKey ?? ''}
              onChange={(e) => set('anthropicApiKey', e.target.value)}
            />
          </label>
          <label className="field">
            <span>Model</span>
            <input value={v('anthropicModel')} onChange={(e) => set('anthropicModel', e.target.value)} />
          </label>
          <p className="hint">Stored in ~/.muse-mobilize/settings.json on this machine only. Never written into the project.</p>
        </section>

        <section>
          <h3>Ollama (local)</h3>
          <label className="field">
            <span>Base URL</span>
            <input value={v('ollamaBaseUrl')} onChange={(e) => set('ollamaBaseUrl', e.target.value)} />
          </label>
          <label className="field">
            <span>Model</span>
            <input value={v('ollamaModel')} onChange={(e) => set('ollamaModel', e.target.value)} />
          </label>
        </section>

        <section>
          <h3>Projects folder</h3>
          <label className="field">
            <span>Workspace root</span>
            <input value={v('workspaceRoot')} onChange={(e) => set('workspaceRoot', e.target.value)} />
          </label>
          <p className="hint">Each project is a plain folder of Markdown, YAML and JSON you can open in any editor.</p>
        </section>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
          <button
            className="btn btn-primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await save(form);
                setForm({});
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
