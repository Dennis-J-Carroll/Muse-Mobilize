import { create } from 'zustand';
import { useStore } from './store';

interface ConversationView {
  current: { projectId: string; paneId: string; request: number; returnElement: HTMLElement | null } | null;
}

/** Temporary presentation only: the pane's saved placement and local draft stay intact. */
export const useConversationView = create<ConversationView>(() => ({ current: null }));
let request = 0;

export function conversationModalOpen(): boolean {
  return Array.from(document.querySelectorAll('dialog[open], [aria-modal="true"], .modal-backdrop'))
    .some(element => element.getClientRects().length > 0);
}

export function openConversation(agentId = 'muse'): boolean {
  const state = useStore.getState();
  if (!state.project || !state.agents.some(agent => agent.id === agentId)) return false;
  let pane = state.panes.find(item => item.type === 'agent' && item.binding?.id === agentId);
  if (!pane) {
    state.openPane('agent', { bindingId: agentId });
    pane = useStore.getState().panes.find(item => item.type === 'agent' && item.binding?.id === agentId);
    if (!pane) return false;
    // A newly opened conversation returns to Tools, without rearranging the desk.
    state.setPaneSize(pane.id, 'minimized');
  }
  const previous = useConversationView.getState().current;
  useConversationView.setState({ current: {
    projectId: state.project.id, paneId: pane.id, request: ++request,
    returnElement: previous?.projectId === state.project.id ? previous.returnElement
      : document.activeElement instanceof HTMLElement ? document.activeElement : null,
  } });
  return true;
}

export function closeConversation(restoreFocus = true) {
  const current = useConversationView.getState().current;
  useConversationView.setState({ current: null });
  if (!restoreFocus) return;
  requestAnimationFrame(() => {
    if (current?.returnElement?.isConnected && current.returnElement.getClientRects().length) {
      current.returnElement.focus({ preventScroll: true });
    } else document.querySelector<HTMLButtonElement>('.quick-muse-trigger')?.focus({ preventScroll: true });
  });
}
