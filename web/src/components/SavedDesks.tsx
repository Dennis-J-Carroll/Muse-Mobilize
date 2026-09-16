import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { parseDesks, type SavedDesk } from '../desks';
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
  const key = `muse:desks:v1:${projectId}`;
  const [desks, setDesks] = useState<SavedDesk[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try { setDesks(parseDesks(localStorage.getItem(key))); } catch { setDesks([]); }
    setOpen(false); setError(''); setName('');
  }, [key]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  const persist = (next: SavedDesk[]) => {
    try { localStorage.setItem(key, JSON.stringify(next)); setDesks(next); setError(''); return true; }
    catch { setError('Browser storage is unavailable or full. Changes were not saved; existing desks are unchanged.'); return false; }
  };
  return <>
    <button ref={trigger} type="button" className="saved-desks-trigger" aria-label="Saved desks" aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon.Layers size={16} /> Desks</button>
    {open && createPortal(<div className="desk-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section ref={dialog} className="saved-desks" role="dialog" aria-modal="true" aria-labelledby="saved-desks-title" onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key !== 'Tab') return;
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? []);
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <header><div><h2 id="saved-desks-title">Your desks</h2><p>Click a desk to return to its arrangement.</p></div><button type="button" aria-label="Close saved desks" onClick={close}><Icon.Close /></button></header>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          if (desks.length >= 12) { setError('Twelve desks saved. Remove one before adding another.'); return; }
          if (persist([...desks, capture(name.trim())])) setName('');
        }}>
          <label>Desk name<input ref={input} aria-label="Desk name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="e.g. Atlas and chapter" required /></label>
          <button type="submit" disabled={!name.trim()}>Save desk</button>
        </form>
        {error && <p className="desk-error" role="alert">{error}</p>}
        <div className="desk-grid">
          {desks.map((desk) => <article key={desk.id} className="desk-card">
            <button type="button" className="desk-restore" aria-label={`Restore ${desk.name}`} onClick={() => { restore(desk); close(); }}><DeskPreview desk={desk} /><span>{desk.name}</span><small>{desk.view.workbench ? 'Workbench' : 'Workspace'} · {desk.view.layout} · {desk.panes.length} cards</small></button>
            <button type="button" className="desk-remove" aria-label={`Remove desk ${desk.name}`} title="Remove saved layout only" onClick={() => persist(desks.filter((item) => item.id !== desk.id))}><Icon.Close size={14} /></button>
          </article>)}
        </div>
        {!desks.length && <p className="desk-empty">Arrange your cards, then save your first desk.</p>}
        <p className="desk-note">Layout previews, not manuscript screenshots. Saved in this browser for this project. Desk changes keep live drafts; reloading still requires saving unfinished tool edits.</p>
      </section>
    </div>, document.body)}
  </>;
}
