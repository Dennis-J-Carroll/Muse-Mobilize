# Muse-Mobilize Knowledge & Continuation Log

Last updated: 2026-09-04 by Codex, continuing Opus 5 work.

## Current goal

Characters, World Building, Plot Outline, Scenes, Dialogue, Themes, References, Goals, Progress, managed story images, hosted provider fast lane, and one-click local model setup are implemented. Automated acceptance now covers uploads and all four new story-system surfaces. Current goal: incorporate Dennis's testing feedback and make full unresolved revisions durable. Sidebar collapse and focus modes remain open.

## Repository state

- Project path: `/home/dennisjcarroll/Desktop/creative/Muse-Mobilize`
- Git boundary: isolated repository on branch `main`.
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

Incorporate Dennis's acceptance findings, then persist full unresolved revision bodies. Follow with reference deletion, safe managed-image cleanup, and References/Goals JSON schemas. Current automated evidence is in `docs/acceptance-2026-09-04.md`.

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

- Managed image bytes outlive cancelled or deleted references; no reference delete
  route or asset garbage collection exists.
- Accepted patches now emit saved-word events. Historical patch deltas from before
  this fix are not backfilled.
- Unresolved revision history preserves summary metadata, not full patch bodies,
  across runtime restart.
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
