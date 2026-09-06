import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDesks, reconcileDeskPanes, type SavedDesk } from '../src/desks.ts';
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
