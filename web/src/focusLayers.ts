import type { KeyboardEvent } from 'react';
import { useStore } from './store';
import { useWritingView } from './writingView';

export function returnToWriting() {
  const id = useWritingView.getState().focusPaneId;
  if (id) document.getElementById(`workspace-${id}`)?.querySelector<HTMLTextAreaElement>('textarea.draft')?.focus({ preventScroll: true });
}

/** Dismiss only the current layer; docking keeps the editor's live form. */
export function dismissFocusLayer() {
  const layer = useWritingView.getState().focusLayer;
  if (layer?.kind === 'editor') useStore.getState().dockFloatingPanel(layer.id);
  useWritingView.getState().setFocusLayer(null);
  returnToWriting();
}

export function trapLayerTab(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') return;
  const root = event.currentTarget;
  const controls = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'))
    .filter((element) => element.getClientRects().length > 0);
  const first = controls[0]; const last = controls.at(-1);
  if (!first) { event.preventDefault(); root.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) { event.preventDefault(); first.focus(); }
}
