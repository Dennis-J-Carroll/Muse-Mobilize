import { discussCard, type CardSnapshot } from '../cardDiscussion';
import { useStore } from '../store';

export function DiscussCardButton({ snapshot }: { snapshot: () => CardSnapshot }) {
  const available = useStore(state => state.agents.some(agent => agent.role === 'muse'));
  if (!available) return null;
  return <button type="button" className="btn discuss-card" onClick={event => {
    event.stopPropagation();
    discussCard(snapshot());
  }}>Discuss this card</button>;
}
