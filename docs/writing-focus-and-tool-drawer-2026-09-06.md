# Writing page, focus, and shared tool drawer

Later continuation adds draggable workspace windows, document tile presets,
Workbench, saved visual desks, and more fonts. See
[the desk and typography guide](workbench-desks-and-typography-2026-09-06.md)
for current controls; the original implementation record below is historical.

## Controls

- Manuscript toolbar: choose **Glass** or **Paper**, and **Light sans** or
  **Regular sans**. The optional paper surface is quieter than the existing
  glass tools. Both weights use bundled Inter Variable (350 and 400); other
  tools and notes retain their original typography.
- **Focus** fills the app viewport with the writing page. **Esc** or **Back to
  workspace** restores the previous workspace, including sidebar collapse,
  maximized panes, and any open tool drawer. Browser/desktop chrome is not
  controlled: this is app focus, not the browser Fullscreen API.
- Minimize any workspace pane to park it in the right-side **Tools** drawer.
  **Tabs** shows one tool at a time; **Stack** provides a scrollable vertical
  set of tools. The restore icon returns a tool to its original region and
  explicit size; the close icon still closes that pane.
- Drawer tabs support Left/Right/Home/End keys. Escape closes the drawer and
  returns focus to its trigger. A focused floating editor handles its own
  Escape first, so closing the drawer does not also collapse that editor.
- Floating character/scene/reference editors remain a separate layer of
  unfinished edits. Writing focus hides their windows and recall tabs without
  discarding them; Alt+1–9 recall is suspended until focus ends.

## Persistence and ownership

Writing appearance is a browser preference. Drawer Tabs/Stack preference is
stored per project/workspace in browser storage. Neither preference changes
manuscript content or the server's workspace schema. Storage errors fall back
to session-only choices.

Focus, current parked panes, positions, and unsaved tool form state remain
session-only. Save work before reload or project switching. Native mobile
keyboards/touch and extended real-writing comfort still need user acceptance.

`web/src/writingView.ts` keeps appearance and transient focus independent from
the saved workspace layout. `WorkspaceCanvas` now owns stable `PaneMount`
instances: each renders to one persistent DOM host, which is moved between
workspace regions and the drawer without changing React portal targets.
This retains local inputs such as unsent Muse questions across minimize,
maximize, restore, and drawer view changes. Hosts return in original pane
order. A focused parked manuscript temporarily occupies the full writing
region and returns to the drawer on Escape.

This replaces the old conditional rendering that unmounted minimized panes
and non-maximized companions. It does not change document autosave or story
save business logic.

Full-suite tracing also exposed a separate navigation race: selecting the
already-open project started a fresh load, replacing pane instances after
typing had begun. The project menu now treats current-project selection as
a no-op. Intentional project changes and explicit internal project refreshes
remain unchanged.

## Verification

- `e2e/writing-focus.spec.ts`: viewport focus, caret/input preservation,
  Escape restoration, floating recall isolation, maximized/collapsed layout,
  appearance persistence, and phone presentation.
- `e2e/tool-drawer.spec.ts`: Tabs/Stack, unsent question and note retention,
  layout restoration, accessible keyboard tabs, per-workspace preferences,
  phone bounds, and focus from a parked manuscript.
- `e2e/project-navigation.spec.ts`: selecting the current project does not
  request a reload or discard an unsent question.
- Existing floating-editor, resizing, responsive, upload/save/reload, Themes,
  References, Goals, Progress, revision recovery, and atlas tests remain in
  the full browser gate.

Final gate: 35/35 Chromium scenarios, 13 server test files, 18 web helper tests,
production build, server/e2e typechecks, and diff check pass. Navigation/drawer
scenarios also pass three repeated runs (12/12). Desktop and phone screenshots
were reviewed. The latest KNOWLEDGE.md entry records this alongside history.
