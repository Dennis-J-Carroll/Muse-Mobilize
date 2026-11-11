import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import { useStore } from '../store';
import type { FloatingPanel } from '../types';
import type { WorkspaceViewport } from '../workspaceLayout';
import { PLACEMENT_LABELS, type CardPlacement } from '../cardPlacement';
import * as Icon from './icons';

type Choice = CardPlacement | 'side-by-side';

const GROUPS: { label: string; items: { choice: Choice; Glyph: ComponentType }[] }[] = [
  { label: 'Move', items: [
    { choice: 'left', Glyph: Icon.PlaceLeft },
    { choice: 'right', Glyph: Icon.PlaceRight },
    { choice: 'top', Glyph: Icon.PlaceTop },
    { choice: 'bottom', Glyph: Icon.PlaceBottom },
  ] },
  { label: 'Fill and arrange', items: [
    { choice: 'fill', Glyph: Icon.PlaceFill },
    { choice: 'side-by-side', Glyph: Icon.PlaceSideBySide },
  ] },
];
const ORDER = GROUPS.flatMap(group => group.items.map(item => item.choice));
const labelFor = (choice: Choice) => choice === 'side-by-side' ? 'Side by side' : PLACEMENT_LABELS[choice];

/** Snap a floating card to a half or the whole desk, or arrange every open card side by side. */
export function CardPlacementMenu({ panel, viewport }: { panel: FloatingPanel; viewport: WorkspaceViewport }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef(new Map<Choice, HTMLButtonElement>());
  const current = panel.placement;

  const close = (restoreFocus: boolean) => {
    if (restoreFocus) trigger.current?.focus();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    items.current.get(current ?? ORDER[0])?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
    // Focus the checked item only when the menu opens, not when the placement changes.
  }, [open]);

  const choose = (choice: Choice) => {
    const store = useStore.getState();
    if (choice === 'side-by-side') store.arrangeFloatingPanels(viewport);
    else store.placeFloatingPanel(panel.id, choice, viewport);
    close(true);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      // Close only the menu; the card's own Escape handler would dock it.
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') { setOpen(false); return; }
    const at = ORDER.indexOf((event.target as HTMLElement).dataset.choice as Choice);
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (at + 1) % ORDER.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (at - 1 + ORDER.length) % ORDER.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? ORDER.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    items.current.get(ORDER[next])?.focus();
  };

  return <div ref={root} className="card-placement">
    <button ref={trigger} type="button" className="floating-drawer-dock card-placement-trigger"
      aria-label={`Arrange ${panel.title}`} title="Arrange card" aria-haspopup="menu" aria-expanded={open}
      onClick={() => setOpen(value => !value)}><Icon.TileGrid /></button>
    {open && <div className="card-placement-menu" role="menu" aria-label="Card placement" onKeyDown={onMenuKeyDown}>
      {GROUPS.map(group => <div key={group.label} className="card-placement-group" role="group" aria-label={group.label}>
        {group.items.map(({ choice, Glyph }) => {
          const checked = current === choice;
          return <button key={choice} type="button" role="menuitemradio" aria-checked={checked}
            aria-label={labelFor(choice)} title={labelFor(choice)} data-choice={choice}
            tabIndex={checked || (!current && choice === ORDER[0]) ? 0 : -1}
            ref={element => { if (element) items.current.set(choice, element); else items.current.delete(choice); }}
            onClick={() => choose(choice)}><Glyph /></button>;
        })}
      </div>)}
    </div>}
  </div>;
}
