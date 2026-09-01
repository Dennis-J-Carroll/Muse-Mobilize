import { useState } from 'react';
import { useStore } from '../store';
import { revealRange } from '../panes/EditorPane';
import type { Patch } from '../types';

/**
 * Agent edits are reviewable by default (§34.8). Accept / Reject / Modify,
 * with the exact before-and-after in view — never an invisible rewrite.
 */
export function PatchCard({ patch, agentId }: { patch: Patch; agentId: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(patch.afterText);
  const [pending, setPending] = useState<'accept' | 'reject' | null>(null);
  const acceptPatch = useStore((s) => s.acceptPatch);
  const rejectPatch = useStore((s) => s.rejectPatch);

  const settled = patch.status !== 'proposed';

  const accept = async () => {
    if (pending) return;
    setPending('accept');
    try {
      await acceptPatch(patch, draft);
    } finally {
      setPending(null);
    }
  };

  const reject = async () => {
    if (pending) return;
    setPending('reject');
    try {
      await rejectPatch(agentId, patch);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={`patch status-${patch.status}`}>
      <div className="patch-head">
        <span className="patch-tag">Proposed revision</span>
        {!patch.anchored && <span className="patch-warn">could not locate in draft</span>}
        {patch.status === 'stale' && <span className="patch-warn">draft changed — stale</span>}
        {patch.anchored && (
          <button className="linkish" onClick={() => revealRange(patch.documentId, patch.start, patch.end)}>
            show in draft
          </button>
        )}
      </div>

      <div className="patch-before">{patch.beforeText}</div>
      {editing ? (
        <textarea className="patch-edit" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
      ) : (
        <div className="patch-after">{draft}</div>
      )}
      {patch.reason && <div className="patch-reason">{patch.reason}</div>}

      {!settled ? (
        <div className="patch-actions">
          <button className="btn btn-accept" disabled={!patch.anchored || pending !== null} onClick={() => void accept()}>
            {pending === 'accept' ? 'Applying…' : 'Accept'}
          </button>
          <button className="btn" disabled={pending !== null} onClick={() => void reject()}>
            {pending === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
          <button className="btn" disabled={pending !== null} onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done editing' : 'Modify'}
          </button>
        </div>
      ) : (
        <div className="patch-settled">
          {patch.status === 'accepted' ? 'Applied to the draft.' : patch.status === 'rejected' ? 'Rejected.' : 'Not applied.'}
        </div>
      )}
    </div>
  );
}
