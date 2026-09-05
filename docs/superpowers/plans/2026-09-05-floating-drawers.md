# Floating Drawer System + Scene Board UI Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the seven pane-specific full-screen "add/edit" modal drawers (Scenes, Characters, World, Plot, Themes, References, Goals) with a shared, multi-instance, draggable, dockable floating panel system; add a drag-resize handle to pane chrome; make the Scenes "Story material" rail collapsible.

**Architecture:** A new Zustand store slice (`floatingPanels`) tracks position/dock/hotkey-slot state for every open drawer instance, independent of each pane's own form/save logic. A new `FloatingDrawer` component wraps each pane's existing drawer content (unchanged) with shared chrome — drag handle, dock-to-strip button, Escape-to-dock, Alt+1-9 recall. A new `FloatingPanelStrip` renders the collapsed tabs. Each pane's local drawer state moves from a single value to a `Map<string, T>` keyed by entity id (or `'new'`) so same-type instances (e.g. two characters) can be open concurrently — see Task 6 note on the `'new'` key.

**Tech Stack:** React 18 + Zustand 5 (existing), no new dependencies. Unit tests via `node --test` (existing `web/test/*.test.ts` convention — pure/exported functions only, no DOM). E2E via Playwright (existing `e2e/*.spec.ts` convention).

**Spec:** `docs/superpowers/specs/2026-09-05-floating-drawers-design.md` (read the Addendum section — it supersedes part of the original Non-goals).

## Global Constraints

- Recall hotkey is **Alt+1 through Alt+9** (not Ctrl — Ctrl+1-9 is reserved by Chrome/Firefox for tab switching and never reaches the page).
- Docked panels render as a **vertical tab strip** on the right viewport edge (not icon chips).
- No full-screen dimming scrim on floating drawers, and no click-outside-to-close — multiple can be open at once, so a modal scrim doesn't apply. Each pane's own `×`/Cancel remains the only hard-close.
- Opening a drawer whose `id` is already open (docked or not) refocuses/undocks the existing one — never duplicates.
- No persistence of floating panel position or scene-board pane size across a page reload — in-memory only, matching the existing `panes` array behavior.
- Positioning math must not depend on `window.innerWidth`/`innerHeight` (keeps store logic testable under Node without a DOM) — use fixed base coordinates plus a cascade offset per additional open panel.

---

### Task 1: Extract shared `useDrag` hook

**Files:**
- Create: `web/src/components/useDrag.ts`
- Modify: `web/src/components/WorkspaceCanvas.tsx:91-118` (remove local `useDrag`, import the extracted one)

**Interfaces:**
- Produces: `useDrag(onMove: (dx: number, dy: number) => void): (e: React.MouseEvent) => void` — mousedown handler that tracks the drag and calls `onMove` with per-tick deltas until mouseup. Used by Task 3 (pane resize handle) and Task 4 (`FloatingDrawer` move handle).

- [ ] **Step 1: Create the hook file with the existing implementation, unchanged**

```ts
// web/src/components/useDrag.ts
import { useCallback, useEffect, useRef } from 'react';

export function useDrag(onMove: (dx: number, dy: number) => void) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const down = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    origin.current = { x: e.clientX, y: e.clientY };
    document.body.classList.add('is-dragging');
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!origin.current) return;
      onMove(e.clientX - origin.current.x, e.clientY - origin.current.y);
      origin.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      origin.current = null;
      document.body.classList.remove('is-dragging');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [onMove]);

  return down;
}
```

- [ ] **Step 2: Remove the local definition from WorkspaceCanvas.tsx and import it instead**

In `web/src/components/WorkspaceCanvas.tsx`, delete lines 91-118 (the local `function useDrag(...) { ... }` block) and add this import near the top (after the existing `import { useStore } from '../store';` line):

```ts
import { useDrag } from './useDrag';
```

Also remove `useCallback` from the `react` import on line 1 if nothing else in the file uses it (check with a search for `useCallback` in the file after deleting the block — if no other match, change line 1 to `import { useEffect, useRef } from 'react';`).

- [ ] **Step 3: Verify the build passes**

Run: `cd web && npm run build`
Expected: exits 0, no TypeScript errors, no unused-import errors.

- [ ] **Step 4: Verify existing e2e suite still passes (region splitter drag is unchanged behavior)**

Run: `npx playwright test responsive.spec.ts`
Expected: all tests pass (this file exercises pane layout; confirms the extraction didn't break the existing right/bottom splitter drag).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/useDrag.ts web/src/components/WorkspaceCanvas.tsx
git commit -m "$(cat <<'EOF'
refactor: extract useDrag hook for reuse by pane resize and floating drawers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```

---

### Task 2: Floating panel store slice

**Files:**
- Modify: `web/src/types.ts` (add `FloatingPanel` type)
- Modify: `web/src/store.ts` (add `floatingPanels` state + 6 actions)
- Test: `web/test/floating-panels.test.ts`

**Interfaces:**
- Produces (consumed by Task 4, 5, 6-12):
  - `type FloatingPanel = { id: string; paneType: PaneType; title: string; x: number; y: number; width: number; height: number; docked: boolean; slot: number | null }`
  - `useStore.getState().floatingPanels: FloatingPanel[]`
  - `useStore.getState().openFloatingPanel(cfg: { id: string; paneType: PaneType; title: string; width?: number; height?: number }): void`
  - `useStore.getState().closeFloatingPanel(id: string): void`
  - `useStore.getState().dockFloatingPanel(id: string): void`
  - `useStore.getState().undockFloatingPanel(id: string): void`
  - `useStore.getState().moveFloatingPanel(id: string, x: number, y: number): void`
  - `useStore.getState().focusFloatingPanel(id: string): void`

- [ ] **Step 1: Add the `FloatingPanel` type**

In `web/src/types.ts`, immediately after the `Pane` interface (after line 389, `}`), add:

```ts

export interface FloatingPanel {
  id: string;
  paneType: PaneType;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  docked: boolean;
  slot: number | null;
}
```

- [ ] **Step 2: Write the failing unit tests**

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd web && node --import tsx --test test/floating-panels.test.ts`
Expected: FAIL — `openFloatingPanel is not a function` (or similar), since the store doesn't have this slice yet.

- [ ] **Step 4: Implement the store slice**

In `web/src/store.ts`, add `FloatingPanel` to the type-only import block (the `import type { ... } from './types';` spanning lines 3-9) — insert `FloatingPanel,` alphabetically next to `GoalStore,` on line 5, i.e. change:

```ts
  GoalStore, ProgressProjection, ReferenceStore, StoryReference,
```

to:

```ts
  FloatingPanel, GoalStore, ProgressProjection, ReferenceStore, StoryReference,
```

Add to the `State` interface (right after the `panes: Pane[];` line, line 30):

```ts
  floatingPanels: FloatingPanel[];
```

Add to the action signatures block (right after `setPaneSize: (paneId: string, mode: Pane['sizeMode']) => void;` on line 63):

```ts
  openFloatingPanel: (cfg: { id: string; paneType: PaneType; title: string; width?: number; height?: number }) => void;
  closeFloatingPanel: (id: string) => void;
  dockFloatingPanel: (id: string) => void;
  undockFloatingPanel: (id: string) => void;
  moveFloatingPanel: (id: string, x: number, y: number) => void;
  focusFloatingPanel: (id: string) => void;
```

Add the initial value next to `panes: [],` (line 147):

```ts
  panes: [],
  floatingPanels: [],
```

Add `floatingPanels: []` to the project-switch reset object on line 192 (find `panes: [], runs: {},` inside that `set({...})` call and change it to `panes: [], floatingPanels: [], runs: {},`).

Add the six action implementations right after `setPaneSize` (after line 285, before the blank line preceding `setRightWidth`):

