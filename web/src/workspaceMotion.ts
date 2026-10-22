import { useCallback, useEffect, useRef } from 'react';
import { useStore } from './store';

type Point = { x: number; y: number };
type PanePlace = { title: string; point: Point | null; parked: boolean };
export type WorkspaceTransition = (change: () => void, message: string) => void;

function point(element: Element | null): Point | null {
  if (!element?.getClientRects().length) return null;
  const box = element.getBoundingClientRect();
  if (box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth) return null;
  return { x: box.left + 12, y: box.top + 6 };
}
function places() {
  return new Map(Array.from(document.querySelectorAll<HTMLElement>('.pane[id^="workspace-"]')).map(element => [element.id, {
    title: element.querySelector('.pane-title span:last-child')?.textContent ?? '',
    point: point(element.querySelector('.pane-head')),
    parked: element.classList.contains('is-min'),
  } satisfies PanePlace]));
}

/** Move small title cues, never manuscript pixels or cloned interactive content.
 * Layout commits immediately; animation cannot delay editing or replace a host. */
export function useWorkspaceMotion(projectId: string | undefined, workspaceId: string | null) {
  const frame = useRef(0);
  const active = useRef(new Set<() => void>());
  const cancel = useCallback(() => {
    cancelAnimationFrame(frame.current);
    for (const stop of active.current) stop();
    active.current.clear();
  }, []);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => { if (preference.matches) cancel(); };
    preference.addEventListener('change', reduce);
    window.addEventListener('resize', cancel);
    window.addEventListener('pointerdown', cancel, true);
    window.addEventListener('keydown', cancel, true);
    return () => {
      cancel();
      preference.removeEventListener('change', reduce);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('pointerdown', cancel, true);
      window.removeEventListener('keydown', cancel, true);
    };
  }, [cancel, projectId, workspaceId]);

  return useCallback<WorkspaceTransition>((change, message) => {
    cancel();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const before = reduce ? new Map<string, PanePlace>() : places();
    const oldTools = point(document.querySelector('.tool-drawer-trigger'));
    change();
    useStore.getState().setNotice(message);
    if (reduce || !Element.prototype.animate) return;
    // Focus-aware desks finish their own layout in the first animation frame.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        const after = places();
        const tools = point(document.querySelector('.tool-drawer-trigger'));
        let count = 0;
        for (const [id, next] of after) {
          const previous = before.get(id);
          if (!previous || count >= 3) continue;
          const from = previous.point ?? (previous.parked ? oldTools : null);
          const to = next.parked ? tools : next.point;
          if (!from || !to || (Math.abs(from.x - to.x) < 12 && Math.abs(from.y - to.y) < 12)) continue;
          const cue = document.createElement('div');
          cue.className = 'workspace-motion-cue';
          cue.setAttribute('aria-hidden', 'true');
          cue.textContent = next.title;
          document.body.append(cue);
          const clamp = (position: Point) => ({
            x: Math.max(8, Math.min(position.x, innerWidth - cue.offsetWidth - 8)),
            y: Math.max(8, Math.min(position.y, innerHeight - cue.offsetHeight - 8)),
          });
          const start = clamp(from); const end = clamp(to);
          const animation = cue.animate([
            { transform: `translate(${start.x}px, ${start.y}px)`, opacity: .85 },
            { transform: `translate(${end.x}px, ${end.y}px)`, opacity: 0 },
          ], { duration: 240, easing: 'cubic-bezier(.16, 1, .3, 1)' });
          const stop = () => { animation.cancel(); cue.remove(); active.current.delete(stop); };
          active.current.add(stop);
          animation.onfinish = stop;
          count++;
        }
      });
    });
  }, [cancel]);
}
