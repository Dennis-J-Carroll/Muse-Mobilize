import { useEffect } from 'react';
import { useStore } from '../store';
import { PatchCard } from '../components/PatchCard';
import { RecoveredPatchCard } from '../components/RecoveredPatchCard';

/**
 * Every patch still awaiting the writer's decision, in one place — both
 * patches from a live agent run and ones recovered from persisted history
 * after a refresh or restart dropped them out of `runs` (see KNOWLEDGE.md
 * "Unresolved revision persistence").
 */
export function ReviewPane() {
  const runs = useStore((s) => s.runs);
  const progress = useStore((s) => s.progress);
  const loadProgress = useStore((s) => s.loadProgress);
  useEffect(() => { void loadProgress(); }, [loadProgress]);

  const pending = Object.values(runs)
    .flat()
    .flatMap((r) => r.patches.map((p) => ({ p, agentId: r.agentId, agentName: r.agentName })))
    .filter((x) => x.p.status === 'proposed');

  const liveIds = new Set(pending.map((x) => x.p.id));
  const recovered = (progress?.unresolvedRevisions ?? []).filter((r) => !liveIds.has(r.patchId));

  if (!pending.length && !recovered.length) return <div className="agent-empty">No revisions waiting on you.</div>;

  return (
    <div className="review">
      {pending.map(({ p, agentId, agentName }) => (
        <div key={p.id} className="review-item">
          <div className="review-from">{agentName}</div>
          <PatchCard patch={p} agentId={agentId} />
        </div>
      ))}
      {recovered.map((revision) => (
        <div key={revision.patchId} className="review-item">
          <div className="review-from">{revision.actor ?? 'Agent'}</div>
          <RecoveredPatchCard revision={revision} />
        </div>
      ))}
    </div>
  );
}
