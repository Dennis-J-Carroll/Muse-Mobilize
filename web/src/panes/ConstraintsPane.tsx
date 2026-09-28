import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { ConstraintItem, ConstraintSlot, Pane } from '../types';
import { rollAll, rollSlot, SLOT_LABELS } from '../constraints';

/** Constraint Generator: roll five constraints (three from canon, two from the craft deck), lock, reroll, pin over the draft. */
export function ConstraintsPane({ pane }: { pane: Pane }) {
  const store = useStore((s) => s.constraints);
  const [items, setItems] = useState<ConstraintItem[] | null>(null);
  const [locked, setLocked] = useState<Set<ConstraintSlot>>(new Set());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const s = useStore.getState();
      if (!s.constraints) await s.loadConstraints();
      const loaded = useStore.getState().constraints;
      if (!live) return;
      if (!loaded) { setFailed(true); return; }
      if (loaded.pinned) setItems(loaded.pinned.items);
      else { const entities = await useStore.getState().canonForRolling(); if (live) setItems(rollAll(entities, null, new Set())); }
    })();
    return () => { live = false; };
  }, []);

  if (failed) {
    return <div className="pane-body pane-loading"><p>Constraints could not load. <button type="button" className="linkish" onClick={() => { setFailed(false); void useStore.getState().loadConstraints().then(() => setFailed(!useStore.getState().constraints)); }}>Retry</button></p></div>;
  }
  if (!items) return <div className="pane-body pane-loading">Rolling…</div>;

  const pinnedTexts = store?.pinned?.items.map((item) => item.text).join('\n');
  const isPinned = pinnedTexts === items.map((item) => item.text).join('\n');
  const rerollOne = async (slot: ConstraintSlot) => {
    const entities = await useStore.getState().canonForRolling();
    setItems((current) => current?.map((item) => item.slot === slot ? rollSlot(slot, entities, item.text) : item) ?? current);
  };
  const rerollAll = async () => {
    const entities = await useStore.getState().canonForRolling();
    setItems((current) => rollAll(entities, current, locked));
  };
  const toggleLock = (slot: ConstraintSlot) => setLocked((current) => {
    const next = new Set(current);
    if (next.has(slot)) next.delete(slot); else next.add(slot);
    return next;
  });

  return <div className="constraints-workspace">
    <header className="story-toolbar">
      <div><span>Story idea</span><h2>Constraints</h2></div>
      <p role="status">{isPinned ? 'Pinned over your draft' : 'Not pinned'}</p>
    </header>
    <div className="constraints-scroll">
      <ol className="constraints-list" aria-label="Rolled constraints">
        {items.map((item) => {
          const label = SLOT_LABELS[item.slot];
          const isLocked = locked.has(item.slot);
          return <li key={item.slot} className={`constraint-row ${isLocked ? 'is-locked' : ''} ${item.entityId ? 'from-canon' : ''}`}>
            <span className="constraint-label">{label}{item.entityId && <small>from your canon</small>}</span>
            <p>{item.text}</p>
            <div className="constraint-row-actions">
              <button type="button" aria-pressed={isLocked} aria-label={`Lock ${label}`} title={isLocked ? 'Locked: kept on Reroll all' : 'Lock this constraint'} onClick={() => toggleLock(item.slot)}>{isLocked ? '🔒' : '🔓'}</button>
              <button type="button" aria-label={`Reroll ${label}`} title="Reroll this one" disabled={isLocked} onClick={() => void rerollOne(item.slot)}>↻</button>
            </div>
          </li>;
        })}
      </ol>
      <div className="premise-actions">
        <button type="button" className="btn" onClick={() => void rerollAll()}>Reroll all</button>
        <button type="button" className="btn btn-primary" disabled={isPinned} onClick={async () => {
          // Pinning is for writing: dock the generator (recallable from Tools) so the draft and its banner come forward.
          if (await useStore.getState().pinConstraints(items)) useStore.getState().setPaneSize(pane.id, 'minimized');
        }}>Pin to draft</button>
      </div>
      <p className="premise-hint">Three constraints come from your canon (who, where, what) and two from the craft deck. Pinned constraints appear above every manuscript page, on every device.</p>
    </div>
  </div>;
}
