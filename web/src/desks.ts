import type { Pane } from './types';
import type { TileLayout, WindowBounds } from './workspaceLayout';
import { WRITING_FONTS, type WritingFont } from './writingView';

export type DeskPane = Omit<Pane, 'id'>;
export interface DeskView {
  layout: TileLayout;
  workbench: boolean;
  sidebarCollapsed: boolean;
  rightWidth: number;
  bottomHeight: number;
  drawerMode: 'tabs' | 'stack';
  font: WritingFont;
  surface: 'glass' | 'paper';
  weight: '350' | '400';
}
export interface SavedDesk {
  version: 1;
  id: string;
  name: string;
  panes: DeskPane[];
  view: DeskView;
  preview: (WindowBounds & { title: string; document: boolean })[];
}

/** Reuse mounted identities. Unlisted live tools are parked, never discarded. */
export function reconcileDeskPanes(current: Pane[], saved: DeskPane[], nextId: () => string): Pane[] {
  const used = new Set<string>();
  const restored = saved.map((layout) => {
    const match = current.find((pane) => !used.has(pane.id) && pane.type === layout.type && pane.binding?.type === layout.binding?.type && pane.binding?.id === layout.binding?.id);
    if (match) used.add(match.id);
    return { ...layout, id: match?.id ?? nextId() };
  });
  return [...restored, ...current.filter((pane) => !used.has(pane.id)).map((pane) => ({ ...pane, sizeMode: 'minimized' as const }))];
}

const types = new Set(['editor', 'agent', 'notes', 'events', 'review', 'outline', 'canon', 'characters', 'world', 'plot', 'scenes', 'dialogue', 'themes', 'references', 'goals', 'progress', 'sources']);
const object = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown, max = 200): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100_000;
const size = (value: unknown) => object(value) && number(value.width) && value.width > 0 && number(value.height) && value.height > 0;
const bounds = (value: unknown) => object(value) && size(value) && number(value.x) && number(value.y);
const validPane = (pane: unknown) => object(pane) && types.has(pane.type) && text(pane.title, 1000)
  && ['main', 'right', 'bottom'].includes(pane.region) && ['normal', 'minimized', 'maximized'].includes(pane.sizeMode)
  && (!pane.binding || (object(pane.binding) && ['document', 'agent'].includes(pane.binding.type) && text(pane.binding.id)))
  && (!pane.size || size(pane.size)) && (!pane.floating || (bounds(pane.floating) && number(pane.floating.layer)));

/** Browser storage is untrusted and may contain obsolete or damaged records. */
export function parseDesks(raw: string | null): SavedDesk[] {
  try {
    if (!raw || raw.length > 2_000_000) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.slice(0, 12).filter((desk): desk is SavedDesk => {
      if (!object(desk) || desk.version !== 1 || !text(desk.id) || !text(desk.name, 60)) return false;
      if (!Array.isArray(desk.panes) || desk.panes.length > 64 || !desk.panes.every(validPane)) return false;
      if (desk.panes.filter((pane: DeskPane) => pane.sizeMode === 'maximized').length > 1) return false;
      const view = desk.view;
      if (!object(view) || !['workspace', 'columns', 'rows', 'grid'].includes(view.layout) || typeof view.workbench !== 'boolean' || typeof view.sidebarCollapsed !== 'boolean') return false;
      if (!number(view.rightWidth) || !number(view.bottomHeight) || !['tabs', 'stack'].includes(view.drawerMode)) return false;
      if (!WRITING_FONTS.some((font) => font.id === view.font) || !['glass', 'paper'].includes(view.surface) || !['350', '400'].includes(view.weight)) return false;
      return Array.isArray(desk.preview) && desk.preview.length <= 64 && desk.preview.every((frame: unknown) => object(frame) && bounds(frame) && text(frame.title, 1000) && typeof frame.document === 'boolean');
    });
  } catch { return []; }
}
