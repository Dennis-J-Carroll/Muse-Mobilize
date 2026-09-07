# Muse-Mobilize Knowledge & Continuation Log

Last updated: 2026-09-07, creating the document-first Mobilize skill and an export roadmap.

## Mobilize preparation and export seed — 2026-09-07

- `skills/mobilize/` is the maintained Codex/Claude skill package. Its offline
  Node helper previews an explicit source selection and, after approval of that
  exact hash, creates a Muse-restorable project JSON. No source writes or live
  app API calls occur. Relative links and assets are not silently rewritten.
- Matching personal copies were installed in `~/.codex/skills/mobilize` and
  `~/.claude/skills/mobilize`, with metadata validation and helper tests passing
  in both locations. A fresh host session may be needed for skill discovery.
- Original Markdown/text bytes and source provenance survive through a Notes
  receipt. Stable IDs enable repeatable packaging, not in-place synchronization;
  each app restore still creates another project. Structured fact/card extraction
  and a first-class contested-account model are deferred.
- Standalone behavior checks and a real backup-service restore/export round trip
  cover preservation, approval/change detection, path safety, output protection,
  size bounds, and identity behavior. An independent synthetic dry run preserved
  all source hashes, excluded retired/session material, and stopped at approval.
- Verification: six standalone helper cases, all sixteen server test files
  (including the real restore/export compatibility test), production build,
  server TypeScript check, and whitespace check pass. No runtime app UI changed;
  the browser suite was not rerun for this skill-only slice.
- KingsBlood's three-file pilot remains preview-only. Packaging requires approval
  of its current selection/hash; restoring needs an explicit destination choice.
- `docs/mobilize-and-export-roadmap.md` separates existing project archives from
  proposed reader editions and adaptations. Portable Saved Desks, novel renderers,
  comic panels, and update/merge import remain future work.

The earlier “/mobilize not implemented” checkpoints below are historical and
superseded by this section. Existing `.claude/` and `notes/` remain unrelated.

## Writing trust and connected story layer — 2026-09-06

- Manuscript edits journal synchronously to versioned, project/document-scoped
  browser storage. Reload offers explicit restore/discard and comparison when
  saved text differs. Autosaves serialize; late replies cannot clear newer edits
  or enter another project. Patch acceptance is gated by successful saving and
  preserves keystrokes made while a patch response is pending.
- All seven floating editor forms and Goals session targets have browser-local
  draft recovery. Reopen the same record/new form after reload. Save clears only
  its matching revision; Cancel cannot discard another form's newer revision.
  Quota/storage failures are visible, preserve prior durable copies, keep affected
  closed editors mounted in the drawer, and prevent unsafe project switching.
- Backups download saved project files and restore a separate project identity.
  Checksums, size limits, allowlisted paths, staged installation, collision checks,
  and field-specific image URL remapping protect restoration. Originals remain
  untouched. Provider keys, browser-local drafts, and Saved Desks are excluded.
- Connections provides shared tags, stable renames, typed record links, backlinks,
  and passage annotations in `connections/connections.json`. Its index filters
  across tools by tag/type; it does not globally filter every canvas.
- Manuscript **Tag / link** or typed **`!#`** opens connections above writing focus.
  Selected prose is restored when the command temporarily replaced it. Exact
  quotes plus adjacent context guide passage jumps; missing/ambiguous passages
  require explicit reconnection. Unlink removes the attachment, not prose or tags.
- Frosted palette and existing editor forms are retained. Saved record editors
  expose **# / Tags and links**. Escape returns through connections → card → draft.
- KingsBlood remains read-only and unimported. `/mobilize`, source provenance,
  competing-account schema, and source maturity remain a separately approved next
  slice. Existing `.claude/` and `notes/` are untouched. This implementation
  extends `8363d49` on `codex/floating-editor-integration`; check `git log -1`
  for the current committed checkpoint and `git status` for subsequent work.

Feature boundaries, acceptance checklist, and continuation prompt:
`docs/writing-trust-and-connections-2026-09-06.md`.
Backup format: `docs/project-backups-contract.md`.

Verified final gate: **59/59 Chromium scenarios**, **44 web node:test cases plus
7 bang-hash assertions**, **15 server test files** (including 15 connection and
11 backup service cases), production build, server/e2e typechecks, and diff check.
Desktop and phone connection screenshots were inspected. Existing 5177 preview
health returns `ok`; its tab was not reloaded. Browser tests used isolated
5277/5278 temporary projects. Native Firefox/fullscreen Escape, mobile keyboard
input, touch, and long-session comfort remain Dennis's acceptance checks.

The older sections below record historical checkpoints; session-only draft and
unimplemented-tag notes are superseded by this section.

## Quiet focus and story-card layers — 2026-09-06

- Optional Hide controls removes manuscript toolbar and font notices only in
  writing focus. A small feather restores controls; preference persists locally.
- Browser Fullscreen is a separate user-triggered option with denied/unsupported
  fallback. Fullscreen targets the document root so editor portals remain visible.
  Native browser exit does not intentionally exit Muse focus; browser Escape and
  toolbar reveal still need Firefox/OS hands-on acceptance.
- Story cards / Alt+Shift+K opens lookup over the draft, including parked editor
  drafts. Character/World aliases/categories, theme motifs, and reference image
  tags participate in lookup. Ctrl+Shift+K is avoided because Firefox reserves it.
- All seven existing record-editor entry points are shared with focus lookup.
  Pulled cards remain draggable and editable. Escape docks only the current app
  layer, preserves the form, and restores manuscript selection. Tab stays inside
  the active focus layer. Save uses existing APIs; drafts remain session-only.
- Persistent tags, `!#` parsing, passage anchors/backlinks, and `/mobilize` imports
  are not implemented in this slice. Their focus-layer contract is documented.
- KingsBlood was inspected read-only. Proposed pilot: Dermelius Royer, Jandell,
  and The Load They Bear. Keep source Markdown unchanged. Import metadata must
  separate document maturity from claim authority, preserve intentional competing
  accounts and names, and exclude superseded / PLAY / unreviewed sources from
  automatic canon extraction. No story files were imported or modified.

Details: `docs/quiet-focus-and-story-cards-2026-09-06.md` and
`docs/kingsblood-mobilize-preview-2026-09-06.md`.
Verification: **48/48 Chromium scenarios**, **25 web helper tests**, **13 server
test files**, production build, server/e2e typechecks, and diff check pass.
Six new browser scenarios exercise quiet focus and layered story-card behavior.
Changes are uncommitted after `8363d49` on `codex/floating-editor-integration`.
Unrelated `.claude/` and `notes/` remain untouched.

Next: hands-on quiet-focus acceptance, then a shared tag/annotation contract and
provenance/contested-account schema before any approved KingsBlood import.

## Personal desks, window movement, and typography — 2026-09-06

Dennis requested dragging for every workspace window, document tile templates,
an optional right-edge Workbench, Times New Roman and fonts from a Typemade
reference. His follow-up clarified personal desk setups: click a visual preview
to restore cards in their chosen arrangement.

- Every workspace header now has a pointer/keyboard move grip. Floating bounds
  remain separate from original tile sizes; Return to layout restores the slot.
  Movement, resize, minimize/maximize, and writing Focus preserve mounted tools.
