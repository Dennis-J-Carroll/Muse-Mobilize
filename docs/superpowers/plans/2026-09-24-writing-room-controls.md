# Writing-room Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add adjustable page width, a focus-mode toggle key that keeps your place, one-key desk switching, an opt-in Space/Enter selection guard, and a themed shortcut legend to the Muse Mobilize manuscript card, without changing any default behavior.

**Architecture:** All work is client-side in `web/src`. Presentation preferences extend the existing `useWritingView` zustand store (per-device `localStorage` preferences). A new pure `shortcuts.ts` module is the single source for key matching and for the legend. Saved desks move from component state into a small shared zustand store (`deskList.ts`) so the Desks dialog, the switcher and the key handler read one list. No server or project-file changes.

**Tech Stack:** React 18, TypeScript 5.7, zustand 5, Vite 6. Unit tests: `node:test` via `node --import tsx --test web/test/*.test.ts`. Browser tests: Playwright 1.62 on the isolated server `e2e/server.mts` (ports 5277/5278, temp directory, mock provider).

**Spec:** `docs/superpowers/specs/2026-09-24-writing-room-controls-design.md`

## Global Constraints

- Nothing that exists today may change behavior unless the writer opts in. Defaults stay as they are.
- Saved desks stay per-device in `localStorage` under `muse:desks:v1:<projectId>`; not moved into the project folder.
- New shortcuts: Alt+Shift+F (focus), Alt+Shift+1…9 (desk N), Alt+Shift+0 (previous arrangement), Alt+Shift+D (desk switcher), Alt+Shift+/ (legend). Match on `event.code`. Ignore when composing, `defaultPrevented`, or Ctrl/Meta held.
- Width presets: Narrow 60ch, Book 68ch, Standard 72ch, Wide 90ch, Full. Slider 45–120ch step 1. Preference key `muse:writing-measure`. Full maps to `100%`, never `0`.
- Default measure stays 72ch on glass and 68ch on paper; horizontal padding floors stay 28px (glass) and 24px (paper). Narrow-container (`materials.css:184`) and phone (`mobile.css:98`) rules keep precedence.
- Selection guard is off by default (preference `muse:guard-selection`); threshold: selection of more than 5 words; behavior: block Space/Enter, keep selection, show "Selection kept — press Delete or Backspace to remove it."
- Legend visuals use existing tokens only: `--accent`, `--glass-face`, `--glass-overlay`, `--shadow-float`, `--r-md`, `--r-lg`, `--ink`, `--ink-mid`, `--line-strong`.
- No server or project-file changes. `~/MuseProjects` is never touched by tests.

## Review Focus

1. A desk shortcut pressed while typing a desk name or a card form field → the keystroke types normally and no desk restores. (Task 6 test.)
2. Alt+Shift+1 pressed when fewer desks exist than the number → nothing happens, no error. (Task 6 test.)
3. A stored preference that is garbage (`muse:writing-measure = "abc"` or `"999"`) → default width, no crash. (Task 2 unit test.)
4. Alt+Shift+0 after switching projects → does nothing (the slot was cleared), never restores another project's panes. (Task 5 unit test.)
5. Alt+Shift+F with no manuscript card open (only notes) → nothing happens. (Task 4 test.)

---

### Task 0: Branch and test environment

**Files:**
- Modify: `playwright.config.ts` (one line)

- [ ] **Step 1: Confirm Dennis's uncommitted work is committed or stashed.** Run `git -C ~/Desktop/creative/Muse-Mobilize status --short`. If anything other than the new spec/plan files is modified, stop and ask Dennis to commit or stash it (it belongs to `feat/workspace-sources-export`). Do not commit or stash it yourself.

- [ ] **Step 2: Create the branch from the current HEAD**

```bash
cd ~/Desktop/creative/Muse-Mobilize
git switch -c feat/writing-room-controls
```

- [ ] **Step 3: Let Playwright use the installed Chrome.** Playwright's bundled Chromium is not installed on this machine. Downloading it needs Dennis's approval, so use the system Chrome by environment variable instead. In `playwright.config.ts`, change the projects line to:

```ts
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) } }],
```

- [ ] **Step 4: Verify the baseline**

Run: `PW_CHANNEL=chrome npx playwright test e2e/writing-focus.spec.ts e2e/saved-desks.spec.ts --reporter=list`
Expected: all pass.
Run: `node --import tsx --test web/test/*.test.ts`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts docs/superpowers/specs/2026-09-24-writing-room-controls-design.md docs/superpowers/plans/2026-09-24-writing-room-controls.md
git commit -m "chore: plan writing-room controls; allow PW_CHANNEL for local Chrome"
```

---

### Task 1: Shortcut registry and matcher

**Files:**
- Create: `web/src/shortcuts.ts`
- Test: `web/test/shortcuts.test.ts`

**Interfaces:**
- Produces: `SHORTCUTS: readonly Shortcut[]`, `type ShortcutAction`, `matchShortcut(event: KeyLike): ShortcutAction | null`, `shortcutBlocked(target: EventTarget | null): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// web/test/shortcuts.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { matchShortcut, SHORTCUTS } from '../src/shortcuts.ts';

const key = (code: string, extra: Partial<Parameters<typeof matchShortcut>[0]> = {}) =>
  ({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, code, ...extra });

test('Alt+Shift combinations map to actions by physical key', () => {
  assert.deepEqual(matchShortcut(key('KeyF')), { kind: 'focus-toggle' });
  assert.deepEqual(matchShortcut(key('KeyD')), { kind: 'desk-switcher' });
  assert.deepEqual(matchShortcut(key('Slash')), { kind: 'legend' });
  assert.deepEqual(matchShortcut(key('Digit0')), { kind: 'desk-previous' });
  assert.deepEqual(matchShortcut(key('Digit1')), { kind: 'desk', index: 0 });
  assert.deepEqual(matchShortcut(key('Digit9')), { kind: 'desk', index: 8 });
});

test('other modifiers, composition and handled events never match', () => {
  assert.equal(matchShortcut(key('KeyF', { shiftKey: false })), null);
  assert.equal(matchShortcut(key('Digit1', { shiftKey: false })), null); // Alt+1 is floating-card recall
  assert.equal(matchShortcut(key('KeyF', { ctrlKey: true })), null);
  assert.equal(matchShortcut(key('KeyF', { metaKey: true })), null);
  assert.equal(matchShortcut(key('KeyF', { isComposing: true })), null);
  assert.equal(matchShortcut(key('KeyF', { defaultPrevented: true })), null);
  assert.equal(matchShortcut(key('KeyK')), null); // Story cards stay owned by App.tsx
});

