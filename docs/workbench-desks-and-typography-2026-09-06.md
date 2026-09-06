# Draggable windows, Workbench, and personal desks

## Try it

1. Drag any workspace card by its dotted title handle. Arrow keys move it by
   5px; Shift+Arrow moves by 20px. The layers icon returns it to its original
   layout. Resize, minimize, maximize, and manuscript Focus remain available.
2. Open pages through **Documents**, then choose **Tiles → Columns, Rows, or
   Grid**. **Workspace** returns documents to their original regions.
3. Enable **Workbench** to park companion tools along the right edge. Documents
   remain on the desk unless individually minimized. Click a right-edge tool
   tab to launch or recall it. **Tools** still opens the shared Tabs/Stack drawer.
4. Arrange cards, choose **Desks**, enter a name, and **Save desk**. Click its
   visual preview to restore that arrangement. Up to twelve desks per project
   are stored in this browser. Removing a desk removes only its saved layout.
5. On a manuscript card, choose **Writing font**: Inter, Times New Roman, Antic,
   Antic Didone, Italiana, Josefin Sans, or Josefin Slab. Paper/Glass and writing
   Focus remain independent. Esc exits writing Focus without losing layout.

## What a desk remembers

Workspace card identity, order, original region, explicit size, floating
position/size/layer, minimized/maximized state, tile preset, Workbench state,
sidebar collapse, region split sizes, drawer view, and manuscript appearance.

Previews are miniature layout drawings, not manuscript screenshots. They
contain card titles and placement, never prose or unsent questions. Floating
cards are drawn above tiled cards, matching the live desk's stacking order.

Restoration reuses matching mounted cards. Unlisted live cards are parked,
not closed. Documents or agents no longer present in the project are skipped.
Document text remains in the normal document store and autosave path; desk
files never restore older manuscript contents. Existing floating entity-editor
forms remain untouched, including their current drafts and positions. They are
not serialized as part of a saved desk and cannot be recreated after reload.

Desks are browser-local, project-specific layout preferences, not backups or
cloud-synced workspaces. Save unfinished tool edits before reload or switching
projects. Floating window geometry is clamped to the current viewport, with
space reserved for recall tabs. Active layouts are session-only unless saved
as a named desk. Switching Drafting/Planning/Review resets the active tile and
Workbench modes; named desks remain available.

## Interaction and accessibility

- All workspace window handles accept pointer dragging and repeated keyboard
  nudges. Moving a card out of the drawer closes the drawer and preserves the
  handle's focus. Reparenting never replaces the React portal target.
- Workbench tabs use Up/Down/Home/End for navigation and Enter/Space to open.
  Drawer tabs retain Left/Right/Home/End navigation. Tools remains a separate
  shortcut to parked windows.
- On phones, Workbench uses compact icon tabs with accessible names and tooltips.
  Collapsed entity editors occupy a separate lower section of the recall rail.
  Tiles become a scrollable single column.
- Writing Focus hides Workbench, Tools, and floating editors, then restores
  the prior room on Escape. It fills the app viewport, not operating-system UI.
- The saved-desk dialog supports Escape and contained Tab navigation. Failed
  browser storage writes leave previous desks unchanged and show an error.

## Fonts

Inter and Josefin families use bundled variable fonts and support Light 350 /
Regular 400. Antic, Antic Didone, and Italiana have a regular face only; the
weight control is disabled for those and Times New Roman. This avoids implying
that a real light font exists when it does not. Typography applies only to
manuscript cards, not notes or tool forms.

Fontsource packages are self-hosted. Their SIL Open Font License notices ship
in `web/public/font-licenses/` and the production build. Antic Didone provides
the high-contrast serif variation closest to the Antic specimen in the supplied
reference. See [Antic Didone](https://fontsource.org/fonts/antic-didone),
[Italiana](https://fontsource.org/fonts/italiana),
[Josefin Sans](https://fontsource.org/fonts/josefin-sans), and
[Josefin Slab](https://fontsource.org/fonts/josefin-slab).

Times New Roman uses an installed font; Liberation Serif, Tinos, and generic
serif are fallbacks. The UI states this explicitly. Microsoft permits naming
Windows fonts in CSS stacks but restricts redistributing their files; no
proprietary Times New Roman files are bundled. See
[Microsoft's font redistribution guidance](https://learn.microsoft.com/en-us/typography/fonts/font-faq).

## Architecture and regression coverage

- `WorkspaceCanvas` moves stable DOM hosts between regions, document tiles,
  the drawer, and a body-level floating layer. A retained focus reference
  restores the active control after host relocation.
- `workspaceLayout.ts` handles pure viewport bounds and the default Workbench
  document policy. Personal arrangements belong to Desks, not a hard-coded
  rule about which notes writers should keep nearby.
- `desks.ts` validates versioned browser records and reconciles saved pane
  identities with live ones. `SavedDesks` owns previews and storage errors.
- `loadDoc` rejects late results if the project/session changed or the document
  was already loaded/edited. This protects pages reopened through desk presets
  from overlapping reads overwriting newer content.
- New browser coverage: `writing-fonts`, `workspace-windows`, `document-tiles`,
  `workbench`, and `saved-desks`. Helper coverage includes invalid snapshots,
  stable identities, parked extra panes, viewport fitting, and late read races.
- Existing upload/save/reload, Themes, References, Goals, Progress, responsive,
  floating-editor, revision recovery, and focus scenarios remain in the gate.

Native phone touch/keyboards and long-session writing comfort still require
user acceptance. Tests use disposable projects and mock providers, never the
live manuscript at localhost:5177.

Final gate: **42/42 Chromium scenarios**, **25 web helper tests**, **13 server
test files**, production build, server/e2e typechecks, and diff check pass.
Desktop and phone previews were visually reviewed. Implementation is tracked
on `codex/floating-editor-integration`; Dennis authorized committing this work.