- Documents picker opens existing project pages. Columns, Rows, and Grid tile
  open documents; Workspace restores their original regions. Phone tiles stack.
- Workbench parks companion tools and exposes all story tools and agents as
  right-edge launch tabs. Tools still opens Tabs/Stack. Entity-editor recall
  occupies a separate lower rail; focus mode hides both layers temporarily.
- Desks saves up to twelve named, clickable layout previews per project/browser.
  It remembers card order, regions, bounds, floating layers, parked/maximized
  state, tile/Workbench settings, sidebar, splits, and manuscript appearance.
  Restoring matches existing pane identities; extra live cards park safely.
  Previews contain titles/geometry, not prose. No draft text is serialized.
- Added Inter, Times New Roman (installed/system fallback), Antic, Antic Didone,
  Italiana, Josefin Sans, and Josefin Slab choices. Open fonts are self-hosted;
  license notices ship in web/public/font-licenses. Static faces use Regular,
  variable faces retain Light 350 / Regular 400. Other tools keep their font.
- Regression-first fixes cover keyboard focus lost during host reparenting,
  preview painter order hiding floating cards, and late document reads that
  could overwrite newer writing or enter a different project/session.

Final verification: **42/42 Chromium scenarios**, **25 web helper tests**,
**13 server test files**, production build, server/e2e typechecks, and diff
check pass. Desktop/phone screenshots reviewed. Existing upload → save → reload,
Themes, References, Goals, Progress, and floating-editor coverage remain green.

Details: `docs/workbench-desks-and-typography-2026-09-06.md`. Desks remain local
to this browser, not cloud-synced backups. Entity-editor drafts/positions are
left untouched when switching desks but are not part of saved desk records.
Save unfinished edits before reload. Native touch/keyboards and long-session
comfort still need user acceptance. Implementation is tracked on
`codex/floating-editor-integration`; unrelated work and Claude's tree preserved.
Dennis authorized the implementation commit after this verification gate.

## Writing page and shared tool drawer — 2026-09-06

Dennis requested a distinct optional manuscript surface, light sans typography,
viewport-filling focus with Escape restoration, and approved a shared right-side
drawer with Tabs/Stack views alongside existing floating-editor recall tabs.

- Manuscript-only Glass/Paper and Light/Regular sans controls use bundled Inter
  Variable (350/400). Appearance persists locally without changing other tools,
  notes typography, or manuscript content. Paper uses a quieter warm surface
  and a roughly 68-character measure.
- Focus fills the app viewport, hides workspace chrome and floating editors,
  and suspends their recall shortcuts. Escape restores previous sidebar,
  pane sizes, maximized arrangement, and open drawer. Browser/OS chrome stays.
- Minimized workspace panes now live in one right-side tool drawer. Tabs shows
  one tool; Stack shows a scrollable set. View preference persists per project
  and workspace. Restoring returns a pane to its original region and order.
- Stable portal hosts preserve unsent questions and tool state through
  minimize/maximize/restore and drawer changes. Focus also works from a parked
  manuscript and returns it to the open drawer without discarding edits.
- Full-suite trace exposed a separate same-project navigation race: the menu
  reopened an already-current story, replacing panes after typing began. The
  menu now closes without reloading when that story is already selected.

Verification: **35/35 Chromium scenarios pass**, including seven new writing,
drawer, and project-navigation scenarios. Navigation/drawer regressions also
passed three consecutive runs (**12/12**). **13 server test files**, **18 web
helper tests**, production build, server/e2e typechecks, and diff check pass.
Desktop and 390px phone screenshots were reviewed; native mobile keyboard/touch
acceptance remains. Tests use disposable projects and mock providers.

Details and limits: `docs/writing-focus-and-tool-drawer-2026-09-06.md`.
Changes remain uncommitted on `codex/floating-editor-integration`; existing
Claude worktree and unrelated files are preserved. Save before refreshing the
live preview at `http://localhost:5177/`. Unsaved tool forms remain session-only.

## Floating editors, collapse, and integration acceptance — 2026-09-05

Claude's stopped foundation was fast-forwarded through `f5a5d81` with Dennis's
approval. Integration continues on `codex/floating-editor-integration`; new
changes are uncommitted, and Claude's worktree plus `.claude/` and `notes/`
remain untouched. See `docs/floating-editors-2026-09-05.md` for controls,
architecture, tests, and known limitations.

- All seven story editors now float, move, collapse into recall tabs, and keep
  independent drafts through tool/layout switches. Alt+1–9 recalls docked
  editors; Escape docks without discarding. App-root ownership is necessary:
  pane-local portals still lose state when their parent pane unmounts.
- Tool sidebar and Scenes Story material collapse independently; normal panes
  support pointer/keyboard resize. Pearl-blue/sand sheen adds material depth
  while preserving the palette, Inter typography, and readable manuscript.
- Regressions exposed and fixed stale milestone-save overwrites, late responses
  entering another project's client state, milestone reorder undone by old
  order values, narrow map fitting blocked by a minimum zoom, and Settings
  pushed below long project lists. Upload tests now validate docking rather
  than the superseded Escape-to-close behavior.
- Full gate: `npm run test:browser` **28/28 Chromium scenarios pass**;
  `npm test` **13 server test files pass**; direct web helper invocation
  **18/18 tests pass**; `npm run build`, server/e2e TypeScript checks, and
  `git diff --check` pass. Scoped independent fix review reports no new issue.
- Tests use disposable projects and mock providers, never the live manuscript.
  Desktop and phone captures support visual review. Native mobile keyboards,
  touch dragging, and extended writing sessions still need user acceptance.
- Unsaved floating drafts/positions remain session-only: save before reload or
  project switch. Minor deferred polish: a pending counter would make inline
  Goals busy indication exact during overlapping queued route operations;
  serialized writes already preserve the data.

Handoff: `/tmp/MUSE_MOBILIZE_FLOATING_HANDOFF_2026-09-05.md`.
Next-session prompt: `/tmp/MUSE_MOBILIZE_FLOATING_NEXT_SESSION_PROMPT.md`.
Preview: `http://localhost:5177/`; save before refreshing the existing tab.

## Atlas background for the World map — 2026-09-05

Continuation of a plan handed off mid-implementation: `server/src/world-map.ts`
and its store test already existed (a per-project singleton, same shape as
`goals.ts`/`settings.ts`) but had no routes, no GC integration, and no UI.

- **Routes**: `GET`/`PUT /api/projects/:id/world-map`, mirroring the goals
  route pair. `PUT` diffs the previous image against the new one and GCs the
  displaced file — the write side of image cleanup that reference deletion
  already had.
- **GC fix (the actual insight from the handoff)**: `imageGc.ts`'s
  `collectManagedImageFileNames` didn't know the map store existed, so
  deleting an unrelated reference that happened to share a file with a
  *hidden* map background would have deleted the atlas image too. Added
  `readWorldMap` to the collector; regression test in
  `imageGc.test.ts` plants an image used by both a reference and a hidden map,
  deletes the reference, and asserts the file survives.
