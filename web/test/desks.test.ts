import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDesks, reconcileDeskPanes, writingReferenceDesk, type SavedDesk } from '../src/desks.ts';
import { fitWindow, recallGutter } from '../src/workspaceLayout.ts';
import type { Pane } from '../src/types.ts';

const page: Pane = { id: 'live-page', type: 'editor', title: 'Chapter', region: 'main', sizeMode: 'normal', binding: { type: 'document', id: 'chapter' } };
const muse: Pane = { id: 'live-muse', type: 'agent', title: 'Muse', region: 'right', sizeMode: 'normal', binding: { type: 'agent', id: 'muse' } };
const desk: SavedDesk = {
  version: 1, id: 'atlas', name: 'Atlas desk', panes: [page, muse], preview: [],
  view: { layout: 'columns', workbench: true, sidebarCollapsed: true, rightWidth: 400, bottomHeight: 210, drawerMode: 'tabs', font: 'inter', surface: 'paper', weight: '350' },
};

test('desk restoration reorders existing identities and parks unlisted live panes', () => {
  const extra: Pane = { id: 'extra', type: 'goals', title: 'Goals', region: 'main', sizeMode: 'maximized' };
  const restored = reconcileDeskPanes([page, muse, extra], [muse, { ...page, sizeMode: 'minimized' }], () => 'unused');
  assert.deepEqual(restored.map((pane) => pane.id), ['live-muse', 'live-page', 'extra']);
  assert.equal(restored[1].sizeMode, 'minimized');
  assert.equal(restored[2].sizeMode, 'minimized');
  assert.equal(extra.sizeMode, 'maximized');
});

test('missing saved views reopen once without duplicate identities on repeated restore', () => {
  let sequence = 0;
  const first = reconcileDeskPanes([page], [muse, page], () => `new-${++sequence}`);
  const again = reconcileDeskPanes(first, [muse, page], () => `new-${++sequence}`);
  assert.deepEqual(again, first);
  assert.equal(sequence, 1);
});

test('desk preference validation accepts supported snapshots and ignores damaged storage', () => {
  assert.deepEqual(parseDesks(JSON.stringify([desk])), [desk]);
  for (const raw of [null, '{', 'null', '{}', '42', JSON.stringify([{ ...desk, version: 99 }])]) assert.deepEqual(parseDesks(raw), []);
});

test('unsafe pane geometry, unknown bindings, and unsupported fonts cannot become live layouts', () => {
  for (const patch of [
    { panes: [{ ...page, type: 'unknown' }] },
    { panes: [{ ...page, binding: { type: 'remote', id: 'x' } }] },
    { panes: [{ ...page, floating: { x: 0, y: 0, width: -10, height: 500, layer: 1 } }] },
    { panes: [{ ...page, size: { width: 1e30, height: 500 } }] },
    { view: { ...desk.view, font: 'unknown' } },
    { preview: [{ x: null, y: 0, width: 300, height: 200, title: 'x', document: true }] },
  ]) assert.deepEqual(parseDesks(JSON.stringify([{ ...desk, ...patch }])), []);
});

test('restored floating windows fit phone and Workbench bounds without mutating saved geometry', () => {
  const saved = { x: 1300, y: 800, width: 700, height: 600 };
  for (const width of [320, 390, 1280]) {
    const viewport = { width, height: 844, gutter: recallGutter(true, width) };
    const fitted = fitWindow(saved, viewport);
    assert.ok(fitted.x >= 8 && fitted.y >= 8);
    assert.ok(fitted.x + fitted.width <= width - viewport.gutter);
    assert.ok(fitted.y + fitted.height <= 836);
  }
  assert.equal(saved.x, 1300);
});

test('focusDocumentId is optional: valid ids are kept, invalid ones are dropped, old desks still parse', () => {
  const withFocus = { ...desk, view: { ...desk.view, focusDocumentId: 'chapter' } };
  const bad = { ...desk, id: 'bad', view: { ...desk.view, focusDocumentId: 42 } };
  const [kept, stripped, old] = parseDesks(JSON.stringify([withFocus, bad, desk]));
  assert.equal(kept.view.focusDocumentId, 'chapter');
  assert.equal(stripped.id, 'bad');
  assert.equal('focusDocumentId' in stripped.view, false);
  assert.equal('focusDocumentId' in old.view, false);
});

test('writing desk parks other tools, preserves the original snapshot, and clears old geometry only for its pair', () => {
  const original: SavedDesk = { ...desk, panes: [
    { ...page, floating: { x: 100, y: 100, width: 800, height: 400, layer: 2 } },
    muse,
    { type: 'notes', title: 'Notes', region: 'bottom', sizeMode: 'normal', size: { width: 500, height: 300 } },
  ], view: { ...desk.view, writingToolsCollapsed: false, focusDocumentId: 'chapter' } };
  const before = structuredClone(original);
  const next = writingReferenceDesk(original, 'chapter', 1, 1280)!;
  assert.deepEqual(original, before);
  assert.deepEqual(next.panes.map((pane) => [pane.region, pane.sizeMode]), [['main', 'normal'], ['right', 'normal'], ['bottom', 'minimized']]);
  assert.equal(next.panes[0].floating, undefined);
  assert.deepEqual(next.panes[2].size, original.panes[2].size);
  assert.equal(next.view.writingToolsCollapsed, true);
  assert.equal(next.view.focusDocumentId, undefined);
  assert.equal(next.view.font, original.view.font);
  assert.equal(next.view.surface, original.view.surface);
  assert.equal(next.view.weight, original.view.weight);
  assert.equal(writingReferenceDesk(original, 'missing', 1, 1280), null);
  assert.equal(writingReferenceDesk(original, 'chapter', 0, 1280), null);
  assert.equal(writingReferenceDesk(original, 'chapter', 99, 1280), null);
});

test('compact tools preference is optional and invalid stored values do not change it', () => {
  const parsed = parseDesks(JSON.stringify([
    desk,
    { ...desk, view: { ...desk.view, writingToolsCollapsed: false } },
    { ...desk, view: { ...desk.view, writingToolsCollapsed: true } },
    { ...desk, view: { ...desk.view, writingToolsCollapsed: 'false' } },
  ]));
  assert.deepEqual(parsed.map((item) => item.view.writingToolsCollapsed), [undefined, false, true, undefined]);
});
