import { create } from 'zustand';
import { openConversation } from './conversationView';
import { useStore } from './store';
import type { AskFocus } from './store';
import type { AgentRun } from './types';

/**
 * The source gate: material the writer attached to the Muse conversation by
 * pressing a button. It stays attached across questions until removed, and
 * never crosses a project change.
 */
export interface AttachedItem { id: string; title: string }
interface ConversationFocus { projectId: string | null; agentId: string | null; source: AttachedItem | null; ticket: AttachedItem | null }

export const useConversationFocus = create<ConversationFocus>(() => ({ projectId: null, agentId: null, source: null, ticket: null }));

function attach(patch: Partial<Pick<ConversationFocus, 'source' | 'ticket'>>): boolean {
  const state = useStore.getState();
  const muse = state.agents.find((agent) => agent.role === 'muse') ?? state.agents.find((agent) => agent.id === 'muse');
  if (!state.project || !muse) return false;
  const current = useConversationFocus.getState();
  const same = current.projectId === state.project.id && current.agentId === muse.id;
  useConversationFocus.setState({
    projectId: state.project.id, agentId: muse.id,
    source: same ? current.source : null, ticket: same ? current.ticket : null, ...patch,
  });
  return openConversation(muse.id);
}

export const askAboutSource = (source: AttachedItem) => attach({ source });
export const workOnTicket = (ticket: AttachedItem) => attach({ ticket });
export const detachSource = () => useConversationFocus.setState({ source: null });
export const detachTicket = () => useConversationFocus.setState({ ticket: null });

export function focusFor(projectId: string | undefined, agentId: string) {
  const focus = useConversationFocus.getState();
  if (!projectId || focus.projectId !== projectId || focus.agentId !== agentId || (!focus.source && !focus.ticket)) return null;
  return { source: focus.source, ticket: focus.ticket };
}

export const focusKey = (focus: { source: AttachedItem | null; ticket: AttachedItem | null }) => `${focus.source?.id ?? ''}|${focus.ticket?.id ?? ''}`;

/** Recent exchanges asked with the same attachment, so "dig into the second one" has something to refer to. */
export function askFocus(focus: { source: AttachedItem | null; ticket: AttachedItem | null }, runs: AgentRun[]): AskFocus {
  const key = focusKey(focus);
  const history = runs.filter((run) => run.focusKey === key && !run.error && run.text.trim()).slice(-3)
    .map((run) => ({ question: run.question, answer: run.text.slice(0, 4000) }));
  return { key, focus: { ...(focus.source ? { sourceId: focus.source.id } : {}), ...(focus.ticket ? { ticketId: focus.ticket.id } : {}) }, history };
}

export const RIPE_THREADS_QUESTION = 'Point me to the thinnest subjects in this source that connect to something deeper. For each, quote what the source says (with its section), say what it connects to, and ask me a question or two that would open it up. Don’t write new lore.';
export const TICKET_QUESTION = 'Help me move this ticket forward. Respond to anything I brought back with questions, references and anything that contradicts the source. Don’t write it for me.';

useStore.subscribe((state, previous) => {
  if (state.project?.id !== previous.project?.id) useConversationFocus.setState({ projectId: null, agentId: null, source: null, ticket: null });
});
