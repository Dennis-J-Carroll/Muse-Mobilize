import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Scene, SceneTheme, ThemeOccurrence } from '../types';

const OCCURRENCES: ThemeOccurrence[] = ['appears', 'echoes', 'fades', 'resolves'];
const OCCURRENCE_LABEL: Record<ThemeOccurrence, string> = {
  appears: 'Appears',
  echoes: 'Echoes',
  fades: 'Fades',
  resolves: 'Resolves',
};
const OCCURRENCE_MARK: Record<ThemeOccurrence, string> = {
  appears: '●',
  echoes: '◌',
  fades: '◔',
  resolves: '◆',
};

interface ThemeDraft {
  name: string;
  motif: string;
  question: string;
  description: string;
}

const draftFrom = (theme?: SceneTheme): ThemeDraft => ({
  name: theme?.name ?? '',
  motif: theme?.motif ?? '',
  question: theme?.question ?? '',
  description: theme?.description ?? '',
});

function occurrenceFor(scene: Scene, themeId: string): ThemeOccurrence | null {
  const asset = scene.assets.find((item) => item.kind === 'theme' && item.refId === themeId);
  if (!asset) return null;
  return OCCURRENCES.includes(asset.role as ThemeOccurrence) ? asset.role as ThemeOccurrence : 'appears';
}

function nextOccurrence(current: ThemeOccurrence | null): ThemeOccurrence | null {
  if (!current) return 'appears';
  const nextIndex = OCCURRENCES.indexOf(current) + 1;
  return nextIndex < OCCURRENCES.length ? OCCURRENCES[nextIndex] : null;
}

function ThemeDrawer({ theme, onClose }: { theme?: SceneTheme; onClose: () => void }) {
  const [draft, setDraft] = useState(() => draftFrom(theme));
  const [createdId, setCreatedId] = useState('');
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const set = (key: keyof ThemeDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    const patch = {
      name: draft.name.trim(),
      motif: draft.motif.trim(),
      question: draft.question.trim(),
      description: draft.description.trim(),
    };
    try {
      const existingId = theme?.id ?? createdId;
      if (existingId) {
        const updated = await useStore.getState().updateSceneTheme(existingId, patch);
        if (updated) onClose();
        return;
      }

      const created = await useStore.getState().createSceneTheme({ name: patch.name, description: patch.description });
      if (!created) return;
      setCreatedId(created.id);
      const updated = await useStore.getState().updateSceneTheme(created.id, patch);
      if (updated) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="story-drawer-backdrop theme-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className="story-drawer theme-drawer" role="dialog" aria-modal="true" aria-labelledby="theme-drawer-title" onSubmit={save}>
        <header>
          <div><span>Theme folio</span><h2 id="theme-drawer-title">{theme ? `Revise ${theme.name}` : createdId ? 'Finish new theme' : 'Add theme'}</h2></div>
          <button type="button" aria-label="Close theme editor" disabled={saving} onClick={onClose}>×</button>
        </header>
        <div className="story-drawer-scroll">
          <section className="story-form-grid theme-form-grid">
            <label className="span-2">Theme name<input ref={first} value={draft.name} onChange={(event) => set('name', event.target.value)} placeholder="Belonging without permission" /></label>
            <label className="span-2">Recurring motif<input value={draft.motif} onChange={(event) => set('motif', event.target.value)} placeholder="Open doors, borrowed names, shared meals…" /></label>
            <label className="span-2">Dramatic question<textarea rows={3} value={draft.question} onChange={(event) => set('question', event.target.value)} placeholder="What must someone risk to be known?" /></label>
            <label className="span-2">Working meaning<textarea rows={5} value={draft.description} onChange={(event) => set('description', event.target.value)} placeholder="How this theme pressures choices across story." /></label>
          </section>
        </div>
        <footer>
          <span>{saving ? 'Saving theme…' : createdId ? 'Theme created; finishing details.' : ''}</span>
          <button type="button" className="btn" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!draft.name.trim() || saving}>{saving ? 'Saving…' : theme || createdId ? 'Save theme' : 'Add to map'}</button>
        </footer>
      </form>
    </div>
  );
}

