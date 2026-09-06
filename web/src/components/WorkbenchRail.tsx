import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { PaneType } from '../types';
import * as Icon from './icons';

export type WorkbenchTool = { type: PaneType; label: string; title: string; bindingId?: string; paneId?: string; icon: typeof Icon.Book };
const TOOLS: WorkbenchTool[] = [
  { type: 'characters', label: 'Characters', title: 'Cast', icon: Icon.Users },
  { type: 'world', label: 'World Building', title: 'World Atlas', icon: Icon.Pin },
  { type: 'plot', label: 'Plot Outline', title: 'Plot Through-line', icon: Icon.Chart },
  { type: 'scenes', label: 'Scenes', title: 'Scene Board', icon: Icon.List },
  { type: 'dialogue', label: 'Dialogue', title: 'Dialogue Table', icon: Icon.Chat },
  { type: 'themes', label: 'Themes', title: 'Theme Threads', icon: Icon.Bulb },
  { type: 'references', label: 'References', title: 'Reference Board', icon: Icon.Bookmark },
  { type: 'goals', label: 'Goals', title: 'Writing Goals', icon: Icon.Target },
  { type: 'progress', label: 'Progress', title: 'Manuscript Progress', icon: Icon.Bars },
  { type: 'canon', label: 'Canon', title: 'Canon', icon: Icon.Book },
  { type: 'review', label: 'Review', title: 'Review', icon: Icon.List },
  { type: 'events', label: 'Activity', title: 'Activity', icon: Icon.Clock },
];

export function WorkbenchRail({ hidden, open, selectedId, onOpen }: { hidden: boolean; open: boolean; selectedId?: string; onOpen: (tool: WorkbenchTool) => void }) {
  const agents = useStore((s) => s.agents);
  const panes = useStore((s) => s.panes);
  const floatingPanels = useStore((s) => s.floatingPanels);
  const items: WorkbenchTool[] = [
    ...TOOLS,
    ...agents.map((agent) => ({ type: 'agent' as const, label: agent.name, title: agent.name, bindingId: agent.id, icon: Icon.Spark })),
    ...panes.filter((pane) => pane.binding?.type === 'document' && pane.sizeMode === 'minimized').map((pane) => ({ type: pane.type, label: pane.title, title: pane.title, paneId: pane.id, bindingId: pane.binding!.id, icon: Icon.Note })),
  ];
  return createPortal(<nav className={`workbench-rail ${floatingPanels.some((panel) => panel.docked) ? 'has-editors' : ''}`} aria-label="Workbench tools" hidden={hidden}>
    <span className="workbench-caption">Workbench</span>
    <div className="workbench-tabs">
      {items.map((item, index) => {
        const pane = panes.find((pane) => item.paneId ? pane.id === item.paneId : pane.type === item.type && pane.binding?.id === item.bindingId);
        const expanded = open && pane?.id === selectedId;
        return <button type="button" key={`${item.type}-${item.bindingId ?? ''}`} aria-label={`Open ${item.label} in workbench`} title={item.label}
          aria-expanded={expanded} aria-controls="workspace-tool-drawer" onClick={() => onOpen(item)}
          onKeyDown={(event) => {
            const next = event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? (index + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
            if (next !== null) { event.preventDefault(); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); }
          }}><item.icon size={16} /><span>{item.label}</span>{pane && <i aria-label="Open tool" />}</button>;
      })}
    </div>
  </nav>, document.body);
}
