import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { useWritingView } from '../writingView';
import { dismissFocusLayer, trapLayerTab } from '../focusLayers';
import { openCharacterEditor } from '../panes/CharactersPane';
import { openWorldEditor } from '../panes/WorldPane';
import { openPlotEditor } from '../panes/PlotPane';
import { openSceneEditor } from '../panes/ScenesPane';
import { openThemeEditor } from '../panes/ThemesPane';
import { openReferenceEditor } from '../panes/ReferencesPane';
import { openMilestoneEditor } from '../panes/GoalsPane';

/** Fast focus lookup uses the same editors as manuscript connections. */
export function FocusStoryCards() {
  const focusPaneId = useWritingView((s) => s.focusPaneId);
  const layer = useWritingView((s) => s.focusLayer);
  const open = Boolean(focusPaneId && layer?.kind === 'cards');
  const canon = useStore((s) => s.canon);
  const plot = useStore((s) => s.plot);
  const scenes = useStore((s) => s.sceneBoard);
  const references = useStore((s) => s.references);
  const goals = useStore((s) => s.goals);
  const panels = useStore((s) => s.floatingPanels);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const state = useStore.getState();
    setLoading(true);
    void Promise.all([
      !state.canon && state.loadCanon(), !state.plot && state.loadPlot(),
      !state.sceneBoard && state.loadScenes(), !state.references && state.loadReferences(),
      !state.goals && state.loadGoals(),
    ]).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, attempt]);

  if (!open) return null;
  const cards = [
    ...(canon?.entities ?? []).map((item) => ({ id: `canon:${item.id}`, label: item.name,
      group: item.type === 'character' ? 'Character' : 'World',
      words: [item.name, ...item.aliases, ...(item.character?.categories ?? item.world?.categories ?? [])].join(' '),
      open: () => item.type === 'character' ? openCharacterEditor(item) : openWorldEditor(item.world?.canvas ?? { x: 0, y: 0 }, item) })),
    ...(plot?.nodes ?? []).map((item) => ({ id: `plot:${item.id}`, label: item.title, group: 'Plot', words: item.title, open: () => openPlotEditor(item.position, item) })),
    ...(scenes?.scenes ?? []).map((item) => ({ id: `scene:${item.id}`, label: item.title, group: 'Scene', words: item.title, open: () => openSceneEditor(item) })),
    ...(scenes?.themes ?? []).map((item) => ({ id: `theme:${item.id}`, label: item.name, group: 'Theme', words: `${item.name} ${item.motif ?? ''}`, open: () => openThemeEditor(item) })),
    ...(references?.items ?? []).map((item) => ({ id: `reference:${item.id}`, label: item.title, group: 'Reference', words: `${item.title} ${item.images.flatMap((image) => image.tags).join(' ')}`, open: () => openReferenceEditor(item) })),
    ...(goals?.milestones ?? []).map((item) => ({ id: `goal:${item.id}`, label: item.title, group: 'Goal', words: item.title, open: () => openMilestoneEditor(item) })),
  ];
  const matches = (text: string) => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const visible = cards.filter((card) => matches(`${card.group} ${card.words}`));
  const drafts = panels.filter((panel) => matches(panel.title));
  const incomplete = !canon || !plot || !scenes || !references || !goals;

  return createPortal(<div className="focus-cards-backdrop">
    <section className="focus-cards" role="dialog" aria-modal="true" aria-label="Story cards" onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing && !event.defaultPrevented) {
        event.preventDefault(); event.stopPropagation(); dismissFocusLayer();
      }
      trapLayerTab(event);
    }}>
      <header><div><h2>Story cards</h2><p>Pull a card beside your writing. Escape returns to the page.</p></div>
        <button type="button" aria-label="Close story cards" onClick={dismissFocusLayer}>×</button></header>
      <input ref={input} type="search" aria-label="Find story card" placeholder="Name, alias, category, or motif…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="focus-card-results">
        {drafts.length > 0 && <div className="focus-card-group"><h3>Open editors · session drafts</h3>{drafts.map((panel) => <button key={panel.id} type="button" aria-label={`Resume ${panel.title}`} onClick={() => {
          useStore.getState().undockFloatingPanel(panel.id);
          useWritingView.getState().setFocusLayer({ kind: 'editor', id: panel.id });
        }}><span>{panel.title}</span><small>Resume draft</small></button>)}</div>}
        {visible.length > 0 && <div className="focus-card-group"><h3>Story records</h3>{visible.map((card) => <button key={card.id} type="button" aria-label={`${card.group}: ${card.label}`} onClick={card.open}><span>{card.label}</span><small>{card.group}</small></button>)}</div>}
        {!loading && !visible.length && !drafts.length && <p>No matching cards.</p>}
        {loading && <p role="status">Loading story cards…</p>}
        {!loading && incomplete && <p role="status">Some story cards could not load. <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry loading cards</button></p>}
      </div>
      <footer>Unsaved card fields recover in this browser when you reopen the same form. Save to include them in project backups.</footer>
    </section>
  </div>, document.body);
}
