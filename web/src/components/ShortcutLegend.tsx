import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SHORTCUTS, type ShortcutGroup } from '../shortcuts';
import { trapLayerTab } from '../focusLayers';
import { useWritingView } from '../writingView';

let returnFocus: HTMLElement | null = null;

/** Keyboard glyph in the app's own tokens: accent stroke on the glass face. */
function KeyboardGlyph() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <rect x="3" y="6.5" width="18" height="11" rx="2.5" />
    <path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8" />
  </svg>;
}

export function LegendTrigger() {
  return <button type="button" className="legend-trigger" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (Alt+Shift+/)" aria-keyshortcuts="Alt+Shift+/"
    onPointerDown={(event) => { if (document.activeElement?.matches('textarea.draft')) event.preventDefault(); }}
    onClick={(event) => { returnFocus = event.currentTarget; useWritingView.getState().setLegendOpen(true); }}>
    <KeyboardGlyph />
  </button>;
}

export function openLegendFromKeyboard() {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useWritingView.getState().setLegendOpen(true);
}

const GROUPS: ShortcutGroup[] = ['Writing', 'Desks and cards'];

export function ShortcutLegend() {
  const open = useWritingView((s) => s.legendOpen);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { if (open) panel.current?.focus(); }, [open]);
  if (!open) return null;
  const close = () => { useWritingView.getState().setLegendOpen(false); requestAnimationFrame(() => returnFocus?.focus({ preventScroll: true })); };
  return createPortal(<div className="legend-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panel} tabIndex={-1} className="shortcut-legend" role="dialog" aria-modal="true" aria-labelledby="shortcut-legend-title" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      trapLayerTab(event);
    }}>
      <header><h2 id="shortcut-legend-title">Keyboard shortcuts</h2><span>Alt + ? to open · Esc to close</span>
        <button type="button" aria-label="Close keyboard shortcuts" onClick={close}>×</button></header>
      <p className="legend-touch-note">With a keyboard attached.</p>
      <div className="legend-groups">
        {GROUPS.map((group) => <div key={group}><h3>{group}</h3><dl>
          {SHORTCUTS.filter((item) => item.group === group).map((item) => <div key={item.id}><dt>{item.label}</dt><dd><kbd>{item.keys}</kbd></dd></div>)}
        </dl></div>)}
      </div>
    </section>
  </div>, document.body);
}