```ts

  openFloatingPanel(cfg) {
    const s = get();
    const existing = s.floatingPanels.find((p) => p.id === cfg.id);
    if (existing) {
      set({
        floatingPanels: [
          ...s.floatingPanels.filter((p) => p.id !== cfg.id),
          { ...existing, docked: false },
        ],
      });
      return;
    }
    const width = cfg.width ?? 560;
    const height = cfg.height ?? 640;
    const openIndex = s.floatingPanels.length;
    const cascade = (openIndex % 6) * 28;
    const usedSlots = new Set(s.floatingPanels.map((p) => p.slot).filter((n): n is number => n !== null));
    let slot: number | null = null;
    for (let n = 1; n <= 9; n++) {
      if (!usedSlots.has(n)) { slot = n; break; }
    }
    const panel: FloatingPanel = {
      id: cfg.id,
      paneType: cfg.paneType,
      title: cfg.title,
      x: 160 + cascade,
      y: 90 + cascade,
      width,
      height,
      docked: false,
      slot,
    };
    set({ floatingPanels: [...s.floatingPanels, panel] });
  },

  closeFloatingPanel(id) {
    set({ floatingPanels: get().floatingPanels.filter((p) => p.id !== id) });
  },

  dockFloatingPanel(id) {
    set({ floatingPanels: get().floatingPanels.map((p) => (p.id === id ? { ...p, docked: true } : p)) });
  },

  undockFloatingPanel(id) {
    const s = get();
    const panel = s.floatingPanels.find((p) => p.id === id);
    if (!panel) return;
    set({
      floatingPanels: [
        ...s.floatingPanels.filter((p) => p.id !== id),
        { ...panel, docked: false },
      ],
    });
  },

  moveFloatingPanel(id, x, y) {
    set({ floatingPanels: get().floatingPanels.map((p) => (p.id === id ? { ...p, x, y } : p)) });
  },

  focusFloatingPanel(id) {
    const s = get();
    const panel = s.floatingPanels.find((p) => p.id === id);
    if (!panel) return;
    set({
      floatingPanels: [
        ...s.floatingPanels.filter((p) => p.id !== id),
        panel,
      ],
    });
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && node --import tsx --test test/floating-panels.test.ts`
Expected: all 9 tests PASS.

- [ ] **Step 6: Verify the build still passes**

Run: `cd web && npm run build`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add web/src/types.ts web/src/store.ts web/test/floating-panels.test.ts
git commit -m "$(cat <<'EOF'
feat: add floatingPanels store slice for shared draggable/dockable drawers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```

---

### Task 3: Pane resize handle

**Files:**
- Modify: `web/src/types.ts` (add optional `Pane.size`)
- Modify: `web/src/store.ts` (add `resizePane` action)
- Modify: `web/src/components/WorkspaceCanvas.tsx` (resize handle UI in `PaneFrame`)
- Modify: `web/src/styles/app.css` (`.pane-resize-handle`)
- Test: `web/test/floating-panels.test.ts` (add `resizePane` cases — same file, since it's the same "pane/panel sizing" concern)

**Interfaces:**
- Consumes: `useDrag` from Task 1.
- Produces: `Pane.size?: { width: number; height: number }`; `useStore.getState().resizePane(paneId: string, width: number, height: number): void`.

- [ ] **Step 1: Add the `size` field to `Pane`**

In `web/src/types.ts`, in the `Pane` interface (currently lines 382-389), add a line after `sizeMode`:

```ts
export interface Pane {
  id: string;
  type: PaneType;
  title: string;
  region: Region;
  binding?: { type: 'document' | 'agent'; id: string };
  sizeMode: 'normal' | 'minimized' | 'maximized';
  size?: { width: number; height: number };
}
```

- [ ] **Step 2: Write the failing test**

Append to `web/test/floating-panels.test.ts`:

```ts

