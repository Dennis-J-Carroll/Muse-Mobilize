import { create } from 'zustand';

type Surface = 'glass' | 'paper';
type Weight = '350' | '400';
export type FocusLayer = { kind: 'cards' } | { kind: 'editor'; id: string } | { kind: 'connections' };
export const WRITING_FONTS = [
  { id: 'inter', label: 'Inter', family: '"Inter Variable", sans-serif', variable: true },
  { id: 'times', label: 'Times New Roman', family: '"Times New Roman", "Liberation Serif", "Tinos", serif', variable: false },
  { id: 'antic', label: 'Antic', family: '"Antic", sans-serif', variable: false },
  { id: 'antic-didone', label: 'Antic Didone', family: '"Antic Didone", serif', variable: false },
  { id: 'italiana', label: 'Italiana', family: '"Italiana", serif', variable: false },
  { id: 'josefin-sans', label: 'Josefin Sans', family: '"Josefin Sans Variable", sans-serif', variable: true },
  { id: 'josefin-slab', label: 'Josefin Slab', family: '"Josefin Slab Variable", serif', variable: true },
] as const;
export type WritingFont = typeof WRITING_FONTS[number]['id'];
const readPreference = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const savePreference = (key: string, value: string) => {
  // Browser privacy/storage limits should not prevent changing the current view.
  try { localStorage.setItem(key, value); } catch { /* Keep session preference. */ }
};

export type Measure = number | 'full' | null;
export const WIDTH_PRESETS = [
  { value: 60, label: 'Narrow' }, { value: 68, label: 'Book' }, { value: 72, label: 'Standard' },
  { value: 90, label: 'Wide' },
] as const;
export const MEASURE_MIN = 45;
export const MEASURE_MAX = 120;
/** Browser storage is untrusted: anything unexpected falls back to today's default width. */
export function parseMeasure(raw: string | null): Measure {
  if (raw === 'full') return 'full';
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= MEASURE_MIN && value <= MEASURE_MAX ? value : null;
}
/** Full is 100%, never 0: a zero measure would give each side 50% padding. */
export const measureCss = (measure: Measure) => measure === null ? undefined : measure === 'full' ? '100%' : `${measure}ch`;

/** Presentation state only; entering focus never changes the workspace layout. */
export const useWritingView = create<{
  focusPaneId: string | null;
  focus: (paneId: string | null) => void;
  focusLayer: FocusLayer | null;
  setFocusLayer: (layer: FocusLayer | null) => void;
  controlsHidden: boolean;
  setControlsHidden: (hidden: boolean) => void;
  workbench: boolean;
  setWorkbench: (workbench: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  surface: Surface;
  weight: Weight;
  font: WritingFont;
  setFont: (font: WritingFont) => void;
  setSurface: (surface: Surface) => void;
  setWeight: (weight: Weight) => void;
  measure: Measure;
  setMeasure: (measure: Measure) => void;
}>((set) => ({
  focusPaneId: null,
  focusLayer: null,
  setFocusLayer: (focusLayer) => set((state) => ({ focusLayer: state.focusPaneId ? focusLayer : null })),
  controlsHidden: readPreference('muse:writing-controls-hidden') === 'true',
  setControlsHidden: (controlsHidden) => { savePreference('muse:writing-controls-hidden', String(controlsHidden)); set({ controlsHidden }); },
  workbench: false,
  setWorkbench: (workbench) => set({ workbench }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  focus: (focusPaneId) => set({ focusPaneId, focusLayer: null }),
  surface: readPreference('muse:writing-surface') === 'paper' ? 'paper' : 'glass',
  weight: readPreference('muse:writing-weight') === '350' ? '350' : '400',
  font: WRITING_FONTS.find((font) => font.id === readPreference('muse:writing-font'))?.id ?? 'inter',
  setFont: (font) => { savePreference('muse:writing-font', font); set({ font }); },
  setSurface: (surface) => { savePreference('muse:writing-surface', surface); set({ surface }); },
  setWeight: (weight) => { savePreference('muse:writing-weight', weight); set({ weight }); },
  measure: parseMeasure(readPreference('muse:writing-measure')),
  setMeasure: (measure) => {
    if (measure === null) { try { localStorage.removeItem('muse:writing-measure'); } catch { /* Keep session preference. */ } }
    else savePreference('muse:writing-measure', String(measure));
    set({ measure });
  },
}));
