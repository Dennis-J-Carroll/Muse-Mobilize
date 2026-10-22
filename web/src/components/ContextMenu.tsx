import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';

export interface ContextAction {
  label: string;
  run: () => void;
  separator?: boolean;
}
interface MenuState {
  owner: string;
  label: string;
  actions: ContextAction[];
  source: HTMLElement;
  returnFocus: HTMLElement;
  point?: { x: number; y: number };
}
const useMenu = create<{ current: MenuState | null }>(() => ({ current: null }));
const editable = (target: EventTarget | null) => target instanceof Element
  && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
const controls = 'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]';

function dismiss(restoreFocus = false) {
  const menu = useMenu.getState().current;
  useMenu.setState({ current: null });
  if (restoreFocus && menu?.returnFocus.isConnected && menu.returnFocus.getClientRects().length) {
    menu.returnFocus.focus({ preventScroll: true });
  }
}

/** One menu across the workspace; each owner dismisses its menu on unmount. */
export function useContextMenu() {
  const owner = useId();
  const current = useMenu(state => state.current?.owner === owner ? state.current : null);
  useEffect(() => () => {
    if (useMenu.getState().current?.owner === owner) dismiss();
  }, [owner]);

  const show = (source: HTMLElement, label: string, actions: ContextAction[], point?: MenuState['point']) => {
    const active = document.activeElement;
    const returnFocus = active instanceof HTMLElement && source.contains(active)
      ? active : source.matches(controls) ? source : source.querySelector<HTMLElement>(controls) ?? source;
    useMenu.setState({ current: { owner, label, actions, source, returnFocus, point } });
  };
  const bind = (label: string, actions: ContextAction[]) => ({
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (editable(event.target)) return;
      event.preventDefault(); event.stopPropagation();
      show(event.currentTarget, label, actions, event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : undefined);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (editable(event.target) || !(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return;
      event.preventDefault(); event.stopPropagation();
      show(event.currentTarget, label, actions);
    },
  });
  const trigger = (label: string, actions: ContextAction[]) => ({
    ...bind(label, actions),
    type: 'button' as const,
    'aria-label': `More actions for ${label}`,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': current?.owner === owner && current.label === label,
    'aria-controls': current?.owner === owner && current.label === label ? 'workspace-context-menu' : undefined,
    title: 'More actions (Shift+F10)',
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      // Keep selection intact and prevent blur from closing a menu before its toggle click.
      if (event.button === 0 && (editable(document.activeElement) || current?.source === event.currentTarget)) event.preventDefault();
    },
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      if (current?.source === event.currentTarget) dismiss(true);
      else show(event.currentTarget, label, actions);
    },
  });
  return { bind, trigger };
}

export function ContextMenu() {
  const current = useMenu(state => state.current);
  return current ? <Menu key={current.owner + current.label} menu={current} /> : null;
}

function Menu({ menu }: { menu: MenuState }) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = panel.current!;
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft ?? 0) + 8;
    const top = (viewport?.offsetTop ?? 0) + 8;
    const width = (viewport?.width ?? window.innerWidth) - 16;
    const height = (viewport?.height ?? window.innerHeight) - 16;
    element.style.maxWidth = `${width}px`;
    element.style.maxHeight = `${height}px`;
    const source = menu.source.getBoundingClientRect();
    element.style.left = `${Math.max(left, Math.min(menu.point?.x ?? source.left, left + width - element.offsetWidth))}px`;
    const below = menu.point?.y ?? source.bottom + 4;
    const y = !menu.point && below + element.offsetHeight > top + height ? source.top - element.offsetHeight - 4 : below;
    element.style.top = `${Math.max(top, Math.min(y, top + height - element.offsetHeight))}px`;
    element.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    const outside = (event: globalThis.PointerEvent) => {
      const onTrigger = menu.source.matches('[aria-haspopup="menu"]') && menu.source.contains(event.target as Node);
      if (!panel.current?.contains(event.target as Node) && !onTrigger) dismiss();
    };
    const scroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) dismiss(true);
    };
    const resize = () => dismiss(true);
    const focus = (event: FocusEvent) => {
      if (!panel.current?.contains(event.target as Node)) dismiss();
    };
    const observer = new MutationObserver(() => {
      if (!menu.source.isConnected || !menu.source.getClientRects().length) dismiss();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', focus);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', focus);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize);
    };
  }, [menu]);

  return createPortal(<div ref={panel} id="workspace-context-menu" className="context-menu" role="menu" aria-label={`${menu.label} actions`}
    onContextMenu={event => event.preventDefault()}
    onKeyDown={event => {
      event.stopPropagation();
      const items = Array.from(panel.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown' ? (index + 1) % items.length
        : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
      if (next !== null) { event.preventDefault(); items[next]?.focus(); }
      else if (event.key === 'Escape') { event.preventDefault(); dismiss(true); }
      else if (event.key === 'Tab') {
        event.preventDefault();
        const targets = Array.from(document.querySelectorAll<HTMLElement>(controls)).filter(target => target.tabIndex >= 0 && target.getClientRects().length && !target.closest('[inert]') && !panel.current!.contains(target));
        const origin = targets.indexOf(menu.returnFocus);
        const target = targets[origin + (event.shiftKey ? -1 : 1)];
        dismiss(true);
        target?.focus({ preventScroll: true });
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
        const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)];
        const match = ordered.find(item => item.textContent?.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
        if (match) { event.preventDefault(); match.focus({ preventScroll: true }); }
      }
    }}>
    <div className="context-menu-title" aria-hidden="true">{menu.label}</div>
    {menu.actions.map(action => <div role="none" key={action.label}>
      {action.separator && <div role="separator" className="context-menu-separator" />}
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => {
        // Restore the origin before the action opens another focus-owning surface.
        dismiss(true); action.run();
      }}>{action.label}</button>
    </div>)}
  </div>, document.body);
}
