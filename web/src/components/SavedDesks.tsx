import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { writingReferenceDesk, type SavedDesk } from '../desks';
import { restorePrevious, restoreWithMemory, useDeskList } from '../deskList';
import { useWritingView } from '../writingView';
import { useEditHistory } from '../editHistory';
import * as Icon from './icons';

function DeskPreview({ desk }: { desk: SavedDesk }) {
  return <svg className="desk-preview" viewBox="0 0 320 180" role="img" aria-label={`Preview of ${desk.name}`}>
    <rect width="320" height="180" rx="8" fill="#dde8ec" />
    {!desk.view.sidebarCollapsed && <rect x="4" y="6" width="48" height="168" rx="5" fill="#c6d8de" />}
    {desk.preview.map((frame, index) => <g key={index}>
      <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} rx="3" fill={frame.document ? '#f8f6f0' : '#eef3f4'} stroke="#a8c6d4" strokeWidth=".8" />
      {frame.width > 40 && frame.height > 15 && <text x={frame.x + 4} y={frame.y + 10} fontSize="6" fill="#3f5f7d">{frame.title.slice(0, Math.floor(frame.width / 4))}</text>}
    </g>)}
    {desk.view.workbench && Array.from({ length: 9 }, (_, index) => <rect key={index} x="304" y={12 + index * 16} width="15" height="12" rx="2" fill="#a8c6d4" />)}
  </svg>;
}

export function SavedDesks({ capture, restore }: { capture: (name: string) => SavedDesk; restore: (desk: SavedDesk) => void }) {
  const projectId = useStore((s) => s.project?.id);
  const documents = useStore((s) => s.project?.documents);
  const panes = useStore((s) => s.panes);
  const lastWritingPaneId = useWritingView((s) => s.lastWritingPaneId);
  const historyBusy = useEditHistory((s) => s.restoring || s.pending > 0);
  const desks = useDeskList((s) => s.desks);
  const previous = useDeskList((s) => s.previous);
  const error = useDeskList((s) => s.error);
  const { persist, move } = useDeskList.getState();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const available = panes.filter((pane) => !pane.sessionOnly);
  const manuscripts = available.filter((pane) => pane.binding?.type === 'document' && documents?.some((doc) => doc.id === pane.binding?.id && doc.kind === 'manuscript'));
  const manuscript = manuscripts.find((pane) => pane.binding?.id === documentId)
    ?? manuscripts.find((pane) => pane.id === lastWritingPaneId) ?? manuscripts.find((pane) => pane.sizeMode !== 'minimized') ?? manuscripts[0];
  const references = available.filter((pane) => pane.id !== manuscript?.id);
  const reference = references.find((pane) => pane.id === referenceId) ?? references.find((pane) => pane.sizeMode !== 'minimized') ?? references[0];
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { useDeskList.getState().load(projectId ?? null); setOpen(false); setName(''); setDocumentId(''); setReferenceId(''); }, [projectId]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  return <>
    <button ref={trigger} type="button" className="saved-desks-trigger" aria-label="Saved desks" aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon.Layers size={16} /> Desks</button>
    {open && createPortal(<div className="desk-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section ref={dialog} className="saved-desks" role="dialog" aria-modal="true" aria-label="Your desks" onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key !== 'Tab') return;
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select:not(:disabled)') ?? []);
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <header><div><h2 id="saved-desks-title">Your desks</h2><p>Click a desk to return to its arrangement.</p></div><button type="button" aria-label="Close saved desks" onClick={close}><Icon.Close /></button></header>
        <section className="writing-desk-preset" aria-label="Writing with reference">
          <h3 id="writing-desk-title">Writing with reference</h3>
          <p>More room for prose, compact writing tools, and one reference beside it. Other panes stay in the tool drawer. On narrow screens, the reference sits below.</p>
          <div className="writing-desk-choices">
            <label>Manuscript<select value={manuscript?.binding?.id ?? ''} disabled={!manuscript} onChange={(event) => setDocumentId(event.target.value)}>
              {!manuscript && <option value="">Open a manuscript first</option>}
              {manuscripts.map((pane) => <option key={pane.id} value={pane.binding!.id}>{pane.title}</option>)}
            </select></label>
            <label>Reference pane<select value={reference?.id ?? ''} disabled={!reference} onChange={(event) => setReferenceId(event.target.value)}>
              {!reference && <option value="">Open a reference pane first</option>}
              {references.map((pane) => <option key={pane.id} value={pane.id}>{pane.title}</option>)}
            </select></label>
          </div>
          <div className="writing-desk-actions">
            <button type="button" disabled={!manuscript || !reference || historyBusy} onClick={() => {
              if (!manuscript?.binding || !reference) return;
              const desk = writingReferenceDesk(capture('Writing with reference'), manuscript.binding.id, available.indexOf(reference), window.innerWidth);
              if (desk) { restoreWithMemory(capture, restore, desk); close(); }
            }}>Use writing desk</button>
            <button type="button" disabled={!previous || historyBusy} onClick={() => { restorePrevious(capture, restore); close(); }}>Previous arrangement</button>
          </div>
        </section>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          if (desks.length >= 12) { useDeskList.setState({ error: 'Twelve desks saved. Remove one before adding another.' }); return; }
          if (persist([...desks, capture(name.trim())])) setName('');
        }}>
          <label>Desk name<input ref={input} aria-label="Desk name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="e.g. Atlas and chapter" required /></label>
          <button type="submit" disabled={!name.trim()}>Save desk</button>
        </form>
        {error && <p className="desk-error" role="alert">{error}</p>}
        <div className="desk-grid">
          {desks.map((desk, index) => <article key={desk.id} className="desk-card">
            {index < 9 && <span className="desk-number" aria-hidden="true">{index + 1}</span>}
            <button type="button" className="desk-restore" aria-label={`Restore ${desk.name}`} aria-keyshortcuts={index < 9 ? `Alt+Shift+${index + 1}` : undefined}
              onClick={() => { restoreWithMemory(capture, restore, desk); close(); }}><DeskPreview desk={desk} /><span>{desk.name}</span><small>{desk.view.workbench ? 'Workbench' : 'Workspace'} · {desk.view.layout} · {desk.panes.length} cards</small></button>
            <div className="desk-move">
              <button type="button" aria-label={`Move ${desk.name} up`} disabled={index === 0} onClick={() => move(desk.id, -1)}>↑</button>
              <button type="button" aria-label={`Move ${desk.name} down`} disabled={index === desks.length - 1} onClick={() => move(desk.id, 1)}>↓</button>
              <button type="button" className="desk-remove" aria-label={`Remove desk ${desk.name}`} title="Remove saved layout only" onClick={() => persist(desks.filter((item) => item.id !== desk.id))}><Icon.Close size={14} /><span>Remove</span></button>
            </div>
          </article>)}
        </div>
        {!desks.length && <p className="desk-empty">Arrange your cards, then save your first desk.</p>}
        <p className="desk-note">Layout previews, not manuscript screenshots. Saved in this browser for this project. Desk changes keep live drafts; reloading still requires saving unfinished tool edits.</p>
      </section>
    </div>, document.body)}
  </>;
}
