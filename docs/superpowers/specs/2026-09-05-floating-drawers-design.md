# Floating drawer system + scene board UI fixes

Date: 2026-09-05
Status: Approved for planning

## Problem

Three related UI gaps in the workspace canvas:

1. **Scene Board can't be resized** beyond the existing minimize/maximize/close
   toggle on pane chrome (`web/src/components/WorkspaceCanvas.tsx:63-89`).
2. **The "Story material" left rail in Scenes can't collapse**
   (`web/src/panes/ScenesPane.tsx:133-138`), wasting width when not dragging
   assets into scenes.
3. **Every "add/edit object" drawer is a full-screen modal, one at a time.**
   Seven panes (Scenes, Characters, World, Plot, Themes, References, Goals)
   each implement their own `*-drawer-backdrop` + slide-in panel, docked to
   the right edge, full height, closes on Escape or backdrop click. A writer
   who wants to add a character and a location in the same pass has to
   finish and close one before starting the other, and can't reposition the
   panel to see the canvas behind it.

## Goals

- Scene Board (and by extension any pane) gets a drag-resize handle in
  normal (non-maximized) size mode, in addition to the existing maximize
  toggle.
- The Scenes "Story material" rail can be collapsed/expanded, reclaiming
  its width for the board.
- Add/edit drawers across all seven panes become independent floating
  windows: draggable via a handle, multiple can be open concurrently, each
  can be sent to a collapsed tab strip on the right edge and recalled,
  without losing typed form state.

## Non-goals

- No change to any pane's save/validation/business logic — only the chrome
  around existing drawer content.
- No persistence of floating panel position/open-state across a page
  reload (in-memory only, like the existing `panes` sizeMode).
- No opening a *new* drawer via hotkey — Alt+1-9 only recalls drawers that
  are already open and docked.

## Design

### 1. Pane resize handle (Scene Board + generalized)

`PaneFrame` (`WorkspaceCanvas.tsx:63`) gains a drag handle on its bottom-right
corner, visible when `sizeMode === 'normal'`. Dragging it adjusts the pane's
explicit width/height (new optional `Pane.size?: { width: number; height:
number }`, defaulting to CSS-driven sizing when unset). Reuses the existing
`useDrag` helper (`WorkspaceCanvas.tsx:91-118`) pattern already used for the
region splitters. This is a generic pane capability, not scene-board-specific
— every pane benefits, satisfying the Scene Board ask.

### 2. Collapsible Story material rail

