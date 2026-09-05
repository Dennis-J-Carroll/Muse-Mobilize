import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import type { Patch, UnresolvedRevision } from '../types';

/**
 * A patch.proposed event survived a refresh/restart but was never in `runs`
 * (see KNOWLEDGE.md "Unresolved revision persistence"). It bypasses
 * acceptPatch/rejectPatch's runs-keyed bookkeeping — there is no run to mark
 * — and tracks its own pending/stale state locally instead.
 */
export function RecoveredPatchCard({ revision }: { revision: UnresolvedRevision }) {
  const [pending, setPending] = useState<'accept' | 'reject' | null>(null);
  const [stale, setStale] = useState(false);
  const project = useStore((s) => s.project);
  const loadProgress = useStore((s) => s.loadProgress);
  const hasBody = revision.beforeText !== undefined;

  const reject = async () => {
    if (pending || !project) return;
    setPending('reject');
    try {
      await api.rejectPatch(project.id, revision.patchId);
      await loadProgress();
    } finally {
      setPending(null);
    }
  };

  const accept = async () => {
    if (pending || !project || !hasBody || !revision.documentId) return;
    setPending('accept');
    // Flush pending keystrokes first, or the server would apply to a stale file
    // and this overwrite would discard them — same invariant as acceptPatch.
    await useStore.getState().flushDoc(revision.documentId);
    const patch: Patch = {
      id: revision.patchId,
      documentId: revision.documentId,
      start: 0,
      end: 0,
      beforeText: revision.beforeText!,
      afterText: revision.afterText ?? '',
      reason: revision.reason ?? '',
      status: 'proposed',
      anchored: true,
    };
    try {
      const { content } = await api.applyPatch(project.id, patch.documentId, patch);
      const s = useStore.getState();
      const cur = s.docs[patch.documentId];
      useStore.setState({ docs: { ...s.docs, [patch.documentId]: { ...(cur ?? { title: patch.documentId }), content, dirty: false } } });
      await loadProgress();
    } catch {
      setStale(true);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="patch status-proposed recovered">
      <div className="patch-head">
        <span className="patch-tag">Recovered revision</span>
        {stale && <span className="patch-warn">draft changed — stale</span>}
      </div>
      {hasBody ? (
        <>
          <div className="patch-before">{revision.beforeText}</div>
          <div className="patch-after">{revision.afterText}</div>
        </>
      ) : (
        <div className="patch-reason">No saved content for this older revision — you can still dismiss it.</div>
      )}
      {revision.reason && <div className="patch-reason">{revision.reason}</div>}
      <div className="patch-actions">
        {hasBody && !stale && (
          <button className="btn btn-accept" disabled={pending !== null} onClick={() => void accept()}>
            {pending === 'accept' ? 'Applying…' : 'Accept'}
          </button>
        )}
        <button className="btn" disabled={pending !== null} onClick={() => void reject()}>
          {pending === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </div>
  );
}