test('resizePane clamps to a sane minimum and only affects the targeted pane', () => {
  useStore.setState({
    panes: [
      { id: 'p1', type: 'scenes', title: 'Scenes', region: 'main', sizeMode: 'normal' },
      { id: 'p2', type: 'goals', title: 'Goals', region: 'main', sizeMode: 'normal' },
    ],
  });
  useStore.getState().resizePane('p1', 900, 700);
  useStore.getState().resizePane('p2', 10, 10);
  const [p1, p2] = useStore.getState().panes;
  assert.deepEqual(p1.size, { width: 900, height: 700 });
  assert.deepEqual(p2.size, { width: 320, height: 200 });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd web && node --import tsx --test test/floating-panels.test.ts`
Expected: FAIL — `resizePane is not a function`.

- [ ] **Step 4: Implement `resizePane`**

In `web/src/store.ts`, add to the action signatures block (next to `setPaneSize`):

```ts
  resizePane: (paneId: string, width: number, height: number) => void;
```

Add the implementation right after `setPaneSize` (before the `openFloatingPanel` block added in Task 2):

```ts
  resizePane(paneId, width, height) {
    set({
      panes: get().panes.map((p) =>
        p.id === paneId ? { ...p, size: { width: Math.max(320, width), height: Math.max(200, height) } } : p,
      ),
    });
  },
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd web && node --import tsx --test test/floating-panels.test.ts`
Expected: all 10 tests PASS.

- [ ] **Step 6: Add the resize handle to `PaneFrame`**

In `web/src/components/WorkspaceCanvas.tsx`, the `PaneFrame` function currently (after Task 1's edit) starts around line 63. Replace the whole function:

```tsx
function PaneFrame({ pane }: { pane: Pane }) {
  const setPaneSize = useStore((s) => s.setPaneSize);
  const closePane = useStore((s) => s.closePane);
  const resizePane = useStore((s) => s.resizePane);
  const doc = useStore((s) => (pane.binding?.type === 'document' ? s.docs[pane.binding.id] : undefined));
  const minimized = pane.sizeMode === 'minimized';
  const ref = useRef<HTMLElement>(null);
  const onResizeDrag = useDrag((dx, dy) => {
    const el = ref.current;
    if (!el) return;
    resizePane(pane.id, el.offsetWidth + dx, el.offsetHeight + dy);
  });

  return (
    <section
      ref={ref}
      className={`pane pane-${pane.type} ${minimized ? 'is-min' : ''}`}
      style={pane.sizeMode === 'normal' && pane.size ? { width: pane.size.width, height: pane.size.height, flex: '0 0 auto' } : undefined}
    >
      <header className="pane-head">
        <span className="pane-title">{pane.title}</span>
        {doc?.dirty && <span className="pane-dirty" title="unsaved">•</span>}
        <span className="pane-tools">
          <button title="Minimize" onClick={() => setPaneSize(pane.id, minimized ? 'normal' : 'minimized')}>
            <Icon.Minus />
          </button>
          <button title="Maximize" onClick={() => setPaneSize(pane.id, pane.sizeMode === 'maximized' ? 'normal' : 'maximized')}>
            <Icon.Expand />
          </button>
          <button title="Close" onClick={() => closePane(pane.id)}>
            <Icon.Close />
          </button>
        </span>
      </header>
      {!minimized && <div className="pane-body">{<PaneBody pane={pane} />}</div>}
      {pane.sizeMode === 'normal' && <div className="pane-resize-handle" onMouseDown={onResizeDrag} title="Drag to resize" />}
    </section>
  );
}
```

This requires `useRef` in the `react` import at the top of the file — update it to `import { useEffect, useRef } from 'react';` if Task 1 left it without `useRef` (it already had `useRef` before Task 1 removed `useCallback`, so this should already be present; verify and add if missing).

- [ ] **Step 7: Add the handle's CSS**

In `web/src/styles/app.css`, find the `.pane {` rule (line 163) and add this new rule directly after its closing brace:

```css
.pane { position: relative; }
.pane-resize-handle {
  position: absolute; right: 2px; bottom: 2px; width: 14px; height: 14px; cursor: nwse-resize; z-index: 5;
  background: linear-gradient(135deg, transparent 0 50%, var(--line-strong) 50% 58%, transparent 58% 66%, var(--line-strong) 66% 74%, transparent 74%);
}
```

(If `.pane` already declares `position: relative` or similar, don't duplicate — just add the `.pane-resize-handle` rule.)

- [ ] **Step 8: Manual browser check**

Run: `npm run dev` (from repo root), open the app, open any pane in normal size mode (not maximized), confirm a small diagonal-hatch handle appears at its bottom-right corner and dragging it resizes the pane. Stop the dev server after checking.

- [ ] **Step 9: Verify the build passes**

Run: `cd web && npm run build`
Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
git add web/src/types.ts web/src/store.ts web/src/components/WorkspaceCanvas.tsx web/src/styles/app.css web/test/floating-panels.test.ts
git commit -m "$(cat <<'EOF'
feat: add drag-resize handle to pane chrome

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```

---

### Task 4: `FloatingDrawer` component

**Files:**
- Create: `web/src/components/FloatingDrawer.tsx`
- Modify: `web/src/styles/app.css` (`.floating-drawer*` rules)

**Interfaces:**
- Consumes: `useDrag` (Task 1); `useStore().floatingPanels`, `openFloatingPanel`, `closeFloatingPanel` (renamed usage: the drawer calls `dockFloatingPanel`), `dockFloatingPanel`, `undockFloatingPanel`, `focusFloatingPanel` (Task 2).
- Produces: `FloatingDrawer` component, used by Tasks 6-12:
  ```tsx
  <FloatingDrawer id={string} paneType={PaneType} title={string} onClose={() => void} width?={number} height?={number}>
    {children}
  </FloatingDrawer>
  ```
  `onClose` is the pane's own hard-close (discard) callback — unchanged from what each pane already passes to its drawer today.

- [ ] **Step 1: Implement the component**

```tsx
// web/src/components/FloatingDrawer.tsx
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { PaneType } from '../types';
import { useDrag } from './useDrag';
import * as Icon from './icons';

export function FloatingDrawer({
  id,
  paneType,
  title,
  width,
  height,
  onClose,
  children,
}: {
  id: string;
  paneType: PaneType;
  title: string;
  width?: number;
  height?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useStore((s) => s.floatingPanels.find((p) => p.id === id));
  const zIndex = useStore((s) => 1000 + s.floatingPanels.findIndex((p) => p.id === id));
  const rootRef = useRef<HTMLDivElement>(null);
  const wasDocked = useRef(false);

  useEffect(() => {
    useStore.getState().openFloatingPanel({ id, paneType, title, width, height });
    return () => useStore.getState().closeFloatingPanel(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (wasDocked.current && panel && !panel.docked) {
      rootRef.current?.focus();
    }
    wasDocked.current = panel?.docked ?? false;
  }, [panel?.docked]);

  const onDragMove = useDrag((dx, dy) => {
    if (!panel) return;
    useStore.getState().moveFloatingPanel(id, panel.x + dx, panel.y + dy);
  });

  if (!panel) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      useStore.getState().dockFloatingPanel(id);
    }
  };

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      className="floating-drawer"
      style={{ left: panel.x, top: panel.y, width: panel.width, height: panel.height, zIndex, display: panel.docked ? 'none' : 'flex' }}
      onMouseDown={() => useStore.getState().focusFloatingPanel(id)}
      onKeyDown={onKeyDown}
    >
      <div className="floating-drawer-grip" onMouseDown={onDragMove}>
        <Icon.Dots />
        <button
          type="button"
          className="floating-drawer-dock"
          aria-label="Send to side"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => useStore.getState().dockFloatingPanel(id)}
        >
          <Icon.Minus size={13} />
        </button>
      </div>
      <div className="floating-drawer-body">{children}</div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Add CSS**

In `web/src/styles/app.css`, add after the `.pane-resize-handle` rule from Task 3:

```css
.floating-drawer {
  position: fixed; flex-direction: column; background: var(--paper-raised); border-radius: var(--r-md);
  box-shadow: var(--shadow-float); overflow: hidden; animation: drawer-in .2s ease-out;
}
.floating-drawer-grip {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 4px 8px;
  background: var(--paper); border-bottom: 1px solid var(--line); cursor: grab; color: var(--ink-soft);
}
.floating-drawer-grip:active { cursor: grabbing; }
.floating-drawer-dock { border: 0; background: transparent; color: var(--ink-soft); display: flex; padding: 3px; border-radius: var(--r-sm); }
.floating-drawer-dock:hover { background: var(--line); }
.floating-drawer-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.floating-drawer-body > * { flex: 1; min-height: 0; }
@media (prefers-reduced-motion: reduce) { .floating-drawer { animation: none; } }
```

- [ ] **Step 3: Verify the build passes**

Run: `cd web && npm run build`
Expected: exits 0. (No consumer yet, so this only checks the component compiles standalone — TypeScript will still check an unused exported component.)

- [ ] **Step 4: Commit**

```bash
git add web/src/components/FloatingDrawer.tsx web/src/styles/app.css
git commit -m "$(cat <<'EOF'
feat: add FloatingDrawer shared chrome component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```

---

### Task 5: `FloatingPanelStrip` + Alt+1-9 hotkey wiring

**Files:**
- Create: `web/src/components/FloatingPanelStrip.tsx`
- Modify: `web/src/components/WorkspaceCanvas.tsx` (mount the strip, add the global hotkey listener)
- Modify: `web/src/styles/app.css` (`.floating-panel-strip*`)

**Interfaces:**
- Consumes: `useStore().floatingPanels`, `undockFloatingPanel`, `focusFloatingPanel` (Task 2).
- Produces: `FloatingPanelStrip` component (no props — reads the store directly), mounted once.

- [ ] **Step 1: Implement the strip**

```tsx
// web/src/components/FloatingPanelStrip.tsx
import { useStore } from '../store';

export function FloatingPanelStrip() {
  const panels = useStore((s) => s.floatingPanels.filter((p) => p.docked));
  if (!panels.length) return null;
  return (
    <div className="floating-panel-strip">
      {panels.map((panel) => (
        <button
          key={panel.id}
          className="floating-panel-tab"
          onClick={() => {
            useStore.getState().undockFloatingPanel(panel.id);
            useStore.getState().focusFloatingPanel(panel.id);
          }}
        >
          {panel.slot !== null && <em>{panel.slot}</em>}
          <span>{panel.title}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Mount the strip and add the global hotkey listener in `WorkspaceCanvas`**

In `web/src/components/WorkspaceCanvas.tsx`:

Add the import near the other component imports:

```ts
import { FloatingPanelStrip } from './FloatingPanelStrip';
```

Inside `export function WorkspaceCanvas()`, add a `useEffect` for the global hotkey right after the existing `onDragV`/`onDragH` declarations:

```tsx
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      const slot = Number(event.key);
      if (!Number.isInteger(slot) || slot < 1 || slot > 9) return;
      const panel = useStore.getState().floatingPanels.find((p) => p.slot === slot && p.docked);
      if (!panel) return;
      event.preventDefault();
      useStore.getState().undockFloatingPanel(panel.id);
      useStore.getState().focusFloatingPanel(panel.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
```

This requires `useEffect` in the file's React import — it's already imported (used by `useDrag` before extraction, but after Task 1 `WorkspaceCanvas.tsx` no longer defines `useDrag` itself). Check the current import line and ensure it reads `import { useEffect, useRef } from 'react';` (add `useEffect` if it was removed by Task 1's cleanup — Task 1 only asked to drop `useCallback`, so `useEffect`/`useRef` should remain from the original file; if `useRef` is unused elsewhere after Task 1, keep it anyway since Task 3 reintroduces a `useRef` in `PaneFrame`).

Add `<FloatingPanelStrip />` as a sibling of the returned layout — the component currently has three early-return branches (`!panes.length`, `maximized`, and the default grid). Render the strip in all three cases by wrapping the existing return value. Change the three `return (...)`/`return <div ...>` statements so each renders the strip alongside the existing content, e.g. for the empty-state branch:

```tsx
  if (!panes.length) {
    return (
      <>
        <div className="canvas canvas-empty">
          <Icon.Feather size={56} />
          <p className="empty-title">Start writing your story…</p>
          <p className="empty-sub">Use the cards on the left to bring your ideas to life.</p>
        </div>
        <FloatingPanelStrip />
      </>
    );
  }
```

for the maximized branch:

```tsx
  if (maximized) {
    return (
      <>
        <div className="canvas canvas-single">
          <PaneFrame pane={maximized} />
        </div>
        <FloatingPanelStrip />
      </>
    );
  }
```

and for the default grid branch, wrap the final `return ( <div className="canvas" ...> ... </div> )` the same way, adding `<FloatingPanelStrip />` as a sibling after the closing `</div>` of `.canvas` and before the final `)`.

- [ ] **Step 3: Add CSS**

In `web/src/styles/app.css`, add after the `.floating-drawer*` rules from Task 4:

```css
.floating-panel-strip {
  position: fixed; top: 50%; right: 0; transform: translateY(-50%); z-index: 900;
  display: flex; flex-direction: column; gap: 2px; max-height: 70vh; overflow-y: auto;
}
.floating-panel-tab {
  display: flex; align-items: center; gap: 6px; padding: 8px 10px; border: 1px solid var(--line);
  border-right: 0; border-radius: var(--r-sm) 0 0 var(--r-sm); background: var(--paper-raised);
  box-shadow: -2px 2px 6px rgba(47,59,68,.08); color: var(--ink); font-size: 11px; max-width: 160px;
  writing-mode: vertical-rl; text-orientation: mixed;
}
.floating-panel-tab span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-height: 120px; }
.floating-panel-tab em { font: 9px var(--font-mono); color: var(--ink-soft); font-style: normal; }
```

- [ ] **Step 4: Verify the build passes**

Run: `cd web && npm run build`
Expected: exits 0.

- [ ] **Step 5: Manual browser check**

Run `npm run dev`, open the app — confirm nothing visually changed yet (the strip renders nothing because `floatingPanels` is still always empty; no pane creates one until Task 6). Stop the dev server after checking.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/FloatingPanelStrip.tsx web/src/components/WorkspaceCanvas.tsx web/src/styles/app.css
git commit -m "$(cat <<'EOF'
feat: add FloatingPanelStrip and Alt+1-9 recall hotkey

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```

---

### Task 6: Migrate `ScenesPane` (rail collapse + floating drawer, first integration)

**Files:**
- Modify: `web/src/panes/ScenesPane.tsx`
- Modify: `web/src/styles/app.css` (`.scene-resource-rail.is-collapsed`; remove now-dead `.scene-drawer-backdrop` rule)
- Test: `e2e/scenes-floating-drawer.spec.ts` (new)

**Interfaces:**
- Consumes: `FloatingDrawer` (Task 4).
- Design note on the `'new'` key: only one blank "new scene" draft can be open at a time per pane (opening "+ Add scene" again while a blank draft is already open/docked refocuses that same draft rather than starting a second blank one). Editing two different *existing* scenes concurrently is fully supported. This mirrors the `id` de-duplication rule in Global Constraints and keeps the "new" flow from silently discarding an in-progress draft.

- [ ] **Step 1: Change the drawer to a Map, add rail-collapse state**

In `web/src/panes/ScenesPane.tsx`, add `Fragment` is not needed. Change the import line to add `FloatingDrawer`:

```ts
import { FloatingDrawer } from '../components/FloatingDrawer';
```

Replace line 91 (`const [drawer, setDrawer] = useState<Scene | 'new' | null>(null);`) with:

```ts
  const [drawers, setDrawers] = useState<Map<string, Scene | 'new'>>(new Map());
  const [railCollapsed, setRailCollapsed] = useState(false);
  const openDrawer = (key: string, value: Scene | 'new') => setDrawers((current) => new Map(current).set(key, value));
  const closeDrawer = (key: string) => setDrawers((current) => { const next = new Map(current); next.delete(key); return next; });
```

- [ ] **Step 2: Update the "+ Add scene" / empty-state buttons**

Change every `setDrawer('new')` call (lines 132, 140) to `openDrawer('new', 'new')`.

- [ ] **Step 3: Update the "+ beat" / "Edit" buttons on each scene lane**

Change every `setDrawer(scene)` call (lines 143, 144) to `openDrawer(scene.id, scene)`.

- [ ] **Step 4: Replace the render call site**

Replace line 147:

```tsx
    {drawer && <SceneDrawer scene={drawer === 'new' ? undefined : drawer} onClose={() => setDrawer(null)} />}
```

with:

```tsx
    {[...drawers.entries()].map(([key, value]) => (
      <FloatingDrawer key={key} id={`scenes:${key}`} paneType="scenes" title={value === 'new' ? 'Add scene' : `Revise ${value.title}`} onClose={() => closeDrawer(key)}>
        <SceneDrawer scene={value === 'new' ? undefined : value} onClose={() => closeDrawer(key)} />
      </FloatingDrawer>
    ))}
```

- [ ] **Step 5: Strip `SceneDrawer`'s own backdrop, wrapper, and Escape handler**

`SceneDrawer` (lines 21-81) currently owns its own backdrop div, its own Escape-to-close `useEffect`, and click-outside-to-close. Since `FloatingDrawer` now owns positioning and Escape-to-dock, replace the outer wrapper. Change the `useEffect` (lines 33-38):

```ts
  useEffect(() => {
    titleRef.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
```

to:

```ts
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
```

Change the return statement's outer wrapper (lines 58 and 80) from:

```tsx
  return <div className="scene-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="scene-drawer" onSubmit={save}>
```

to:

```tsx
  return (
    <form className="scene-drawer" onSubmit={save}>
```

and the closing (line 80):

```tsx
    </form>
  </div>;
```

to:

```tsx
    </form>
  );
```

- [ ] **Step 6: Add the rail collapse toggle**

Replace the resource rail header (line 134):

```tsx
      <header><span>Story material</span><p>Drag into any scene. Click adds to selected scene.</p></header>
```

with:

```tsx
      <header>
        <span>Story material</span>
        <button type="button" className="scene-rail-toggle" aria-label={railCollapsed ? 'Expand story material' : 'Collapse story material'} onClick={() => setRailCollapsed((current) => !current)}>{railCollapsed ? '»' : '«'}</button>
        {!railCollapsed && <p>Drag into any scene. Click adds to selected scene.</p>}
      </header>
```

Update the `<aside>` element (line 133) to include the collapsed class:

```tsx
    <aside className={`scene-resource-rail ${railCollapsed ? 'is-collapsed' : ''}`}>
```

Hide the `<nav>` labels and the resource list body when collapsed by wrapping the existing `<nav>` (line 135) and everything through the resource list (line 137) in a `{!railCollapsed && (...)}` block — i.e. change:

```tsx
      <nav>{(['character', 'theme', 'location', 'plot'] as SceneAssetKind[]).map((kind) => <button key={kind} className={resourceKind === kind ? 'is-active' : ''} onClick={() => setResourceKind(kind)}>{ASSET_MARK[kind]}<span>{ASSET_LABEL[kind]}</span><b>{resources.filter((item) => item.kind === kind).length}</b></button>)}</nav>
      {resourceKind === 'theme' && <form className="scene-theme-add" onSubmit={async (event) => { event.preventDefault(); const theme = await useStore.getState().createSceneTheme({ name: themeName }); if (theme) setThemeName(''); }}><input aria-label="New theme" value={themeName} onChange={(event) => setThemeName(event.target.value)} placeholder="New theme…" /><button disabled={!themeName.trim()}>+</button></form>}
      <div className="scene-resource-list">{resources.filter((item) => item.kind === resourceKind).map((resource) => <button key={resource.refId} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(resource)); }} onClick={() => { if (selected) void attach(selected, resource); }} disabled={!selected}><i>{ASSET_MARK[resource.kind]}</i><span><strong>{resource.label}</strong><small>{resource.detail}</small></span><em>⠿</em></button>)}{!resources.some((item) => item.kind === resourceKind) && <p className="scene-resource-empty">No {ASSET_LABEL[resourceKind].toLowerCase()} material yet.</p>}</div>
```

to:

```tsx
      {!railCollapsed && <>
        <nav>{(['character', 'theme', 'location', 'plot'] as SceneAssetKind[]).map((kind) => <button key={kind} className={resourceKind === kind ? 'is-active' : ''} onClick={() => setResourceKind(kind)}>{ASSET_MARK[kind]}<span>{ASSET_LABEL[kind]}</span><b>{resources.filter((item) => item.kind === kind).length}</b></button>)}</nav>
        {resourceKind === 'theme' && <form className="scene-theme-add" onSubmit={async (event) => { event.preventDefault(); const theme = await useStore.getState().createSceneTheme({ name: themeName }); if (theme) setThemeName(''); }}><input aria-label="New theme" value={themeName} onChange={(event) => setThemeName(event.target.value)} placeholder="New theme…" /><button disabled={!themeName.trim()}>+</button></form>}
        <div className="scene-resource-list">{resources.filter((item) => item.kind === resourceKind).map((resource) => <button key={resource.refId} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(resource)); }} onClick={() => { if (selected) void attach(selected, resource); }} disabled={!selected}><i>{ASSET_MARK[resource.kind]}</i><span><strong>{resource.label}</strong><small>{resource.detail}</small></span><em>⠿</em></button>)}{!resources.some((item) => item.kind === resourceKind) && <p className="scene-resource-empty">No {ASSET_LABEL[resourceKind].toLowerCase()} material yet.</p>}</div>
      </>}
```

- [ ] **Step 7: CSS for the collapse state and cleanup**

In `web/src/styles/app.css`, remove the now-dead `.scene-drawer-backdrop` rule (line 1367) and the `.scene-drawer` rule's `height: 100%` positioning (line 1368) — replace both lines:

```css
.scene-drawer-backdrop { position: absolute; inset: 0; z-index: 70; display: flex; justify-content: flex-end; background: rgba(47,59,68,.22); }
.scene-drawer { width: min(650px,96%); height: 100%; display: flex; flex-direction: column; background: var(--paper-raised); box-shadow: -14px 0 42px rgba(47,59,68,.18); animation: drawer-in .2s ease-out; }
```

with:

```css
.scene-drawer { width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--paper-raised); }
```

Add the collapse rule near `.scene-resource-rail` (line 1310):

```css
.scene-resource-rail.is-collapsed { flex: 0 0 44px; width: 44px; }
.scene-resource-rail.is-collapsed > header { padding: 10px 6px; }
.scene-rail-toggle { border: 0; background: transparent; color: var(--ink-soft); font: 12px var(--font-mono); cursor: pointer; }
```

- [ ] **Step 8: Verify the build passes**

Run: `cd web && npm run build`
Expected: exits 0.

- [ ] **Step 9: Manual browser check**

Run `npm run dev`, open Scenes, click "+ Add scene" — confirm it now opens as a floating box (not a full-height right-docked panel) with a grip strip on top; drag it by the grip; press Escape and confirm it collapses to a tab on the right edge; click the tab to bring it back with your typed title intact; open "Edit" on an existing scene while the "new scene" draft is still open (docked or not) and confirm both exist independently; collapse the Story material rail and confirm it shrinks to an icon strip. Stop the dev server after checking.

- [ ] **Step 10: Write the e2e regression + new-behavior test**

```ts
// e2e/scenes-floating-drawer.spec.ts
import { test, expect, openTool } from './fixtures';

test('scene drawer opens floating, docks on Escape, and recalls via Alt+1', async ({ page, projectId }) => {
  await openTool(page, 'Scenes');
  await page.getByRole('button', { name: '+ Add scene', exact: true }).click();
  const drawer = page.locator('.floating-drawer').filter({ has: page.locator('.scene-drawer') });
  await expect(drawer).toBeVisible();
  await drawer.locator('input[placeholder="Council summons Kiala"]').fill('The trial begins');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.locator('.floating-panel-tab')).toContainText('Add scene');
  await page.keyboard.press('Alt+1');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('input[placeholder="Council summons Kiala"]')).toHaveValue('The trial begins');
});

test('two scene drawers can be open at once', async ({ page, projectId }) => {
  await openTool(page, 'Scenes');
  await page.getByRole('button', { name: '+ Add scene', exact: true }).click();
  await page.getByRole('textbox', { name: /Scene title/i }).fill('Opening scene');
  await page.getByRole('button', { name: 'Add to board', exact: true }).click();
  await page.getByText('Opening scene', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: '+ Add scene', exact: true }).click();
  await expect(page.locator('.floating-drawer')).toHaveCount(2);
});

test('story material rail collapses and expands', async ({ page, projectId }) => {
  await openTool(page, 'Scenes');
  const rail = page.locator('.scene-resource-rail');
  await expect(rail).not.toHaveClass(/is-collapsed/);
  await page.getByRole('button', { name: 'Collapse story material' }).click();
  await expect(rail).toHaveClass(/is-collapsed/);
  await page.getByRole('button', { name: 'Expand story material' }).click();
  await expect(rail).not.toHaveClass(/is-collapsed/);
});
```

- [ ] **Step 11: Run the new e2e file**

Run: `npx playwright test scenes-floating-drawer.spec.ts`
Expected: all 3 tests PASS.

- [ ] **Step 12: Run the full existing scenes-related e2e coverage to check for regressions**

Run: `npx playwright test --grep-invert "scenes-floating-drawer"` is not targeted enough — instead run the whole suite once at the end of Task 13. For now just confirm nothing in `e2e/` references `.scene-drawer-backdrop` directly:

Run: `grep -rn "scene-drawer-backdrop" e2e/`
Expected: no matches (if any exist, update that selector to `.floating-drawer` before proceeding).

- [ ] **Step 13: Commit**

```bash
git add web/src/panes/ScenesPane.tsx web/src/styles/app.css e2e/scenes-floating-drawer.spec.ts
git commit -m "$(cat <<'EOF'
feat: migrate Scenes drawer to FloatingDrawer, add collapsible story material rail

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```

---

### Task 7: Migrate `CharactersPane`

**Files:**
- Modify: `web/src/panes/CharactersPane.tsx`
- Modify: `web/src/styles/app.css` (remove dead `.character-drawer-backdrop`)
- Test: `e2e/characters-floating-drawer.spec.ts` (new)

- [ ] **Step 1: Change drawer state to a Map**

Replace line 248 (`const [drawerEntity, setDrawerEntity] = useState<CanonEntity | null | undefined>(undefined);`) with:

```ts
  const [drawers, setDrawers] = useState<Map<string, CanonEntity | 'new'>>(new Map());
```

Add the import:

```ts
import { FloatingDrawer } from '../components/FloatingDrawer';
```

- [ ] **Step 2: Rewrite `openDrawer`/`closeDrawer`/`save`**

Replace lines 267-291:

```ts
  const openDrawer = (entity?: CanonEntity) => {
    setDraft(draftFrom(entity));
    setDrawerEntity(entity ?? null);
  };
  const closeDrawer = () => setDrawerEntity(undefined);
  const save = async () => {
    const profile = profileFrom(draft);
    if (drawerEntity) {
      const updated = await useStore.getState().updateCanonEntity(drawerEntity.id, {
        name: draft.name.trim(), aliases: list(draft.aliases), summary: draft.summary.trim(), character: profile,
      });
      if (updated) {
        setSelectedId(updated.id);
        closeDrawer();
      }
    } else {
      const created = await useStore.getState().createCanonEntity({
        type: 'character', name: draft.name.trim(), aliases: list(draft.aliases), summary: draft.summary.trim(), character: profile,
      });
      if (created) {
        setSelectedId(created.id);
        closeDrawer();
      }
    }
  };
```

with:

```ts
  const [drafts, setDrafts] = useState<Map<string, CharacterDraft>>(new Map());
  const openDrawer = (entity?: CanonEntity) => {
    const key = entity?.id ?? 'new';
    setDrafts((current) => new Map(current).set(key, draftFrom(entity)));
    setDrawers((current) => new Map(current).set(key, entity ?? 'new'));
  };
  const closeDrawer = (key: string) => {
    setDrawers((current) => { const next = new Map(current); next.delete(key); return next; });
    setDrafts((current) => { const next = new Map(current); next.delete(key); return next; });
  };
  const setDraftFor = (key: string, updater: (current: CharacterDraft) => CharacterDraft) =>
    setDrafts((current) => { const next = new Map(current); next.set(key, updater(next.get(key) ?? blankDraft)); return next; });
  const save = async (key: string, entity: CanonEntity | 'new') => {
    const draft = drafts.get(key) ?? blankDraft;
    const profile = profileFrom(draft);
    if (entity !== 'new') {
      const updated = await useStore.getState().updateCanonEntity(entity.id, {
        name: draft.name.trim(), aliases: list(draft.aliases), summary: draft.summary.trim(), character: profile,
      });
      if (updated) {
        setSelectedId(updated.id);
        closeDrawer(key);
      }
    } else {
      const created = await useStore.getState().createCanonEntity({
        type: 'character', name: draft.name.trim(), aliases: list(draft.aliases), summary: draft.summary.trim(), character: profile,
      });
      if (created) {
        setSelectedId(created.id);
        closeDrawer(key);
      }
    }
  };
```

This removes the pane-level single `draft`/`setDraft` state (line 249, `const [draft, setDraft] = useState<CharacterDraft>(blankDraft);`) in favor of the per-key `drafts` map declared above — delete line 249.

- [ ] **Step 3: Update the render call site**

Replace line 358:

```tsx
      {drawerEntity !== undefined && <Drawer entity={drawerEntity ?? undefined} draft={draft} setDraft={setDraft} onClose={closeDrawer} onSave={save} />}
```

with:

```tsx
      {[...drawers.entries()].map(([key, entity]) => (
        <FloatingDrawer key={key} id={`characters:${key}`} paneType="characters" title={entity === 'new' ? 'New character' : `Revise ${entity.name}`} onClose={() => closeDrawer(key)}>
          <Drawer
            entity={entity === 'new' ? undefined : entity}
            draft={drafts.get(key) ?? blankDraft}
            setDraft={(updater) => setDraftFor(key, typeof updater === 'function' ? updater : () => updater)}
            onClose={() => closeDrawer(key)}
            onSave={() => save(key, entity)}
          />
        </FloatingDrawer>
      ))}
```

- [ ] **Step 4: Strip `Drawer`'s own backdrop/Escape handling**

In the `Drawer` function (lines 156-241), replace the Escape `useEffect` (lines 176-180):

```ts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, uploadingImages, onClose]);
```

Delete this block entirely (`FloatingDrawer` now owns Escape-to-dock).

Replace the outer wrapper (lines 189-190 and 239-240) — change:

```tsx
  return (
    <div className="character-drawer-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) close(); }}>
      <form className="character-drawer" onSubmit={save}>
```

to:

```tsx
  return (
    <form className="character-drawer" onSubmit={save}>
```

and:

```tsx
      </form>
    </div>
  );
```

to:

```tsx
    </form>
  );
