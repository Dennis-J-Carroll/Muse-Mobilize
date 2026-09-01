import { useStore } from '../store';
import { PatchCard } from '../components/PatchCard';

/** Every patch still awaiting the writer's decision, in one place. */
export function ReviewPane() {
  const runs = useStore((s) => s.runs);
  const pending = Object.values(runs)
    .flat()
    .flatMap((r) => r.patches.map((p) => ({ p, agentId: r.agentId, agentName: r.agentName })))
    .filter((x) => x.p.status === 'proposed');

  if (!pending.length) return <div className="agent-empty">No revisions waiting on you.</div>;

  return (
    <div className="review">
      {pending.map(({ p, agentId, agentName }) => (
        <div key={p.id} className="review-item">
          <div className="review-from">{agentName}</div>
          <PatchCard patch={p} agentId={agentId} />
        </div>
      ))}
    </div>
  );
}