- **Input validation**: `world-map.ts` now clamps `opacity` to `[0,1]`,
  coerces `visible` to boolean, and validates `image` the same way
  `references.ts` does (managed project asset or http(s) URL only).
- **UI** (`WorldPane.tsx`): the map image renders inside `.world-space`,
  before the links/nodes SVG, so it pans and zooms with landmarks using the
  same transform — no separate camera state. A collapsible "Atlas background"
  panel (toggled from the canvas nav) has upload/replace, an opacity slider,
  a show/hide checkbox, and a "Fit to canvas" button.
- **Fit-to-canvas is camera-only, not a persisted placement.** The map has no
  stored `{x,y,width,height}` — it renders at its natural pixel size, anchored
  at world-space origin `(0,0)`, same coordinate system landmark positions
  already use. `fitWorld` unions the image's natural bounds with landmark
  points, so "Fit landmarks" and "Fit to canvas" never disagree. Consequence:
  a user who has already placed landmarks can't slide the map underneath them
  to align it — only pan/zoom together. If that's needed later, it's a schema
  change (a stored map rect), not a UI tweak.
- Found and fixed one more real bug while writing the e2e test: the canvas's
  pointerdown handler captures the pointer for panning unless the click
  target is inside `.world-node, .world-inspector, .world-nav` — the new
  `.world-map-panel` wasn't in that exclusion list, so every click on its
  controls (checkbox, buttons) got hijacked into a pan-capture instead of
  reaching the control. Added `.world-map-panel` to both the pointerdown and
  double-click exclusion lists.
- Opacity slider commits on `pointerup`/`blur`, not on every `onChange` step.
  A naive per-step PUT would fire ~9 read-modify-write requests for one drag
  and, since `writeWorldMap` has no request serialization, an out-of-order
  response could silently overwrite the last value the user actually set.
  The slider still updates instantly (local `displayOpacity` state drives
  both the input and the `<img>` layer directly, independent of the network
  round trip); only the commit is deferred and coalesced to one request.
- "Fit to canvas" is disabled until the background image's natural size has
  loaded (`mapNatural`), so clicking it immediately after upload can't
  silently fit landmarks only while ignoring the map.
- The background panel auto-opens when a project loads with an image set but
  `visible: false` — otherwise a user who hid the map, then reloaded, would
  have no visible way back to the `▤` nav toggle that reveals it again.

### Verification

- `npm test`: 57 server tests pass, including the new GC regression
  (`imageGc.test.ts`) and the pre-existing store test.
- `npx tsc -p server/tsconfig.json`, `-p web/tsconfig.json`, `-p e2e/tsconfig.json`:
  all pass.
- `npm run build`: passes.
- `npx playwright test`: 19/19 pass (Chromium), including two specs in
  `e2e/world-map.spec.ts` — upload/opacity-commit/show-hide/reload
  persistence, and the reference-deletion-while-map-hidden GC scenario
  end-to-end (not just the unit test).
- `git diff --check`: passes.
- Verification here is scripted (server tests + Playwright/Chromium), not
  hands-on interaction with the running app in a browser.

## Etched-glass UI and phone acceptance — 2026-09-05

Dennis requested the same palette in a neo-minimalist skeuomorphic style:
frosted etched glass, subtle inset weight, and thin Inter/SF-style typography.
Shared material tokens and `web/src/styles/materials.css` apply that direction;
Inter Variable is bundled locally. Display weight is 300, manuscript 400, and
control labels 450. Secondary text contrast is stronger than the previous skin.

Two new red-green browser regressions caught phone-specific layout failures:
the fixed sidebar left only 92px for the workspace, and desktop split sizing
then left only 44px for the manuscript. At <=700px, a horizontal tool rail and
stacked drafting panes now preserve usable writing space without changing saved
desktop arrangements. Pane stacking uses a <=650px workspace container query so
900px tablets also retain a readable manuscript. Upload/save/reload and
project-menu reachability are tested at 390px; drafting is tested at 390/900px.
Desktop collapse/focus controls remain separate work.

Full gate: 17 browser scenarios, 12 server test files, upload helpers, frontend
build, server/e2e typechecks, and diff check passed. Visual checks covered desktop,
390px phone, and 700px tablet layouts. See `docs/design-2026-09-05.md` for details,
limitations, and current next steps. Previous acceptance report is historical;
its references to missing GC and revision bodies predate committed fixes below.

No commit created for this UI pass. Pre-existing untracked `notes/` was untouched.

## Unresolved revision persistence — implemented — 2026-09-04

Item #4 from the prior handoff is done. Split into two deliverables per
advisor consult (both shipped together, not sequenced across sessions):

1. **Dismiss-only recourse** — the actual stuck-state bug fix. No schema
   change needed; `POST /patches/reject` already only needs `{patchId}`.
2. **Body persistence** — `patch.proposed` events now carry `beforeText`/
   `afterText` (`server/src/agents.ts` emit call), so a recovered patch can
   also be *accepted*, not just dismissed.

**Wiring decisions settled:**

- **Where it renders:** `ReviewPane` (`web/src/panes/ReviewPane.tsx`), not
  `ProgressPane`. A **hydrate-`runs`-at-load** option was investigated and
  *rejected*: `web/src/panes/AgentPane.tsx` renders full run transcripts
  (question/text/consultations/provider/model) from the same `s.runs[agentId]`
  slice `ReviewPane` reads. Synthesizing a fake `AgentRun` for a recovered
  patch would inject fabricated conversation history into AgentPane. Instead,
  `ReviewPane` reads `progress.unresolvedRevisions` directly and renders any
  entry whose `patchId` isn't already covered by a live `runs`-backed patch
  through a new `web/src/components/RecoveredPatchCard.tsx` — separate from
  `PatchCard`, with its own local `pending`/`stale` state instead of routing
  through `runs`-keyed `markPatch` (which would silently no-op for a patch
  that was never in `runs`, per the prior handoff's own reading of that
  function — that no-op is exactly why stale-refusal visibility needed its
  own state here, not reuse of `acceptPatch`/`rejectPatch`).
- **Recovered-patch label:** `revision.actor ?? 'Agent'`. No placeholder
  `agentId` string was needed — confirmed by reading `PatchCard.tsx` in full:
  `agentId` is only passed through to `rejectPatch`'s unused leading-
  underscore parameter, never rendered or used to index anything.
- **`readEvents` cost:** unchanged, confirmed not worth revisiting — patch
  bodies are bounded ("one to three sentences", `agents.ts:33`).

**A real bug caught only by a second advisor pass, not by the test gate:**
the first draft of `RecoveredPatchCard`'s accept handler skipped
`flushDoc(documentId)` before calling `applyPatch`, unlike `acceptPatch`
(`store.ts:357`) which flushes for exactly this reason — the server always
applies to the last-saved file, so accepting a recovered patch while the
writer has unflushed keystrokes in that same document would silently
overwrite them. Fixed by calling `useStore.getState().flushDoc(...)` before
`api.applyPatch(...)`. The e2e tests couldn't catch this on their own because
they set document content via the HTTP API, never through the editor, so
there was never a dirty doc to lose — this is a case worth remembering: a
green gate does not mean an invariant like this one was actually exercised.

