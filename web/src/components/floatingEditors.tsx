import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getProjectSession, useStore } from '../store';
import type { PaneType } from '../types';
import { FloatingDrawer } from './FloatingDrawer';
import { FloatingPanelStrip } from './FloatingPanelStrip';
import { useWritingView } from '../writingView';
import { returnToWriting } from '../focusLayers';
import { draftJournal } from '../draftRecovery';

/** Forms belong to the project, not to a transient tool pane. The stored
 * elements are session-only and are released by close or project switch. */
export function openFloatingEditor(config: {
  id: string; paneType: PaneType; title: string; width?: number; height?: number;
  render: (close: () => void) => ReactNode;
}) {
  const state = useStore.getState();
  if (useWritingView.getState().focusPaneId) useWritingView.getState().setFocusLayer({ kind: 'editor', id: config.id });
  if (state.floatingPanels.some((panel) => panel.id === config.id)) {
    state.undockFloatingPanel(config.id);
    // Also focus an already-visible instance without replacing its form.
    requestAnimationFrame(() => document.getElementById(`floating-${config.id}`)?.focus());
    return;
  }
  const project = state.project;
  const projectSession = getProjectSession();
  const content = config.render(() => {
    // An old async save must not close a new project's identically named form.
    if (useStore.getState().project !== project || getProjectSession() !== projectSession) return;
    const separator = config.id.indexOf(':');
    if (project && draftJournal.hasScopeIssue({ projectId: project.id, tool: config.id.slice(0, separator), entityId: config.id.slice(separator + 1) })) {
      useStore.getState().dockFloatingPanel(config.id);
      useStore.setState({ error: 'Recovery storage is unavailable. This editor was kept in the side drawer; save or copy its writing before leaving.' });
      return;
    }
    useStore.getState().closeFloatingPanel(config.id);
  });
  state.openFloatingPanel(config);
  const cascade = (state.floatingPanels.length % 6) * 28;
  // Viewport measurements live in the UI boundary; store math stays DOM-free.
  state.moveFloatingPanel(config.id, Math.max(8, window.innerWidth - (config.width ?? 560) - 64 - cascade), 72 + cascade);
  useStore.setState((current) => ({ floatingEditorContents: { ...current.floatingEditorContents, [config.id]: content } }));
}

export function FloatingEditorHost() {
  const focused = useWritingView((state) => state.focusPaneId !== null);
  const layer = useWritingView((state) => state.focusLayer);
  const focusEditorId = focused && layer?.kind === 'editor' ? layer.id : null;
  const panels = useStore((state) => state.floatingPanels);
  const contents = useStore((state) => state.floatingEditorContents);
  useEffect(() => {
    if (!focusEditorId || panels.some((panel) => panel.id === focusEditorId && !panel.docked)) return;
    useWritingView.getState().setFocusLayer(null);
    returnToWriting();
  }, [focusEditorId, panels]);
  return createPortal(<div className="floating-editor-host" hidden={focused && !focusEditorId}>
    {focusEditorId && <div className="focus-editor-backdrop" />}
    {panels.map((panel, index) => <FloatingDrawer key={panel.id} panel={panel} order={index} hidden={focused && panel.id !== focusEditorId} focusMode={panel.id === focusEditorId}>
      {contents[panel.id]}
    </FloatingDrawer>)}
    <FloatingPanelStrip disabled={focused} />
  </div>, document.body);
}