```

- [ ] **Step 5: CSS cleanup**

In `web/src/styles/app.css`, remove line 484 (`.character-drawer-backdrop { ... }`) and change line 485 from:

```css
.character-drawer { width: min(620px, 92%); height: 100%; display: flex; flex-direction: column; background: var(--paper-raised); box-shadow: -14px 0 42px rgba(47,59,68,.18); animation: drawer-in .2s ease-out; }
```

to:

```css
.character-drawer { width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--paper-raised); }
```

- [ ] **Step 6: Verify build**

Run: `cd web && npm run build`
Expected: exits 0. Pay attention to the `setDraft` prop type on `Drawer` — its declared type is `React.Dispatch<React.SetStateAction<CharacterDraft>>`; the adapter in Step 3 must satisfy that exact type (accepting either a value or an updater function), which the code above does via the `typeof updater === 'function'` check.

- [ ] **Step 7: Manual browser check**

Run `npm run dev`, open Characters, click "Add character", fill the name field, open a second "Edit dossier" on an existing character while the first is still open — confirm both floating windows exist independently with independent field state; dock one via Escape, recall via its Alt+N tab. Stop the dev server after checking.

- [ ] **Step 8: Write e2e test**

```ts
// e2e/characters-floating-drawer.spec.ts
import { test, expect, openTool } from './fixtures';

