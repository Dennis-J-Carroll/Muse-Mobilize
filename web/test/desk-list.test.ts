import assert from 'node:assert/strict';
import test from 'node:test';
import { moveDesk, useDeskList, restoreWithMemory, restorePrevious } from '../src/deskList.ts';
import type { SavedDesk } from '../src/desks.ts';

const desk = (id: string): SavedDesk => ({ version: 1, id, name: id, panes: [], preview: [],
  view: { layout: 'workspace', workbench: false, sidebarCollapsed: false, rightWidth: 380, bottomHeight: 220, drawerMode: 'tabs', font: 'inter', surface: 'glass', weight: '400' } });

test('moveDesk reorders by one and ignores moves past either end', () => {
  const list = [desk('a'), desk('b'), desk('c')];
  assert.deepEqual(moveDesk(list, 'c', -1).map((d) => d.id), ['a', 'c', 'b']);
  assert.deepEqual(moveDesk(list, 'a', 1).map((d) => d.id), ['b', 'a', 'c']);
  assert.deepEqual(moveDesk(list, 'a', -1).map((d) => d.id), ['a', 'b', 'c']);
  assert.deepEqual(moveDesk(list, 'c', 1).map((d) => d.id), ['a', 'b', 'c']);
  assert.deepEqual(moveDesk(list, 'missing', 1).map((d) => d.id), ['a', 'b', 'c']);
});

test('previous arrangement swaps on each restore and clears when the project changes', () => {
  const restored: string[] = [];
  let n = 0;
  const capture = () => desk(`here-${++n}`);
  const restore = (d: SavedDesk) => { restored.push(d.id); };
  useDeskList.setState({ projectId: 'p1', desks: [], error: '', previous: null });
  restoreWithMemory(capture, restore, desk('atlas'));
  assert.equal(useDeskList.getState().previous?.id, 'here-1');
  restorePrevious(capture, restore);
  assert.deepEqual(restored, ['atlas', 'here-1']);
  assert.equal(useDeskList.getState().previous?.id, 'here-2');
  useDeskList.setState({ projectId: 'p1' });
  useDeskList.getState().load('p2');
  assert.equal(useDeskList.getState().previous, null);
  restorePrevious(capture, restore);
  assert.deepEqual(restored, ['atlas', 'here-1']);
});
