# Idea-First Start and Card Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Intended executor:** Claude Opus 5.5 (`claude-opus-5-5`).

**Goal:** A new story starts from the writer's idea instead of a browser `prompt()`, and every floating card gets a placement menu (move to an edge, fill, arrange side by side).

**Architecture:** Two independent slices that share no code. Slice A adds an optional `idea` to project creation on the server and one `NewStoryForm` component used by both the boot screen and the Sidebar. Slice B adds pure geometry in `web/src/cardPlacement.ts`, one store action, and one menu component mounted in `FloatingDrawer`, which already hosts all seven floating editors, so every card inherits it.

**Tech Stack:** React 18, Zustand 5, Express server, `node:test` with `tsx`, Playwright. No new dependencies.

**Spec:** None. The design decisions are in "Design" below; treat that section as the spec.

## Design

**Slice A: idea-first start**

- The form asks one question first: "What's the idea?" (textarea, optional, max 1200 characters = `PREMISE_WORKING_MAX`). A second field, "Story name", is optional.
- Empty name: derive from the idea with `titleFromIdea`. Empty idea and empty name: `Untitled Story`.
- The idea is saved as `premise.working` and prepended to `notes/scratchpad.md` under `## The idea`. It is **never** written into `manuscript/chapter-01.md`: the manuscript is the writer's artifact.
- After creation the app opens as it does today, plus the Premise pane in the `right` region when an idea was given.
- Exact copy: heading `What's the idea?`; helper `A sentence is enough. You can change everything later.`; name label `Story name (optional)`; primary button `Start writing`; secondary button `Skip, just give me a page` (creates `Untitled Story` with no idea).

**Slice B: card placement**

- A "card" is a floating panel rendered by `FloatingDrawer`. Modal surfaces (`ConnectionsPanel`, `SavedDesks`, `SettingsModal`, `thread-popover`) are out of scope.
- Menu groups and items, in order. **Move:** `Left half`, `Right half`, `Top half`, `Bottom half`. **Fill and arrange:** `Fill desk`, `Side by side`.
- `Side by side` tiles every undocked card into equal columns, left to right in current stacking order.
- "Open in new window" from the reference screenshot is **not built**. A second browser window means a second store instance racing the draft journal and autosave, which the trust model forbids without cross-window locking. It is listed under Follow-ups.
- A card remembers its placement so the menu can show it as checked. Dragging or resizing by hand clears it.
- The menu is hidden for companion cards and at viewport widths of 700px or less.

## Global Constraints

- No new npm dependencies.
- No `window.prompt`, `window.confirm` or `window.alert` in new code.
- Server tests run with `npm test`. Web unit tests run with `node --import tsx --test web/test/*.test.ts`. Browser tests run with `npm run test:browser`.
- Follow the existing etched-glass tokens in `web/src/styles/tokens.css`; add no new colour values.
- Every new control has an accessible name; menus are keyboard operable and return focus to their trigger on close.
- Existing e2e fixtures call `POST /api/projects` with `{ name }` only; that request must keep working unchanged.

## Review Focus

1. Idea longer than 1200 characters pasted in: the form blocks submit and shows the count; the server truncates nothing silently and rejects with 400. (Task 1, Task 3)
2. Idea made only of whitespace or punctuation: name falls back to `Untitled Story`, premise stays empty. (Task 2)
3. Double click on `Start writing`: exactly one project is created. (Task 3)
4. Escape inside the open placement menu: the menu closes and the card stays open; it must not dock the card. (Task 6)
5. Viewport narrower than a snapped card after a window resize: the card stays fully on screen and its header controls stay reachable. (Task 4)

---

### Task 1: Server accepts an idea when creating a project

**Files:**
- Modify: `server/src/projects.ts:45-75` (`createProject`)
- Modify: `server/src/index.ts:317-320` (`POST /api/projects`)
- Test: `server/test/projects-idea.test.ts` (create; copy the env/import preamble from `server/test/binder.test.ts:1-20`)

**Interfaces:**
- Produces: `createProject(name: string, idea?: string): Promise<ProjectManifest>`; `POST /api/projects` body `{ name?: string; idea?: string }`, 400 with `{ error }` when `idea.length > PREMISE_WORKING_MAX`.

