# Writing-room controls — design

Date: 2026-09-24
Status: draft for review
Scope: spec 1 of 2. Spec 2 (multi-book series) follows separately.

## Intent

Dennis writes long-form fiction (King's Blood, planned as multiple books) in Muse Mobilize.
He wants the manuscript card to be comfortable to write in for long sessions and fast to
move around: adjustable page width, easy in/out of focus mode, one-key jumps between saved
desks, and a visible reference for every shortcut.

Constraints he set:
- Nothing that exists today may change behavior unless the writer opts in. Defaults stay as they are.
- Saved desks stay per-device in browser storage (not moved into the project folder).
- Plan first, choose options with pros and cons, then build.

Success looks like:
- Page width can be changed from the toolbar in one click, and fine-tuned.
- Focus mode toggles with one key and the caret and scroll position survive the toggle.
- Any of the first nine saved desks opens with one key; any desk is findable by name; one key bounces back to the previous desk.
- A themed shortcut legend is one click away from the logo, and also reachable in focus mode.
- Existing projects, saved desks and preferences load unchanged.

## Findings that shaped this

From the 2026-09-24 capacity spike (isolated e2e server, throwaway data):
- Keystroke latency scales with the size of the open document (~34 ms at 10k words, ~135 ms at 100k, ~630 ms at 500k). A 90-chapter, 450k-word project loads in 0.3 s with a 16 MB heap. Chapters are the unit that must stay small; project size is not the constraint.
- The manuscript column width is hard-coded: `.draft` padding uses `72ch` (glass) and `68ch` (paper) in `web/src/styles/app.css` and `writing-page.css`.
- At a 1024 px viewport the manuscript card is 287 px wide (~23 characters per line) and the writing toolbar wraps to four rows.

From the 2026-09-23 text-loss investigation: the save log showed 22 words replaced in one keystroke and restored by undo 10 s later. Cause: an unnoticed selection replaced by Space or Enter (standard textarea behavior), most likely from a touchpad contact while typing. No application code deletes text on Space/Enter.

## Features

### 1. Page width (presets + fine-tune)

- A **Width** select joins the existing `.writing-appearance` selects (Surface, Font, Weight) in the manuscript toolbar:
  Narrow (60ch), Book (68ch), Standard (72ch, default), Wide (90ch), Full (no cap).
- A **Page** button opens a small popover with a slider, 45–120ch in steps of 1, plus a live readout. Moving the slider sets a custom width; the select then shows "Custom (NNch)".
- The value is a per-device preference stored like the existing ones (`readPreference`/`savePreference` in `web/src/writingView.ts`, key `muse:writing-measure`). Stored as a number of `ch`, or the string `full`. Full maps to a measure of `100%`, never `0` (a zero measure would give each side 50% padding and collapse the column).
- CSS: `.draft` horizontal padding becomes `max(28px, calc((100% - var(--page-measure, 72ch)) / 2))`, keeping today's 28px floor; the paper rule uses the same variable with its own default so paper keeps its current 68ch look until the writer picks a width. The variable is set on `.editor-wrap.writing-page` from the preference. Padding (not `max-width`) is kept so the scrollbar stays at the card edge. The existing narrow-container rule (`materials.css:184`, under 650px) and phone rule (`mobile.css:98`) keep precedence, so width controls have no effect on narrow cards or phones; the Width select and Page button stay visible there but are marked "applies on wider screens".
- Applies to manuscript documents only. Notes and outline cards keep their current layout.
- The popover is designed so font size and line spacing can be added later; they are **not** in this spec.

### 2. Focus mode: toggle key and keep your place

- **Alt+Shift+F** toggles focus for the most recently raised manuscript card (the existing `raisePane` order). Esc keeps exiting as today.
- If no manuscript card is open, the key does nothing and the legend lists it as unavailable.
- **Keep your place**: focus changes come from four places (Focus button, Esc in `App.tsx:76`, the new key, desk restore), and an `EditorPane` layout effect runs only after the change. So the snapshot is taken inside the shared `useWritingView.getState().focus()` action: it records `selectionStart`, `selectionEnd` and the caret's height relative to the textarea's visible area for the affected document (from `editorRefs`). After the layout settles (next animation frame), `EditorPane` restores selection and scroll so the caret sits at the same relative height.
- First step is a failing Playwright round-trip test. `PaneMount` keeps the textarea host stable, so the selection may already survive and only scroll may drift; if the selection survives today, the feature shrinks to scroll restore only.
- **Optional (5) Focus as a desk:** `DeskView` gains an optional `focusDocumentId`. Capturing a desk while in focus records it; restoring such a desk re-enters focus on that document if it is open. Desks without the field behave exactly as today. `parseDesks` accepts the field when it is a valid id and ignores it otherwise.

### 3. Desk shortcuts

- **Alt+Shift+1…9** restores saved desk 1–9 in list order. Desk cards in the Desks dialog show their number. New "Move up" and "Move down" buttons on each desk card reorder the list, which changes the numbers.
- **Alt+Shift+D** opens a desk switcher: a small dialog built like `FocusStoryCards` with a filter box, arrow-key selection, Enter to restore, Esc to close, and the existing SVG previews.
- **Alt+Shift+0** returns to the previous arrangement. Before any desk restore (by key, switcher or dialog), the current arrangement is captured with the existing `captureDesk` into an in-memory "previous" slot (not saved to the list). Alt+Shift+0 restores it and swaps it with the arrangement being left, so repeated presses bounce between two layouts. The slot is cleared when the open project changes, so it never restores panes bound to another project's documents.
- Desk storage stays in `localStorage` under `muse:desks:v1:<projectId>` (per device, as decided). The desk list moves from `SavedDesks` component state into a small shared hook so both the dialog and the key handler read the same list.
- Restores go through the existing `restoreDesk`, so pane identities are reused and unlisted tools are parked, never discarded.

### 4. Shortcut legend

- A keyboard icon button (inline SVG, drawn in the app's tokens: `--accent` stroke, `--glass-face` fill, `--r-md` corners) sits next to the logo in the sidebar header. It stays visible when the sidebar is collapsed and also appears in the focus toolbar beside "Back to workspace".
- Clicking it, or pressing **Alt+Shift+/** (shown as "Alt + ?"), opens a glass panel (`--glass-overlay`, `--shadow-float`, `--r-lg`) listing shortcuts in two groups: Writing, and Desks and cards. Esc or the close button dismisses it and returns focus to the trigger.
- The legend is generated from one shortcut registry module (`web/src/shortcuts.ts`) that lists each shortcut's id, keys, label, group and availability. The new handlers (focus, desks, legend) are registered there. Existing handlers (Alt+1…9 recall, Alt+Shift+K story cards, Ctrl+Z/Y, Ctrl+Enter, `!#`) are listed in the registry for display; their handlers are not moved in this spec.
- On touch screens (no hardware keyboard), the legend still opens from the icon and labels the list "Keyboard shortcuts (with a keyboard attached)".
- Accessible: dialog role, labelled heading, focus trap using the existing `focusLayers` helper, `aria-keyshortcuts` on triggers.

### 5. Selection guard for Space and Enter (opt-in; confirm in review)

- Off by default, per the no-behavior-change constraint. Turned on from the Page popover ("Protect selections from Space/Enter").
- When on and the selection in the manuscript covers more than 5 words and the key pressed is Space or Enter with no modifiers, the keystroke is blocked, the selection is kept, and a short status note appears: "Selection kept — press Delete or Backspace to remove it."
- Typing any other character, Delete or Backspace behaves as today. Paste behaves as today.
- Implemented in `onBeforeInput` (inputType `insertText` with data `" "`, `insertParagraph`, `insertLineBreak`), not only `onKeyDown`, because Android virtual keyboards report `key: "Unidentified"` on keydown.
- Open for review: whether to include it at all, the 5-word threshold, and block-with-hint (vs. collapsing the selection).

## Keyboard handling rules

All new shortcuts use Alt+Shift so they never produce text and do not collide with existing bindings:

| Key | Action | Existing binding checked |
|---|---|---|
| Alt+Shift+F | Toggle focus | none |
| Alt+Shift+1…9 | Restore desk N | Alt+1…9 is floating-card recall (no Shift) |
| Alt+Shift+0 | Previous arrangement | none |
| Alt+Shift+D | Desk switcher | none |
| Alt+Shift+/ | Shortcut legend | none |
| Alt+Shift+K | Story cards (existing) | unchanged |

Handlers match on `event.code` (Digit1, KeyF…) so keyboard layouts that turn Shift+digit into symbols still work. They ignore events that are composing, already `defaultPrevented`, or have Ctrl/Meta held. They are allowed while typing in the manuscript textarea (Alt+Shift combinations do not insert text), but ignored while an input inside a dialog or floating card form has focus, and while the desk switcher or legend is open (those dialogs handle their own keys). Desk restores are ignored while `useEditHistory` reports `restoring` or pending, matching the guard used by `UndoControls`.

## Components and files

| Unit | Responsibility | Files |
|---|---|---|
| Shortcut registry | Single list of shortcuts for handlers and legend | new `web/src/shortcuts.ts` |
| Page measure preference | Store and apply width | `web/src/writingView.ts`, `web/src/panes/EditorPane.tsx`, `web/src/styles/app.css`, `writing-page.css` |
| Page popover | Slider UI | new `web/src/components/PagePopover.tsx` |
| Focus place keeper | Save and restore caret and scroll | `web/src/panes/EditorPane.tsx` |
| Desk list hook | Shared desk list and reorder | new `web/src/useSavedDesks.ts`, `web/src/components/SavedDesks.tsx` |
| Desk switcher | Filterable desk dialog | new `web/src/components/DeskSwitcher.tsx` |
| Desk keys + previous slot | Alt+Shift+0–9, D | new `web/src/useDeskShortcuts.ts`, mounted in `web/src/components/WorkspaceToolbar.tsx` |
| Shortcut legend | Icon button and panel | new `web/src/components/ShortcutLegend.tsx`, sidebar header in `App.tsx`, focus toolbar in `EditorPane.tsx` |
| Desk focus field (optional) | `focusDocumentId` on `DeskView` | `web/src/desks.ts` |
| Selection guard (if confirmed) | Block Space/Enter over large selection | `web/src/panes/EditorPane.tsx` |

## Compatibility

- No server or project-file changes. `kb.muse` and other projects are untouched.
- Missing preferences fall back to today's values (72ch glass, 68ch paper).
- Saved desks without the new optional field parse and restore as today; desks remain capped at 12 by `parseDesks`.
- The uncommitted work on `feat/workspace-sources-export` (snap-to-maximize, collapsible header) is left as is; this work starts on a new branch after that work is committed or shelved by Dennis.

## Testing

Playwright specs in `e2e/`, running on the isolated server (`e2e/server.mts`):
- Width: preset and slider change the rendered text column; preference survives reload; paper default unchanged when nothing is chosen.
- Focus: Alt+Shift+F enters and leaves; caret offset and selection identical after a round trip; caret stays in view in a 10k-word document.
- Desks: Alt+Shift+N restores the Nth desk; Move up/down changes the mapping; Alt+Shift+0 bounces between two arrangements; switcher filters and restores by Enter; keys ignored while a card form input is focused.
- Legend: opens from the icon and Alt+Shift+/, lists every registry entry, closes with Esc and returns focus; icon present with sidebar collapsed and in focus mode.
- Selection guard (if confirmed): a 20-word selection plus Space leaves text intact; a 2-word selection plus Space replaces as today.
- Regression: existing `writing-focus`, `saved-desks`, `quiet-focus`, `floating-editors` specs pass unchanged.
- Firefox acceptance (Dennis's browser; automated runs use Chrome): the app defines no `accesskey` attributes today, so Firefox's Alt+Shift content access keys do not collide. Dennis confirms in Firefox on Linux that each Alt+Shift shortcut works and is not taken by menus or input-method switching. Optionally install Playwright's Firefox build (needs a download, ask first) to automate this.
- Guard (if included): verified with `beforeinput` events as well as key presses.

## Out of scope

- Multi-book series (spec 2).
- Font size and line-spacing controls (the popover leaves room for them).
- Moving desks into the project folder.
- Replacing the textarea editor (needed for first-line indents, paragraph dimming, inline styling).
- Collapsing the writing toolbar on narrow cards, and a one-click "give the manuscript room" layout (noted for a later spec).
