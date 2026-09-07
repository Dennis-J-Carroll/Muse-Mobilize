import { create } from 'zustand';
import type { ConnectionTarget } from '../../shared/connections';
import { useStore } from './store';
import { useWritingView, type FocusLayer } from './writingView';
import { returnToWriting } from './focusLayers';

export interface ConnectionContext {
  target: ConnectionTarget;
  range?: { start: number; end: number; quote: string };
}

export const useConnectionsView = create<{
  open: boolean; projectId: string | null; context: ConnectionContext | null;
  returnLayer: FocusLayer | null; returnElement: HTMLElement | null;
}>(() => ({ open: false, projectId: null, context: null, returnLayer: null, returnElement: null }));

export function openConnections(context: ConnectionContext | null = null) {
  const projectId = useStore.getState().project?.id;
  if (!projectId) return;
  const view = useWritingView.getState();
  useConnectionsView.setState({ open: true, projectId, context,
    returnLayer: view.focusLayer, returnElement: document.activeElement instanceof HTMLElement ? document.activeElement : null });
  if (view.focusPaneId) view.setFocusLayer({ kind: 'connections' });
}

export function closeConnections(restoreFocus = true) {
  const state = useConnectionsView.getState();
  useConnectionsView.setState({ open: false, context: null });
  if (useWritingView.getState().focusLayer?.kind === 'connections') {
    useWritingView.getState().setFocusLayer(restoreFocus ? state.returnLayer : null);
  }
  if (!restoreFocus) return;
  requestAnimationFrame(() => {
    if (state.returnElement?.isConnected && state.returnElement.getClientRects().length) state.returnElement.focus({ preventScroll: true });
    else returnToWriting();
  });
}

export function targetForEditor(id: string): ConnectionTarget | null {
  const separator = id.indexOf(':');
  const prefix = id.slice(0, separator); const entityId = id.slice(separator + 1);
  const kinds: Record<string, ConnectionTarget['kind']> = { characters: 'canon', world: 'canon', plot: 'plot', scenes: 'scene', themes: 'theme', references: 'reference', goals: 'goal' };
  return separator > 0 && entityId && entityId !== 'new' && kinds[prefix] ? { kind: kinds[prefix], id: entityId } : null;
}