export function ThemesPane() {
  const board = useStore((state) => state.sceneBoard);
  const project = useStore((state) => state.project);
  const [drawer, setDrawer] = useState<SceneTheme | 'new' | null>(null);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  useEffect(() => { void useStore.getState().loadScenes(); }, []);

  const scenes = useMemo(() => [...(board?.scenes ?? [])].sort((left, right) => left.order - right.order), [board]);
  const themes = board?.themes ?? [];
  const occurrenceCount = useMemo(() => scenes.reduce((count, scene) => (
    count + scene.assets.filter((asset) => asset.kind === 'theme').length
  ), 0), [scenes]);

  const cycleCell = async (scene: Scene, theme: SceneTheme) => {
    const key = `${theme.id}:${scene.id}`;
    if (savingCells.has(key)) return;
    const next = nextOccurrence(occurrenceFor(scene, theme.id));
    const assets = scene.assets.filter((asset) => !(asset.kind === 'theme' && asset.refId === theme.id));
    if (next) assets.push({ kind: 'theme', refId: theme.id, role: next });
    setSavingCells((current) => new Set(current).add(key));
    try {
      await useStore.getState().updateScene(scene.id, { assets });
    } finally {
      setSavingCells((current) => {
        const updated = new Set(current);
        updated.delete(key);
        return updated;
      });
    }
  };

  if (!board) return <div className="pane-body pane-loading">Tracing themes…</div>;

  return (
    <div className="theme-workspace">
      <header className="story-toolbar theme-toolbar">
        <div><span>Motif current</span><h2>{project?.name ?? 'Theme threads'}</h2></div>
        <p><b>{themes.length}</b> themes · <b>{occurrenceCount}</b> scene marks</p>
        <button type="button" className="btn btn-primary" onClick={() => setDrawer('new')}>+ Add theme</button>
      </header>

      <section className="theme-map-intro" aria-label="Thread map key">
        <div><h3>Thread map</h3><p>Read scenes left to right. Select any cell to advance theme from first appearance through resolution.</p></div>
        <ul className="theme-legend">
          {OCCURRENCES.map((occurrence) => <li key={occurrence} className={`is-${occurrence}`}><i aria-hidden="true">{OCCURRENCE_MARK[occurrence]}</i><span>{OCCURRENCE_LABEL[occurrence]}</span></li>)}
          <li className="is-blank"><i aria-hidden="true">·</i><span>Not present</span></li>
        </ul>
      </section>

      <main className="theme-map-scroll">
        {!themes.length && (
          <div className="story-empty theme-empty"><span>◇</span><h3>No thread on map</h3><p>Add first theme, then mark where it appears, echoes, fades, and resolves.</p><button type="button" className="btn btn-primary" onClick={() => setDrawer('new')}>Add first theme</button></div>
        )}
        {themes.length > 0 && !scenes.length && (
          <div className="story-empty theme-empty compact"><h3>No scenes to cross</h3><p>Create scenes in Scene Board; they become columns here in story order.</p></div>
        )}
        {themes.length > 0 && scenes.length > 0 && (
          <table className="theme-thread-table">
            <caption>Theme occurrences across scenes in story order</caption>
            <thead><tr><th scope="col" className="theme-corner"><span>Theme</span><small>motif / question</small></th>{scenes.map((scene, index) => <th scope="col" className="theme-scene-head" key={scene.id}><small>{String(index + 1).padStart(2, '0')} · {scene.section || 'Unsectioned'}</small><span>{scene.title}</span></th>)}</tr></thead>
            <tbody>{themes.map((theme) => <tr key={theme.id}>
              <th scope="row" className="theme-identity"><button type="button" aria-label={`Edit theme ${theme.name}`} onClick={() => setDrawer(theme)}><strong>{theme.name}</strong>{theme.motif && <span>{theme.motif}</span>}{theme.question && <small>{theme.question}</small>}{!theme.motif && !theme.question && <small>Add motif or question</small>}</button></th>
              {scenes.map((scene) => {
                const current = occurrenceFor(scene, theme.id);
                const next = nextOccurrence(current);
                const key = `${theme.id}:${scene.id}`;
                const currentLabel = current ? OCCURRENCE_LABEL[current] : 'Not present';
                const nextLabel = next ? OCCURRENCE_LABEL[next] : 'Not present';
                return <td key={scene.id} className={`theme-cell-wrap ${current ? `is-${current}` : 'is-blank'}`}><button type="button" className="theme-cell" disabled={savingCells.has(key)} aria-label={`${theme.name} in ${scene.title}: ${currentLabel}. Change to ${nextLabel}.`} aria-pressed={Boolean(current)} title={`${currentLabel} → ${nextLabel}`} onClick={() => void cycleCell(scene, theme)}><i aria-hidden="true">{current ? OCCURRENCE_MARK[current] : '·'}</i><span>{currentLabel}</span></button></td>;
              })}
            </tr>)}</tbody>
          </table>
        )}
      </main>

      {drawer && <ThemeDrawer theme={drawer === 'new' ? undefined : drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}
