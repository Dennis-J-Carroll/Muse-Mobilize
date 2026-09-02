import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import type { LocalModelOption, LocalModelProgress, ProviderCheckResult, ProviderStatus } from '../types';

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
  const installLocalModel = useStore((s) => s.installLocalModel);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<ProviderCheckResult | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [localProgress, setLocalProgress] = useState<LocalModelProgress | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

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
  const localProviders = useMemo(() => providers.filter((provider) => provider.kind === 'local'), [providers]);
  const alternatives = useMemo(() => providers.filter((provider) => !provider.featured && provider.kind !== 'local'), [providers]);
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

  const chooseLocalModel = async (option: LocalModelOption) => {
    if (!selected?.available || installingId) return;
    setInstallingId(option.id);
    setLocalProgress(option.installed ? { status: 'Activating', percent: 100 } : { status: 'Starting download', percent: 0 });
    setLocalError(null);
    try {
      const baseUrl = value('ollamaBaseUrl', 'http://localhost:11434');
      if (option.installed) {
        await save({ defaultProvider: 'ollama', ollamaBaseUrl: baseUrl, ollamaModel: option.model });
      } else {
        await save({ defaultProvider: 'ollama', ollamaBaseUrl: baseUrl });
        await installLocalModel(option.id, setLocalProgress);
      }
      setForm((current) => ({ ...current, defaultProvider: 'ollama', ollamaModel: option.model }));
      setLocalProgress({ status: 'Ready for agents', percent: 100 });
    } catch (err: any) {
      setLocalError(String(err?.message ?? err));
    } finally {
      setInstallingId(null);
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
            <span className="rail-label rail-label-secondary">Free local</span>
            {localProviders.map((provider) => (
              <EngineButton key={provider.id} provider={provider} selected={selected?.id === provider.id} onSelect={() => update('defaultProvider', provider.id)} />
            ))}
            <span className="rail-label rail-label-secondary">Other engines</span>
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
                  <section className="local-fast-start">
                    <header className="local-fast-head">
                      <div>
                        <span className="engine-kind">Local fast start</span>
                        <h4>Choose weight. Start room.</h4>
                        <p>Download once. No API key or per-token bill.</p>
                      </div>
                      <span className="local-free-mark">FREE · LOCAL</span>
                    </header>

                    {!selected.available && (
                      <div className="local-runtime-gate">
                        <div>
                          <strong>Ollama not found</strong>
                          <span>Install runtime once, then Muse handles models here.</span>
                        </div>
                        <a className="btn btn-primary" href="https://ollama.com/download" target="_blank" rel="noreferrer">Get Ollama ↗</a>
                        <button type="button" className="btn" onClick={() => void load()}>Check again</button>
                      </div>
                    )}

                    <div className="local-model-rack" aria-label="Free local model choices">
                      {(selected.localModels ?? []).map((option, index) => (
                        <div
                          key={option.id}
                          className={`local-model-row ${option.recommended ? 'is-recommended' : ''} ${option.heavyweight ? 'is-heavy' : ''} ${option.active ? 'is-active' : ''}`}
                        >
                          <span className="model-spine" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                          <div className="local-model-copy">
                            <div>
                              <strong>{option.label}</strong>
                              {option.recommended && <span className="model-pick">Best start</span>}
                              {option.active && <span className="model-active">In room</span>}
                            </div>
                            <span>{option.role}</span>
                            <p>{option.note}</p>
                          </div>
                          <div className="local-model-weight">
                            <b>{option.size}</b>
                            <span>{option.ram}</span>
                          </div>
                          <button
                            type="button"
                            className={`btn ${option.recommended ? 'btn-primary' : ''}`}
                            disabled={!selected.available || Boolean(installingId)}
                            onClick={() => void chooseLocalModel(option)}
                          >
                            {installingId === option.id
                              ? 'Working…'
                              : option.active
                                ? 'Active'
                                : option.installed
                                  ? 'Use now'
                                  : 'Download & use'}
                          </button>
                        </div>
                      ))}
                    </div>

                    {localProgress && (
                      <div className="local-pull-track" role="status">
                        <div><span>{localProgress.status}</span><b>{localProgress.percent ?? '…'}{typeof localProgress.percent === 'number' ? '%' : ''}</b></div>
                        <progress max="100" value={localProgress.percent ?? 0} />
                        <small>Keep Muse open while model arrives. Default agents switch only after completion.</small>
                      </div>
                    )}
                    {localError && <div className="connection-result is-bad" role="alert">{localError}</div>}

                    <details className="local-advanced">
                      <summary>Advanced local settings</summary>
                      <label className="field">
                        <span>Ollama URL</span>
                        <input value={value('ollamaBaseUrl')} onChange={(event) => update('ollamaBaseUrl', event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Custom installed model</span>
                        <input list="models-ollama" value={value('ollamaModel')} onChange={(event) => update('ollamaModel', event.target.value)} />
                        <datalist id="models-ollama">{selected.models.map((model) => <option key={model} value={model} />)}</datalist>
                      </label>
                    </details>
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
          <span>{selected?.kind === 'offline'
            ? 'Offline engine needs no check.'
            : selected?.kind === 'local'
              ? 'Local models run on this machine. No per-token charge.'
              : 'Connection check sends tiny request and may incur vendor charge.'}</span>
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