test('editing two characters at once keeps each drawer independent', async ({ page, projectId }) => {
  await openTool(page, 'Characters');
  await page.getByRole('button', { name: 'Add character' }).click();
  await page.getByPlaceholder('Character name').fill('Kiala');
  await page.getByRole('button', { name: 'Add to cast', exact: true }).click();
  await page.getByRole('button', { name: 'Add character' }).click();
  await page.getByPlaceholder('Character name').fill('Warden');
  await page.getByRole('button', { name: 'Add to cast', exact: true }).click();

  await page.getByText('Kiala', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit dossier' }).click();
  await page.getByText('Warden', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit dossier' }).click();

  await expect(page.locator('.floating-drawer')).toHaveCount(2);
  const names = page.locator('.floating-drawer .character-drawer h2');
  await expect(names).toHaveText(['Revise Kiala', 'Revise Warden']);
});
```

- [ ] **Step 9: Run it**

Run: `npx playwright test characters-floating-drawer.spec.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add web/src/panes/CharactersPane.tsx web/src/styles/app.css e2e/characters-floating-drawer.spec.ts
git commit -m "$(cat <<'EOF'
feat: migrate Characters drawer to FloatingDrawer with per-character concurrency

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```

---

### Task 8: Migrate `WorldPane`

**Files:**
- Modify: `web/src/panes/WorldPane.tsx`
- Modify: `web/src/styles/app.css` (remove dead `.world-drawer-backdrop`)

- [ ] **Step 1: Change drawer state to a Map**

Replace line 177 (`const [drawer, setDrawer] = useState<{ entity?: CanonEntity; point: Point } | null>(null);`) with:

```ts
  const [drawers, setDrawers] = useState<Map<string, { entity?: CanonEntity; point: Point }>>(new Map());
  const openDrawer = (value: { entity?: CanonEntity; point: Point }) =>
    setDrawers((current) => new Map(current).set(value.entity?.id ?? 'new', value));
  const closeDrawer = (key: string) => setDrawers((current) => { const next = new Map(current); next.delete(key); return next; });
```

Add the import:

```ts
import { FloatingDrawer } from '../components/FloatingDrawer';
```

- [ ] **Step 2: Update every `setDrawer(...)` call site to `openDrawer(...)`**

Lines 425, 462, 514, 595, 610 all call `setDrawer({...})` — change each to `openDrawer({...})` (same argument shape, no other changes).

- [ ] **Step 3: Update the render call site**

Replace line 616:

```tsx
      {drawer && <WorldDrawer entity={drawer.entity} point={drawer.point} onClose={() => setDrawer(null)} onSaved={(entity) => { setSelectedId(entity.id); setDrawer(null); }} />}
```

with:

```tsx
      {[...drawers.entries()].map(([key, value]) => (
        <FloatingDrawer key={key} id={`world:${key}`} paneType="world" title={value.entity ? `Edit ${value.entity.name}` : 'Place a landmark'} onClose={() => closeDrawer(key)}>
          <WorldDrawer entity={value.entity} point={value.point} onClose={() => closeDrawer(key)} onSaved={(entity) => { setSelectedId(entity.id); closeDrawer(key); }} />
        </FloatingDrawer>
      ))}
```

- [ ] **Step 4: Strip `WorldDrawer`'s own backdrop/Escape handling**

Replace the `useEffect` (lines 82-89):

```ts
  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [uploadingImages, onClose]);
```

with:

```ts
  useEffect(() => {
    nameRef.current?.focus();
  }, []);
```

Replace the outer wrapper (line 118 and its matching closer near the end of the function) — change:

```tsx
    <div className="world-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <form className="world-drawer" onSubmit={save}>
```

to:

```tsx
    <form className="world-drawer" onSubmit={save}>
```

and its closing `</form></div>` to `</form>`.

- [ ] **Step 5: CSS cleanup**

Remove line 726 (`.world-drawer-backdrop { ... }`) in `app.css`, and change line 727 from:

```css
.world-drawer { width: min(560px, 94%); height: 100%; display: flex; flex-direction: column; background: var(--paper-raised); box-shadow: -14px 0 42px rgba(47,59,68,.18); animation: drawer-in .2s ease-out; }
```

to:

```css
.world-drawer { width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--paper-raised); }
```

- [ ] **Step 6: Verify build**

Run: `cd web && npm run build`
Expected: exits 0.

- [ ] **Step 7: Manual browser check**

Run `npm run dev`, open World, place a landmark, edit two different existing landmarks concurrently, confirm both are independent floating windows. Stop the dev server after checking.

- [ ] **Step 8: Run full e2e suite for this pane (there's no dedicated world e2e file today — confirm no other spec references the old class)**

Run: `grep -rn "world-drawer-backdrop" e2e/`
Expected: no matches.

- [ ] **Step 9: Commit**

```bash
git add web/src/panes/WorldPane.tsx web/src/styles/app.css
git commit -m "$(cat <<'EOF'
feat: migrate World drawer to FloatingDrawer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```

---

### Task 9: Migrate `PlotPane`

**Files:**
- Modify: `web/src/panes/PlotPane.tsx`
- Modify: `web/src/styles/app.css` (remove dead `.plot-drawer-backdrop`)

- [ ] **Step 1: Change drawer state to a Map**

Replace line 144 (`const [drawer, setDrawer] = useState<{ node?: PlotNode; point: Point } | null>(null);`) with:

```ts
  const [drawers, setDrawers] = useState<Map<string, { node?: PlotNode; point: Point }>>(new Map());
  const openDrawer = (value: { node?: PlotNode; point: Point }) =>
    setDrawers((current) => new Map(current).set(value.node?.id ?? 'new', value));
  const closeDrawer = (key: string) => setDrawers((current) => { const next = new Map(current); next.delete(key); return next; });
