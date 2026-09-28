import { useEffect } from 'react';
import { useStore } from '../store';
import type { ConstraintSlot } from '../types';
import { rollAll, SLOT_LABELS } from '../constraints';

/** The pinned constraint set, as one slim row of tickable chips above the manuscript. */
export function PinnedConstraints() {
  const constraints = useStore((s) => s.constraints);
  const projectId = useStore((s) => s.project?.id);
  useEffect(() => { if (projectId && !useStore.getState().constraints) void useStore.getState().loadConstraints(); }, [projectId]);
  const pinned = constraints?.pinned;
  if (!pinned) return null;

  const update = useStore.getState().updateConstraints;
  const toggle = (slot: ConstraintSlot) => void update((current) => current.pinned ? {
    ...current, pinned: { ...current.pinned, items: current.pinned.items.map((item) => item.slot === slot ? { ...item, done: !item.done } : item) },
  } : current);
  /** Ticked constraints stay; the rest are rerolled. */
  const reroll = async () => {
    const entities = await useStore.getState().canonForRolling();
    void update((current) => {
      if (!current.pinned) return current;
      const kept = new Set(current.pinned.items.filter((item) => item.done).map((item) => item.slot));
      return { ...current, pinned: { ...current.pinned, items: rollAll(entities, current.pinned.items, kept) } };
    });
  };

  return <div className="pinned-constraints" role="group" aria-label="Pinned constraints">
    <ul>
      {pinned.items.map((item) => <li key={item.slot} className={item.done ? 'is-done' : ''}>
        <label title={SLOT_LABELS[item.slot]}>
          <input type="checkbox" checked={item.done} onChange={() => toggle(item.slot)} />
          <span>{item.text}</span>
        </label>
      </li>)}
    </ul>
    <button type="button" aria-label="Reroll unticked constraints" title="Reroll the ones not ticked"
      onPointerDown={(event) => event.preventDefault()} onClick={() => void reroll()}>↻</button>
    <button type="button" aria-label="Unpin constraints" title="Unpin (Undo brings it back)"
      onPointerDown={(event) => event.preventDefault()} onClick={() => void update((current) => ({ ...current, pinned: null }))}>×</button>
  </div>;
}