Coverage: `server/test/progress.test.ts` (event payload → projection,
including that a pre-upgrade/legacy event with no `beforeText` correctly
*omits* the key rather than emitting an empty string) and
`e2e/review-recovery.spec.ts` (accept-with-body updates the document and
clears the queue; legacy/bodyless patch offers Reject only, no Accept;
a patch whose `beforeText` no longer matches the document surfaces
"draft changed — stale" rather than silently no-op'ing).

## Current goal

Characters, World Building, Plot Outline, Scenes, Dialogue, Themes, References, Goals, Progress, managed story images, hosted provider fast lane, and one-click local model setup are implemented. Automated acceptance covers uploads and all four story-system surfaces. Reference deletion with cross-store managed-image garbage collection and unresolved revision recovery exist. Sidebar collapse, independent floating editor recall, pane resize, and world atlas backgrounds are now implemented. Next: Dennis's real-writing acceptance feedback and native mobile checks.

## Repository state

- Project path: `/home/dennisjcarroll/Desktop/creative/Muse-Mobilize`
- Git boundary: isolated repository on branch `codex/floating-editor-integration`.
- Baseline commit: `ccbb660` (`chore: establish Muse-Mobilize baseline`).
- Parent `creative` repository no longer determines project history.
- Product/architecture source: `muse-mobilize-handoff/MUSE_MOBILIZE_HANDOFF.md`
- Run commands: `npm run dev`, `npm test`, `npm run test:browser`, `npm run build`

## Project compass

- Purpose: local-first, artifact-centered multi-agent writing workspace where manuscript stays sovereign and agent edits remain reviewable.
- Input → process → output: manuscript selection + question → scoped context → role agent/model provider → optional explicit consultation → anchored patch → writer decision → snapshot + event history.
- Frontend: React/Vite workspace shell in `web/src`, Zustand orchestration in `web/src/store.ts`.
- Runtime: Express/TypeScript in `server/src/index.ts`.
- Core agent flow: `server/src/agents.ts`.
- Provider-neutral response parsing and patch anchoring: `server/src/protocol.ts`.
- Local project persistence: `server/src/projects.ts`; append-only history: `server/src/events.ts`.
- Portable canon store and agent rendering: `server/src/canon.ts`.
- Providers: deterministic offline mock, OpenAI, Google Gemini, xAI/Grok, Anthropic, and Ollama under `server/src/providers/`.

## Recovered Opus checkpoint

### Runtime-confirmed

Existing `Kiala Test` project event history shows:

- Project created at `2026-09-01T16:11:54Z`.
- Muse requests completed through offline mock provider.
- Muse explicitly consulted Continuity.
- Result included anchored patch proposals.
- Patch `9c5593b7-1c3f-41cc-8b7a-bee598bb24f4` created pre-apply snapshot and was accepted.
- Same patch was submitted again 5 ms later and rejected as stale. This exposed duplicate-decision race in patch card.

### Code-confirmed

- Handoff phases 0–5 now have substantial MVP implementations.
- Watchers, Writers' Room, frozen-reader semantics, plugins, branches, and desktop packaging remain future work.
- Automated coverage includes canon persistence/status/context plus output parsing, patch anchoring, and stale-patch refusal.

## Codex continuation — 2026-09-01

### Change

Hardened `web/src/components/PatchCard.tsx` against duplicate decisions:

- Added per-card `accept | reject` pending state.
- Guarded accept/reject handlers while one request is active.
- Disabled Accept, Reject, and Modify controls during decision transaction.
- Added `Applying…` and `Rejecting…` progress labels.

This prevents rapid repeated clicks from issuing duplicate patch requests and incorrectly turning successful apply into visible stale failure.

### Verification

- `npm test`: pass — 1 suite, 1 test file, 0 failures.
- `npm run build`: pass — TypeScript check and Vite production build.
- `npm run dev`: runtime started on ports 5177/5178 after local socket permission.
- `/api/health`: `{ "ok": true }`.
- Browser smoke: drafting workspace rendered with manuscript, Muse pane, scratchpad, and mock-provider status.

## Known risks and open questions

- Browser harness now exists; patch-card single-flight behavior still needs its own browser regression.
- Server patch-apply endpoint is safe against changed source text but not idempotent by patch ID; client guard handles normal UI double-submit, while retry-safe API behavior remains future hardening.
- Canon writes use whole-file JSON replacement; concurrent writers could overwrite each other. Single-user MVP is safe, multi-user work is not.
- Entity deletion and fact deletion are not exposed yet.
- Character knowledge cutoffs remain Phase 8; current character entities represent stable identity, not revision-specific knowledge.
- Existing agent YAML is never silently rewritten. Pre-Phase-5 Continuity agents receive canon through role fallback but retain their original prompt text.
- Managed images accept PNG, JPEG, WebP, GIF, and AVIF up to 5 MB. SVG and larger-file workflows remain intentionally unsupported.
- World relationship rendering resolves fact values against exact entity names or aliases; richer typed/many-target relationships remain future work.
- Plot graph writes use whole-file JSON replacement like canon. Single-user MVP is safe; concurrent writers are not.
- Scene board writes use whole-file JSON replacement like canon and plot. Single-user MVP is safe; concurrent writers are not.
- Plot edge deletion, node deletion, automatic layout, and undo are not exposed yet.
- Plot World anchors deliberately cap at three and reference canon entity IDs; they do not snapshot World data.
- Hosted model preset lists are curated snapshots and need periodic vendor-doc review.
- Manual connection checks make tiny hosted requests and may incur vendor charges; UI warns before action.
- Hosted output is request/response only; streaming and OAuth are not built yet.
- Ollama runtime installation remains an explicit operating-system step; browser
  does not silently install software.
- Local downloads have progress but no cancel control or disk-space preflight.
- Muse Glimmer is a heavyweight 30B/18 GB option, not a low-resource default.

## Suggested next step

Persist full unresolved revision bodies (see "Unresolved revision persistence — design" below). Follow with References/Goals JSON schemas. Current automated evidence is in `docs/acceptance-2026-09-04.md`.

## Sensory subtag fork resolved: decorative-only — 2026-09-04

Character sense subtags (`vision`/`audio`/`proximity`) previously carried `status`
and `evidence` fields intended as a lightweight parallel canon system. The web
editor (`CharactersPane.tsx`) re-parsed the free-text subtag field on every save
and matched each parsed subtag back to its prior `status`/`evidence` by
case-insensitive label — so renaming a subtag's label silently reset its status
to `proposed` and dropped its evidence, with no error or warning.

Decision: subtags are decorative only. `CharacterSenseSubtag` now has just
`id`, `label`, `value`, `indicator` — no `status`, no `evidence`, no label-based
matching to lose. Server (`canon.ts`), types (both packages), the editor
(`CharactersPane.tsx`), `renderCanonContext`, and `schemas/character-profile.schema.json`
were all updated together. If subtag status/evidence tracking is wanted later,
it needs stable IDs threaded through the UI (not label matching) and is a
bigger feature, not a fix — treat it as new scope, not a revert of this decision.

## Reference deletion and cross-store image garbage collection — 2026-09-04

`DELETE /api/projects/:id/references/:referenceId` (`deleteReference` in
`references.ts`) removes a reference, then `deleteOrphanedImages`
(`server/src/imageGc.ts`) deletes any managed image file the removed reference
used, provided no other store still points to it. `collectManagedImageFileNames`
scans `canon.json` (character + world images), `plot.json` (node images), and
`references.json` — the three stores that can hold a `StoryImage[]`. Covered by
`server/test/imageGc.test.ts` (orphan deleted; shared with another reference
survives; shared with a character survives) and `e2e/references.spec.ts`
("removing a reference…", verifies the file is actually gone on disk, not just
absent from the UI).

## Unresolved revision persistence — design and confirmed findings — 2026-09-04

Today, `patch.proposed` events in the append-only log carry only
`{patchId, documentId, anchored, reason}` — never the patch body
(`beforeText`/`afterText`). The full `Patch` object exists only in the
browser's in-memory run state. After a page refresh or server restart, the
Progress pane's "unresolved revisions" list still shows the patch (projected
from the event log), but there is no way to view, accept, or reject it — the
bytes needed to act on it are gone.

