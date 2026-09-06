import type { Pane } from './types';

export type TileLayout = 'workspace' | 'columns' | 'rows' | 'grid';

/** Decide which pages stay on the desk when Workbench parks companion tools. */
export function isWorkbenchDocument(pane: Pane): boolean {
  // Keep open documents on the desk by default. Writers can park individual
  // pages and save that personal arrangement as a visual Desk preset.
  return pane.binding?.type === 'document';
}

export interface WindowBounds { x: number; y: number; width: number; height: number }
export interface WorkspaceViewport { width: number; height: number; gutter?: number }
export const recallGutter = (workbench: boolean, width: number) => workbench && width > 700 ? 152 : 48;

/** Reserve a recall gutter and keep every window's controls on screen. */
export function fitWindow(bounds: WindowBounds, viewport: WorkspaceViewport): WindowBounds {
  const gutter = viewport.gutter ?? 48;
  const width = Math.min(Math.max(320, bounds.width), Math.max(120, viewport.width - gutter - 16));
  const height = Math.min(Math.max(200, bounds.height), Math.max(120, viewport.height - 24));
  return {
    width, height,
    x: Math.max(8, Math.min(bounds.x, viewport.width - width - gutter)),
    y: Math.max(8, Math.min(bounds.y, viewport.height - height - 8)),
  };
}
