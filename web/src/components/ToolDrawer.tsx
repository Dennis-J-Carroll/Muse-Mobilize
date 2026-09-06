import { createPortal } from 'react-dom';
import type { RefObject } from 'react';
import type { Pane } from '../types';

export type DrawerMode = 'tabs' | 'stack';

export function ToolDrawer({ panes, open, hidden, mode, selectedId, contentRef, triggerRef, onToggle, onClose, onMode, onSelect, workbench = false }: {
  panes: Pane[];
  open: boolean;
  hidden: boolean;
  mode: DrawerMode;
  workbench?: boolean;
  selectedId: string | undefined;
  contentRef: RefObject<HTMLDivElement>;
  triggerRef: RefObject<HTMLButtonElement>;
  onToggle: () => void;
  onClose: () => void;
  onMode: (mode: DrawerMode) => void;
  onSelect: (id: string) => void;
}) {
  return createPortal(<div className={`tool-drawer-host ${workbench ? 'is-workbench' : ''}`} hidden={hidden}>
    {panes.length > 0 && <button ref={triggerRef} type="button" className="tool-drawer-trigger"
      aria-label="Open tool drawer" aria-expanded={open} aria-controls="workspace-tool-drawer" onClick={onToggle}>
      Tools <span>{panes.length}</span>
    </button>}
    <section id="workspace-tool-drawer" className={`tool-drawer is-${mode}`} role="region" aria-label="Parked workspace tools" hidden={!open || !panes.length}>
      <header className="tool-drawer-head">
        <h2>Tool drawer</h2>
        <div role="group" aria-label="Drawer view">
          <button type="button" aria-pressed={mode === 'tabs'} onClick={() => onMode('tabs')}>Tabs</button>
          <button type="button" aria-pressed={mode === 'stack'} onClick={() => onMode('stack')}>Stack</button>
        </div>
        <button type="button" aria-label="Close tool drawer" title="Close tool drawer (Escape)" onClick={onClose}>×</button>
      </header>
      {mode === 'tabs' && <div className="tool-drawer-tabs" role="tablist" aria-label="Parked tools">
        {panes.map((pane, index) => <button key={pane.id} id={`tool-tab-${pane.id}`} type="button" role="tab"
          aria-selected={selectedId === pane.id} aria-controls={`tool-content-${pane.id}`}
          tabIndex={selectedId === pane.id ? 0 : -1}
          onClick={() => onSelect(pane.id)}
          onKeyDown={(event) => {
            const next = event.key === 'ArrowRight' ? (index + 1) % panes.length : event.key === 'ArrowLeft' ? (index + panes.length - 1) % panes.length : event.key === 'Home' ? 0 : event.key === 'End' ? panes.length - 1 : null;
            if (next === null) return;
            event.preventDefault();
            onSelect(panes[next].id);
            (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
          }}>{pane.title}</button>)}
      </div>}
      <div className="tool-drawer-content" ref={contentRef} />
    </section>
  </div>, document.body);
}
