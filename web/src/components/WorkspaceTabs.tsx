import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useStore } from '../store';
import * as Icon from './icons';

/** Seeded modes get their own glyph and hue; any custom workspace falls back to Layers. */
const TABS: Record<string, { icon: ReactNode; color: string }> = {
  drafting: { icon: <Icon.Feather size={16} />, color: 'var(--card-deep)' },
  planning: { icon: <Icon.Chart size={16} />, color: 'var(--ok)' },
  review: { icon: <Icon.Eye size={16} />, color: 'var(--warn)' },
};
const FALLBACK = { icon: <Icon.Layers size={16} />, color: 'var(--accent)' };

/**
 * Drafting / Planning / Review as an animated tab bar (after CodePen VwKzaEm,
 * re-skinned to etched glass): the active mode's icon lifts on a colored disc
 * and a wave-topped notch in the bar slides beneath it.
 */
export function WorkspaceTabs() {
  const workspaces = useStore((s) => s.workspaces);
  const active = useStore((s) => s.activeWorkspace);
  const bar = useRef<HTMLDivElement>(null);
  const notch = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = bar.current;
    if (!root) return;
    const place = (instant: boolean) => {
      const wave = notch.current;
      const disc = root.querySelector<HTMLElement>('.ws-tab[aria-pressed="true"] .ws-tab-icon');
      if (!wave) return;
      wave.hidden = !disc;
      if (!disc) return;
      const centered = disc.getBoundingClientRect().left - root.getBoundingClientRect().left + disc.offsetWidth / 2 - wave.offsetWidth / 2;
      // Keep the wave on the flat part of the pill's top edge; past the rounded
      // ends its tail would stick out as a ridge.
      const radius = root.offsetHeight / 2;
      const left = Math.min(Math.max(centered, radius), root.offsetWidth - radius - wave.offsetWidth);
      // Resizes jump straight to the new spot; mode changes glide.
      if (instant) root.style.setProperty('--ws-tab-glide', 'none');
      wave.style.transform = `translate3d(${Math.round(left)}px, 0, 0)`;
      if (instant) requestAnimationFrame(() => root.style.removeProperty('--ws-tab-glide'));
    };
    place(false);
    const observer = new ResizeObserver(() => place(true));
    observer.observe(root);
    return () => observer.disconnect();
  }, [active, workspaces]);

  return (
    <div ref={bar} className="ws-tabs" role="group" aria-label="Workspace mode">
      {workspaces.map((w) => {
        const tab = TABS[w.id] ?? FALLBACK;
        const on = active === w.id;
        return (
          <button key={w.id} type="button" className={`ws-tab ${on ? 'is-on' : ''}`} aria-pressed={on}
            style={{ '--ws-tab-color': tab.color } as CSSProperties}
            onClick={() => void useStore.getState().applyWorkspace(w.id)}>
            <span className="ws-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="ws-tab-label">{w.name}</span>
          </button>
        );
      })}
      <span ref={notch} className="ws-tabs-notch" aria-hidden="true" />
      <svg className="ws-tabs-clip" aria-hidden="true" focusable="false">
        <clipPath id="ws-tabs-notch-shape" clipPathUnits="objectBoundingBox" transform="scale(0.0049285362247413 0.021978021978022)">
          <path d="M6.7,45.5c5.7,0.1,14.1-0.4,23.3-4c5.7-2.3,9.9-5,18.1-10.5c10.7-7.1,11.8-9.2,20.6-14.3c5-2.9,9.2-5.2,15.2-7c7.1-2.1,13.3-2.3,17.6-2.1c4.2-0.2,10.5,0.1,17.6,2.1c6.1,1.8,10.2,4.1,15.2,7c8.8,5,9.9,7.1,20.6,14.3c8.3,5.5,12.4,8.2,18.1,10.5c9.2,3.6,17.6,4.2,23.3,4H6.7z" />
        </clipPath>
      </svg>
    </div>
  );
}