test('registry lists every shortcut the legend must show, grouped', () => {
  const ids = SHORTCUTS.map((item) => item.id);
  for (const id of ['focus-toggle', 'focus-exit', 'undo', 'tag', 'story-cards', 'ask-muse', 'desk-n', 'desk-previous', 'desk-switcher', 'recall-card', 'legend']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(SHORTCUTS.every((item) => item.group === 'Writing' || item.group === 'Desks and cards'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test web/test/shortcuts.test.ts`
Expected: FAIL, cannot find module `../src/shortcuts.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// web/src/shortcuts.ts
/** One list feeds both the key handler and the shortcut legend, so they cannot drift. */
export type ShortcutGroup = 'Writing' | 'Desks and cards';
export interface Shortcut { id: string; keys: string; label: string; group: ShortcutGroup }

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'focus-toggle', keys: 'Alt Shift F', label: 'Enter or leave focus', group: 'Writing' },
  { id: 'focus-exit', keys: 'Esc', label: 'Leave focus', group: 'Writing' },
  { id: 'undo', keys: 'Ctrl Z / Ctrl Y', label: 'Undo / redo writing', group: 'Writing' },
  { id: 'tag', keys: 'type !#', label: 'Tag or link the word at the cursor', group: 'Writing' },
  { id: 'story-cards', keys: 'Alt Shift K', label: 'Story cards (in focus)', group: 'Writing' },
  { id: 'ask-muse', keys: 'Ctrl Enter', label: 'Send to Muse', group: 'Writing' },
  { id: 'desk-n', keys: 'Alt Shift 1–9', label: 'Open desk 1–9', group: 'Desks and cards' },
  { id: 'desk-previous', keys: 'Alt Shift 0', label: 'Back to previous arrangement', group: 'Desks and cards' },
  { id: 'desk-switcher', keys: 'Alt Shift D', label: 'Find a desk', group: 'Desks and cards' },
  { id: 'recall-card', keys: 'Alt 1–9', label: 'Recall a floating card', group: 'Desks and cards' },
  { id: 'legend', keys: 'Alt Shift /', label: 'Show these shortcuts', group: 'Desks and cards' },
];

export type ShortcutAction =
  | { kind: 'focus-toggle' } | { kind: 'desk'; index: number } | { kind: 'desk-previous' }
  | { kind: 'desk-switcher' } | { kind: 'legend' };

export interface KeyLike { altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; code: string; isComposing?: boolean; defaultPrevented?: boolean }

/** Physical keys (event.code) so layouts that turn Shift+digit into symbols still work. */
export function matchShortcut(event: KeyLike): ShortcutAction | null {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.isComposing || event.defaultPrevented) return null;
  if (event.code === 'KeyF') return { kind: 'focus-toggle' };
  if (event.code === 'KeyD') return { kind: 'desk-switcher' };
  if (event.code === 'Slash') return { kind: 'legend' };
  if (event.code === 'Digit0') return { kind: 'desk-previous' };
  const digit = /^Digit([1-9])$/.exec(event.code);
  return digit ? { kind: 'desk', index: Number(digit[1]) - 1 } : null;
}

/** Dialogs and card forms own their keys; the manuscript textarea does not block Alt+Shift shortcuts. */
export function shortcutBlocked(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  if (target.closest('[role="dialog"], .floating-drawer')) return true;
  return Boolean(target.closest('input, select, textarea')) && !target.matches('textarea.draft');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test web/test/shortcuts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/shortcuts.ts web/test/shortcuts.test.ts
git commit -m "feat: add shortcut registry and Alt+Shift matcher"
```

---

### Task 2: Page width preference, CSS variable and Width select

**Files:**
- Modify: `web/src/writingView.ts`
- Modify: `web/src/panes/EditorPane.tsx` (the `.editor-wrap` div around line 145 and the `.writing-appearance` selects around lines 151–160)
- Modify: `web/src/styles/app.css:263-267` (`.draft` padding)
- Modify: `web/src/styles/writing-page.css:28` (paper `.draft` padding)
- Test: `web/test/page-measure.test.ts`, `e2e/page-width.spec.ts`

**Interfaces:**
- Produces: `type Measure = number | 'full' | null`, `parseMeasure(raw: string | null): Measure`, `measureCss(measure: Measure): string | undefined`, `WIDTH_PRESETS`, and on `useWritingView`: `measure: Measure`, `setMeasure(measure: Measure): void`.

- [ ] **Step 1: Write the failing unit test**

```ts
// web/test/page-measure.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMeasure, measureCss } from '../src/writingView.ts';

test('stored measure parses to default, full or a whole number of ch in range', () => {
  assert.equal(parseMeasure(null), null);
  assert.equal(parseMeasure('full'), 'full');
  assert.equal(parseMeasure('90'), 90);
  assert.equal(parseMeasure('45'), 45);
  assert.equal(parseMeasure('120'), 120);
  for (const bad of ['abc', '999', '44', '121', '0', '72.5', '']) assert.equal(parseMeasure(bad), null, bad);
});

test('css value: default leaves the stylesheet fallback, full is 100%, never 0', () => {
  assert.equal(measureCss(null), undefined);
  assert.equal(measureCss('full'), '100%');
  assert.equal(measureCss(90), '90ch');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test web/test/page-measure.test.ts`
Expected: FAIL, `parseMeasure` is not exported.

- [ ] **Step 3: Implement the preference in `web/src/writingView.ts`**

Add above `useWritingView`:

```ts
export type Measure = number | 'full' | null;
export const WIDTH_PRESETS = [
  { value: 60, label: 'Narrow' }, { value: 68, label: 'Book' }, { value: 72, label: 'Standard' },
  { value: 90, label: 'Wide' },
] as const;
export const MEASURE_MIN = 45;
export const MEASURE_MAX = 120;
/** Browser storage is untrusted: anything unexpected falls back to today's default width. */
export function parseMeasure(raw: string | null): Measure {
  if (raw === 'full') return 'full';
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= MEASURE_MIN && value <= MEASURE_MAX ? value : null;
}
/** Full is 100%, never 0: a zero measure would give each side 50% padding. */
export const measureCss = (measure: Measure) => measure === null ? undefined : measure === 'full' ? '100%' : `${measure}ch`;
```

Add to the store's type: `measure: Measure; setMeasure: (measure: Measure) => void;` and to its body:

```ts
  measure: parseMeasure(readPreference('muse:writing-measure')),
  setMeasure: (measure) => {
    if (measure === null) { try { localStorage.removeItem('muse:writing-measure'); } catch { /* Keep session preference. */ } }
    else savePreference('muse:writing-measure', String(measure));
    set({ measure });
  },
```

- [ ] **Step 4: Run the unit test**

Run: `node --import tsx --test web/test/page-measure.test.ts`
Expected: PASS.

- [ ] **Step 5: CSS uses the variable with today's defaults**

In `web/src/styles/app.css`, `.draft` padding line becomes:

```css
  padding: 26px max(28px, calc((100% - var(--page-measure, 72ch)) / 2)) 40px;
```

In `web/src/styles/writing-page.css:28`, the paper rule's padding becomes:

```css
.writing-page[data-surface="paper"] .draft { padding: 32px max(24px, calc((100% - var(--page-measure, 68ch)) / 2)) 64px; font-size: 18px; line-height: 1.9; letter-spacing: .005em; }
```

Leave `materials.css:184` and `mobile.css:98` untouched; they come later in the cascade or inside narrower queries and keep precedence.

- [ ] **Step 6: Apply the variable and add the Width select in `EditorPane.tsx`**

Read the preference near the other `useWritingView` selectors:

```ts
  const measure = useWritingView((s) => s.measure);
```

On the `.editor-wrap` div, add a style only for manuscripts:

```tsx
    <div className={`editor-wrap ${isManuscript ? 'writing-page' : ''} ${quiet ? 'is-quiet' : ''}`} data-surface={isManuscript ? surface : undefined}
      style={isManuscript && measureCss(measure) ? { ['--page-measure' as string]: measureCss(measure) } : undefined}>
```

Inside `.writing-appearance`, after the weight select:

```tsx
          <select aria-label="Page width" value={measure === null ? 'default' : measure === 'full' ? 'full' : WIDTH_PRESETS.some((p) => p.value === measure) ? String(measure) : 'custom'}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'custom') return;
              useWritingView.getState().setMeasure(value === 'default' ? null : value === 'full' ? 'full' : Number(value));
            }}>
            <option value="default">Default width</option>
            {WIDTH_PRESETS.map((preset) => <option key={preset.value} value={String(preset.value)}>{preset.label} ({preset.value})</option>)}
            <option value="full">Full</option>
            {typeof measure === 'number' && !WIDTH_PRESETS.some((p) => p.value === measure) && <option value="custom">Custom ({measure})</option>}
          </select>
```

Import `measureCss, WIDTH_PRESETS` from `../writingView`.

- [ ] **Step 7: Write the browser test**

```ts
// e2e/page-width.spec.ts
import { test, expect } from './fixtures';

const column = (page: import('@playwright/test').Page) => page.locator('.pane-editor textarea.draft').evaluate((el: HTMLTextAreaElement) => {
  const style = getComputedStyle(el);
  return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
});

test('width presets change the text column, persist, and default stays unchanged', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  const standard = await column(page);
  await page.getByLabel('Page width').selectOption('90');
  const wide = await column(page);
  expect(wide).toBeGreaterThan(standard * 1.2);
  await page.getByLabel('Page width').selectOption('full');
  expect(await column(page)).toBeGreaterThan(1800);
  await page.getByLabel('Page width').selectOption('60');
  const narrow = await column(page);
  expect(narrow).toBeLessThan(standard);
  await page.reload();
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  await expect(page.getByLabel('Page width')).toHaveValue('60');
  expect(Math.abs((await column(page)) - narrow)).toBeLessThan(2);
  await page.getByLabel('Page width').selectOption('default');
  expect(Math.abs((await column(page)) - standard)).toBeLessThan(2);
});

test('garbage preference falls back to the default width', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.evaluate(() => localStorage.setItem('muse:writing-measure', 'abc'));
  await page.reload();
  await expect(page.getByLabel('Page width')).toHaveValue('default');
});
```

- [ ] **Step 8: Run browser tests**

Run: `PW_CHANNEL=chrome npx playwright test e2e/page-width.spec.ts e2e/writing-fonts.spec.ts e2e/writing-focus.spec.ts --reporter=list`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add web/src/writingView.ts web/src/panes/EditorPane.tsx web/src/styles/app.css web/src/styles/writing-page.css web/test/page-measure.test.ts e2e/page-width.spec.ts
git commit -m "feat: adjustable manuscript page width with presets"
```

