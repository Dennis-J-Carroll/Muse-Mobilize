import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import type { Pane } from '../types';
import * as Icon from '../components/icons';

/** Registry so a patch card can point at the exact range inside the draft. */
export const editorRefs = new Map<string, HTMLTextAreaElement>();

export function revealRange(documentId: string, start: number, end: number) {
  const el = editorRefs.get(documentId);
  if (!el) return;
  el.focus();
  el.setSelectionRange(start, end);
  // Rough scroll: put the range near the top third of the viewport.
  const before = el.value.slice(0, start);
  const line = before.split('\n').length;
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '28');
  el.scrollTop = Math.max(0, (line - 4) * lineHeight);
}

export function EditorPane({ pane }: { pane: Pane }) {
  const docId = pane.binding?.id ?? '';
  const doc = useStore((s) => s.docs[docId]);
  const agents = useStore((s) => s.agents);
  const selection = useStore((s) => s.selection);
  const busy = useStore((s) => s.busy);
  const editDoc = useStore((s) => s.editDoc);
  const setSelection = useStore((s) => s.setSelection);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) editorRefs.set(docId, ref.current);
    return () => {
      editorRefs.delete(docId);
    };
  }, [docId]);

  useEffect(() => {
    void useStore.getState().loadDoc(docId);
  }, [docId]);

  const syncSelection = () => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end > start) setSelection({ documentId: docId, start, end, text: el.value.slice(start, end) });
    else if (selection?.documentId === docId) setSelection(null);
  };

  const mine = selection && selection.documentId === docId ? selection : null;
  const selWords = mine ? mine.text.split(/\s+/).filter(Boolean).length : 0;
  const anyBusy = Object.values(busy).some(Boolean);

  const askAbout = (agentId: string) => {
    useStore.getState().openPane('agent', { bindingId: agentId });
    void useStore.getState().ask(agentId, 'Read this selection and tell me what you see.', true);
  };

  if (!doc) return <div className="pane-body pane-loading">Opening…</div>;

  return (
    <div className="editor-wrap">
      <div className={`ask-bar ${mine ? 'is-live' : ''}`}>
        {mine ? (
          <>
            <span className="ask-count">{selWords} words selected</span>
            <span className="ask-label">Ask</span>
            <div className="ask-agents">
              {agents.map((a) => (
                <button
                  key={a.id}
                  className="chip chip-agent"
                  disabled={anyBusy}
                  style={{ ['--chip' as any]: a.accent ?? 'var(--accent)' }}
                  onClick={() => askAbout(a.id)}
                >
                  {busy[a.id] ? '…' : a.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <span className="ask-hint">
            <Icon.Spark size={14} /> Highlight a passage to send it to an agent.
          </span>
        )}
      </div>

      <textarea
        ref={ref}
        className={`draft ${pane.type === 'notes' ? 'draft-notes' : ''}`}
        spellCheck
        value={doc.content}
        onChange={(e) => editDoc(docId, e.target.value)}
        onSelect={syncSelection}
        onKeyUp={syncSelection}
        onMouseUp={syncSelection}
        onBlur={() => void useStore.getState().flushDoc(docId)}
        placeholder="Start writing your story…"
      />
    </div>
  );
}
