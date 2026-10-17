import { create } from 'zustand';
import { getProjectSession, useStore } from './store';
import { useWritingView } from './writingView';
import type { Pane } from './types';
import type { SavedDesk } from './desks';

interface Bookmark {
  start: number; end: number; direction: 'forward' | 'backward' | 'none';
  top: number; left: number; fraction: number; width: number; height: number; text: string;
}
export interface CharacterConsultation {
  projectId: string; session: number; workspaceId: string | null;
  paneId: string; documentId: string; castPaneId: string;
  characterId?: string; editorId?: string;
}
export const useCharacterConsultation = create<{ current: CharacterConsultation | null }>(() => ({ current: null }));
let bookmark: Bookmark | null = null;
let scrollIntentUntil = 0;
let returningToWriting = false;
export const consultationPreservesPaneOrder = () => returningToWriting || Boolean(useCharacterConsultation.getState().current);
export function noteConsultationScrollIntent(paneId: string) {
  if (useCharacterConsultation.getState().current?.paneId === paneId) scrollIntentUntil = performance.now() + 500;
}
export function trackConsultationScroll(paneId: string, el: HTMLTextAreaElement) {
  if (performance.now() < scrollIntentUntil) {
    noteConsultationScrollIntent(paneId);
    updateConsultationBookmark(paneId, el);
  }
}
let workspacePreview: SavedDesk['preview'] | null = null;
export const consultationWorkspacePreview = () => useCharacterConsultation.getState().current ? workspacePreview : null;
const editor = (id: string) => document.getElementById(`workspace-${id}`)?.querySelector<HTMLTextAreaElement>('textarea.draft');

function capture(el: HTMLTextAreaElement): Bookmark {
  return { start: el.selectionStart, end: el.selectionEnd, direction: el.selectionDirection,
    top: el.scrollTop, left: el.scrollLeft, fraction: el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight),
    width: el.clientWidth, height: el.clientHeight, text: el.value };
}
/** Capture user interactions, never layout-generated scroll events. */
export function updateConsultationBookmark(paneId: string, el: HTMLTextAreaElement) {
  if (useCharacterConsultation.getState().current?.paneId === paneId) bookmark = capture(el);
}
export function consultationIsCurrent(value: CharacterConsultation) {
  const state = useStore.getState();
  return state.project?.id === value.projectId && getProjectSession() === value.session
    && state.activeWorkspace === value.workspaceId
    && state.project.documents.some(doc => doc.id === value.documentId && doc.kind === 'manuscript')
    && state.panes.some(pane => pane.id === value.paneId && pane.binding?.id === value.documentId);
}
export function restoreConsultationReadingPosition() {
  scrollIntentUntil = 0;
  const current = useCharacterConsultation.getState().current;
  const el = current && editor(current.paneId);
  if (el && bookmark) {
    el.setSelectionRange(bookmark.start, bookmark.end, bookmark.direction);
    el.scrollTop = bookmark.fraction * Math.max(0, el.scrollHeight - el.clientHeight);
  }
}

/** Navigation may borrow a pane without changing its saved size or placement. */
export function beginCharacterConsultation(characterId?: string): boolean {
  const current = useCharacterConsultation.getState().current;
  if (current && consultationIsCurrent(current)) {
    if (characterId) useCharacterConsultation.setState({ current: { ...current, characterId } });
    return true;
  }
  const state = useStore.getState(), view = useWritingView.getState();
  if (!state.project || (!view.focusPaneId && (state.activeWorkspace !== 'drafting' || view.workbench))) return false;
  const candidates = state.panes.filter(pane => pane.type === 'editor'
    && state.project!.documents.some(doc => doc.id === pane.binding?.id && doc.kind === 'manuscript')
    && editor(pane.id)?.getClientRects().length);
  const source = candidates.find(pane => pane.id === (view.focusPaneId ?? view.lastWritingPaneId))
    ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (!source) return false;
  scrollIntentUntil = 0;
  bookmark = capture(editor(source.id)!);
  workspacePreview = state.panes.filter(pane => !pane.sessionOnly).flatMap(pane => {
    const el = document.getElementById(`workspace-${pane.id}`);
    if (!el?.getClientRects().length) return [];
    const box = el.getBoundingClientRect();
    return [{ x: box.x / innerWidth * 320, y: box.y / innerHeight * 180, width: box.width / innerWidth * 320,
      height: box.height / innerHeight * 180, title: pane.title, document: pane.binding?.type === 'document' }];
  });
  let cast = state.panes.find(pane => pane.type === 'characters');
  if (!cast) {
    cast = { id: `consult-cast-${crypto.randomUUID()}`, type: 'characters', title: 'Cast', region: 'main', sizeMode: 'normal', sessionOnly: true } satisfies Pane;
    useStore.setState({ panes: [...state.panes, cast] });
  }
  useWritingView.getState().setFocusLayer(null);
  useCharacterConsultation.setState({ current: { projectId: state.project.id, session: getProjectSession(), workspaceId: state.activeWorkspace,
    paneId: source.id, documentId: source.binding!.id, castPaneId: cast.id, characterId } });
  return true;
}
export function showConsultationEditor(id: string) {
  const current = useCharacterConsultation.getState().current;
  if (current) useCharacterConsultation.setState({ current: { ...current, editorId: id } });
}
export function parkConsultationEditor() {
  const current = useCharacterConsultation.getState().current;
  if (!current?.editorId) return;
  useStore.getState().dockFloatingPanel(current.editorId);
  useCharacterConsultation.setState({ current: { ...current, editorId: undefined } });
}
export function finishCharacterConsultation(restore = true) {
  const current = useCharacterConsultation.getState().current;
  if (!current) return;
  const valid = consultationIsCurrent(current), place = bookmark;
  const state = useStore.getState();
  if (state.project?.id === current.projectId && getProjectSession() === current.session && current.editorId) {
    parkConsultationEditor();
    if (restore && valid) useStore.getState().setNotice('Character draft kept. Save it to include changes in project backups.');
  }
  returningToWriting = restore && valid;
  useCharacterConsultation.setState({ current: null }); bookmark = null; workspacePreview = null; scrollIntentUntil = 0;
  if (!restore || !valid) return;
  requestAnimationFrame(() => {
    try {
      if (!consultationIsCurrent(current) || useCharacterConsultation.getState().current) return;
      const el = editor(current.paneId);
      if (!el?.getClientRects().length || !place) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(Math.min(place.start, el.value.length), Math.min(place.end, el.value.length), place.direction);
      const same = el.clientWidth === place.width && el.clientHeight === place.height && el.value === place.text;
      el.scrollTop = same ? place.top : place.fraction * Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollLeft = place.left;
    } finally { returningToWriting = false; }
  });
}
export function leaveConsultationForWorkspace() {
  if (!useCharacterConsultation.getState().current) return;
  finishCharacterConsultation(false);
  useWritingView.getState().focus(null);
}
export function openFullCast() {
  leaveConsultationForWorkspace();
  useWritingView.getState().focus(null);
  useStore.getState().openPane('characters', { title: 'Cast', region: 'main', focus: true });
}