---

### Task 3: Page popover (fine-tune slider and guard setting)

**Files:**
- Create: `web/src/components/PagePopover.tsx`
- Modify: `web/src/writingView.ts` (guard preference)
- Modify: `web/src/panes/EditorPane.tsx` (render the popover trigger after the Width select)
- Modify: `web/src/styles/writing-page.css` (append popover styles)
- Test: `e2e/page-width.spec.ts` (add a test)

**Interfaces:**
- Consumes: `Measure`, `MEASURE_MIN`, `MEASURE_MAX`, `setMeasure` (Task 2).
- Produces: on `useWritingView`: `guardSelection: boolean`, `setGuardSelection(on: boolean): void`. Component `PagePopover()`.

- [ ] **Step 1: Add the failing browser test** (append to `e2e/page-width.spec.ts`)

```ts
test('page popover slider sets a custom width and the guard setting persists', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.getByRole('button', { name: 'Page settings', exact: true }).click();
  const slider = page.getByLabel('Page width in characters');
  await slider.fill('83');
  await expect(page.getByLabel('Page width')).toHaveValue('custom');
  await expect(page.locator('option[value="custom"]')).toHaveText('Custom (83)');
  const guard = page.getByLabel('Protect selections from Space and Enter');
  await expect(guard).not.toBeChecked();
  await guard.check();
  await page.keyboard.press('Escape');
  await expect(slider).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Page settings', exact: true }).click();
  await expect(page.getByLabel('Page width in characters')).toHaveValue('83');
  await expect(page.getByLabel('Protect selections from Space and Enter')).toBeChecked();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PW_CHANNEL=chrome npx playwright test e2e/page-width.spec.ts -g "popover" --reporter=list`
Expected: FAIL, no button named "Page settings".

- [ ] **Step 3: Guard preference in `writingView.ts`**

Type: `guardSelection: boolean; setGuardSelection: (on: boolean) => void;` Body:

```ts
  guardSelection: readPreference('muse:guard-selection') === 'true',
  setGuardSelection: (guardSelection) => { savePreference('muse:guard-selection', String(guardSelection)); set({ guardSelection }); },
```

- [ ] **Step 4: Create `web/src/components/PagePopover.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { MEASURE_MAX, MEASURE_MIN, useWritingView } from '../writingView';

/** Fine-tune for the page. Room is left here for font size and line spacing later. */
export function PagePopover() {
  const measure = useWritingView((s) => s.measure);
  const guard = useWritingView((s) => s.guardSelection);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const value = typeof measure === 'number' ? measure : 72;
  return <div ref={root} className="page-popover-root" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" aria-label="Page settings" aria-expanded={open} aria-haspopup="dialog"
      onPointerDown={(event) => event.preventDefault()} onClick={() => setOpen(!open)}>Page</button>
    {open && <div className="page-popover" role="group" aria-label="Page settings">
      <label>Width <output>{measure === 'full' ? 'Full' : measure === null ? 'Default' : `${value} characters`}</output>
        <input type="range" aria-label="Page width in characters" min={MEASURE_MIN} max={MEASURE_MAX} step={1} value={value}
          onChange={(event) => useWritingView.getState().setMeasure(Number(event.target.value))} /></label>
      <button type="button" className="linkish" onClick={() => useWritingView.getState().setMeasure(null)}>Reset to default</button>
      <p className="page-popover-note">Applies on wider screens; phones and narrow cards keep their own margins.</p>
      <label className="page-popover-check"><input type="checkbox" checked={guard}
        onChange={(event) => useWritingView.getState().setGuardSelection(event.target.checked)} />
        Protect selections from Space and Enter</label>
    </div>}
  </div>;
}
```

- [ ] **Step 5: Render it in `EditorPane.tsx`** directly after the Page width select, inside `.writing-appearance`: `<PagePopover />`, importing from `../components/PagePopover`.

- [ ] **Step 6: Styles** (append to `web/src/styles/writing-page.css`)

```css
.page-popover-root { position: relative; }
.page-popover-root > button { min-height: 32px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--glass-face); font-size: 12px; color: var(--ink-mid); }
.page-popover { position: absolute; z-index: 620; top: calc(100% + 6px); left: 0; width: min(260px, 80vw); display: grid; gap: 10px; padding: 12px; border: 1px solid var(--glass-edge); border-radius: var(--r-md); background: var(--glass-overlay); box-shadow: var(--shadow-float); font-size: 12.5px; color: var(--ink); }
.page-popover label { display: grid; gap: 6px; }
.page-popover output { color: var(--ink-mid); }
.page-popover input[type="range"] { accent-color: var(--accent); }
.page-popover-note { margin: 0; color: var(--ink-soft); font-size: 11px; }
.page-popover-check { display: flex !important; align-items: center; gap: 8px; }
```

- [ ] **Step 7: Run tests**

Run: `PW_CHANNEL=chrome npx playwright test e2e/page-width.spec.ts --reporter=list`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/PagePopover.tsx web/src/writingView.ts web/src/panes/EditorPane.tsx web/src/styles/writing-page.css e2e/page-width.spec.ts
git commit -m "feat: page popover with width slider and selection-guard setting"
```

---

### Task 4: Focus toggle key and keep your place

**Files:**
- Create: `web/src/focusPlace.ts`
- Modify: `web/src/writingView.ts` (`focus` action, `lastWritingPaneId`)
- Modify: `web/src/panes/EditorPane.tsx` (record last writing pane on textarea focus; restore place after focus change)
- Create: `web/src/useShortcutKeys.ts` (global key handler; this task wires focus-toggle only)
- Modify: `web/src/components/WorkspaceToolbar.tsx` (mount the hook)
- Test: `e2e/focus-toggle.spec.ts`

**Interfaces:**
- Consumes: `matchShortcut`, `shortcutBlocked` (Task 1).
- Produces: `rememberPlaces(): void`, `restorePlace(paneId: string, el: HTMLTextAreaElement): void` in `focusPlace.ts`; `lastWritingPaneId: string | null`, `setLastWritingPane(id: string): void`, `toggleFocus(): void` on `useWritingView`; `useShortcutKeys(actions: ShortcutHandlers): void` with `interface ShortcutHandlers { desk?(index: number): void; deskPrevious?(): void; deskSwitcher?(): void; legend?(): void }`.

Note: the spec pins the target to `raisePane` order, but `raisePane` only orders floating cards. The target is therefore the manuscript textarea the writer last focused (`lastWritingPaneId`), falling back to the first open manuscript editor.

- [ ] **Step 1: Write the failing browser test**

```ts
// e2e/focus-toggle.spec.ts
import { test, expect } from './fixtures';

const long = Array.from({ length: 400 }, (_, i) => `Line ${i + 1} of the long chapter, steady and plain.`).join('\n');

