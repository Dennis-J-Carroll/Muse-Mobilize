import { useEffect, useLayoutEffect, useRef } from 'react';
import { useStore } from '../store';
import type { Pane } from '../types';
import * as Icon from '../components/icons';
import { useWritingView, WRITING_FONTS, type WritingFont } from '../writingView';

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
  const isManuscript = useStore((s) => s.project?.documents.find((item) => item.id === docId)?.kind === 'manuscript');
  const focused = useWritingView((s) => s.focusPaneId === pane.id);
  const surface = useWritingView((s) => s.surface);
  const weight = useWritingView((s) => s.weight);
  const fontId = useWritingView((s) => s.font);
  const font = WRITING_FONTS.find((item) => item.id === fontId) ?? WRITING_FONTS[0];
  const wasFocused = useRef(focused);

  useLayoutEffect(() => {
    if (wasFocused.current === focused) return;
    wasFocused.current = focused;
    ref.current?.focus({ preventScroll: true });
  }, [focused]);

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
    <div className={`editor-wrap ${isManuscript ? 'writing-page' : ''}`} data-surface={isManuscript ? surface : undefined}>
      {isManuscript && <div className="writing-toolbar">
        <span className="writing-focus-title">{doc.title}</span>
        <div className="writing-appearance">
          <select aria-label="Page surface" value={surface} onChange={(event) => useWritingView.getState().setSurface(event.target.value as 'glass' | 'paper')}>
            <option value="glass">Glass</option><option value="paper">Paper</option>
          </select>
          <select aria-label="Writing font" value={font.id} onChange={(event) => useWritingView.getState().setFont(event.target.value as WritingFont)}>
            {WRITING_FONTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <select aria-label="Writing weight" value={font.variable ? weight : '400'} disabled={!font.variable} title={font.variable ? 'Writing weight' : 'This font has one regular weight'} onChange={(event) => useWritingView.getState().setWeight(event.target.value as '350' | '400')}>
            <option value="350">Light</option><option value="400">Regular</option>
          </select>
        </div>
        <button type="button" className="writing-focus-button"
          aria-label={focused ? 'Exit writing focus' : 'Focus writing'}
          aria-pressed={focused}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => useWritingView.getState().focus(focused ? null : pane.id)}>
          <Icon.Expand size={15} /> {focused ? 'Back to workspace' : 'Focus'}
          {focused && <kbd>Esc</kbd>}
        </button>
      </div>}
      {isManuscript && font.id === 'times' && <p className="writing-font-note">Uses installed Times New Roman; otherwise a serif fallback.</p>}
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
        style={isManuscript ? { fontFamily: font.family, fontWeight: font.variable ? Number(weight) : 400 } : undefined}
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
