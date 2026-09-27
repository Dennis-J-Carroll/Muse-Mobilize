import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SHORTCUTS, type ShortcutGroup } from '../shortcuts';
import { trapLayerTab } from '../focusLayers';
import { useWritingView } from '../writingView';
import * as Icon from './icons';

let returnFocus: HTMLElement | null = null;

export function LegendTrigger() {
  return <button type="button" className="legend-trigger" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (Alt+Shift+/)" aria-keyshortcuts="Alt+Shift+/"
    onPointerDown={(event) => { if (document.activeElement?.matches('textarea.draft')) event.preventDefault(); }}
    onClick={(event) => { returnFocus = event.currentTarget; useWritingView.getState().setLegendOpen(true); }}>
    <Icon.Compass size={17} />
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