test('Alt+Shift+F toggles focus and keeps caret and scroll position', async ({ page, request, projectId }) => {
  const { project } = await (await request.get(`/api/projects/${projectId}`)).json();
  const doc = project.documents.find((d: { kind: string }) => d.kind === 'manuscript');
  await request.put(`/api/projects/${projectId}/documents/${doc.id}`, { data: { content: long, log: false } });
  await page.reload();
  const draft = page.locator('.pane-editor textarea.draft');
  await expect(draft).toHaveValue(/Line 400/);
  const caret = long.indexOf('Line 200 ');
  await draft.evaluate((el: HTMLTextAreaElement, at: number) => { el.focus(); el.setSelectionRange(at, at + 8); el.scrollTop = el.scrollHeight * 0.5 - el.clientHeight / 2; }, caret);
  const fraction = () => draft.evaluate((el: HTMLTextAreaElement) => el.scrollTop / el.scrollHeight);
  const before = await fraction();
  await page.keyboard.press('Alt+Shift+F');
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toBeVisible();
  await page.waitForTimeout(100);
  expect(await draft.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([caret, caret + 8]);
  expect(Math.abs((await fraction()) - before)).toBeLessThan(0.02);
  await page.keyboard.press('Alt+Shift+F');
  await expect(page.getByRole('button', { name: 'Focus writing', exact: true })).toBeVisible();
  await page.waitForTimeout(100);
  expect(Math.abs((await fraction()) - before)).toBeLessThan(0.02);
  await expect(draft).toHaveValue(long);
});

test('Alt+Shift+F does nothing when no manuscript card is open', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.locator('section.pane-editor').getByTitle('Close', { exact: true }).click();
  await expect(page.locator('section.pane-editor')).toHaveCount(0);
  await page.keyboard.press('Alt+Shift+F');
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toHaveCount(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PW_CHANNEL=chrome npx playwright test e2e/focus-toggle.spec.ts --reporter=list`
Expected: FAIL on the first test (Alt+Shift+F does nothing yet). The second test may already pass; it pins behavior for later changes.

- [ ] **Step 3: Create `web/src/focusPlace.ts`**

```ts
/** Remember where the writer was before focus changes the textarea's width and height. */
interface Place { start: number; end: number; fraction: number }
const places = new Map<string, Place>();

export function rememberPlaces() {
  document.querySelectorAll<HTMLTextAreaElement>('textarea.draft').forEach((el) => {
    const pane = el.closest('[id^="workspace-"]');
    if (!pane) return;
    places.set(pane.id.slice('workspace-'.length), { start: el.selectionStart, end: el.selectionEnd, fraction: el.scrollHeight ? el.scrollTop / el.scrollHeight : 0 });
  });
}

/** Document fraction survives rewrapping better than pixel offsets when the column width changes. */
export function restorePlace(paneId: string, el: HTMLTextAreaElement) {
  const place = places.get(paneId);
  if (!place) return;
  places.delete(paneId);
  if (el.selectionStart !== place.start || el.selectionEnd !== place.end) el.setSelectionRange(place.start, place.end);
  el.scrollTop = place.fraction * el.scrollHeight;
}
```

- [ ] **Step 4: `writingView.ts` — snapshot inside `focus`, track last writing pane, add `toggleFocus`**

Import `rememberPlaces` from `./focusPlace`. Add to the type: `lastWritingPaneId: string | null; setLastWritingPane: (id: string) => void; toggleFocus: () => void;`. Replace `focus` and add the new members (the store factory must take `(set, get)`):

```ts
  focus: (focusPaneId) => {
    // Every entry and exit path (button, Esc, Alt+Shift+F, desk restore) comes through here,
    // so the snapshot is taken before the layout changes.
    if (typeof document !== 'undefined' && focusPaneId !== get().focusPaneId) rememberPlaces();
    set({ focusPaneId, focusLayer: null });
  },
  lastWritingPaneId: null,
  setLastWritingPane: (lastWritingPaneId) => set({ lastWritingPaneId }),
  toggleFocus: () => {
    const { focusPaneId, lastWritingPaneId, focus } = get();
    if (focusPaneId) { focus(null); return; }
    const editors = [...document.querySelectorAll<HTMLElement>('section.pane-editor')]
      .filter((pane) => pane.querySelector('.writing-page textarea.draft'))
      .map((pane) => pane.id.slice('workspace-'.length));
    const target = lastWritingPaneId && editors.includes(lastWritingPaneId) ? lastWritingPaneId : editors[0];
    if (target) focus(target);
  },
```

- [ ] **Step 5: `EditorPane.tsx` — record and restore**

On the textarea add `onFocus={() => { if (isManuscript) useWritingView.getState().setLastWritingPane(pane.id); }}`. Import `restorePlace` from `../focusPlace`. Extend the existing `useLayoutEffect` on `[focused]`:

```ts
  useLayoutEffect(() => {
    if (wasFocused.current === focused) return;
    wasFocused.current = focused;
    const el = ref.current;
    el?.focus({ preventScroll: true });
    // Wait one frame for the new layout before restoring scroll.
    const frame = requestAnimationFrame(() => { if (el) restorePlace(pane.id, el); });
    return () => cancelAnimationFrame(frame);
  }, [focused, pane.id]);
```

- [ ] **Step 6: Create `web/src/useShortcutKeys.ts` and mount it**

```ts
import { useEffect, useRef } from 'react';
import { matchShortcut, shortcutBlocked } from './shortcuts';
import { useWritingView } from './writingView';

export interface ShortcutHandlers { desk?(index: number): void; deskPrevious?(): void; deskSwitcher?(): void; legend?(): void }

/** One window listener for every Alt+Shift shortcut; handlers are read fresh on each key. */
export function useShortcutKeys(handlers: ShortcutHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = matchShortcut(event);
      if (!action || shortcutBlocked(event.target)) return;
      const h = latest.current;
      const run = action.kind === 'focus-toggle' ? () => useWritingView.getState().toggleFocus()
        : action.kind === 'desk' ? h.desk && (() => h.desk!(action.index))
        : action.kind === 'desk-previous' ? h.deskPrevious
        : action.kind === 'desk-switcher' ? h.deskSwitcher
        : h.legend;
      if (!run) return;
      event.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
```

In `WorkspaceToolbar.tsx`, inside the component body: `useShortcutKeys({});` (later tasks fill the handlers). Import from `../useShortcutKeys`.

- [ ] **Step 7: Run tests**

Run: `PW_CHANNEL=chrome npx playwright test e2e/focus-toggle.spec.ts e2e/writing-focus.spec.ts e2e/quiet-focus.spec.ts e2e/focus-cards.spec.ts --reporter=list`
Expected: all pass. If the scroll assertion already passed before Step 3 (Step 2 failed only on the key), keep `focusPlace.ts` anyway: it is what makes Esc and desk restores keep the place too.

- [ ] **Step 8: Commit**

```bash
git add web/src/focusPlace.ts web/src/writingView.ts web/src/panes/EditorPane.tsx web/src/useShortcutKeys.ts web/src/components/WorkspaceToolbar.tsx e2e/focus-toggle.spec.ts
git commit -m "feat: Alt+Shift+F focus toggle that keeps caret and scroll"
```

---

### Task 5: Shared desk list, numbering and Move up/down

**Files:**
- Create: `web/src/deskList.ts`
- Modify: `web/src/components/SavedDesks.tsx` (use the store; numbers; move buttons; restore through memory)
- Modify: `web/src/styles/` file that holds `.desk-card` (find with `grep -rn "desk-card" web/src/styles`) for the number badge and move buttons
- Test: `web/test/desk-list.test.ts`

**Interfaces:**
- Consumes: `parseDesks`, `SavedDesk` from `desks.ts`.
- Produces: `moveDesk(desks: SavedDesk[], id: string, delta: -1 | 1): SavedDesk[]`; zustand `useDeskList` with `projectId: string | null`, `desks: SavedDesk[]`, `error: string`, `previous: SavedDesk | null`, `load(projectId: string | null): void`, `persist(next: SavedDesk[]): boolean`, `move(id: string, delta: -1 | 1): void`; `restoreWithMemory(capture: (name: string) => SavedDesk, restore: (desk: SavedDesk) => void, desk: SavedDesk): void`; `restorePrevious(capture, restore): void`.

- [ ] **Step 1: Write the failing unit test**

```ts
// web/test/desk-list.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test web/test/desk-list.test.ts`
Expected: FAIL, cannot find module `../src/deskList.ts`.

- [ ] **Step 3: Create `web/src/deskList.ts`**

```ts
import { create } from 'zustand';
import { parseDesks, type SavedDesk } from './desks';

const key = (projectId: string) => `muse:desks:v1:${projectId}`;

export function moveDesk(desks: SavedDesk[], id: string, delta: -1 | 1): SavedDesk[] {
  const from = desks.findIndex((desk) => desk.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= desks.length) return desks;
  const next = [...desks];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Desks stay per device (localStorage); one list serves the dialog, the switcher and the keys. */
export const useDeskList = create<{
  projectId: string | null; desks: SavedDesk[]; error: string; previous: SavedDesk | null;
  load: (projectId: string | null) => void; persist: (next: SavedDesk[]) => boolean; move: (id: string, delta: -1 | 1) => void;
}>((set, get) => ({
  projectId: null, desks: [], error: '', previous: null,
  load: (projectId) => {
    if (projectId === get().projectId) return;
    let desks: SavedDesk[] = [];
    try { desks = projectId ? parseDesks(localStorage.getItem(key(projectId))) : []; } catch { desks = []; }
    // A previous arrangement from another project would bind panes to documents that are not here.
    set({ projectId, desks, error: '', previous: null });
  },
  persist: (next) => {
    const projectId = get().projectId;
    if (!projectId) return false;
    try { localStorage.setItem(key(projectId), JSON.stringify(next)); set({ desks: next, error: '' }); return true; }
    catch { set({ error: 'Browser storage is unavailable or full. Changes were not saved; existing desks are unchanged.' }); return false; }
  },
  move: (id, delta) => { get().persist(moveDesk(get().desks, id, delta)); },
}));

export function restoreWithMemory(capture: (name: string) => SavedDesk, restore: (desk: SavedDesk) => void, desk: SavedDesk) {
  const here = capture('Previous arrangement');
  restore(desk);
  useDeskList.setState({ previous: here });
}

export function restorePrevious(capture: (name: string) => SavedDesk, restore: (desk: SavedDesk) => void) {
  const previous = useDeskList.getState().previous;
  if (previous) restoreWithMemory(capture, restore, previous);
}
```

Note: in `load`, the `localStorage` access is inside `try`, so the unit test (Node, no `localStorage`) gets an empty list without throwing.

- [ ] **Step 4: Run the unit test**

Run: `node --import tsx --test web/test/desk-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `SavedDesks.tsx` to the shared store**

Replace the local `desks`, `error`, `persist` state and the loading `useEffect` with:

```tsx
  const desks = useDeskList((s) => s.desks);
  const error = useDeskList((s) => s.error);
  const { persist, move } = useDeskList.getState();
  useEffect(() => { useDeskList.getState().load(projectId ?? null); setOpen(false); setName(''); }, [projectId]);
```

Keep the "Twelve desks saved" check, but make it set the store error: `useDeskList.setState({ error: 'Twelve desks saved. Remove one before adding another.' })`. In the desk grid, show the number and move buttons and restore through memory:

```tsx
          {desks.map((desk, index) => <article key={desk.id} className="desk-card">
            {index < 9 && <span className="desk-number" aria-hidden="true">{index + 1}</span>}
            <button type="button" className="desk-restore" aria-label={`Restore ${desk.name}`} aria-keyshortcuts={index < 9 ? `Alt+Shift+${index + 1}` : undefined}
              onClick={() => { restoreWithMemory(capture, restore, desk); close(); }}><DeskPreview desk={desk} /><span>{desk.name}</span><small>{desk.view.workbench ? 'Workbench' : 'Workspace'} · {desk.view.layout} · {desk.panes.length} cards</small></button>
            <div className="desk-move">
              <button type="button" aria-label={`Move ${desk.name} up`} disabled={index === 0} onClick={() => move(desk.id, -1)}>↑</button>
              <button type="button" aria-label={`Move ${desk.name} down`} disabled={index === desks.length - 1} onClick={() => move(desk.id, 1)}>↓</button>
            </div>
            <button type="button" className="desk-remove" aria-label={`Remove desk ${desk.name}`} title="Remove saved layout only" onClick={() => persist(desks.filter((item) => item.id !== desk.id))}><Icon.Close size={14} /></button>
          </article>)}
```

Remove the now-unused `parseDesks` import and `key` constant from `SavedDesks.tsx`; import `useDeskList, restoreWithMemory` from `../deskList`.

- [ ] **Step 6: Styles** (append beside the existing `.desk-card` rules)

```css
.desk-card { position: relative; }
.desk-number { position: absolute; top: 8px; left: 8px; z-index: 1; min-width: 20px; height: 20px; display: grid; place-items: center; border-radius: 6px; background: var(--accent); color: #fff; font-size: 11px; font-weight: 500; }
.desk-move { display: flex; gap: 4px; }
.desk-move button { min-width: 28px; min-height: 28px; border: 1px solid var(--line); border-radius: 6px; background: var(--glass-face); color: var(--ink-mid); }
.desk-move button:disabled { opacity: .4; }
```

- [ ] **Step 7: Run tests**

Run: `node --import tsx --test web/test/*.test.ts` then `PW_CHANNEL=chrome npx playwright test e2e/saved-desks.spec.ts --reporter=list`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add web/src/deskList.ts web/src/components/SavedDesks.tsx web/src/styles web/test/desk-list.test.ts
git commit -m "feat: shared desk list with numbers, reorder and previous-arrangement memory"
```

---

### Task 6: Desk keys and desk switcher

**Files:**
- Create: `web/src/components/DeskSwitcher.tsx`
- Modify: `web/src/writingView.ts` (`deskSwitcherOpen`)
- Modify: `web/src/components/WorkspaceToolbar.tsx` (handlers; render switcher)
- Modify: `web/src/styles/writing-page.css` (switcher list styles)
- Test: `e2e/desk-shortcuts.spec.ts`

**Interfaces:**
- Consumes: `useShortcutKeys` (Task 4); `useDeskList`, `restoreWithMemory`, `restorePrevious` (Task 5); `useEditHistory` from `../editHistory`.
- Produces: `deskSwitcherOpen: boolean`, `setDeskSwitcherOpen(open: boolean): void` on `useWritingView`; component `DeskSwitcher({ onRestore }: { onRestore: (desk: SavedDesk) => void })`.

- [ ] **Step 1: Write the failing browser test**

```ts
// e2e/desk-shortcuts.spec.ts
import { test, expect } from './fixtures';

async function saveDesk(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await page.getByLabel('Desk name').fill(name);
  await page.getByRole('button', { name: 'Save desk', exact: true }).click();
  await page.keyboard.press('Escape');
}
const layout = (page: import('@playwright/test').Page) => page.getByLabel('Document tiles');

test('Alt+Shift+N restores desk N, Alt+Shift+0 bounces back, switcher finds by name', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await layout(page).selectOption('columns');
  await saveDesk(page, 'Columns desk');
  await layout(page).selectOption('rows');
  await saveDesk(page, 'Rows desk');
  await layout(page).selectOption('grid');

  await page.keyboard.press('Alt+Shift+1');
  await expect(layout(page)).toHaveValue('columns');
  await page.keyboard.press('Alt+Shift+2');
  await expect(layout(page)).toHaveValue('rows');
  await page.keyboard.press('Alt+Shift+0');
  await expect(layout(page)).toHaveValue('columns');
  await page.keyboard.press('Alt+Shift+0');
  await expect(layout(page)).toHaveValue('rows');
  await page.keyboard.press('Alt+Shift+7'); // no seventh desk: nothing happens
  await expect(layout(page)).toHaveValue('rows');

  await page.keyboard.press('Alt+Shift+D');
  const switcher = page.getByRole('dialog', { name: 'Find a desk' });
  await expect(switcher).toBeVisible();
  await switcher.getByLabel('Filter desks').fill('colu');
  await page.keyboard.press('Enter');
  await expect(switcher).toBeHidden();
  await expect(layout(page)).toHaveValue('columns');
});

test('desk keys stay quiet while typing in a form field', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await layout(page).selectOption('columns');
  await saveDesk(page, 'Columns desk');
  await layout(page).selectOption('rows');
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await page.getByLabel('Desk name').focus();
  await page.keyboard.press('Alt+Shift+1');
  await page.keyboard.press('Escape');
  await expect(layout(page)).toHaveValue('rows');
});

test('Move up changes which desk a number opens', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await layout(page).selectOption('columns');
  await saveDesk(page, 'Columns desk');
  await layout(page).selectOption('rows');
  await saveDesk(page, 'Rows desk');
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await page.getByRole('button', { name: 'Move Rows desk up', exact: true }).click();
  await page.keyboard.press('Escape');
  await layout(page).selectOption('grid');
  await page.keyboard.press('Alt+Shift+1');
  await expect(layout(page)).toHaveValue('rows');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PW_CHANNEL=chrome npx playwright test e2e/desk-shortcuts.spec.ts --reporter=list`
Expected: FAIL at the first `Alt+Shift+1` assertion.

- [ ] **Step 3: Switcher state in `writingView.ts`**

Type: `deskSwitcherOpen: boolean; setDeskSwitcherOpen: (open: boolean) => void;` Body: `deskSwitcherOpen: false, setDeskSwitcherOpen: (deskSwitcherOpen) => set({ deskSwitcherOpen }),`

- [ ] **Step 4: Create `web/src/components/DeskSwitcher.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDeskList } from '../deskList';
import type { SavedDesk } from '../desks';
import { trapLayerTab } from '../focusLayers';
import { useWritingView } from '../writingView';

/** Find any saved desk by name; arrows move, Enter restores, Escape closes. */
export function DeskSwitcher({ onRestore }: { onRestore: (desk: SavedDesk) => void }) {
  const desks = useDeskList((s) => s.desks);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const returnTo = useRef<Element | null>(document.activeElement);
  useEffect(() => { input.current?.focus(); }, []);
  const visible = desks.filter((desk) => desk.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const close = () => {
    useWritingView.getState().setDeskSwitcherOpen(false);
    requestAnimationFrame(() => (returnTo.current as HTMLElement | null)?.focus?.({ preventScroll: true }));
  };
  const choose = (desk: SavedDesk | undefined) => { if (!desk) return; useWritingView.getState().setDeskSwitcherOpen(false); onRestore(desk); };
  return createPortal(<div className="focus-cards-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="focus-cards desk-switcher" role="dialog" aria-modal="true" aria-label="Find a desk" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, visible.length - 1)); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return; }
      if (event.key === 'Enter') { event.preventDefault(); choose(visible[active]); return; }
      trapLayerTab(event);
    }}>
      <header><div><h2>Find a desk</h2><p>Type to filter. Enter opens the highlighted desk.</p></div>
        <button type="button" aria-label="Close desk finder" onClick={close}>×</button></header>
      <input ref={input} type="search" aria-label="Filter desks" placeholder="Desk name…" value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} />
      <div className="focus-card-results" role="listbox" aria-label="Desks">
        {visible.map((desk, index) => <button key={desk.id} type="button" role="option" aria-selected={index === active}
          className={index === active ? 'is-active' : ''} onClick={() => choose(desk)}>
          <span>{desk.name}</span><small>{desks.indexOf(desk) < 9 ? `Alt Shift ${desks.indexOf(desk) + 1}` : ''}</small></button>)}
        {!visible.length && <p className="desk-empty">{desks.length ? 'No desk matches that name.' : 'No saved desks yet. Save one from Desks.'}</p>}
      </div>
    </section>
  </div>, document.body);
}
```

- [ ] **Step 5: Wire handlers in `WorkspaceToolbar.tsx`**

Replace `useShortcutKeys({});` with:

```tsx
  const switcherOpen = useWritingView((s) => s.deskSwitcherOpen);
  const busy = () => { const history = useEditHistory.getState(); return history.restoring || history.pending > 0; };
  useShortcutKeys({
    desk: (index) => { const desk = useDeskList.getState().desks[index]; if (desk && !busy()) restoreWithMemory(captureDesk, restoreDesk, desk); },
    deskPrevious: () => { if (!busy()) restorePrevious(captureDesk, restoreDesk); },
    deskSwitcher: () => useWritingView.getState().setDeskSwitcherOpen(true),
  });
```

After `<SavedDesks … />` render: `{switcherOpen && <DeskSwitcher onRestore={(desk) => { if (!busy()) restoreWithMemory(captureDesk, restoreDesk, desk); }} />}`. Also call `useDeskList.getState().load(projectId)` in an effect here keyed on the project id (`const projectId = useStore((s) => s.project?.id ?? null); useEffect(() => { useDeskList.getState().load(projectId); }, [projectId]);`) so keys work before the Desks dialog was ever opened. Imports: `useWritingView` from `../writingView`, `useEditHistory` from `../editHistory`, `useDeskList, restoreWithMemory, restorePrevious` from `../deskList`, `DeskSwitcher` from `./DeskSwitcher`.

- [ ] **Step 6: Styles** (append to `web/src/styles/writing-page.css`)

```css
.desk-switcher .focus-card-results > button { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 10px; border: 0; border-bottom: 1px solid var(--line); background: transparent; border-radius: 4px; }
.desk-switcher .focus-card-results > button.is-active { background: rgba(63, 95, 125, .1); box-shadow: inset 2px 0 0 var(--accent); }
.desk-switcher .focus-card-results small { margin-left: auto; color: var(--ink-soft); font-family: var(--font-mono); font-size: 11px; }
```

- [ ] **Step 7: Run tests**

Run: `PW_CHANNEL=chrome npx playwright test e2e/desk-shortcuts.spec.ts e2e/saved-desks.spec.ts e2e/floating-editors.spec.ts --reporter=list`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/DeskSwitcher.tsx web/src/writingView.ts web/src/components/WorkspaceToolbar.tsx web/src/styles/writing-page.css e2e/desk-shortcuts.spec.ts
git commit -m "feat: Alt+Shift desk keys, previous arrangement and desk finder"
```

---

### Task 7: Focus as part of a desk (optional field)

**Files:**
- Modify: `web/src/desks.ts` (`DeskView.focusDocumentId?`, parse normalizes)
- Modify: `web/src/components/WorkspaceCanvas.tsx` (`captureDesk` records it; `restoreDesk` re-enters focus)
- Test: `web/test/desks.test.ts` (add tests), `e2e/desk-shortcuts.spec.ts` (add a test)

**Interfaces:**
- Consumes: `useWritingView.focus`, `focusPaneId`.
- Produces: `DeskView.focusDocumentId?: string`.

- [ ] **Step 1: Write the failing unit test** (append to `web/test/desks.test.ts`)

```ts
test('focusDocumentId is optional: valid ids are kept, invalid ones are dropped, old desks still parse', () => {
  const withFocus = { ...desk, view: { ...desk.view, focusDocumentId: 'chapter' } };
  const bad = { ...desk, id: 'bad', view: { ...desk.view, focusDocumentId: 42 } };
  const [kept, stripped, old] = parseDesks(JSON.stringify([withFocus, bad, desk]));
  assert.equal(kept.view.focusDocumentId, 'chapter');
  assert.equal(stripped.id, 'bad');
  assert.equal('focusDocumentId' in stripped.view, false);
  assert.equal('focusDocumentId' in old.view, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test web/test/desks.test.ts`
Expected: FAIL on `kept.view.focusDocumentId` type or the stripped assertion.

- [ ] **Step 3: Implement in `desks.ts`**

Add `focusDocumentId?: string;` to `DeskView`. At the end of `parseDesks`, map the filtered list to strip an invalid field:

```ts
    return value.slice(0, 12).filter(/* existing predicate unchanged */).map((desk) => {
      const focusId = (desk.view as { focusDocumentId?: unknown }).focusDocumentId;
      if (focusId === undefined || text(focusId)) return desk;
      const { focusDocumentId: _drop, ...view } = desk.view;
      return { ...desk, view };
    });
```

- [ ] **Step 4: Capture and restore in `WorkspaceCanvas.tsx`**

In `captureDesk`, compute and add to `view`:

```ts
    const focused = state.panes.find((pane) => pane.id === view.focusPaneId);
    const focusDocumentId = focused?.binding?.type === 'document' ? focused.binding.id : undefined;
    // ...inside view: { ...existing fields, ...(focusDocumentId ? { focusDocumentId } : {}) }
```

In `restoreDesk`, after `beforeWorkbench.current.clear();`:

```ts
    if (desk.view.focusDocumentId) {
      const id = desk.view.focusDocumentId;
      requestAnimationFrame(() => {
        const pane = useStore.getState().panes.find((item) => item.binding?.type === 'document' && item.binding.id === id);
        if (pane) useWritingView.getState().focus(pane.id);
      });
    }
```

- [ ] **Step 5: Browser test** (append to `e2e/desk-shortcuts.spec.ts`)

Focus mode hides the workspace toolbar, so the Desks dialog cannot save a desk while focused. The test saves a normal desk, adds `focusDocumentId` to the stored record (exactly what `captureDesk` writes when focused), reloads, and restores it by key.

```ts
test('a desk saved in focus re-enters focus when restored', async ({ page, projectId }) => {
  await page.getByRole('button', { name: 'Saved desks', exact: true }).click();
  await page.getByLabel('Desk name').fill('Focused desk');
  await page.getByRole('button', { name: 'Save desk', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.evaluate((projectId) => {
    const key = `muse:desks:v1:${projectId}`;
    const desks = JSON.parse(localStorage.getItem(key)!);
    const doc = desks[0].panes.find((pane: { type: string; binding?: { type: string; id: string } }) => pane.type === 'editor' && pane.binding?.type === 'document');
    desks[0].view.focusDocumentId = doc.binding.id;
    localStorage.setItem(key, JSON.stringify(desks));
  }, projectId);
  await page.reload();
  await page.keyboard.press('Alt+Shift+1');
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toBeVisible();
});
```

- [ ] **Step 6: Run tests**

Run: `node --import tsx --test web/test/desks.test.ts` and `PW_CHANNEL=chrome npx playwright test e2e/desk-shortcuts.spec.ts --reporter=list`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/desks.ts web/src/components/WorkspaceCanvas.tsx web/test/desks.test.ts e2e/desk-shortcuts.spec.ts
git commit -m "feat: desks can remember writing focus"
```

---

### Task 8: Shortcut legend

**Files:**
- Create: `web/src/components/ShortcutLegend.tsx`
- Modify: `web/src/writingView.ts` (`legendOpen`)
- Modify: `web/src/components/Sidebar.tsx` (trigger in `.brand-row`, between `.brand-text` and `.sidebar-toggle`)
- Modify: `web/src/panes/EditorPane.tsx` (trigger inside `.writing-focus-actions`)
- Modify: `web/src/components/WorkspaceToolbar.tsx` (legend handler; render the panel once)
- Modify: `web/src/styles/materials.css` (legend styles)
- Test: `e2e/shortcut-legend.spec.ts`

**Interfaces:**
- Consumes: `SHORTCUTS` (Task 1), `useShortcutKeys` (Task 4).
- Produces: `legendOpen: boolean`, `setLegendOpen(open: boolean): void` on `useWritingView`; components `LegendTrigger()` and `ShortcutLegend()`.

- [ ] **Step 1: Write the failing browser test**

```ts
// e2e/shortcut-legend.spec.ts
import { test, expect } from './fixtures';

test('legend opens from the logo icon and Alt+Shift+/, lists shortcuts, and returns focus', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const trigger = page.locator('.brand-row').getByRole('button', { name: 'Keyboard shortcuts', exact: true });
  await trigger.click();
  const legend = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(legend).toBeVisible();
  for (const label of ['Enter or leave focus', 'Open desk 1–9', 'Back to previous arrangement', 'Find a desk', 'Recall a floating card', 'Show these shortcuts']) await expect(legend.getByText(label)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(legend).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Alt+Shift+Slash');
  await expect(legend).toBeVisible();
  await page.keyboard.press('Escape');
});

test('legend trigger stays reachable with the sidebar collapsed and in focus mode', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  await page.getByRole('button', { name: 'Collapse tool menu', exact: true }).click();
  await expect(page.locator('.brand-row').getByRole('button', { name: 'Keyboard shortcuts', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand tool menu', exact: true }).click();
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  const focusTrigger = page.locator('.writing-focus-actions').getByRole('button', { name: 'Keyboard shortcuts', exact: true });
  await expect(focusTrigger).toBeVisible();
  await focusTrigger.click();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Exit writing focus', exact: true })).toBeVisible(); // Esc closed the legend only
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PW_CHANNEL=chrome npx playwright test e2e/shortcut-legend.spec.ts --reporter=list`
Expected: FAIL, no "Keyboard shortcuts" button.

- [ ] **Step 3: Legend state in `writingView.ts`**

Type: `legendOpen: boolean; setLegendOpen: (open: boolean) => void;` Body: `legendOpen: false, setLegendOpen: (legendOpen) => set({ legendOpen }),`

- [ ] **Step 4: Create `web/src/components/ShortcutLegend.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SHORTCUTS, type ShortcutGroup } from '../shortcuts';
import { trapLayerTab } from '../focusLayers';
import { useWritingView } from '../writingView';

let returnFocus: HTMLElement | null = null;

/** Keyboard glyph in the app's own tokens: accent stroke on the glass face. */
function KeyboardGlyph() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <rect x="3" y="6.5" width="18" height="11" rx="2.5" />
    <path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8" />
  </svg>;
}

export function LegendTrigger() {
  return <button type="button" className="legend-trigger" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (Alt+Shift+/)" aria-keyshortcuts="Alt+Shift+/"
    onPointerDown={(event) => { if (document.activeElement?.matches('textarea.draft')) event.preventDefault(); }}
    onClick={(event) => { returnFocus = event.currentTarget; useWritingView.getState().setLegendOpen(true); }}>
    <KeyboardGlyph />
  </button>;
}

export function openLegendFromKeyboard() {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useWritingView.getState().setLegendOpen(true);
}

const GROUPS: ShortcutGroup[] = ['Writing', 'Desks and cards'];

export function ShortcutLegend() {
  const open = useWritingView((s) => s.legendOpen);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { if (open) panel.current?.focus(); }, [open]);
  if (!open) return null;
  const close = () => { useWritingView.getState().setLegendOpen(false); requestAnimationFrame(() => returnFocus?.focus({ preventScroll: true })); };
  return createPortal(<div className="legend-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panel} tabIndex={-1} className="shortcut-legend" role="dialog" aria-modal="true" aria-labelledby="shortcut-legend-title" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      trapLayerTab(event);
    }}>
      <header><h2 id="shortcut-legend-title">Keyboard shortcuts</h2><span>Alt + ? to open · Esc to close</span>
        <button type="button" aria-label="Close keyboard shortcuts" onClick={close}>×</button></header>
      <p className="legend-touch-note">With a keyboard attached.</p>
      <div className="legend-groups">
        {GROUPS.map((group) => <div key={group}><h3>{group}</h3><dl>
          {SHORTCUTS.filter((item) => item.group === group).map((item) => <div key={item.id}><dt>{item.label}</dt><dd><kbd>{item.keys}</kbd></dd></div>)}
        </dl></div>)}
      </div>
    </section>
  </div>, document.body);
}
```

- [ ] **Step 5: Place triggers and the panel**

In `Sidebar.tsx` `.brand-row`, insert `<LegendTrigger />` between the `.brand-text` div and the `.sidebar-toggle` button. In `EditorPane.tsx`, inside `{focused && <div className="writing-focus-actions">`, add `<LegendTrigger />` as the last child. In `WorkspaceToolbar.tsx`, add `legend: openLegendFromKeyboard,` to the `useShortcutKeys` handlers and render `<ShortcutLegend />` once after the switcher. Imports from `./ShortcutLegend` / `../components/ShortcutLegend`.

Because the legend dialog stops Escape propagation in its own `onKeyDown`, App's focus-exit Escape handler (window listener, `App.tsx:76`) sees `defaultPrevented` and does nothing. Verified by the second test.

- [ ] **Step 6: Styles** (append to `web/src/styles/materials.css`)

```css
.legend-trigger { display: grid; place-items: center; width: 32px; height: 32px; flex: 0 0 32px; border: 1px solid var(--line-strong); border-radius: var(--r-sm); background: var(--glass-face); color: var(--accent); }
.legend-trigger:hover { border-color: var(--accent-soft); }
.legend-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.legend-backdrop { position: fixed; inset: 0; z-index: 2300; display: grid; place-items: start center; padding: min(12vh, 96px) 16px 16px; background: rgba(221, 232, 236, .18); }
.shortcut-legend { width: min(640px, 100%); max-height: 100%; overflow: auto; padding: 18px 20px; border: 1px solid var(--glass-edge); border-radius: var(--r-lg); background: var(--glass-sheen), var(--glass-overlay); box-shadow: var(--shadow-float); color: var(--ink); }
.shortcut-legend:focus { outline: none; }
.shortcut-legend header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.shortcut-legend h2 { margin: 0; font-size: 16px; font-weight: 500; }
.shortcut-legend header span { margin-left: auto; color: var(--ink-mid); font-size: 12px; }
.shortcut-legend header button { border: 0; background: transparent; min-width: 32px; min-height: 32px; font-size: 20px; color: var(--ink-mid); }
.legend-touch-note { display: none; margin: 0 0 8px; color: var(--ink-soft); font-size: 12px; }
@media (hover: none) and (pointer: coarse) { .legend-touch-note { display: block; } }
.legend-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px 24px; }
.legend-groups h3 { margin: 0 0 6px; color: var(--accent-soft); font-size: 11px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; }
.legend-groups dl { margin: 0; }
.legend-groups dl > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0; font-size: 13px; }
.legend-groups dd { margin: 0; }
.legend-groups kbd { padding: 1px 7px; border: 1px solid var(--line-strong); border-radius: 6px; background: #fff; color: var(--accent); font: 12px var(--font-mono); white-space: nowrap; }
```

- [ ] **Step 7: Run tests**

Run: `PW_CHANNEL=chrome npx playwright test e2e/shortcut-legend.spec.ts e2e/writing-focus.spec.ts e2e/collapse.spec.ts e2e/mobile.spec.ts --reporter=list`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/ShortcutLegend.tsx web/src/writingView.ts web/src/components/Sidebar.tsx web/src/panes/EditorPane.tsx web/src/components/WorkspaceToolbar.tsx web/src/styles/materials.css e2e/shortcut-legend.spec.ts
git commit -m "feat: themed keyboard shortcut legend beside the logo and in focus"
```

---

### Task 9: Selection guard (opt-in)

**Files:**
- Create: `web/src/selectionGuard.ts`
- Modify: `web/src/panes/EditorPane.tsx` (native `beforeinput` listener)
- Test: `web/test/selection-guard.test.ts`, `e2e/selection-guard.spec.ts`

**Interfaces:**
- Consumes: `guardSelection` preference (Task 3).
- Produces: `shouldGuard(value: string, start: number, end: number, inputType: string, data: string | null): boolean`, `GUARD_NOTICE: string`.

- [ ] **Step 1: Write the failing unit test**

```ts
// web/test/selection-guard.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldGuard } from '../src/selectionGuard.ts';

const text = 'one two three four five six seven eight';
test('guards Space and Enter over a selection of more than five words', () => {
  const end = text.indexOf('seven');
  assert.equal(shouldGuard(text, 0, end, 'insertText', ' '), true);
  assert.equal(shouldGuard(text, 0, end, 'insertParagraph', null), true);
  assert.equal(shouldGuard(text, 0, end, 'insertLineBreak', null), true);
});
test('leaves small selections, other characters, deletes and pastes alone', () => {
  const end = text.indexOf('seven');
  assert.equal(shouldGuard(text, 0, text.indexOf('three'), 'insertText', ' '), false); // two words
  assert.equal(shouldGuard(text, 0, end, 'insertText', 'a'), false);
  assert.equal(shouldGuard(text, 0, end, 'deleteContentBackward', null), false);
  assert.equal(shouldGuard(text, 0, end, 'insertFromPaste', null), false);
  assert.equal(shouldGuard(text, 5, 5, 'insertText', ' '), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test web/test/selection-guard.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Create `web/src/selectionGuard.ts`**

```ts
export const GUARD_NOTICE = 'Selection kept — press Delete or Backspace to remove it.';
const THRESHOLD_WORDS = 5;

/** A stray touchpad selection plus Space/Enter silently replaces a whole passage; this stops only that case. */
export function shouldGuard(value: string, start: number, end: number, inputType: string, data: string | null): boolean {
  if (end <= start) return false;
  const whitespace = (inputType === 'insertText' && data === ' ') || inputType === 'insertParagraph' || inputType === 'insertLineBreak';
  if (!whitespace) return false;
  return value.slice(start, end).split(/\s+/).filter(Boolean).length > THRESHOLD_WORDS;
}
```

- [ ] **Step 4: Native listener in `EditorPane.tsx`**

React's `onBeforeInput` is built on `textInput`/`keypress`, so it does not carry `inputType` and misses Enter. Use the native event:

```ts
  const guard = useWritingView((s) => s.guardSelection);
  useEffect(() => {
    const el = ref.current;
    if (!el || !guard || !isManuscript) return;
    const onBeforeInput = (event: InputEvent) => {
      if (event.isComposing || !shouldGuard(el.value, el.selectionStart, el.selectionEnd, event.inputType, event.data)) return;
      event.preventDefault();
      useStore.getState().setNotice(GUARD_NOTICE);
    };
    el.addEventListener('beforeinput', onBeforeInput);
    return () => el.removeEventListener('beforeinput', onBeforeInput);
  }, [guard, isManuscript, Boolean(doc)]);
```

Import `shouldGuard, GUARD_NOTICE` from `../selectionGuard`. Place the `guard` selector and this effect with the other hooks, before `if (!doc) return …` (line 142), so hook order never changes. The `Boolean(doc)` dependency re-runs the effect once the textarea exists (before the document loads, the pane renders a loading placeholder and `ref.current` is null).

- [ ] **Step 5: Browser test**

```ts
// e2e/selection-guard.spec.ts
import { test, expect } from './fixtures';

test('guard is off by default; when on, Space over a long selection keeps the text', async ({ page, projectId }) => {
  expect(projectId).toBeTruthy();
  const sentence = 'one two three four five six seven eight nine ten';
  const six = 'one two three four five six'.length; // 27: a six-word selection
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.fill(sentence);
  await draft.evaluate((el: HTMLTextAreaElement, end: number) => { el.focus(); el.setSelectionRange(0, end); }, six);
  await page.keyboard.press('Space');
  await expect(draft).toHaveValue('  seven eight nine ten'); // default: replaced, as today
  await draft.fill(sentence);
  await page.getByRole('button', { name: 'Page settings', exact: true }).click();
  await page.getByLabel('Protect selections from Space and Enter').check();
  await page.keyboard.press('Escape');
  await draft.evaluate((el: HTMLTextAreaElement, end: number) => { el.focus(); el.setSelectionRange(0, end); }, six);
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await expect(draft).toHaveValue(sentence);
  await expect(page.getByText('Selection kept — press Delete or Backspace to remove it.')).toBeVisible();
  await draft.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 7)); // "one two": two words
  await page.keyboard.press('Space');
  await expect(draft).toHaveValue('  three four five six seven eight nine ten');
});
```

- [ ] **Step 6: Run tests**

Run: `node --import tsx --test web/test/selection-guard.test.ts` and `PW_CHANNEL=chrome npx playwright test e2e/selection-guard.spec.ts e2e/connections.spec.ts --reporter=list`
Expected: all pass (`connections.spec.ts` covers the `!#` path that shares the textarea handlers).

