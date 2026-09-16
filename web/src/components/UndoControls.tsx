import { useEffect } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { emptyHistory, updateHistory, useEditHistory } from '../editHistory';

export function UndoControls() {
  const projectId = useStore((s) => s.project?.id);
  const history = useEditHistory((s) => s.byProject[projectId ?? ''] ?? emptyHistory);
  const pending = useEditHistory((s) => s.pending > 0 || s.restoring);
  const formsOpen = useStore((s) => s.floatingPanels.length > 0);
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void api.history(projectId).then(({ history }) => { if (active) updateHistory(projectId, history); }).catch(() => {});
    return () => { active = false; };
  }, [projectId]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      if ((event.target as Element)?.closest('input, textarea, [contenteditable="true"], dialog, .floating-drawer')) return;
      const direction = event.key.toLowerCase() === 'z' ? (event.shiftKey ? 'redo' : 'undo') : event.key.toLowerCase() === 'y' ? 'redo' : null;
      if (!direction || pending || formsOpen) return;
      event.preventDefault(); void useStore.getState().restoreSavedEdit(direction);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [pending, formsOpen]);
  return <div className="undo-controls" role="group" aria-label="Saved project history">
    {(['undo', 'redo'] as const).map((direction) => <button key={direction} type="button"
      aria-label={`${direction === 'undo' ? 'Undo' : 'Redo'} saved change`}
      title={formsOpen ? 'Save or cancel open card forms first' : history[direction]?.label ?? 'No saved changes in this session'}
      disabled={pending || formsOpen || !history[direction]} onClick={() => void useStore.getState().restoreSavedEdit(direction)}>
      {direction === 'undo' ? '↶ Undo' : '↷ Redo'}
    </button>)}
    {history.message && <span className="undo-message" role="status">{history.message}</span>}
  </div>;
}

export function DocumentUndo({ documentId }: { documentId: string }) {
  const doc = useStore((s) => s.docs[documentId]);
  const restoring = useEditHistory((s) => s.restoring);
  return <div className="undo-controls" role="group" aria-label="Writing history">
    {(['undo', 'redo'] as const).map((direction) => <button key={direction} type="button" aria-label={`${direction === 'undo' ? 'Undo' : 'Redo'} writing`}
      disabled={restoring || Boolean(doc?.recovery || doc?.applyingPatch) || !doc?.history?.[direction === 'undo' ? 'past' : 'future'].length}
      onPointerDown={(event) => event.preventDefault()} onClick={() => useStore.getState().travelDoc(documentId, direction)}>
      {direction === 'undo' ? '↶ Undo' : '↷ Redo'}
    </button>)}
  </div>;
}
