import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { TileLayout } from '../workspaceLayout';
import * as Icon from './icons';
import { SavedDesks } from './SavedDesks';
import type { SavedDesk } from '../desks';

export function WorkspaceToolbar({ layout, onLayout, workbench, onWorkbench, captureDesk, restoreDesk }: { layout: TileLayout; onLayout: (layout: TileLayout) => void; workbench: boolean; onWorkbench: () => void; captureDesk: (name: string) => SavedDesk; restoreDesk: (desk: SavedDesk) => void }) {
  const documents = useStore((s) => s.project?.documents ?? []);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className="workspace-toolbar" aria-label="Workspace arrangement">
    <label className="tile-picker"><Icon.Layers size={16} /><span>Tiles</span>
      <select aria-label="Document tiles" value={layout} onChange={(event) => onLayout(event.target.value as TileLayout)}>
        <option value="workspace">Workspace</option><option value="columns">Columns</option><option value="rows">Rows</option><option value="grid">Grid</option>
      </select>
    </label>
    <div ref={root} className="document-picker" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    }}>
      <button ref={trigger} type="button" aria-label="Open document" aria-expanded={open} aria-controls="document-picker-list" onClick={() => setOpen(!open)}><Icon.Book size={16} /> Documents</button>
      {open && <div id="document-picker-list" className="document-picker-list" role="group" aria-label="Project documents">
        {documents.map((doc) => <button type="button" key={doc.id} aria-label={`Open ${doc.title}`} onClick={() => {
          const s = useStore.getState();
          const existing = s.panes.find((pane) => pane.binding?.type === 'document' && pane.binding.id === doc.id);
          if (existing) s.setPaneSize(existing.id, 'normal');
          else s.openPane('editor', { bindingId: doc.id });
          setOpen(false);
          trigger.current?.focus();
        }}><span>{doc.title}</span><small>{doc.kind}</small></button>)}
      </div>}
    </div>
    <SavedDesks capture={captureDesk} restore={restoreDesk} />
    <button type="button" className="workbench-toggle" aria-pressed={workbench} onClick={onWorkbench}><Icon.Layers size={16} /> Workbench</button>
  </div>;
}