**Confirmed, not hypothetical: there is no dismiss/reject action reachable
once this happens.** `ReviewPane.tsx` renders exclusively from
`useStore((s) => s.runs)` (`web/src/panes/ReviewPane.tsx:6-10`). `runs` is
reset to `{}` every time a project is opened (`web/src/store.ts:188`, inside
whatever function loads a project — grep `runs: {}`) and nothing ever
rehydrates it from the server. So after a refresh, restart, or reopening the
project, `runs` is empty, `ReviewPane` shows "No revisions waiting on you.",
and the `PatchCard` accept/reject buttons that would call
`POST /patches/apply` or `POST /patches/reject` never render at all — even
though `POST /patches/reject` itself only needs `{patchId}`
(`web/src/api.ts:137-138`) and would happily clear it. The Progress pane's
counter (`progress.unresolvedRevisions.length`) can therefore go permanently
stuck with zero user recourse. This is a real stuck-state bug, confirmed by
reading the code paths end to end — not a "maybe skip this" case.

**Also confirmed: recovered patches can reuse the existing accept/reject code
almost unchanged.** `acceptPatch` (`web/src/store.ts:352-370`) takes a `Patch`
and an optional text override — it never reads `agentId` at all. `rejectPatch`
(`web/src/store.ts:372`) takes `(_agentId, patch)` — the leading underscore
means the parameter is already unused. `markPatch` (`web/src/store.ts:743-752`)
walks `runs` looking for a matching `patch.id` and safely no-ops if it isn't
found (returns `runs` restructured but unchanged) — so calling it for a patch
that was never in `runs` is harmless, not a crash risk. Net: a `Patch` object
reconstructed from a persisted event can be run through
`useStore.getState().acceptPatch(patch, ...)` /
`useStore.getState().rejectPatch(anything, patch)` today, with no changes to
either function. `PatchCard` (`web/src/components/PatchCard.tsx`) itself only
needs `{ patch: Patch; agentId: string }` as props — `agentId` is passed
through to the unused `rejectPatch` param and otherwise unread by the
component, so any placeholder string works.

**Recommended fix:** append `beforeText`, `afterText`, and `reason` into the
`patch.proposed` event payload itself (`server/src/agents.ts:227-233`) —
`progress.ts` is already a pure projection over the event log via
`projectUnresolvedRevisions`, so this needs no new storage or second source of
truth; `UnresolvedRevision` (`server/src/types.ts`) gains optional
`beforeText`/`afterText`. Patch bodies are bounded by design (agents are
instructed to keep patches to "one to three sentences" — `agents.ts:33`), so
event-log growth is not a real cost. Treat stored `start`/`end` offsets as a
discardable hint, not a source of truth — `applyPatch` (`protocol.ts:135-153`)
already falls back from the offset check to a unique `indexOf(beforeText)`
search and refuses as stale if the document moved, so recovery should
re-anchor via `beforeText` rather than trust old offsets carried in the event.
Patches proposed before this change ships will have no body in the log;
render those dismiss-only (a bare "Reject" affordance keyed on `patchId`,
no `PatchCard`) rather than trying to backfill them.

**Open wiring decisions for the next session (good advisor material, not yet
settled):**
1. Where does a recovered patch render? Options: (a) teach `ReviewPane` to also
   read `progress.unresolvedRevisions` and synthesize a minimal `AgentRun`-free
   entry per item that has a body, alongside the live `runs`-backed ones; or
   (b) render recovered patches directly in `ProgressPane`'s existing revision
   queue list, next to the "Open current review queue" button, since that pane
   already has the data. (b) is less invasive — it doesn't touch `ReviewPane`'s
   `runs`-shaped assumptions at all — but (a) keeps all patch decisions in one
   place for the writer. Pick one; don't build both.
2. What placeholder `agentId`/label does a recovered patch carry into
   `PatchCard`/the review list? The event already has `actor` on `MuseEvent`
   (optional) — likely enough for a label; no real `agentId` string is needed
   since neither `acceptPatch` nor `rejectPatch` reads it.
3. Should `readProgress` fetch full events unconditionally (it already does via
   `readEvents(projectDir, Number.MAX_SAFE_INTEGER)`, so no change needed there)
   or should the heavier body-carrying payload change that math for large
   projects? Given the "one to three sentences" bound above, almost certainly
   not — confirm rather than assume if `readEvents` performance ever becomes a
   question.

## Browser acceptance and regression repair — 2026-09-04

- Added Playwright runner plus 11 Chromium scenarios for uploads, Themes,
  References, Goals, and Progress. Real API and project files back save/reload
  checks; injected network delays/failures make transaction regressions repeatable.
- Test instance uses `MUSE_CONFIG_DIR` with a generated temporary settings file,
  mock provider, and project directory. Runtime ports 5277/5278 are isolated from
  development ports 5177/5178. Test fixtures are removed on runner shutdown.
- Fixed numeric step constraints rejecting milestone targets such as 25000 and
  session targets such as 125 words / 17 minutes.
- Fixed milestone reorder reverting to old order, coordinated session/milestone
  saves, and narrowed save payloads to the changed Goals section.
- Locked reference submission and closing during save, kept failed drafts for
  retry, and cleared stale error feedback after successful retry.
- Accepted manuscript patches now emit `document.saved` with word count, keeping
  future word-flow history aligned with manuscript changes.
- Verified: 11 browser scenarios, 11 server test files, upload helper tests,
  frontend build, server typecheck, browser-suite typecheck, and diff check pass.
- Coverage and reproduction details: `docs/acceptance-2026-09-04.md`.

## Story-system surfaces continuation — 2026-09-04

### Implemented

- Themes scene-thread map with typed `appears`, `echoes`, `fades`, and `resolves`
  occurrences in manuscript order.
- References moodboard with uploaded images, quotes, web sources, attribution,
  notes, captions, and stable links to story entities.
- Goals milestone path with session focus, word/minute targets, ordered milestones,
  status, due date, and optional word target.
- Progress workspace with current manuscript words, event-derived word flow,
  scene completion, and unresolved revision history.