```

Add the import:

```ts
import { FloatingDrawer } from '../components/FloatingDrawer';
```

- [ ] **Step 2: Update every `setDrawer(...)` call site to `openDrawer(...)`**

Lines 269, 310, 325 call `setDrawer({...})` — change each to `openDrawer({...})`.

- [ ] **Step 3: Update the render call site**

Replace line 328:

```tsx
      {drawer && <PlotDrawer node={drawer.node} point={drawer.point} worldEntities={worldEntities} onClose={() => setDrawer(null)} onSaved={(node) => { setSelectedId(node.id); setExpanded((current) => new Set(current).add(node.id)); setDrawer(null); }} />}
```

with:

```tsx
      {[...drawers.entries()].map(([key, value]) => (
        <FloatingDrawer key={key} id={`plot:${key}`} paneType="plot" title={value.node ? `Revise ${value.node.title}` : 'Add plot beat'} onClose={() => closeDrawer(key)}>
          <PlotDrawer
            node={value.node}
            point={value.point}
            worldEntities={worldEntities}
            onClose={() => closeDrawer(key)}
            onSaved={(node) => { setSelectedId(node.id); setExpanded((current) => new Set(current).add(node.id)); closeDrawer(key); }}
          />
        </FloatingDrawer>
      ))}
```

- [ ] **Step 4: Strip `PlotDrawer`'s own backdrop/Escape handling**

Replace the `useEffect` (lines 64-69):

```ts
  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [uploadingImages, onClose]);
