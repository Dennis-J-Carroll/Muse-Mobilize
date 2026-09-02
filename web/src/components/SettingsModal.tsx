import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import type { ProviderCheckResult, ProviderStatus } from '../types';

const ENGINE_MARKS: Record<string, string> = {
  openai: 'O', google: 'G', xai: 'X', anthropic: 'A', ollama: '◌', mock: 'M',
};

function EngineButton({ provider, selected, onSelect }: {
  provider: ProviderStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`engine-choice engine-${provider.id} ${selected ? 'is-selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="engine-choice-mark">{ENGINE_MARKS[provider.id] ?? provider.label[0]}</span>
      <span className="engine-choice-copy">
        <strong>{provider.label}</strong>
        <small>{provider.available ? 'Configured' : provider.kind === 'offline' ? 'Always ready' : 'Setup needed'}</small>
      </span>
      <span className={`provider-dot ${provider.available ? 'up' : 'down'}`} aria-hidden="true" />
    </button>
  );
}

/** One engine rail, one credential deck. Provider setup metadata comes from server registry. */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const providers = useStore((s) => s.providers);
  const load = useStore((s) => s.loadSettings);
  const save = useStore((s) => s.saveSettings);
  const testProvider = useStore((s) => s.testProvider);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<ProviderCheckResult | null>(null);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);

  const value = (key: string, fallback = '') => form[key] ?? (settings as any)?.[key] ?? fallback;
  const update = (key: string, next: string) => {
    setForm((current) => ({ ...current, [key]: next }));
    setCheck(null);
  };
  const discardUpdate = (key: string) => {
    setForm((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setCheck(null);
  };
  const selectedId = value('defaultProvider', 'mock');
  const selected = providers.find((provider) => provider.id === selectedId) ?? providers[0];
  const featured = useMemo(() => providers.filter((provider) => provider.featured), [providers]);
  const alternatives = useMemo(() => providers.filter((provider) => !provider.featured), [providers]);
  const keyPendingClear = Boolean(
    selected?.setup && selected.setup.keyField in form && form[selected.setup.keyField] === '',
  );

  const commit = async (withCheck: boolean) => {
    if (!selected) return;
    setSaving(true);
    setCheck(null);
    try {
      await save(form);
      setForm({});
      if (withCheck) setCheck(await testProvider(selected.id));
    } catch (err: any) {
      setCheck({ ok: false, provider: selected.id, error: String(err?.message ?? err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-head">
          <div>
            <span className="eyebrow">Engine room</span>
            <h2 id="settings-title">Connect models to your writers’ room</h2>
            <p>Agents keep their roles when engine changes.</p>
          </div>
          <button type="button" className="icon-btn settings-close" aria-label="Close settings" onClick={onClose}>×</button>
        </header>

        <div className="engine-layout">
          <aside className="engine-rail" aria-label="Model providers">
            <span className="rail-label">Fast lane</span>
            {featured.map((provider) => (
              <EngineButton key={provider.id} provider={provider} selected={selected?.id === provider.id} onSelect={() => update('defaultProvider', provider.id)} />
            ))}
            <span className="rail-label rail-label-secondary">Local &amp; other</span>
            {alternatives.map((provider) => (
              <EngineButton key={provider.id} provider={provider} selected={selected?.id === provider.id} onSelect={() => update('defaultProvider', provider.id)} />
            ))}
          </aside>

          <main className={`credential-deck deck-${selected?.id ?? 'empty'}`}>
            {selected ? (
              <>
                <section className="engine-intro">
                  <span className="engine-seal" aria-hidden="true">{ENGINE_MARKS[selected.id] ?? selected.label[0]}</span>
                  <div>
                    <span className="engine-kind">{selected.kind} engine</span>
                    <h3>{selected.label}</h3>
                    <p>{selected.note}</p>
                  </div>
                  <span className={`readiness ${selected.available ? 'is-ready' : ''}`}>
                    {selected.available ? 'Configured' : selected.kind === 'offline' ? 'Ready' : 'Needs setup'}
                  </span>
                </section>

                {selected.setup && (
                  <section className="credential-fields">
                    <label className="field">
                      <span>API key</span>
                      <input
                        type="password"
                        autoComplete="off"
                        placeholder={selected.setup.keyPlaceholder}
                        value={form[selected.setup.keyField] ?? ''}
                        onChange={(event) => update(selected.setup!.keyField, event.target.value)}
                      />
                    </label>
                    <div className="key-guidance">
                      <span>
                        {keyPendingClear
                          ? 'Key will be removed when saved.'
                          : form[selected.setup.keyField]
                          ? 'New key ready to save.'
                          : selected.credentialSource === 'settings'
                            ? 'Key saved locally. Value never returns to browser.'
                            : selected.credentialSource === 'environment'
                              ? `Using ${selected.setup.envKeys.join(' or ')} from environment.`
                            : 'No key saved.'}
                      </span>
                      <a href={selected.setup.keyUrl} target="_blank" rel="noreferrer">Create key ↗</a>
                      {selected.credentialSource === 'settings' && (
                        <button
                          type="button"
                          className="text-btn danger-text"
                          onClick={() => keyPendingClear ? discardUpdate(selected.setup!.keyField) : update(selected.setup!.keyField, '')}
                        >
                          {keyPendingClear ? 'Keep key' : 'Forget key'}
                        </button>
                      )}
                    </div>
                    <label className="field">
                      <span>Model</span>
                      <input
                        list={`models-${selected.id}`}
                        value={value(selected.setup.modelField, selected.models[0])}
                        onChange={(event) => update(selected.setup!.modelField, event.target.value)}
                      />
                      <datalist id={`models-${selected.id}`}>
                        {selected.models.map((model) => <option key={model} value={model} />)}
                      </datalist>
                    </label>
                    <p className="storage-note">Paste above or set {selected.setup.envKeys.join(' / ') || 'provider environment variable'}. Local settings file uses owner-only permissions.</p>
                  </section>
                )}

                {selected.id === 'ollama' && (
                  <section className="credential-fields">
                    <label className="field">
                      <span>Base URL</span>
                      <input value={value('ollamaBaseUrl')} onChange={(event) => update('ollamaBaseUrl', event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Model</span>
                      <input list="models-ollama" value={value('ollamaModel')} onChange={(event) => update('ollamaModel', event.target.value)} />
                      <datalist id="models-ollama">{selected.models.map((model) => <option key={model} value={model} />)}</datalist>
                    </label>
                    <p className="storage-note">Muse talks only to local Ollama URL.</p>
                  </section>
                )}

                {selected.id === 'mock' && (
                  <section className="offline-note">
                    <strong>No setup. No network. No cost.</strong>
                    <p>Mock engine returns deterministic replies for demos and interface testing.</p>
                  </section>
                )}

                {check && (
                  <div className={`connection-result ${check.ok ? 'is-good' : 'is-bad'}`} role="status">
                    {check.ok ? `Connected · ${check.model} · ${check.ms} ms` : check.error}
                  </div>
                )}

                <section className="workspace-setting">
                  <label className="field">
                    <span>Projects folder</span>
                    <input value={value('workspaceRoot')} onChange={(event) => update('workspaceRoot', event.target.value)} />
                  </label>
                  <p>Projects remain plain Markdown, YAML, and JSON.</p>
                </section>
              </>
            ) : <p>Loading engines…</p>}
          </main>
        </div>

        <footer className="modal-actions settings-actions">
          <span>{selected?.kind === 'offline' ? 'Offline engine needs no check.' : 'Connection check sends tiny request and may incur vendor charge.'}</span>
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button type="button" className="btn" disabled={saving} onClick={() => void commit(false)}>Save</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void commit(selected?.kind !== 'offline')}>
            {saving ? 'Working…' : selected?.kind === 'offline' ? 'Use offline' : 'Save & check'}
          </button>
        </footer>
      </div>
    </div>
  );
}
