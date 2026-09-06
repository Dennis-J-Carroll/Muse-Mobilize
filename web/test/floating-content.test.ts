import assert from 'node:assert/strict';
import test from 'node:test';
import { useStore } from '../src/store.ts';

test('hard closing releases only the targeted editor content and hotkey slot', () => {
  useStore.setState({ floatingPanels: [], floatingEditorContents: { a: 'Draft A', b: 'Draft B' } });
  useStore.getState().openFloatingPanel({ id: 'a', paneType: 'scenes', title: 'A' });
  useStore.getState().openFloatingPanel({ id: 'b', paneType: 'scenes', title: 'B' });
  useStore.getState().dockFloatingPanel('a');
  assert.equal(useStore.getState().floatingEditorContents.a, 'Draft A');
  useStore.getState().closeFloatingPanel('a');
  assert.deepEqual(useStore.getState().floatingEditorContents, { b: 'Draft B' });
  assert.equal(useStore.getState().floatingPanels[0].id, 'b');
});
