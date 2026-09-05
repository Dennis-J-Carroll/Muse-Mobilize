// web/test/floating-panels.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { useStore } from '../src/store.ts';

const reset = () => useStore.setState({ floatingPanels: [] });

test('opening a new panel assigns the lowest free slot starting at 1', () => {
  reset();
  useStore.getState().openFloatingPanel({ id: 'characters:a', paneType: 'characters', title: 'A' });
  useStore.getState().openFloatingPanel({ id: 'characters:b', paneType: 'characters', title: 'B' });
  const [a, b] = useStore.getState().floatingPanels;
  assert.equal(a.slot, 1);
  assert.equal(b.slot, 2);
});

test('closing a panel frees its slot for reuse', () => {
  reset();
  useStore.getState().openFloatingPanel({ id: 'characters:a', paneType: 'characters', title: 'A' });
  useStore.getState().openFloatingPanel({ id: 'characters:b', paneType: 'characters', title: 'B' });
  useStore.getState().closeFloatingPanel('characters:a');
  useStore.getState().openFloatingPanel({ id: 'characters:c', paneType: 'characters', title: 'C' });
  const c = useStore.getState().floatingPanels.find((p) => p.id === 'characters:c');
  assert.equal(c?.slot, 1);
});

test('the tenth concurrently open panel gets no hotkey slot', () => {
  reset();
  for (let i = 0; i < 9; i++) {
    useStore.getState().openFloatingPanel({ id: `characters:${i}`, paneType: 'characters', title: String(i) });
  }
  useStore.getState().openFloatingPanel({ id: 'characters:tenth', paneType: 'characters', title: 'Tenth' });
  const tenth = useStore.getState().floatingPanels.find((p) => p.id === 'characters:tenth');
  assert.equal(tenth?.slot, null);
});

test('opening an id that is already open refocuses and undocks it instead of duplicating', () => {
  reset();
  useStore.getState().openFloatingPanel({ id: 'scenes:new', paneType: 'scenes', title: 'New scene' });
  useStore.getState().dockFloatingPanel('scenes:new');
  useStore.getState().openFloatingPanel({ id: 'scenes:new', paneType: 'scenes', title: 'New scene' });
  const panels = useStore.getState().floatingPanels;
  assert.equal(panels.length, 1);
  assert.equal(panels[0].docked, false);
});

test('dockFloatingPanel keeps the entry and its slot, only flips docked', () => {
  reset();
  useStore.getState().openFloatingPanel({ id: 'scenes:new', paneType: 'scenes', title: 'New scene' });
  const slot = useStore.getState().floatingPanels[0].slot;
  useStore.getState().dockFloatingPanel('scenes:new');
  const panel = useStore.getState().floatingPanels[0];
  assert.equal(panel.docked, true);
  assert.equal(panel.slot, slot);
});

test('undockFloatingPanel un-docks and moves the entry to the front of z-order', () => {
  reset();
  useStore.getState().openFloatingPanel({ id: 'scenes:a', paneType: 'scenes', title: 'A' });
  useStore.getState().openFloatingPanel({ id: 'scenes:b', paneType: 'scenes', title: 'B' });
  useStore.getState().dockFloatingPanel('scenes:a');
  useStore.getState().undockFloatingPanel('scenes:a');
  const panels = useStore.getState().floatingPanels;
  assert.equal(panels[panels.length - 1].id, 'scenes:a');
  assert.equal(panels.find((p) => p.id === 'scenes:a')?.docked, false);
});

test('moveFloatingPanel updates position for only the targeted panel', () => {
  reset();
  useStore.getState().openFloatingPanel({ id: 'scenes:a', paneType: 'scenes', title: 'A' });
  useStore.getState().openFloatingPanel({ id: 'scenes:b', paneType: 'scenes', title: 'B' });
  const bBefore = useStore.getState().floatingPanels.find((p) => p.id === 'scenes:b')!;
  useStore.getState().moveFloatingPanel('scenes:a', 200, 300);
  const a = useStore.getState().floatingPanels.find((p) => p.id === 'scenes:a')!;
  const bAfter = useStore.getState().floatingPanels.find((p) => p.id === 'scenes:b')!;
  assert.equal(a.x, 200);
  assert.equal(a.y, 300);
  assert.equal(bAfter.x, bBefore.x);
  assert.equal(bAfter.y, bBefore.y);
});

test('focusFloatingPanel moves the entry to the end without changing docked state', () => {
  reset();
  useStore.getState().openFloatingPanel({ id: 'scenes:a', paneType: 'scenes', title: 'A' });
  useStore.getState().openFloatingPanel({ id: 'scenes:b', paneType: 'scenes', title: 'B' });
  useStore.getState().focusFloatingPanel('scenes:a');
  const panels = useStore.getState().floatingPanels;
  assert.equal(panels[panels.length - 1].id, 'scenes:a');
  assert.equal(panels.find((p) => p.id === 'scenes:a')?.docked, false);
});

test('successive opens cascade position so panels do not perfectly overlap', () => {
  reset();
  useStore.getState().openFloatingPanel({ id: 'scenes:a', paneType: 'scenes', title: 'A' });
  useStore.getState().openFloatingPanel({ id: 'scenes:b', paneType: 'scenes', title: 'B' });
  const [a, b] = useStore.getState().floatingPanels;
  assert.notEqual(`${a.x},${a.y}`, `${b.x},${b.y}`);
});