```

with:

```ts
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
```

Replace the outer wrapper (line 89 and its matching closer) — change:

```tsx
    <div className="plot-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <form className="plot-drawer" onSubmit={save}>
```

to:

```tsx
    <form className="plot-drawer" onSubmit={save}>
```

and its closing `</form></div>` to `</form>`.

- [ ] **Step 5: CSS cleanup**

Remove line 968 (`.plot-drawer-backdrop { ... }`), change line 969 from:

```css
.plot-drawer { width: min(610px, 95%); height: 100%; display: flex; flex-direction: column; background: var(--paper-raised); box-shadow: -14px 0 42px rgba(47,59,68,.18); animation: drawer-in .2s ease-out; }
```

to:

```css
.plot-drawer { width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--paper-raised); }
```

- [ ] **Step 6: Verify build**

Run: `cd web && npm run build`
Expected: exits 0.

- [ ] **Step 7: Manual browser check**

Run `npm run dev`, open Plot, add a beat, edit two existing beats concurrently, confirm independence. Stop the dev server after checking.

- [ ] **Step 8: Confirm no e2e references the removed class**

Run: `grep -rn "plot-drawer-backdrop" e2e/`
Expected: no matches.

- [ ] **Step 9: Commit**

```bash
git add web/src/panes/PlotPane.tsx web/src/styles/app.css
git commit -m "$(cat <<'EOF'
feat: migrate Plot drawer to FloatingDrawer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```

---

### Task 10: Migrate `ThemesPane`

**Files:**
- Modify: `web/src/panes/ThemesPane.tsx`
- Modify: `web/src/styles/app.css` (remove dead `.theme-drawer-backdrop`/shared `.story-drawer-backdrop` usage for this pane)
- Test: `e2e/themes.spec.ts` (existing — verify/adjust selectors)

- [ ] **Step 1: Change drawer state to a Map**

Replace line 117 (`const [drawer, setDrawer] = useState<SceneTheme | 'new' | null>(null);`) with:

```ts
  const [drawers, setDrawers] = useState<Map<string, SceneTheme | 'new'>>(new Map());
  const openDrawer = (key: string, value: SceneTheme | 'new') => setDrawers((current) => new Map(current).set(key, value));
  const closeDrawer = (key: string) => setDrawers((current) => { const next = new Map(current); next.delete(key); return next; });
```

Add the import:

```ts
import { FloatingDrawer } from '../components/FloatingDrawer';
```

- [ ] **Step 2: Update call sites**

Line 153 and 166 (`setDrawer('new')`) → `openDrawer('new', 'new')`.
Line 176 (`setDrawer(theme)`) → `openDrawer(theme.id, theme)`.

- [ ] **Step 3: Update the render call site**

Replace line 190:

```tsx
      {drawer && <ThemeDrawer theme={drawer === 'new' ? undefined : drawer} onClose={() => setDrawer(null)} />}
```

with:

```tsx
      {[...drawers.entries()].map(([key, value]) => (
        <FloatingDrawer key={key} id={`themes:${key}`} paneType="themes" title={value === 'new' ? 'Add theme' : `Revise ${value.name}`} onClose={() => closeDrawer(key)}>
          <ThemeDrawer theme={value === 'new' ? undefined : value} onClose={() => closeDrawer(key)} />
        </FloatingDrawer>
      ))}
```

- [ ] **Step 4: Strip `ThemeDrawer`'s own backdrop/Escape handling**

Replace the `useEffect` (lines 51-58):

```ts
  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);
```

with:

```ts
  useEffect(() => {
    first.current?.focus();
  }, []);
```

Replace the outer wrapper (line 90 and its matching closer near line 111) — change:

```tsx
    <div className="story-drawer-backdrop theme-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className="story-drawer theme-drawer" role="dialog" aria-modal="true" aria-labelledby="theme-drawer-title" onSubmit={save}>
```

to:

```tsx
    <form className="story-drawer theme-drawer" role="dialog" aria-labelledby="theme-drawer-title" onSubmit={save}>
```

(drop `aria-modal="true"` — it's no longer a modal) and its closing `</form></div>` to `</form>`.

- [ ] **Step 5: CSS cleanup**

`.story-drawer-backdrop` is shared by Themes, References, and Goals — don't delete it yet (References/Goals still use it until Tasks 11-12). Just confirm `.theme-drawer-backdrop`'s class name is no longer referenced anywhere: `grep -n "theme-drawer-backdrop" web/src/styles/app.css` — if it appears only as part of the combined selector removed in Step 4 (no standalone CSS rule keyed on it), no CSS file change is needed for this task.

- [ ] **Step 6: Verify build**

Run: `cd web && npm run build`
Expected: exits 0.

- [ ] **Step 7: Update the existing themes e2e test if it targets removed markup**

Run: `grep -n "story-drawer-backdrop\|theme-drawer" e2e/themes.spec.ts`
If any selector targets the backdrop div directly (rather than a role/label), update it to target `.floating-drawer` instead. If it only uses `getByRole`/`getByLabel` (check the file), no change needed.

- [ ] **Step 8: Run the existing themes e2e suite**

Run: `npx playwright test themes.spec.ts`
Expected: all tests PASS (update any failing selector per Step 7, then re-run).

- [ ] **Step 9: Manual browser check**

Run `npm run dev`, open Themes, add a theme, edit two different existing themes concurrently. Stop the dev server after checking.

- [ ] **Step 10: Commit**

```bash
git add web/src/panes/ThemesPane.tsx e2e/themes.spec.ts
git commit -m "$(cat <<'EOF'
feat: migrate Themes drawer to FloatingDrawer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```

---

### Task 11: Migrate `ReferencesPane`

**Files:**
- Modify: `web/src/panes/ReferencesPane.tsx`
- Test: `e2e/references.spec.ts` (existing — verify/adjust selectors)

- [ ] **Step 1: Change drawer state to a Map**

Replace line 136 (`const [drawer, setDrawer] = useState<StoryReference | 'new' | null>(null);`) with:

```ts
  const [drawers, setDrawers] = useState<Map<string, StoryReference | 'new'>>(new Map());
  const openDrawer = (key: string, value: StoryReference | 'new') => setDrawers((current) => new Map(current).set(key, value));
  const closeDrawer = (key: string) => setDrawers((current) => { const next = new Map(current); next.delete(key); return next; });
```

Add the import:

```ts
import { FloatingDrawer } from '../components/FloatingDrawer';
```

- [ ] **Step 2: Update call sites**

Lines 152, 155 (`setDrawer('new')`) → `openDrawer('new', 'new')`.
Line 158 (`setDrawer(item)`) → `openDrawer(item.id, item)`.

- [ ] **Step 3: Update the render call site**

Replace line 162:

```tsx
    {drawer && <ReferenceDrawer reference={drawer === 'new' ? undefined : drawer} options={options} onClose={() => setDrawer(null)} />}
```

with:

```tsx
    {[...drawers.entries()].map(([key, value]) => (
      <FloatingDrawer key={key} id={`references:${key}`} paneType="references" title={value === 'new' ? 'Pin reference' : `Revise ${value.title}`} onClose={() => closeDrawer(key)}>
        <ReferenceDrawer reference={value === 'new' ? undefined : value} options={options} onClose={() => closeDrawer(key)} />
      </FloatingDrawer>
    ))}
