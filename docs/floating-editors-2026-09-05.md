# Floating editors and pearl-glass refinement — 2026-09-05

## User-facing behavior

- Left tool menu collapses to a narrow recall rail on desktop or a compact
  header on phones. Project menu stays accessible; manuscript stays mounted.
  Long project lists scroll independently of New Project and Settings.
- Scenes Story material collapses independently, reclaiming its grid track.
- Scenes, Characters, World, Plot, Themes, References, and Goals each open
  independent floating editors. Different existing entities of the same type
  can stay open together. Reopening an entity recalls its current draft.
- Drag the grip or use its arrow keys to move an editor. Escape or **Send to
  side** collapses it into the right-edge strip. Click its tab or use Alt+1–9
  to recall it. Focus returns to the previous field. Cancel/× still discards.
- Normal workspace panes have pointer and keyboard resize handles. Explicit
  size survives maximize/restore during the current session.
- Glass keeps the original palette, with faint pearl-blue/warm-sand highlights
  and stronger etched edges. Inter weights and text contrast remain unchanged.

These are session-only editor drafts and positions, not durable recovery:
save changes before reloading, closing the app, or switching projects.
Only one unsaved **new** editor per type is allowed; existing entities remain
independent. Slots above nine still have clickable recall tabs.

## Architecture and plan adjustments

Claude's completed foundation was fast-forwarded from `c679388` to `f5a5d81`.
New integration work is on `codex/floating-editor-integration`; the separate
Claude worktree remains untouched. No new commits were created for this pass.

The approved spec and original plan remain in `docs/superpowers/`. One important
adjustment: editor React elements are held by an app-root host, not pane-local
maps. Tool focus/maximize/layout switches unmount pane bodies; a portal alone
does not change React ownership. Stable app-root keys preserve each form's
state across these transitions. Closing releases its content and hotkey slot.

`web/src/components/floatingEditors.tsx` owns this boundary. FloatingDrawer owns
position, keyboard/pointer behavior and focus; FloatingPanelStrip owns recall.
The existing store keeps metadata and session-only content; it never serializes
React elements. Project switching clears both collections.

Related regression fixes: stable Zustand selector snapshots in Plot/World,
explicit hidden styling for the Story material body, an ancestor container for
scene layout queries, and corrected atlas reload assertions that wait for saved
state rather than mistaking loading emptiness for a hidden map.

Concurrent milestone saves now queue functional updates against the latest
goals, and route moves reindex the new sequence rather than sorting by stale
order values. Project-session guards keep late story responses/uploads from
populating another project or closing a new same-ID editor. Large atlas images
can zoom out far enough to fit a phone canvas.

## Verification entry points

- `e2e/collapse.spec.ts`: workspace reclaimed without losing manuscript edits.
- `e2e/floating-editors.spec.ts`: cross-tool drafts, same-type drafts,
  drag/resize/restore, seven editor types on phone.
- `e2e/floating-save-races.spec.ts`: delayed project-switch save and overlapping
  milestone writes.
- `e2e/world-map.spec.ts`: upload, opacity, hidden/visible reload, collapsible
  controls, hidden-map image retention, and large-image phone fitting.
- `e2e/responsive.spec.ts`: long project-menu footer reachability and phone
  upload/save/reload; `e2e/references.spec.ts` includes uploads while docked.
- Existing Themes, References, Goals, Progress, revision, and responsive tests
  remain part of the full gate.

Full gate: 28 Chromium scenarios, 13 server test files, 18 web helper tests,
frontend build, server/e2e typechecks, and diff check pass. KNOWLEDGE.md records
the final integration verification alongside earlier history.
Scripted Chromium coverage is not native iOS/Android touch-keyboard acceptance.
Next user test: use real map/reference images, keep several drafts open while
switching tools, then report any surprising collapse, focus, or save behavior.

Minor follow-up: inline Goals uses a local busy boolean, which can clear after
the first of several queued route actions. Writes still serialize correctly;
a pending counter would make that busy indication exact.
