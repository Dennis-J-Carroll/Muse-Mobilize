# Mobile atlas and undo

Implemented September 15, 2026.

## Atlas gestures

- Drag open map space with one finger to pan.
- Spread two fingers to zoom in; bring them together to zoom out. The map point under their midpoint stays anchored, even while both fingers move.
- Lift one finger to continue panning with the remaining finger.
- Drag a landmark with one finger to reposition it. Adding a second finger cancels that unsaved move and starts camera zoom instead.
- A cancelled gesture does not save a landmark move.
- Zoom buttons and Fit remain available. The phone inspector leaves room for these controls, and the atlas can scroll into view without collapsing to a narrow strip.

Only the atlas handles these gestures; the rest of the page retains normal browser behavior. Zoom changes the camera, not saved landmark coordinates.

## Undo and redo

**Writing:** use Undo/Redo above the manuscript, outline, or notes. Continuous typing is grouped into short bursts; replacements and pauses start new steps. Ctrl/Cmd+Z undoes writing; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes it. Restored writing follows the usual autosave and draft-recovery path. Accepted suggested edits can also be undone.

**Open card forms:** Undo form edit and Redo form edit work inside character, world, plot, scene, reference, theme, and goal forms that use draft recovery. These reverse the open form's values; save the form to commit them. Agent Studio and Project Binder have their own Undo/Redo controls for agent settings and recipe changes.

**Saved project changes:** use Undo/Redo in the workspace toolbar. This covers saved story cards and facts, plot records, scenes and themes, goals, atlas background settings and landmark moves, references, Sources, connections, document creation/writing, agents, arrangements, binder recipes, and saved workspaces. Save or cancel open card forms first. Pending writing is saved before the most recent saved action is undone.

Saved undo checks the affected files before restoring them. If they have changed elsewhere, restoration stops and preserves the newer files. Restored agent permissions receive a fresh policy revision so a running agent cannot mistake restored settings for its original configuration. Undo does not recall information already sent to a model.

Undoing a removed reference or Source restores its captured data, including deleted image or Source bytes. Restored image bytes may remain in the project after redo so newer references can continue using them.

### History lifetime

- Writing and open-form history keep up to 80 local steps while that editing state remains open. Reloading clears these local stacks; draft recovery is separate.
- Saved history keeps up to 40 actions for each browser session and project, bounded by memory limits. It survives page reloads in the same browser session while the local server remains running.
- Restarting the server clears saved undo history. A new browser session starts its own history. History is not included in portable project backups.
- A capture larger than 32 MiB cannot enter saved history. Saving still succeeds, the affected session history clears, and the toolbar reports that the change could not be captured. Stored history is capped at 64 MiB per session, with older sessions/actions evicted as needed.
- Model calls, exports, settings changes, project creation/restoration, and browser workspace layout gestures are outside saved content undo. Exports and model responses are not reversible actions.

Use **Backups** for recovery across server restarts and longer editing sessions.

## Neutral starter content

New projects use `character-1` for the example character, persona ID, contact references, manuscript, outline, notes, and visible examples. Hard-coded app examples no longer use Kiala or Senna. Existing project manuscripts and author-created character names are not rewritten; these are saved story data rather than application labels.

## Phone check

1. Reload Muse on the phone after the development server picks up the changes.
2. Open World Building. Pinch both directions, move both fingers together, then lift one and continue panning.
3. Start a drag on a landmark, add a second finger, then release. Confirm the landmark did not move in saved data.
4. Move a landmark normally. Use workspace Undo, then Redo. Reload and check the final position.
5. Type in a document and try its Undo/Redo buttons with the software keyboard open and closed.
6. Edit a card field, undo it, redo it, then save. Use workspace Undo to reverse that save.
7. Try the same gestures in landscape. Report the phone model/browser if a native gesture behaves differently from Chromium emulation.

## Next development steps

1. Complete physical-phone keyboard, upload, download, and PDF checks using [the phone checklist](testing-on-your-phone.md).
2. Exercise one complete project workflow: draft, cards, scoped agent advice, binder export, backup, and restore into a new project.
3. Refine first-run onboarding and the install/open experience. The current browser architecture makes an installable web-app path a natural implementation to evaluate.
4. Before a hosted or shared beta, implement the deployment access model, authentication, project authorization, and backup/recovery operations. The current development server is intended for a trusted private network.
5. Validate configured model providers and scoped-agent behavior with a small, explicit test budget, then run a small beta with real writing projects.

## Validation — September 15, 2026

- Server suite: 133 tests passed.
- Frontend suite: 48 tests passed.
- Full Chromium suite: 83 of 84 scenarios passed initially. The remaining scenario found that the added toolbar shortened the manuscript on a narrow screen; the stacked editor minimum height was corrected.
- Final affected browser suites: all 18 scenarios passed, covering atlas touch gestures, writing and saved undo, Agent Studio, Project Binder, responsive layouts, tool drawers, and writing focus. This rerun includes the previously failing manuscript-height scenario. The complete 84-scenario suite was not repeated after that correction.
- Final production build and TypeScript checks passed. The source scan found no Kiala or Senna references in `web/src`, `server/src`, or `shared`.
- Browser checks used Chromium touch emulation, including actual multi-touch events. Physical iOS/Android keyboard and native gesture behavior still require the phone checklist above.