```

- [ ] **Step 4: Strip `ReferenceDrawer`'s own backdrop/Escape handling**

Replace the Escape `useEffect` (lines 46-50):

```ts
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose, busy]);
```

Delete this block entirely (keep the separate `useEffect(() => { titleRef.current?.focus(); }, [])` on line 45 unchanged).

Replace the outer wrapper (line 89 and its matching closer) — change:

```tsx
  return <div className="story-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="story-drawer reference-drawer" role="dialog" aria-modal="true" aria-labelledby="reference-drawer-title" onSubmit={submit}>
```

to:

```tsx
  return (
    <form className="story-drawer reference-drawer" role="dialog" aria-labelledby="reference-drawer-title" onSubmit={submit}>
```

and its closing `</form></div>;` to `</form>\n  );` (find the exact closing lines by reading the end of the `ReferenceDrawer` function before editing).

- [ ] **Step 5: Verify build**

Run: `cd web && npm run build`
Expected: exits 0.

- [ ] **Step 6: Check and update the existing e2e file**

Run: `grep -n "story-drawer-backdrop" e2e/references.spec.ts`
Update any direct backdrop-selector usage to `.floating-drawer`; if it only uses roles/labels, leave as-is.

- [ ] **Step 7: Run it**

Run: `npx playwright test references.spec.ts`
Expected: PASS.

- [ ] **Step 8: Manual browser check**

Run `npm run dev`, open References, pin a reference, edit two existing references concurrently. Stop the dev server after checking.

- [ ] **Step 9: Commit**

```bash
git add web/src/panes/ReferencesPane.tsx e2e/references.spec.ts
git commit -m "$(cat <<'EOF'
feat: migrate References drawer to FloatingDrawer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```

---

### Task 12: Migrate `GoalsPane`

**Files:**
- Modify: `web/src/panes/GoalsPane.tsx`
- Modify: `web/src/styles/app.css` (now safe to delete the shared `.story-drawer-backdrop` rule — Themes, References, and Goals were its only consumers and all three are migrated after this task)
- Test: `e2e/goals.spec.ts` (existing — verify/adjust selectors)

- [ ] **Step 1: Change drawer state to a Map**

Replace line 126 (`const [drawer, setDrawer] = useState<GoalMilestone | 'new' | null>(null);`) with:

```ts
  const [drawers, setDrawers] = useState<Map<string, GoalMilestone | 'new'>>(new Map());
  const openDrawer = (key: string, value: GoalMilestone | 'new') => setDrawers((current) => new Map(current).set(key, value));
  const closeDrawer = (key: string) => setDrawers((current) => { const next = new Map(current); next.delete(key); return next; });
```

Add the import:

```ts
import { FloatingDrawer } from '../components/FloatingDrawer';
```

- [ ] **Step 2: Update call sites**

Lines 207, 222 (`setDrawer('new')`) → `openDrawer('new', 'new')`.
Line 229 (`setDrawer(milestone)`) → `openDrawer(milestone.id, milestone)`.

- [ ] **Step 3: Update the render call site**

Replace line 242:

```tsx
      {drawer && <MilestoneDrawer milestone={drawer === 'new' ? undefined : drawer} onClose={() => setDrawer(null)} onSave={(draft) => saveMilestone(draft, drawer === 'new' ? undefined : drawer)} />}
```

with:

```tsx
      {[...drawers.entries()].map(([key, value]) => (
        <FloatingDrawer key={key} id={`goals:${key}`} paneType="goals" title={value === 'new' ? 'Add milestone' : `Revise ${value.title}`} onClose={() => closeDrawer(key)}>
          <MilestoneDrawer milestone={value === 'new' ? undefined : value} onClose={() => closeDrawer(key)} onSave={(draft) => saveMilestone(draft, value === 'new' ? undefined : value)} />
        </FloatingDrawer>
      ))}
```

- [ ] **Step 4: Strip `MilestoneDrawer`'s own backdrop/Escape handling**

Replace the `useEffect` (lines 70-77):

```ts
  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);
```

with:

```ts
  useEffect(() => {
    first.current?.focus();
  }, []);
```

Replace the outer wrapper (line 92 and its matching closer at line 113-114) — change:

```tsx
    <div className="story-drawer-backdrop goal-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className="story-drawer goal-drawer" role="dialog" aria-modal="true" aria-labelledby="goal-drawer-title" onSubmit={submit}>
```

to:

```tsx
    <form className="story-drawer goal-drawer" role="dialog" aria-labelledby="goal-drawer-title" onSubmit={submit}>
```

and:

```tsx
      </form>
    </div>
  );
```

to:

```tsx
    </form>
  );
```

- [ ] **Step 5: Delete the now-fully-dead shared backdrop CSS**

In `web/src/styles/app.css`, search for every rule keyed on `.story-drawer-backdrop` (there should be exactly the base rule plus pane-specific combinators like `.theme-drawer-backdrop`, `.goal-drawer-backdrop`). Confirm with:

Run: `grep -n "story-drawer-backdrop\|goal-drawer-backdrop" web/src/styles/app.css`

Delete every matched rule. Also check each of `.story-drawer`, `.theme-drawer`, `.goal-drawer`, `.reference-drawer` for a `height: 100%` + backdrop-relative sizing that assumed full-viewport-height docking — change any `height: 100%` on these to remain `height: 100%` (they should still fill the `FloatingDrawer`'s body, which is fine) but remove any leftover `animation: drawer-in` declarations on the backdrop-adjacent rule (the animation now lives on `.floating-drawer` from Task 4) if present.

- [ ] **Step 6: Verify build**

Run: `cd web && npm run build`
Expected: exits 0.

- [ ] **Step 7: Check and update the existing e2e file**

Run: `grep -n "story-drawer-backdrop\|goal-drawer-backdrop" e2e/goals.spec.ts`
Update any direct backdrop-selector usage to `.floating-drawer`; if it only uses roles/labels (it does, per the file read earlier in this session), no change needed.

- [ ] **Step 8: Run it**

Run: `npx playwright test goals.spec.ts`
Expected: PASS.

- [ ] **Step 9: Manual browser check**

Run `npm run dev`, open Goals, add a milestone, edit two existing milestones concurrently. Stop the dev server after checking.

- [ ] **Step 10: Commit**

```bash
git add web/src/panes/GoalsPane.tsx web/src/styles/app.css
git commit -m "$(cat <<'EOF'
feat: migrate Goals drawer to FloatingDrawer, remove dead shared backdrop CSS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```

---

### Task 13: Cross-pane concurrency integration test + full regression pass

**Files:**
- Test: `e2e/floating-drawers-cross-pane.spec.ts` (new)

**Interfaces:**
- Consumes: everything from Tasks 1-12. This task adds no production code — it validates the whole system end-to-end and closes out the plan.

- [ ] **Step 1: Write the cross-pane concurrency test**

```ts
// e2e/floating-drawers-cross-pane.spec.ts
import { test, expect, openTool } from './fixtures';

test('a scene drawer and a character drawer can be open, docked, and recalled independently', async ({ page, projectId }) => {
  await openTool(page, 'Scenes');
  await page.getByRole('button', { name: '+ Add scene', exact: true }).click();
  await page.getByRole('textbox', { name: /Scene title/i }).fill('The trial begins');

  await openTool(page, 'Characters');
  await page.getByRole('button', { name: 'Add character' }).click();
  await page.getByPlaceholder('Character name').fill('Kiala');

  await expect(page.locator('.floating-drawer')).toHaveCount(2);

  await page.keyboard.press('Alt+1');
  await expect(page.locator('.floating-panel-tab')).toHaveCount(1);

  await page.keyboard.press('Alt+2');
  await expect(page.locator('.floating-panel-tab')).toHaveCount(0);
  await expect(page.locator('.floating-drawer')).toHaveCount(2);

  await expect(page.getByRole('textbox', { name: /Scene title/i })).toHaveValue('The trial begins');
  await expect(page.getByPlaceholder('Character name')).toHaveValue('Kiala');
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test floating-drawers-cross-pane.spec.ts`
Expected: PASS.

- [ ] **Step 3: Run the full test suite (unit + e2e) as final regression check**

Run: `npm test` (server unit tests), `cd web && node --import tsx --test test/*.test.ts` (web unit tests), `npx playwright test` (full e2e suite, from repo root).
Expected: everything passes.

- [ ] **Step 4: Final build check**

Run: `cd web && npm run build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add e2e/floating-drawers-cross-pane.spec.ts
git commit -m "$(cat <<'EOF'
test: add cross-pane floating drawer concurrency e2e coverage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhVcbvsF4NYiSnrGFDg2s9
EOF
)"
```