- [ ] **Step 1: Write the failing tests**

```ts
test('createProject stores the idea as the working premise and in the scratchpad', async () => {
  const project = await createProject(`Idea ${crypto.randomUUID()}`, 'A lighthouse keeper hears the sea answer back.');
  const dir = await projectDir(project.id);
  assert.equal((await readPremise(dir)).working, 'A lighthouse keeper hears the sea answer back.');
  const notes = await readDocument(project.id, 'notes');
  assert.ok(notes.content.startsWith('## The idea\n\nA lighthouse keeper hears the sea answer back.\n'));
  const chapter = await readDocument(project.id, 'chapter-01');
  assert.ok(!chapter.content.includes('lighthouse'));
});

test('createProject without an idea leaves the premise empty', async () => {
  const project = await createProject(`Plain ${crypto.randomUUID()}`);
  assert.equal((await readPremise(await projectDir(project.id))).working, '');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm -w server run test -- --test-name-pattern="createProject"`
Expected: FAIL, premise `working` is `''`.

- [ ] **Step 3: Implement**

In `createProject`, trim `idea`; when non-empty, prefix the scratchpad seed with `## The idea\n\n${idea}\n\n` and call `writePremise(dir, { working: idea })` after the directories exist. In the route, read `String(req.body?.idea ?? '').trim()`, respond 400 `{ error: 'Idea is longer than 1200 characters.' }` when over `PREMISE_WORKING_MAX`, otherwise pass it through.

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all server tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/projects.ts server/src/index.ts server/test/projects-idea.test.ts
git commit -m "feat: seed a new project's premise from the writer's idea"
```

---

### Task 2: Derive a story name from an idea

**Files:**
- Create: `web/src/startIdea.ts`
- Test: `web/test/start-idea.test.ts`

**Interfaces:**
- Produces: `IDEA_MAX = 1200`; `titleFromIdea(idea: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { IDEA_MAX, titleFromIdea } from '../src/startIdea.ts';

test('titleFromIdea keeps the first five words, title-cased, without trailing punctuation', () => {
  assert.equal(titleFromIdea('a lighthouse keeper hears the sea answer back.'), 'A Lighthouse Keeper Hears The');
  assert.equal(titleFromIdea('Oathbreaker!'), 'Oathbreaker');
});
test('titleFromIdea falls back when nothing usable is left', () => {
  assert.equal(titleFromIdea(''), 'Untitled Story');
  assert.equal(titleFromIdea('  …?!  '), 'Untitled Story');
});
test('titleFromIdea caps the name at 60 characters', () => {
  assert.ok(titleFromIdea('Supercalifragilistic '.repeat(8)).length <= 60);
});
test('IDEA_MAX matches the server premise limit', () => assert.equal(IDEA_MAX, 1200));
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test web/test/start-idea.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `titleFromIdea` and `IDEA_MAX` in `web/src/startIdea.ts`**

Split on whitespace, strip leading and trailing non-letter, non-digit characters per word (Unicode-aware, `\p{L}\p{N}`), drop empty words, take five, upper-case each first letter, join, slice to 60.

- [ ] **Step 4: Run to verify pass**

Run: `node --import tsx --test web/test/start-idea.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/startIdea.ts web/test/start-idea.test.ts
git commit -m "feat: derive a story name from its idea"
```

---

### Task 3: NewStoryForm replaces both name prompts

**Files:**
- Create: `web/src/components/NewStoryForm.tsx`
- Modify: `web/src/api.ts:110-111` (`createProject`)
- Modify: `web/src/store.ts` (`newProject` signature at line 72 and its implementation)
- Modify: `web/src/App.tsx:108-125` (boot screen)
- Modify: `web/src/components/Sidebar.tsx:275` (project menu "new" action)
- Modify: `web/src/styles/app.css` (form styles beside the existing `.boot` rules)
- Test: `e2e/new-story.spec.ts`

**Interfaces:**
- Consumes: `titleFromIdea`, `IDEA_MAX` (Task 2); `POST /api/projects { name, idea }` (Task 1).
- Produces: `api.createProject(name: string, idea?: string)`; store `newProject(name: string, idea?: string): Promise<void>`; `<NewStoryForm onDone?: () => void />`.

- [ ] **Step 1: Write the failing browser test**

```ts
import { test, expect } from './fixtures';

test('a new story starts from an idea, which becomes the working premise', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('button', { name: 'New Project' }).click();
  const form = page.getByRole('dialog', { name: 'New story' });
  await expect(form.getByRole('heading', { name: "What's the idea?" })).toBeVisible();
  await form.getByLabel("What's the idea?").fill('a lighthouse keeper hears the sea answer back.');
  await expect(form.getByLabel('Story name (optional)')).toHaveAttribute('placeholder', 'A Lighthouse Keeper Hears The');
  await form.getByRole('button', { name: 'Start writing' }).dblclick();
  await expect(page.getByRole('heading', { name: 'A Lighthouse Keeper Hears The', level: 1 })).toBeVisible();
  await expect(page.locator('.premise-workspace').getByRole('textbox', { name: 'Working premise' }))
    .toHaveValue('a lighthouse keeper hears the sea answer back.');
  await page.getByRole('button', { name: 'Project menu' }).click();
  await expect(page.getByRole('button', { name: 'A Lighthouse Keeper Hears The', exact: true })).toHaveCount(1);
});

test('an over-long idea cannot be submitted', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('button', { name: 'New Project' }).click();
  const form = page.getByRole('dialog', { name: 'New story' });
  await form.getByLabel("What's the idea?").fill('x'.repeat(1201));
  await expect(form.getByText('1201 / 1200')).toBeVisible();
  await expect(form.getByRole('button', { name: 'Start writing' })).toBeDisabled();
});
```

If the Sidebar's existing button is not named `New Project`, keep its current accessible name and adjust the test to match; do not rename it.

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test e2e/new-story.spec.ts`
Expected: FAIL, no dialog named `New story`.

- [ ] **Step 3: Extend `api.createProject` and store `newProject` with the optional `idea`**

After the project opens, when `idea` is non-empty call `openPane('premise', { title: 'Premise', region: 'right' })`.

- [ ] **Step 4: Build `NewStoryForm`**

A `<form>` with the copy from Design. Holds `idea`, `name`, `pending`. Name placeholder is `titleFromIdea(idea)`. Submit sends `name.trim() || titleFromIdea(idea)` and `idea.trim()`; a `pending` ref guards re-entry. Shows `{idea.length} / 1200` and disables submit above `IDEA_MAX`. Surfaces store `error` with `role="alert"`. Calls `onDone` after success.

- [ ] **Step 5: Mount it**

Boot screen: render `<NewStoryForm />` inline in place of the button, keeping `<ProjectBackups />` below. Sidebar: the project menu action opens the form inside a `role="dialog" aria-modal="true" aria-label="New story"` wrapper styled with the existing `.modal-backdrop` and `.modal` classes; Escape and backdrop click close it and return focus to the Project menu button.

- [ ] **Step 6: Run to verify pass**

Run: `npx playwright test e2e/new-story.spec.ts e2e/project-navigation.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/NewStoryForm.tsx web/src/api.ts web/src/store.ts web/src/App.tsx web/src/components/Sidebar.tsx web/src/styles/app.css e2e/new-story.spec.ts
git commit -m "feat: start a new story from its idea instead of a name prompt"
```

---

### Task 4: Placement geometry

**Files:**
- Create: `web/src/cardPlacement.ts`
- Test: `web/test/card-placement.test.ts`

**Interfaces:**
- Consumes: `WindowBounds`, `WorkspaceViewport` from `web/src/workspaceLayout.ts`.
- Produces:
  - `type CardPlacement = 'left' | 'right' | 'top' | 'bottom' | 'fill'`
  - `PLACEMENT_LABELS: Record<CardPlacement, string>` with the labels from Design
  - `placementBounds(placement: CardPlacement, viewport: WorkspaceViewport): WindowBounds`
  - `sideBySideBounds(count: number, viewport: WorkspaceViewport): WindowBounds[]`

Usable area: x from 8 to `viewport.width - gutter - 8` (gutter defaults to 48), y from 8 to `viewport.height - 8`. Halves split the usable area with an 8px gap. Minimum card size is 320 by 200, matching `fitWindow`; when a half would be smaller, return the minimum size clamped inside the usable area.

- [ ] **Step 1: Write the failing tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { placementBounds, sideBySideBounds } from '../src/cardPlacement.ts';

const viewport = { width: 1280, height: 800, gutter: 48 };

test('halves split the usable desk with an 8px gap', () => {
  assert.deepEqual(placementBounds('left', viewport), { x: 8, y: 8, width: 604, height: 784 });
  assert.deepEqual(placementBounds('right', viewport), { x: 620, y: 8, width: 604, height: 784 });
  assert.deepEqual(placementBounds('top', viewport), { x: 8, y: 8, width: 1216, height: 388 });
  assert.deepEqual(placementBounds('bottom', viewport), { x: 8, y: 404, width: 1216, height: 388 });
});
test('fill covers the usable desk and leaves the recall gutter free', () => {
  assert.deepEqual(placementBounds('fill', viewport), { x: 8, y: 8, width: 1216, height: 784 });
});
test('a narrow viewport never pushes a card off screen', () => {
  const small = { width: 500, height: 400, gutter: 48 };
  for (const placement of ['left', 'right', 'top', 'bottom', 'fill'] as const) {
    const b = placementBounds(placement, small);
    assert.ok(b.x >= 8 && b.y >= 8 && b.x + b.width <= 500 - 48 && b.y + b.height <= 400 - 8, placement);
  }
});
test('side by side tiles equal columns left to right', () => {
  const [a, b, c] = sideBySideBounds(3, viewport);
  assert.equal(a.x, 8);
  assert.equal(a.width, b.width);
  assert.equal(b.x, a.x + a.width + 8);
  assert.equal(c.x + c.width, 1224);
  assert.deepEqual(sideBySideBounds(0, viewport), []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test web/test/card-placement.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement both functions in `web/src/cardPlacement.ts`**

Floor all divisions. When the viewport is too small for the 320 by 200 minimum, shrink to the usable area rather than overflowing (the third test pins this).

- [ ] **Step 4: Run to verify pass**

Run: `node --import tsx --test web/test/card-placement.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/cardPlacement.ts web/test/card-placement.test.ts
git commit -m "feat: add placement geometry for floating cards"
```

---

### Task 5: Store remembers and applies a card's placement

**Files:**
- Modify: `web/src/types.ts:410-420` (`FloatingPanel`)
- Modify: `web/src/store.ts` (state type near line 98; `moveFloatingPanel`, `resizeFloatingPanel` implementations)
- Test: `web/test/floating-panels.test.ts` (extend; follow the file's existing setup)

**Interfaces:**
- Consumes: `CardPlacement`, `placementBounds`, `sideBySideBounds` (Task 4).
- Produces:
  - `FloatingPanel.placement?: CardPlacement | 'side-by-side'`
  - `placeFloatingPanel(id: string, placement: CardPlacement, viewport: WorkspaceViewport): void`
  - `arrangeFloatingPanels(viewport: WorkspaceViewport): void`

- [ ] **Step 1: Write the failing tests**

Add three tests to `web/test/floating-panels.test.ts`, with these assertions:
1. `placeFloatingPanel(id, 'right', viewport)` sets the panel's `x`, `y`, `width`, `height` to `placementBounds('right', viewport)` and `placement` to `'right'`.
2. After that, `moveFloatingPanel(id, 40, 40)` leaves `placement` `undefined`; the same holds for `resizeFloatingPanel`.
3. With three panels where the second is docked, `arrangeFloatingPanels(viewport)` gives the two undocked panels the bounds from `sideBySideBounds(2, viewport)` in stacking order with `placement === 'side-by-side'`, and leaves the docked panel's bounds unchanged.

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test web/test/floating-panels.test.ts`
Expected: FAIL, `placeFloatingPanel` is not a function.

- [ ] **Step 3: Implement the two actions; clear `placement` in the move and resize actions**

Both new actions also raise the affected panels the same way `focusFloatingPanel` does.

- [ ] **Step 4: Run to verify pass**

Run: `node --import tsx --test web/test/*.test.ts`
Expected: all web unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/types.ts web/src/store.ts web/test/floating-panels.test.ts
git commit -m "feat: place and arrange floating cards from the store"
```

---

### Task 6: Placement menu on every card

**Files:**
- Create: `web/src/components/CardPlacementMenu.tsx`
- Modify: `web/src/components/FloatingDrawer.tsx:72-86` (header)
- Modify: `web/src/components/icons.tsx` (six glyphs)
- Modify: `web/src/styles/floating-editors.css`
- Test: `e2e/card-placement.spec.ts`

**Interfaces:**
- Consumes: `placeFloatingPanel`, `arrangeFloatingPanels` (Task 5); `PLACEMENT_LABELS` (Task 4); the `viewport` and `gutter` values `FloatingDrawer` already computes.
- Produces: `<CardPlacementMenu panel={panel} viewport={{ ...viewport, gutter }} />`.

- [ ] **Step 1: Write the failing browser test**

Open a card the way `e2e/floating-editors.spec.ts` opens its first editor, then:

```ts
const card = page.locator('.floating-drawer').first();
const trigger = card.getByRole('button', { name: /^Arrange / });
await trigger.click();
const menu = page.getByRole('menu', { name: 'Card placement' });
await expect(menu.getByRole('group', { name: 'Move' }).getByRole('menuitemradio')).toHaveCount(4);
await expect(menu.getByRole('group', { name: 'Fill and arrange' }).getByRole('menuitemradio')).toHaveCount(2);

await menu.getByRole('menuitemradio', { name: 'Right half' }).click();
await expect(menu).toBeHidden();
const view = page.viewportSize()!;
const box = (await card.boundingBox())!;
expect(box.x).toBeGreaterThan(view.width / 2 - 40);
expect(box.height).toBeGreaterThan(view.height - 40);

await trigger.click();
await expect(menu.getByRole('menuitemradio', { name: 'Right half' })).toHaveAttribute('aria-checked', 'true');
await page.keyboard.press('Escape');
await expect(menu).toBeHidden();
await expect(card).toBeVisible();          // Escape closed the menu, not the card
await expect(trigger).toBeFocused();
```

Add a second test at `page.setViewportSize({ width: 600, height: 800 })` asserting the `Arrange` trigger has count 0.

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test e2e/card-placement.spec.ts`
Expected: FAIL, no button matching `Arrange`.

- [ ] **Step 3: Build `CardPlacementMenu`**

Trigger: `<button className="floating-drawer-dock" aria-label={`Arrange ${panel.title}`} aria-haspopup="menu" aria-expanded>`. Popover: `role="menu" aria-label="Card placement"`, two `role="group"` blocks labelled `Move` and `Fill and arrange`, items `role="menuitemradio"` with `aria-checked` from `panel.placement` and `aria-label` from `PLACEMENT_LABELS` (`Side by side` for the arrange item). Icon-only items, 36px square, laid out in a row like the reference screenshot. Arrow keys move between items, Enter and Space select, Escape closes with `stopPropagation()` so the drawer's own Escape handler does not dock the card, outside pointer-down closes. Selecting calls the store action, closes, and returns focus to the trigger.

- [ ] **Step 4: Mount it in the `FloatingDrawer` header**

Place it immediately before the existing dock button, rendered only when `!companion`. Hide it with a `max-width: 700px` media query in `floating-editors.css`.

- [ ] **Step 5: Run to verify pass**

Run: `npx playwright test e2e/card-placement.spec.ts e2e/floating-editors.spec.ts e2e/floating-save-races.spec.ts e2e/shortcut-guards.spec.ts`
Expected: PASS.

- [ ] **Step 6: Full verification**

Run: `npm test && node --import tsx --test web/test/*.test.ts && npm run build && npm run test:browser`
Expected: all pass, build clean.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/CardPlacementMenu.tsx web/src/components/FloatingDrawer.tsx web/src/components/icons.tsx web/src/styles/floating-editors.css e2e/card-placement.spec.ts
git commit -m "feat: give every floating card a placement menu"
```

---

## Follow-ups (not in this plan)

- **Open in new window.** Needs a standalone card route plus cross-window locking of the draft journal and autosave. Write a spec first.
- Placement menu for workspace panes (`WorkspaceCanvas`), which already have float, maximise and park controls of their own.
- Replace the remaining seven native `prompt`/`confirm` calls.
