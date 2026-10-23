import { UndoControls } from './UndoControls';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { TileLayout } from '../workspaceLayout';
import * as Icon from './icons';
import { SavedDesks } from './SavedDesks';
import type { SavedDesk } from '../desks';
import { openConnections } from '../connectionsView';
import { ProjectBackups } from './ProjectBackups';
import { useShortcutKeys } from '../useShortcutKeys';
import { useWritingView } from '../writingView';
import { useEditHistory } from '../editHistory';
import { restorePrevious, restoreWithMemory, useDeskList } from '../deskList';
import { DeskSwitcher } from './DeskSwitcher';
import { openLegendFromKeyboard, ShortcutLegend } from './ShortcutLegend';
import { openConversation, useConversationView } from '../conversationView';

const TILE_ICONS: Record<TileLayout, React.ReactNode> = {
  workspace: <Icon.Layers size={16} />, columns: <Icon.TileColumns />, rows: <Icon.TileRows />, grid: <Icon.TileGrid />,
};

export function WorkspaceToolbar({ layout, onLayout, workbench, onWorkbench, captureDesk, restoreDesk }: { layout: TileLayout; onLayout: (layout: TileLayout) => void; workbench: boolean; onWorkbench: () => void; captureDesk: (name: string) => SavedDesk; restoreDesk: (desk: SavedDesk) => void }) {
  const documents = useStore((s) => s.project?.documents ?? []);
  const hasMuse = useStore(s => s.agents.some(agent => agent.id === 'muse'));
  const conversation = useConversationView(s => s.current);
  const museOpen = useStore(s => Boolean(conversation && s.project?.id === conversation.projectId && s.panes.some(pane => pane.id === conversation.paneId && pane.binding?.id === 'muse')));
  const [open, setOpen] = useState(false);
  const projectId = useStore((s) => s.project?.id ?? null);
  useEffect(() => { useDeskList.getState().load(projectId); }, [projectId]);
  const switcherOpen = useWritingView((s) => s.deskSwitcherOpen);
  const busy = () => { const history = useEditHistory.getState(); return history.restoring || history.pending > 0; };
  useShortcutKeys({
    conversation: () => openConversation(),
    desk: (index) => {
      const desk = useDeskList.getState().desks[index];
      if (!desk || busy()) return false;
      restoreWithMemory(captureDesk, restoreDesk, desk);
    },
    deskPrevious: () => {
      if (!useDeskList.getState().previous || busy()) return false;
      restorePrevious(captureDesk, restoreDesk);
    },
    deskSwitcher: () => useWritingView.getState().setDeskSwitcherOpen(true),
    legend: openLegendFromKeyboard,
  });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div id="workspace-arrangement" className="workspace-toolbar" aria-label="Workspace arrangement">
    <div className="workspace-tool-group" role="group" aria-label="Documents and desk">
      {hasMuse && <button type="button" className="quick-muse-trigger" aria-label="Open Muse conversation"
        aria-expanded={museOpen} aria-controls="quick-conversation" aria-keyshortcuts="Alt+Shift+M" title="Talk with Muse (Alt+Shift+M)"
        onClick={() => openConversation()}><Icon.Feather size={16} /> Muse</button>}
      {/* One control: the icon mirrors the chosen arrangement, the select changes it. */}
      <label className="tile-picker" title="Arrange documents">{TILE_ICONS[layout]}
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
    </div>
    {switcherOpen && <DeskSwitcher onRestore={(desk) => { if (!busy()) restoreWithMemory(captureDesk, restoreDesk, desk); }} />}
    <ShortcutLegend />
    <div className="workspace-project-group" role="group" aria-label="Project actions">
      <UndoControls />
      <button type="button" className="connections-trigger" aria-label="Open connections" onClick={() => openConnections()}>Connections</button>
      <ProjectBackups />
    </div>
  </div>;
}
