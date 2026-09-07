import { useCallback, useEffect, useMemo, useReducer, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import { draftJournal, RecoverableDraft, type DraftCheckpoint } from './draftRecovery';
import { getProjectSession, useStore } from './store';

export function useRecoverableDraft<T>(tool: string, entityId: string, initial: () => T) {
  const project = useStore((state) => state.project);
  const session = getProjectSession();
  const [, render] = useReducer((value: number) => value + 1, 0);
  const recovery = useMemo(() => new RecoverableDraft(draftJournal, { projectId: project?.id ?? '', tool, entityId }, initial()), [project, session, tool, entityId]);
  const current = () => useStore.getState().project === project && getProjectSession() === session;
  const setDraft: Dispatch<SetStateAction<T>> = useCallback((next) => {
    if (!current()) return;
    recovery.update(next);
    render();
  }, [recovery]);
  const completeSave = (checkpoint: DraftCheckpoint<T>, canonicalValue?: T) => {
    const complete = recovery.completeSave(checkpoint, canonicalValue);
    if (current()) render();
    return complete && current();
  };
  const discard = () => { recovery.discard(); if (current()) render(); };
  const field = <K extends keyof T>(key: K): [T[K], Dispatch<SetStateAction<T[K]>>] => [recovery.value[key], (next) => setDraft((value) => ({ ...value, [key]: typeof next === 'function' ? (next as (current: T[K]) => T[K])(value[key]) : next }))];
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (recovery.dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [recovery]);
  return { draft: recovery.value, setDraft, field, checkpoint: () => recovery.checkpoint(), completeSave, discard, restored: recovery.restored, conflict: recovery.conflict, recordId: recovery.recordId, rememberRecord: (id: string) => { recovery.rememberRecord(id); if (current()) render(); } };
}

export function DraftRecoveryNotice({ recovery }: { recovery: { restored: boolean; conflict: boolean } }) {
  return <p className="draft-recovery-note" role={recovery.conflict ? 'alert' : 'status'}>
    {recovery.conflict ? 'Recovered unsaved changes. The saved record has also changed; review these fields before saving.'
      : recovery.restored ? 'Recovered your unsaved changes for this form. Save to keep them in the project, or Cancel to discard them.'
        : 'Unsaved changes are kept in this browser. Cancel discards them; closing or sending to the side keeps them.'}
  </p>;
}

/** Render once in App, outside focus-only content so recovery remains reachable on reload. */
export function RecoveryPanel() {
  const docs = useStore((state) => state.docs);
  const issues = useSyncExternalStore(draftJournal.subscribe, draftJournal.getIssues, draftJournal.getIssues);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (Object.values(useStore.getState().docs).some((doc) => doc.dirty) || draftJournal.getIssues().length) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, []);
  const pending = Object.entries(docs).filter(([, doc]) => doc.recovery);
  if (!pending.length && !issues.length) return null;
  return <aside className="draft-recovery-panel" aria-label="Draft recovery">
    {issues.length > 0 && <div role="alert"><strong>Recovery storage needs attention</strong>{issues.map((issue) => <p key={issue}>{issue}</p>)}</div>}
    {pending.map(([id, doc]) => <section key={id} aria-label={`Recover ${doc.title}`}>
      <h2>Unsaved writing found: {doc.title}</h2>
      <p>{doc.recovery!.base !== doc.content ? 'The saved page has changed since this draft began. Choose which version to continue with. Restoring will replace the saved page when autosave runs.' : 'Choose whether to restore your unsaved writing or continue with the saved page.'}</p>
      <details><summary>Compare versions</summary><h3>Recovered writing</h3><pre>{doc.recovery!.value}</pre><h3>Saved page</h3><pre>{doc.content}</pre></details>
      <div><button type="button" className="btn btn-primary" onClick={() => useStore.getState().resolveDocRecovery(id, 'restore')}>Restore recovered draft</button><button type="button" className="btn" onClick={() => useStore.getState().resolveDocRecovery(id, 'discard')}>Keep saved version</button></div>
    </section>)}
    <p>Recovery uses this browser’s local storage on this device. It is limited, can be cleared or unavailable in private browsing, and is not a project backup. Unsaved tool forms return when you reopen the same record or new form.</p>
  </aside>;
}
