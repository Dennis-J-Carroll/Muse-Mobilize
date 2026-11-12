import { create } from 'zustand';
import { openConversation } from './conversationView';
import { useStore } from './store';

export const CARD_EXCERPT_MAX = 12000;
export interface CardSnapshot {
  kind: 'Theme' | 'Character' | 'Scene' | 'Plot';
  title: string;
  draft?: boolean;
  fields: [string, string | string[] | undefined][];
}
interface CardAttachment {
  id: number;
  projectId: string;
  agentId: string;
  title: string;
  text: string;
  trimmed: boolean;
}

/** Only explicitly listed, visible text enters the snapshot; no linked-record traversal. */
export function cardExcerpt(snapshot: CardSnapshot) {
  const text = [
    `${snapshot.kind}: ${snapshot.title.trim() || 'Untitled'}`,
    snapshot.draft ? 'Snapshot of the open editor; may include unsaved changes.' : 'Snapshot of the saved card.',
    ...snapshot.fields.flatMap(([label, value]) => {
      const body = Array.isArray(value) ? value.filter(Boolean).map(item => `- ${item}`).join('\n') : value?.trim();
      return body ? [`${label}:\n${body}`] : [];
    }),
  ].join('\n\n');
  return { text: text.slice(0, CARD_EXCERPT_MAX), trimmed: text.length > CARD_EXCERPT_MAX };
}

export const useCardDiscussion = create<{ current: CardAttachment | null }>(() => ({ current: null }));
let request = 0;

export function discussCard(snapshot: CardSnapshot) {
  const state = useStore.getState();
  const muse = state.agents.find(agent => agent.role === 'muse');
  if (!state.project || !muse || !openConversation(muse.id)) return;
  useCardDiscussion.setState({ current: {
    id: ++request, projectId: state.project.id, agentId: muse.id,
    title: `${snapshot.kind}: ${snapshot.title.trim() || 'Untitled'}`, ...cardExcerpt(snapshot),
  } });
}

// Attachments are temporary and never cross a project change, even if the writer returns.
useStore.subscribe((state, previous) => {
  if (state.project?.id !== previous.project?.id) useCardDiscussion.setState({ current: null });
});