- Hardened image intake: exact MIME allowlist, content-signature checks, 5 MiB
  limit, 12-file batch cap, three concurrent uploads, partial-batch success, and
  drawer locking while uploads are active.
- Legacy Scene Theme role `pressure` normalizes to `appears` during save, keeping
  pre-lifecycle projects editable while unknown roles still fail validation.
- Direct sidebar launch and focused workspace routing for all four surfaces.

### Verification

- `npm test`: pass — 11 server test files, 0 failures.
- `npm run build`: pass — frontend TypeScript check and Vite production build.
- `npx tsc -p server/tsconfig.json --noEmit`: pass.
- `node --import tsx --test web/test/image-upload.test.ts`: pass — 5 tests.
- `jq empty schemas/*.json`: pass.
- `git diff --check`: pass.
- Browser smoke used isolated `Muse Mobilize QA 2026-09-04` project. Real PNG
  upload previewed, saved, and survived reload. Reference entity link persisted.
  Theme map rendered manuscript order plus `Appears` and `Resolves` states.
- Scene compatibility regression confirms legacy `pressure` data survives an
  unrelated scene edit as normalized `appears`.

### Known next risks

- ~~Managed image bytes outlive cancelled or deleted references~~ — fixed
  2026-09-04, see "Reference deletion and cross-store image garbage collection" above.
- Accepted patches now emit saved-word events. Historical patch deltas from before
  this fix are not backfilled.
- ~~Unresolved revision history preserves summary metadata, not full patch
  bodies, across runtime restart~~ — fixed 2026-09-04, see "Unresolved
  revision persistence — implemented" above. Patches proposed before this
  shipped still recover as dismiss-only (no body was recorded for them).
- New References and Goals JSON stores have runtime validation and tests but no
  checked-in JSON schemas yet.
- Chromium browser regressions now cover reference uploads. JPEG/WebP/GIF/AVIF
  browser decoding and dedicated Character/World/Plot gallery scenarios remain
  useful extensions beyond current PNG-centered acceptance path.
- Theme occurrence model stores one lifecycle role per theme/scene; evidence quotes
  and occurrence notes remain future work.
- Goal progress policy lives in `web/src/goalProgress.ts`; default behavior caps
  automatic word-target progress at 99% until manual completion. Product choice is
  intentionally exposed for owner tuning.

## Local Fast Start continuation — 2026-09-02

### Implemented

- Curated local model shelf: Qwen 3.5 0.8B, Phi-4 Mini, recommended Qwen 3.5
  4B, and heavyweight Meta Muse Glimmer 30B.
- Server-owned model metadata with download size, RAM guidance, fit notes,
  installed status, and active status.
- Streamed Ollama pull adapter using `POST /api/pull` and robust NDJSON parsing
  across arbitrary response chunks.
- Public install stream at `POST /api/local-models/:id/install` with normalized
  progress, completion, and useful error events.
- Transactional activation: room switches to Ollama and selected model only
  after terminal download success; failed pulls preserve existing engine.
- Settings provider rail separates Fast lane, Free local, and Other engines.
- Manuscript-ledger model shelf with **Download & use**, **Use now**, active
  state, progress bar, missing-runtime guidance, and advanced custom settings.
- Agents configured with `provider: default` follow selected local model without
  editing agent YAML.

### Runtime-confirmed

- Existing Ollama runtime detected as configured; all four catalog choices
  rendered without starting a download.
- Desktop model shelf and `640px` compact layout remained readable and usable.
- Browser console reported zero warnings/errors during Settings verification.

### Verification

- Local installer tests cover chunked progress, completion activation, and
  failed-download rollback behavior with injected fake fetch; no network or
  multi-GB download used.
- `npm test`: pass — 6 test files, 0 failures.
- `npx tsc -p server/tsconfig.json --noEmit`: pass.
- `npm run build`: pass — frontend TypeScript and Vite production bundle.
- `git diff --check`: pass.

## Continuation handoff — 2026-09-01

- Copy-paste handoff prompt created at `/tmp/muse-mobilize-plot-outline-handoff.md`.
- Intended next objective: first distinct Plot Outline surface with expandable nodes, detail-page handoff, and branch/merge through-line.
- Prompt anchors next agent to exact project path, implementation checkpoint `44a349b`, committed phase history, acceptance gates, and suggested skills.
- Repository still has no configured remote. Next agent must use exact local path; commit hash alone cannot transfer changes across machines or containers.
- Handoff references this knowledge log and commits instead of duplicating implementation detail.

## Provider fast lane continuation — 2026-09-01

### Implemented

- Fast-lane Settings rail for OpenAI, Google Gemini, and xAI/Grok; Anthropic,
  Ollama, and offline Mock remain available below.
- Data-driven credential deck sourced from server provider registry metadata.
- Direct official key-creation links, blank secret inputs, key-present status,
  model presets available before setup, and explicit Forget key action.
- Standard env fast paths: `OPENAI_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`,
  and `XAI_API_KEY`; UI reports environment source without exposing value.
- Shared OpenAI-compatible Responses adapter for OpenAI and xAI.
- Native Google Gemini Interactions adapter.
- Hosted requests set `store: false`; keys stay server-side in environment or
  owner-only (`0600`) local settings.
- Manual **Save & check** route with billability warning and useful credential,
  model, rate-limit, and service errors.
- Provider adapter recipe at `docs/providers.md`.

### Verification

- Provider tests use injected fake settings/fetch; no real key, network, or spend.
- Redaction test confirms no API key value reaches browser-facing settings.
- `npm test`: pass — 4 test files, 0 failures.
- `npx tsc -p server/tsconfig.json --noEmit`: pass.
- `npm run build`: pass — frontend TypeScript and Vite production bundle.
- Browser: desktop and `640px` settings layouts passed; official key links and
  default presets verified for OpenAI, Google, and xAI.
- No hosted connection check executed during verification.

## Dev-port 500 fix — 2026-09-01

### Root cause

- Duplicate `npm run dev` stacks existed.
- Older Vite owned frontend port `5177`, while its runtime had stopped.
- New Vite silently fell through onto runtime port `5178`; new Express runtime
  then failed with `EADDRINUSE`.
- Frontend still rendered from `5178`, but `/api` proxied back into same Vite,
  producing bootstrap hang/500 and empty project screen.

### Fix and verification

- `web/vite.config.ts` now sets `strictPort: true`; frontend can never steal API port.
- Regression test locks web `5177`, API proxy `5178`, and strict-port contract.
- Original collision repro now exits immediately with `Port 5177 is already in use`.
- Duplicate Muse dev process groups stopped; one clean stack restarted.
- Frontend, proxied settings, runtime health, projects, and settings all return 200.

## Plot Outline workspace continuation — 2026-09-01

### Implemented

- Plot Outline sidebar action launches focused Plot Through-line directly instead of another launcher menu.
- Versioned `plot/plot.json` persistence with beat, turn, reveal, climax, and resolution nodes.
- Typed story edges: sequence, branch, merge, and cause; missing endpoints reject before persistence.
- Per-edge path text is now directly editable from Story threads inside beat folio;
  relation type can be revised in same focused control.
