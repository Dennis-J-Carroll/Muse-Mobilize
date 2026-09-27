import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDeskList } from '../deskList';
import type { SavedDesk } from '../desks';
import { trapLayerTab } from '../focusLayers';
import { useWritingView } from '../writingView';

/** Find any saved desk by name; arrows move, Enter restores, Escape closes. */
export function DeskSwitcher({ onRestore }: { onRestore: (desk: SavedDesk) => void }) {
  const desks = useDeskList((s) => s.desks);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const returnTo = useRef<Element | null>(document.activeElement);
  useEffect(() => { input.current?.focus(); }, []);
  const visible = desks.filter((desk) => desk.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const close = () => {
    useWritingView.getState().setDeskSwitcherOpen(false);
    requestAnimationFrame(() => (returnTo.current as HTMLElement | null)?.focus?.({ preventScroll: true }));
  };
  const choose = (desk: SavedDesk | undefined) => { if (!desk) return; useWritingView.getState().setDeskSwitcherOpen(false); onRestore(desk); };
  return createPortal(<div className="focus-cards-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="focus-cards desk-switcher" role="dialog" aria-modal="true" aria-label="Find a desk" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, visible.length - 1)); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return; }
      if (event.key === 'Enter') { event.preventDefault(); choose(visible[active]); return; }
      trapLayerTab(event);
    }}>
      <header><div><h2>Find a desk</h2><p>Type to filter. Enter opens the highlighted desk.</p></div>
        <button type="button" aria-label="Close desk finder" onClick={close}>×</button></header>
      <input ref={input} type="search" aria-label="Filter desks" placeholder="Desk name…" value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} />
      <div className="focus-card-results" role="listbox" aria-label="Desks">
        {visible.map((desk, index) => <button key={desk.id} type="button" role="option" aria-selected={index === active}
          className={index === active ? 'is-active' : ''} onClick={() => choose(desk)}>
          <span>{desk.name}</span><small>{desks.indexOf(desk) < 9 ? `Alt Shift ${desks.indexOf(desk) + 1}` : ''}</small></button>)}
        {!visible.length && <p className="desk-empty">{desks.length ? 'No desk matches that name.' : 'No saved desks yet. Save one from Desks.'}</p>}
      </div>
    </section>
  </div>, document.body);
}
