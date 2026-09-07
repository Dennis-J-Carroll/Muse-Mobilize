import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useStore } from '../store';
import type { Pane } from '../types';
import * as Icon from '../components/icons';
import { useWritingView, WRITING_FONTS, type WritingFont } from '../writingView';
import { useWritingFullscreen } from '../useWritingFullscreen';
import { openConnections } from '../connectionsView';
import { resolveBangHash, type BangSnapshot } from '../bangHash';

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
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const isManuscript = useStore((s) => s.project?.documents.find((item) => item.id === docId)?.kind === 'manuscript');
  const focused = useWritingView((s) => s.focusPaneId === pane.id);
  const controlsHidden = useWritingView((s) => s.controlsHidden);
  const quiet = isManuscript && focused && controlsHidden;
  const browserScreen = useWritingFullscreen(focused);
  const surface = useWritingView((s) => s.surface);
  const weight = useWritingView((s) => s.weight);
  const fontId = useWritingView((s) => s.font);
  const font = WRITING_FONTS.find((item) => item.id === fontId) ?? WRITING_FONTS[0];
  const wasFocused = useRef(focused);
  const bang = useRef<BangSnapshot | null>(null);

  useLayoutEffect(() => {
    if (wasFocused.current === focused) return;
    wasFocused.current = focused;
    ref.current?.focus({ preventScroll: true });
  }, [focused]);

  const bindEditor = useCallback((element: HTMLTextAreaElement | null) => {
    if (element) editorRefs.set(docId, element);
    else if (editorRefs.get(docId) === ref.current) editorRefs.delete(docId);
    ref.current = element;
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

  const toggleControls = () => {
    useWritingView.getState().setControlsHidden(!controlsHidden);
    ref.current?.focus({ preventScroll: true });
  };

  const connectSelection = () => {
    const el = ref.current;
    if (!el || doc?.recovery) return;
    const start = el.selectionStart; const end = el.selectionEnd;
    openConnections({ target: { kind: 'document', id: docId },
      ...(end > start ? { range: { start, end, quote: el.value.slice(start, end) } } : {}) });
  };
  const typedCommand = (character: string): boolean => {
    const el = ref.current;
    if (!el || doc?.recovery) return false;
    if (character === '!') {
      bang.current = { content: el.value, start: el.selectionStart, end: el.selectionEnd };
      return false;
    }
    const resolved = character === '#' && el.selectionStart === el.selectionEnd ? resolveBangHash(el.value, el.selectionStart, bang.current) : null;
    bang.current = null;
    if (!resolved) return false;
    // Restore any text temporarily replaced by !, before opening the overlay.
    editDoc(docId, resolved.content);
    openConnections({ target: { kind: 'document', id: docId },
      ...(resolved.quote ? { range: { start: resolved.start, end: resolved.end, quote: resolved.quote } } : {}) });
    return true;
  };

  if (!doc) return <div className="pane-body pane-loading">Opening…</div>;

  return (
    <div className={`editor-wrap ${isManuscript ? 'writing-page' : ''} ${quiet ? 'is-quiet' : ''}`} data-surface={isManuscript ? surface : undefined}>
      {quiet && <button type="button" className="writing-controls-reveal" aria-label="Show writing controls" title="Show writing controls"
        onPointerDown={(event) => event.preventDefault()} onClick={toggleControls}><Icon.Feather size={16} /></button>}
      {isManuscript && <div className="writing-toolbar" hidden={quiet}>
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
        <button type="button" aria-label="Tag or link selection" title="Connect selected text, or type !#" disabled={Boolean(doc.recovery)} onPointerDown={(event) => event.preventDefault()} onClick={connectSelection}>Tag / link</button>
        {focused && <div className="writing-focus-actions">
          <button type="button" aria-label="Open story cards" aria-keyshortcuts="Alt+Shift+K" title="Open story cards (Alt+Shift+K)" onPointerDown={(event) => event.preventDefault()}
            onClick={() => useWritingView.getState().setFocusLayer({ kind: 'cards' })}>Story cards</button>
          <button type="button" aria-label={browserScreen.fullscreen ? 'Exit browser fullscreen' : 'Enter browser fullscreen'}
            disabled={browserScreen.pending} onPointerDown={(event) => event.preventDefault()}
            onClick={() => { void browserScreen.toggle(); ref.current?.focus({ preventScroll: true }); }}>
            {browserScreen.fullscreen ? 'Restore browser' : 'Fullscreen'}
          </button>
          <button type="button" aria-label="Hide writing controls" onPointerDown={(event) => event.preventDefault()} onClick={toggleControls}>Hide controls</button>
        </div>}
        <button type="button" className="writing-focus-button"
          aria-label={focused ? 'Exit writing focus' : 'Focus writing'}
          aria-pressed={focused}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => useWritingView.getState().focus(focused ? null : pane.id)}>
          <Icon.Expand size={15} /> {focused ? 'Back to workspace' : 'Focus'}
          {focused && <kbd>Esc</kbd>}
        </button>
      </div>}
      {focused && browserScreen.message && <p className="writing-font-note" role="status" hidden={quiet}>{browserScreen.message}</p>}
      {isManuscript && font.id === 'times' && <p className="writing-font-note" hidden={quiet}>Uses installed Times New Roman; otherwise a serif fallback.</p>}
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
        ref={bindEditor}
        className={`draft ${pane.type === 'notes' ? 'draft-notes' : ''}`}
        style={isManuscript ? { fontFamily: font.family, fontWeight: font.variable ? Number(weight) : 400 } : undefined}
        spellCheck
        readOnly={Boolean(doc.recovery)}
        aria-label={doc.recovery ? `${doc.title} — choose a recovered version to continue` : undefined}
        value={doc.content}
        onChange={(e) => editDoc(docId, e.target.value)}
        onSelect={syncSelection}
        onPaste={() => { bang.current = null; }}
        onCompositionStart={() => { bang.current = null; }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) { bang.current = null; return; }
          if (event.key.length === 1 && typedCommand(event.key)) event.preventDefault();
          else if (event.key.length !== 1) bang.current = null;
        }}
        onBeforeInput={(event) => {
          const native = event.nativeEvent as InputEvent;
          if (!native.isComposing && native.inputType !== 'insertFromPaste' && native.data && typedCommand(native.data)) event.preventDefault();
        }}
        onKeyUp={syncSelection}
        onMouseUp={syncSelection}
        onBlur={() => void useStore.getState().flushDoc(docId)}
        placeholder="Start writing your story…"
      />
    </div>
  );
}