- [ ] **Step 7: Commit**

```bash
git add web/src/selectionGuard.ts web/src/panes/EditorPane.tsx web/test/selection-guard.test.ts e2e/selection-guard.spec.ts
git commit -m "feat: opt-in guard against Space/Enter replacing a long selection"
```

---

### Task 10: Full regression and Firefox acceptance

**Files:** none new.

- [ ] **Step 1: Type-check and build**

Run: `npm -w web run build`
Expected: exits 0.

- [ ] **Step 2: All unit tests**

Run: `node --import tsx --test web/test/*.test.ts` and `npm test`
Expected: `# fail 0` for both.

- [ ] **Step 3: All browser tests**

Run: `PW_CHANNEL=chrome npx playwright test --reporter=list`
Expected: all pass. Any failure in a spec this plan did not add is a regression: fix it before continuing.

- [ ] **Step 4: Firefox acceptance (Dennis, manual).** In Firefox on Linux, on the dev app (`npm run dev`, http://localhost:5177), confirm each of these works and is not taken by a menu or input-method switch: Alt+Shift+F, Alt+Shift+1, Alt+Shift+0, Alt+Shift+D, Alt+Shift+/. Record the result in the PR description.

- [ ] **Step 5: Commit any fixes** with messages describing the regression fixed.
