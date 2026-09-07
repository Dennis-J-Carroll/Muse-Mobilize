import type { ConnectionTarget } from '../../shared/connections';
import { useStore } from './store';
import { openCharacterEditor } from './panes/CharactersPane';
import { openWorldEditor } from './panes/WorldPane';
import { openPlotEditor } from './panes/PlotPane';
import { openSceneEditor } from './panes/ScenesPane';
import { openThemeEditor } from './panes/ThemesPane';
import { openReferenceEditor } from './panes/ReferencesPane';
import { openMilestoneEditor } from './panes/GoalsPane';
import { useWritingView } from './writingView';

export interface StoryRecord { target: ConnectionTarget; label: string; group: string; words: string; open: () => void }
export const targetKey = (target: ConnectionTarget) => `${target.kind}:${target.id}`;
export const sameTarget = (a: ConnectionTarget, b?: ConnectionTarget) => Boolean(b && targetKey(a) === targetKey(b));

export async function loadStoryRecords() {
  const s = useStore.getState();
  await Promise.all([!s.canon && s.loadCanon(), !s.plot && s.loadPlot(), !s.sceneBoard && s.loadScenes(), !s.references && s.loadReferences(), !s.goals && s.loadGoals()]);
}

export function openDocumentRecord(id: string) {
  const s = useStore.getState();
  const existing = s.panes.find((pane) => pane.binding?.type === 'document' && pane.binding.id === id);
  if (existing) s.setPaneSize(existing.id, 'normal');
  else s.openPane('editor', { bindingId: id });
  const pane = useStore.getState().panes.find((item) => item.binding?.type === 'document' && item.binding.id === id);
  if (pane && useWritingView.getState().focusPaneId) useWritingView.getState().focus(pane.id);
}

/** Shared identities, not copied forms: lookup always opens the existing editor. */
export function storyRecords(s = useStore.getState()): StoryRecord[] {
  return [
    ...(s.project?.documents ?? []).map((item) => ({ target: { kind: 'document' as const, id: item.id }, label: item.title, group: 'Document', words: item.title, open: () => openDocumentRecord(item.id) })),
    ...(s.canon?.entities ?? []).map((item) => ({ target: { kind: 'canon' as const, id: item.id }, label: item.name, group: item.type === 'character' ? 'Character' : 'World', words: [item.name, ...item.aliases, ...(item.character?.categories ?? item.world?.categories ?? [])].join(' '), open: () => item.type === 'character' ? openCharacterEditor(item) : openWorldEditor(item.world?.canvas ?? { x: 0, y: 0 }, item) })),
    ...(s.plot?.nodes ?? []).map((item) => ({ target: { kind: 'plot' as const, id: item.id }, label: item.title, group: 'Plot', words: item.title, open: () => openPlotEditor(item.position, item) })),
    ...(s.sceneBoard?.scenes ?? []).map((item) => ({ target: { kind: 'scene' as const, id: item.id }, label: item.title, group: 'Scene', words: item.title, open: () => openSceneEditor(item) })),
    ...(s.sceneBoard?.themes ?? []).map((item) => ({ target: { kind: 'theme' as const, id: item.id }, label: item.name, group: 'Theme', words: `${item.name} ${item.motif ?? ''}`, open: () => openThemeEditor(item) })),
    ...(s.references?.items ?? []).map((item) => ({ target: { kind: 'reference' as const, id: item.id }, label: item.title, group: 'Reference', words: `${item.title} ${item.images.flatMap((image) => image.tags).join(' ')}`, open: () => openReferenceEditor(item) })),
    ...(s.goals?.milestones ?? []).map((item) => ({ target: { kind: 'goal' as const, id: item.id }, label: item.title, group: 'Goal', words: item.title, open: () => openMilestoneEditor(item) })),
  ];
}