`ScenesPane` gets a local `railCollapsed` boolean (`useState`, not global
store — it's view-only UI state scoped to one pane instance). A toggle
button in the rail header collapses it to a thin strip (icon-only, ~40px)
via a CSS class swap (`scene-resource-rail.is-collapsed`), matching the
existing responsive collapse behavior already defined for narrow viewports
(`app.css:1440-1443`) but user-triggered instead of media-query-triggered.

### 3. Floating drawer system

**State** — new store slice, `floatingPanels: FloatingPanel[]`:

```ts
interface FloatingPanel {
  id: string;            // e.g. "scenes:new" or "characters:c_42" — caller-chosen, stable per logical drawer
  paneType: PaneType;
  title: string;
  x: number; y: number;   // top-left, px, viewport-relative
  width: number; height: number;
  docked: boolean;        // true = collapsed to right-edge tab strip
  slot: number | null;    // Alt+1-9 recall slot; assigned on open, freed on close
}
```

Store actions:
- `openFloatingPanel({ id, paneType, title, width?, height? })` — no-ops
  (just focuses) if `id` already exists; otherwise creates it, computes an
  initial centered-ish resting position offset by existing open-panel count
  (so stacked opens cascade instead of overlapping exactly), and assigns the
  lowest free slot 1-9 (or `null` if all nine are taken).
- `closeFloatingPanel(id)` — removes it, frees its slot.
- `dockFloatingPanel(id)` — sets `docked: true`. Keeps the entry (and the
  pane's form state, since the pane component stays mounted — see below).
- `undockFloatingPanel(id)` — sets `docked: false`, brings to front.
- `moveFloatingPanel(id, x, y)` — updates position during drag.
- `focusFloatingPanel(id)` — reorders to front (z-index via array order).

**Why store, not local `useState`:** docking currently would unmount the
drawer (each pane's drawer only renders `{drawer && <Drawer .../>}`). Moving
open/docked state to the store, while the drawer's *content* stays a normal
child, lets `FloatingDrawer` keep its children mounted-but-hidden when
docked (`display:none` via CSS, not unmount), so typed input survives a
dock/recall cycle.

**Component** — new `web/src/components/FloatingDrawer.tsx`:

```tsx
function FloatingDrawer({ id, paneType, title, width, height, onClose, children }: {
  id: string; paneType: PaneType; title: string;
  width?: number; height?: number;
  onClose: () => void; // full close/discard — still owned by the calling pane
  children: React.ReactNode;
}): JSX.Element
```

- Calls `openFloatingPanel` on mount (via `useEffect`, keyed on `id`),
  `closeFloatingPanel` when the caller's `onClose` fires.
- Reads its own entry from `floatingPanels` by `id` for position/docked
  state.
- Renders two states from one mounted tree:
  - **Open**: fixed-position box at `(x, y)`, sized `width × height`
    (defaults ~560×640, matching current drawer proportions), header with a
    drag-handle (grip icon, full header mousedown/mousemove via the existing
    `useDrag` pattern → `moveFloatingPanel`), a dock button (`Icon.Minus`,
    tooltip "Send to side"), and the existing close `×` (`Icon.Close`) which
    calls the caller's `onClose`. Slides in from the right edge on first
    mount (reuse the `drawer-in` keyframe), resting at its computed position
    — not docked to the edge.
  - **Docked**: hidden (`display:none`) from its normal position; instead a
    tab renders in a single shared `FloatingPanelStrip` (see below).
- No full-screen dimming scrim, and no click-outside-to-close — with
  multiple concurrent floating windows a modal scrim no longer makes sense.
  Each pane's own "Cancel"/`×` remains the only explicit close.
- `Escape`, while a floating drawer has focus-within, calls `dockFloatingPanel`
  instead of closing (replaces each pane's current
  `if (event.key === 'Escape') onClose()` listener).
- Global `Alt+1..9` keydown (registered once, in `WorkspaceCanvas` or a new
  small provider) calls `undockFloatingPanel` + `focusFloatingPanel` for
  whichever panel holds that slot, if any.

**`FloatingPanelStrip`** — new small component rendered once at the
workspace root (sibling of `WorkspaceCanvas`'s panes), listing every
`floatingPanels` entry where `docked === true` as a vertical tab (title
text, slot number badge if assigned) fixed to the viewport's right edge.
Click a tab → `undockFloatingPanel` + `focusFloatingPanel`.

### 4. Migration (all seven panes)

For each of `ScenesPane`, `CharactersPane`, `WorldPane`, `PlotPane`,
`ThemesPane`, `ReferencesPane`, `GoalsPane`:

- Remove the pane's own `*-drawer-backdrop` wrapper div and its
  `drawer-in`-animation CSS usage (the shared component now owns entry
  animation).
- Remove the pane-local `Escape`-key `useEffect` (shared component owns
  this now).
- Wrap the existing drawer's inner content (unchanged form/save logic) in
  `<FloatingDrawer id={...} paneType="..." title={...} onClose={...}>`.
- `id` must be stable per logical drawer instance: for "new" drawers use a
  fixed sentinel like `"scenes:new"` (only one "new scene" drawer makes
  sense at a time — opening "new" again while one is already open/docked
  just refocuses it); for "edit" drawers use `` `${paneType}:${entity.id}` ``
  so editing two different characters opens two independent floating
  windows, but re-clicking edit on the same character refocuses the
  existing one instead of duplicating it.

### CSS

- New rules for `.floating-drawer` (position/box/header/handle), replacing
  the seven pane-specific `*-drawer` positioning rules (form-content rules
  inside each, e.g. `.scene-drawer-scroll`, stay untouched).
- New `.floating-panel-strip` + `.floating-panel-tab` for the docked strip.
- `.scene-resource-rail.is-collapsed` for the rail collapse.
- `.pane-resize-handle` for the new corner drag affordance.

## Addendum (2026-09-05): same-type multi-instance

Confirmed with Dennis: concurrency must work **within** a pane type too —
editing Character A and Character B at the same time, each independently
dockable/recallable — not just across pane types (a scene drawer + a
character drawer). This supersedes the earlier assumption that migration
is chrome-only.

Each of the 7 panes currently tracks its drawer in a single-value
`useState`, e.g. `const [drawer, setDrawer] = useState<Scene | 'new' |
null>(null)` (`ScenesPane.tsx:91`), `useState<CanonEntity | null |
undefined>` (`CharactersPane.tsx:248`), or `useState<{ entity?: CanonEntity;
point: Point } | null>` (`WorldPane.tsx:177`, `PlotPane.tsx:144`). Opening
a second item today replaces the first, unmounting its form.

**Change:** each pane's drawer state becomes a `Map<string, T>` keyed by a
stable id (`'new'` for the create-flow, or the entity/item id for edits):

```ts
const [drawers, setDrawers] = useState<Map<string, Scene | 'new'>>(new Map());
const openDrawer = (key: string, value: Scene | 'new') =>
  setDrawers((current) => new Map(current).set(key, value));
const closeDrawer = (key: string) =>
  setDrawers((current) => { const next = new Map(current); next.delete(key); return next; });
```

Opening the same key twice (e.g. clicking "Edit" on the same character
that's already open) just replaces that one entry — it doesn't duplicate a
window, matching the existing "re-focus, don't duplicate" rule for the
`FloatingDrawer` `id` prop. The render site changes from a single
conditional (`{drawer && <X .../>}`) to a `.map()` over `drawers.entries()`,
one `<FloatingDrawer>` per entry, each with its own `id`, e.g.
`` `characters:${key}` ``.

This does **not** change any save/validation/business logic (the `save`,
`onSaved`, field-parsing functions are unchanged) — it changes how many
drawer instances a pane can have mounted at once and how each is closed
(by key, not globally). The "Non-goals" bullet above ("only the chrome
around existing drawer content") is narrowed to: *no change to save,
validation, or data-shape logic* — the open/close state-tracking mechanism
is explicitly in scope.

## Testing

- Existing pane e2e tests that open/fill/save a drawer (scenes, characters,
  world, plot, themes, references, goals) must keep passing — the save
  path is unchanged, only chrome. Expect selector updates anywhere a test
  targets `.scene-drawer-backdrop` etc. directly rather than form fields.
- New coverage: open two different drawers concurrently (e.g. new scene +
  edit a character) and confirm both are independently visible/draggable;
  dock one via Escape, confirm its typed field value survives; Alt+1-9
  recalls the right one; drag-resize handle changes a pane's size and
  persists across a maximize/restore cycle within the session.