- Editorial story-current surface with circular knots, manuscript strips, curved typed threads, section markers, and telling-order columns.
- Expandable nodes plus floating folio for change summary, goal, conflict, stakes, outcome, private notes, and document binding.
- Drag and keyboard movement persisted to graph coordinates.
- Atomic Add/Edit drawer saves full folio, optional document page, and optional World anchors together.
- World interaction stays sparse: maximum three entity-ID references, pins hidden by default, explicit Atlas locate action, and derived plot backlinks inside World inspector.
- One-shot cross-workspace focus messages prevent closed folios/inspectors from reopening.
- Formal Draft 2020-12 schema at `schemas/plot-graph.schema.json`.
- Container-aware folio bottom sheet and drawer behavior for narrow panes.

### Runtime-confirmed

- `Kiala Test` now contains four representative beats: Council summons Kiala, Confront the Warden, Search the sealed archive, and Brother's message decoded.
- Two branch threads split public and quiet inquiry paths; two merge threads converge on decoded message reveal.
- Veyr and Tide Council anchors remain optional. Plot surface showed zero pins by default and two pins after explicit toggle.
- `Locate in Atlas` centered Veyr; Atlas derived two plot backlinks; Council backlink returned to exact expanded Plot folio.
- Folio close stayed closed after one-shot focus consumption.
- Keyboard movement placed branch lanes at separate vertical positions and persisted coordinates.
- Browser caught and verified fixes for toolbar/folio overlap and unstable loading-array render loop.
- Narrow `492px` plot pane used bottom-sheet folio with no page-level horizontal overflow.
- Characters reopened with Kiala dossier; World reopened with Veyr inspector; neither regressed at narrow width.

### Verification

- Plot persistence tests cover branch/merge save, endpoint validation, atomic full-folio creation, folio update, document binding, sparse World anchors, and three-anchor limit.
- `npm test`: pass — canon, plot, and protocol test files, 0 failures.
- `npm run build`: pass — frontend TypeScript and Vite production bundle.
- `npx tsc -p server/tsconfig.json --noEmit`: pass.
- Browser console: 0 errors in fresh Plot workspace load.
- `git diff --check`: pass before commit.

### Notes-folder question resolved — 2026-09-02

Recovered question from `notes/mm_outline_notes_01n.xcf`: “How do edges of each
note get their own text?” Each connection already stored independent text in
`PlotEdge.label`, but old UI exposed it only as optional path label during edge
creation. Beat folio now shows **Edit text** on every Story thread. Writer can
revise both thread type and unique path text; SVG current redraws from persisted
edge. Blank path text deliberately falls back to relation name.

## Phase 5 continuation — 2026-09-01

### Implemented

- Isolated Git repository and verified baseline commit `ccbb660`.
- Portable `canon/canon.json` with versioned entities and facts.
- Statuses: `idea`, `proposed`, `established`, `canonical`, `retconned`, `deprecated`.
- Stable entity IDs with character and broader entity types.
- Evidence links carrying document ID, exact quote, and optional offsets.
- Runtime API for listing canon, creating entities/facts, and updating facts.
- Canon mutation events in append-only project history.
- Status-aware canon rendering for agent context; trusted facts sort before speculation.
- Continuity role fallback gives older projects canon without rewriting user-owned YAML.
- Workspace Canon pane with entity capture, fact capture, status promotion, and selection-to-evidence flow.

### Runtime-confirmed

- `Kiala Test` now contains Kiala character entity and canonical `recognizes → imperial seal` fact backed by Chapter One evidence.
- Continuity run context reported `canon (1 entities, 1 facts)`.
- Headless browser opened Characters launcher, mounted Canon pane, and displayed stored entity, canonical fact, and evidence link.

### Verification

- `npm test`: pass — canon and protocol test files, 0 failures.
- `npm run build`: pass — frontend TypeScript and Vite production bundle.
- `npx tsc -p server/tsconfig.json --noEmit`: pass.
- `git diff --check`: pass.

## World Building workspace continuation — 2026-09-01

### Implemented

- World Building sidebar action launches focused Living Atlas directly instead of another launcher menu.
- Default open spatial canvas with pan, centered zoom, fit-to-world, double-click placement, and persistent domain coordinates.
- Landmark types: place, faction, object, event, rule, and lore, backed by existing non-character canon entities.
- Atlas metadata: categories, era, atmosphere, story significance, aliases, summary, and optional lore-document binding.
- Draggable landmark seals with keyboard arrow movement and deterministic overlap separation.
- Relationship threads derived from stable canon facts; new connections default to `proposed`.
- Floating atlas inspector with facts, relationship creation, editing, document handoff, and canon handoff.
- Editorial Pages fallback with type index, structured entries, linked lore pages, and locate-on-canvas action.
- Formal Draft 2020-12 schema at `schemas/world-profile.schema.json`.
- Status-aware agent context now includes world categories and attributes.
- Container-aware canvas, inspector, drawer, and Pages layouts.

### Joint Characters + World fixes

- Maximized pane shell remains flex-based, preventing dedicated surfaces from collapsing to intrinsic content height.
- Opening one focused domain surface demotes prior maximized surface, so Characters and World Building switch deterministically.
- New or legacy overlapping landmarks separate onto nearby open coordinates.
- Landmark selection supports normal button clicks in addition to pointer dragging.

### Runtime-confirmed

- `Kiala Test` now contains Veyr and Tide Council world entities with structured atlas metadata.
- Canvas rendered two distinct landmark seals joined by `Tide Council — governs → Veyr` as proposed canon.
- Mouse drag moved Veyr and persisted its coordinates; Shift+Arrow moved Tide Council and persisted coordinates.
- Pages mode rendered both structured entries and connection counts.
- Characters reopened after World Building with Kiala dossier and Vision/Audio/Proximity bands intact.
- Character edit/save roundtrip completed after shared shell changes.
- Narrow `492px` pane switched Characters dossier to stacked layout and World inspector to bottom sheet with no page-level horizontal overflow.

### Verification

- `npm test`: pass — character, world profile, coordinate, and relationship persistence coverage included.
- `npm run build`: pass — frontend TypeScript and Vite production bundle.
- `npx tsc -p server/tsconfig.json --noEmit`: pass.
- Both JSON schemas parse with `jq empty`.
- `git diff --check`: pass.

## Characters workspace continuation — 2026-09-01

### Implemented

- Characters sidebar action launches focused cast workspace directly instead of another menu.
- Connected portrait cast line with category filters and Add Character entry point.
- Character dossier: identity, aliases, story function, body, goals, fears, clothing, linked canon facts.
- Sensory triad: Vision, Audio, Proximity summaries plus strength/limitation/sensitivity/preference subtags.
- Add/Edit edge drawer with keyboard focus and Escape dismissal.
- Character profile persistence and entity update API.
- Formal Draft 2020-12 schema at `schemas/character-profile.schema.json`.
- Reference image URL/path support with portrait preview.
- Character-agent and canon-trail handoffs.
- Container-aware responsive layout based on actual pane width.

### Runtime-confirmed

- `Kiala Test` character enriched with categories, motive, physical traits, three senses, and indicator subtags.
- Wide browser view rendered cast line, dossier, sensory signals, and canon trail.
- Add drawer mounted with 20 fields and focused Character name automatically.
- Narrow `432px` surface switched to stacked dossier with no page-level horizontal overflow.
- Edit/save roundtrip retained sensory canon status and source evidence.

### Verification

- `npm test`: pass — canon persistence/update coverage included.
- `npm run build`: pass — frontend TypeScript and Vite production bundle.
- `npx tsc -p server/tsconfig.json --noEmit`: pass.
- `jq empty schemas/character-profile.schema.json`: pass.
- `git diff --check`: pass.

## Session log

- 2026-09-01 — Opus checkpoint reconstructed from handoff, source, timestamps, and project event log.
- 2026-09-01 — Baseline tests/build passed; full local UI rendered.
- 2026-09-01 — Duplicate patch-decision race fixed in patch card.
- 2026-09-01 — Continuation recorded here for next agent/session.
- 2026-09-01 — Isolated Git repository initialized; baseline committed at `ccbb660`.
- 2026-09-01 — Phase 5 canon store, API, Continuity context, and Canon pane implemented through red-green tests.
- 2026-09-01 — Characters converted from generic launcher menu into focused cast workspace.
- 2026-09-01 — World Building converted into Living Atlas canvas with canon-backed relationship threads and Pages fallback.
- 2026-09-01 — Plot Outline continuation prompt prepared and handoff location recorded.
- 2026-09-01 — Plot Outline converted into braided branch/merge story current with optional World Atlas anchors and backlinks.
- 2026-09-01 — OpenAI, Google Gemini, and xAI/Grok fast-lane setup, adapters, safe checks, docs, and tests added.
- 2026-09-01 — Duplicate-dev port collision causing bootstrap 500 fixed with strict frontend port contract.
- 2026-09-02 — One-click Ollama Local Fast Start added with curated light/heavy models, streamed safe activation, responsive UI, docs, and tests.
- 2026-09-02 — Notes question answered in-product: Plot thread path text and relation are directly editable per edge.
- 2026-09-02 — Scenes became storyboard beat lanes with draggable character, theme, location, and plot references; Dialogue became scene-bound table-read surface with subtext, knowledge state, and voice checks.
- 2026-09-02 — Screencast-led QA fixed Character drawer draft loss on failed create/update and exercised recent domain surfaces end to end in isolated project.
- 2026-09-03 — Added managed multi-image upload/contact sheets across Characters, Plot Outline, and World Building.

## Managed story images continuation — 2026-09-03

### Implemented

- Shared `StoryImage` contract across character profiles, plot nodes, and world profiles.
- Managed project upload endpoint stores files under `assets/images/` and returns portable project URLs.
- PNG, JPEG, WebP, GIF, and AVIF validation by MIME type and file signature; 5 MB per-image cap.
- Reusable contact-sheet editor supports drag/drop, multi-file chooser, URL fallback, captions, cover order, and removal.
- First character image drives portrait; first plot image marks beat; first world image marks canvas landmark and atlas page.
- Character dossier, plot folio, and world inspector show scrollable multi-image strips.
- Character, World, and Plot schemas now formalize image arrays.

### Verification

- Red-green persistence tests cover managed bytes, unsafe types/paths, and multiple Character, World, and Plot image references.
- Browser chooser reached upload API and rendered returned 640×480 managed image.
- Character, Plot, and World drawers exposed matching image controls; 700px viewport had no horizontal overflow.
- Generated QA asset and exact QA activity records were removed after verification; Kiala story/canon data remained unchanged.

## Scenes + Dialogue workspace continuation — 2026-09-02

### Implemented

- Focused Scene Board launch with story-section groups and horizontal beat lanes.
- Scene folios for title, section, purpose, summary, drafting status, manuscript
  binding, beat creation, removal, and left/right sequence changes.
- Story-material rail populated from existing canon Characters, canon Locations,
  Plot nodes, and scene-owned Themes.
- Native drag/drop into scene lanes plus click-to-attach accessibility fallback.
- Stable typed references instead of copied source labels; reference removal and
  missing-reference fallback remain explicit.
- Focused Dialogue table with scene selection and exact Scene Board handoff.
- Ordered speaker lines with separate audible text, subtext, line-specific
  knowledge state, manual voice status, and voice-check note.
- Versioned `scenes/scenes.json` persistence and Draft 2020-12 schema at
  `schemas/scene-board.schema.json`.
- Append-only history events for scene/theme creation and scene updates.

### Runtime-confirmed

- Existing Kiala canon/plot resources appeared in story-material rail without
  copying or mutating project story data.
- Empty-board, scene folio, beat editor, and empty Dialogue states rendered.
- Sidebar direct launches switched between Scene Board and Dialogue Table.
- `312px` scene pane used compact horizontal resource rail with zero page-level
  overflow.
- Browser console reported zero warnings/errors after fixing unstable filtered
  document selector in Scene folio.

### Verification

- Persistence tests cover typed asset dedupe, ordered beat lanes, all Dialogue
  continuity fields, and invalid-status rollback.
- `npm test`: pass — 7 test files, 0 failures.
- `npm run build`: pass — frontend TypeScript and Vite production bundle.
- `npx tsc -p server/tsconfig.json --noEmit`: pass.
- `jq empty schemas/scene-board.schema.json`: pass.

## Screencast-led recent-change QA — 2026-09-02

### Diagnosis and fix

- Reviewed supplied 1920×1080 WebM screencast frame by frame. Clip shows New
  Character drawer accepting `Justin`, but ends before Add to cast submission.
- Kiala event history contains Character pane open but no character-create event
  around report. Project canon remained unchanged.
- Isolated normal-path reproduction created and persisted character correctly.
- Isolated runtime-failure reproduction exposed concrete bug: store returned
  `null`, but Characters pane closed drawer unconditionally. Name, role, and all
  other entered fields disappeared behind generic error toast.
- Character create/edit drawer now closes only after API returns saved entity.
  Failed request keeps complete draft and permits successful retry after runtime
  reconnects.
- No frontend interaction-test harness exists at correct component seam; browser
  failure/retry loop provides regression evidence. Existing server canon tests
  still cover persistence contract.

### Cross-workspace runtime verification

- Isolated QA project created two Characters and completed dossier edit.
- World created one Location; Plot created two nodes, one World anchor, and one
  labeled sequence edge.
- Scenes created one lane, one beat, one Theme, and attached Character, Theme,
  Location, and Plot references through accessible click path.
- Dialogue created one line with speaker, subtext, knowledge state, in-voice
  status, and voice note.
- Full reload preserved every artifact. Disk JSON counts matched UI counts.
- Character failed-save draft remained open, then same draft succeeded unchanged
  after isolated runtime restart.
- `640px` viewport produced `312px` Characters, World, Plot, Scenes, and Dialogue
  panes with no page-level horizontal overflow.
- Fresh cross-workspace browser tab reported zero warnings/errors.
- Browser automation driver emitted no native `dragstart`, so HTML5 drag itself
  could not be mechanically asserted; click-to-attach fallback and persisted
  typed-reference path passed.
- Isolated project, temporary instrumentation, and QA processes removed. Kiala
  project data was never mutated.
