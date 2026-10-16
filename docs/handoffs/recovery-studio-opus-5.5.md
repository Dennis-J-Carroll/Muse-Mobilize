# Recovery / Studio implementation handoff for Opus 5.5

Current status (2026-10-16): Release A recovery gate complete and pushed. Studio slots and schema 1.4 formatting verified locally. Muse edition persistence/conversion implemented; full Studio transfer remains incomplete. Read newest checkpoints first; earlier pending-work notes are historical.
Baseline: Muse main 2fe54db, tracked clean before task. User authorized implementation and checkpoint commits/push. Unrelated untracked notes/Pics_MM/ and notes/Screenshot from 2026-10-07 13-46-33.png must remain untouched.

Muse: /home/dennisjcarroll/Desktop/creative/Muse-Mobilize
Studio: /home/dennisjcarroll/Desktop/Interactive_FV (not a Git repository)
Architecture: ../architecture/ADR-001-recovery-and-studio.md
Full accepted specification: current task user message, dated 2026-10-15.

## Confirmed choices
Portable backups first; 2 GiB saved project envelope. Prose + explicitly chosen images. One document per scene. Separate Studio slots. Preserve paragraphs/headings/dividers/bold/italics. Evidence-led writing polish, no invented user sessions.

## Implementation sequence
1. File-backed v2 backup and shared validation.
2. Worker jobs, HTTP/browser streaming, verified downloads/restores, combined package.
3. Studio checkpoint then IndexedDB slots/migration and save conflicts.
4. Schema 1.4 marks, safe rendering, editor and both reader runtimes.
5. Muse editions and three-chapter round trip.
6. Novel workload and manual friction log.

## Important boundaries
Do not raise Base64 limits. Do not feed v2 through v1 representation. Preserve strict path/collision/symlink checks and source original integrity. Browser cannot attest file durability. Restore as new project only. Repeat Studio imports must not replace existing adaptations. Both Studio reader runtimes need changes. Build via python3 studio/build.py; generated visual-trails/studio/index.html is not editable source.

## Usage
2026-10-15 start: 37% five-hour, 81% weekly remaining, account-wide. User requested handoff near limit; threshold 15%. No reset credit authorized. Update this file at each checkpoint before stopping.

## Checkpoint 1 implementation (2026-10-15)
Implemented server/src/backup-archive.ts, tests in server/test/backup-archive.test.ts. Shared policy exported from server/src/backups.ts; legacy behavior unchanged. Pinned yazl 3.3.1, yauzl 3.4.0 and matching types.

Implemented APIs (internal only): captureSavedProject(sourceDir, sourceId, staging, options), writeBackupArchive(staging, manifest, output, options), readBackupArchive(filename, optionalExtractionDir, options), installSavedProject(stagedRoot, manifest, workspace, optionalTargetId, options). Options include AbortSignal and phase/bytes progress. Archive manifest metadata sorted by code-point path; snapshot SHA-256 is JSON of [path,size,sha256] tuples. Manifest first ZIP entry, then exact project/ entries; explicit directory entries rejected. Captured files streamed with bounded buffers, SHA checked, inventory checked before/after. Semantic stores read separately. Original source hashes checked against verified archive metadata. New restore ID and typed image/media remapping; destination reserved exclusively before rename.

NOT implemented yet: job manager/worker, disk reservations, deadline/TTL enforcement, upload/download endpoints, status ledger, retry journal, crash cleanup, combined Binder packaging, browser changes, all Studio/edition work. Limits exist in ARCHIVE_LIMITS but temporary/reserve/deadline limits await job layer. Core functions must not be exposed directly as production routes before that layer exists. Caller currently owns cleanup of failed capture/extraction output.

### Verification
- TypeScript server check passes: npx tsc -p server/tsconfig.json.
- Full server suite passed 210/210 before last two additional core cases: npm test, outside sandbox.
- Legacy backup suite passed unchanged.
- Source baseline issue resolved diagnostically: sandbox execFile returns empty stdout even for console.log(42); all 16 source tests pass outside sandbox. No source tests edited. Sandbox-friendly test command: node --import tsx --experimental-test-isolation=none --test <file>. Source child probes still require unrestricted execution.
- Core tests include >50 MiB asset, restore identity/link remapping, corruption/missing/duplicates/unlisted/symlink rejection, source hash mismatch, staged tampering, cancellation, 10k file boundary, structured JSON budget, edits during capture.
- Real KB drill passed in temporary workspace: 90 files, 55,424,541 saved bytes, 54,852,353-byte archive, 3 documents; 85 files excluding identity/remappable stores checked byte-exact. Remapping covered separately by automated fixture. Original KB untouched; temporary drill removed.
- Capacity run: MUSE_ARCHIVE_CAPACITY=1 node --expose-gc --import tsx --experimental-test-isolation=none --test server/test/backup-archive.test.ts. Results appended below when complete.
- Logs: /tmp/muse-recovery-full-server.log, /tmp/muse-recovery-capacity.log, /tmp/muse-recovery-kb.log, /tmp/muse-recovery-types.log, /tmp/muse-recovery-audit.json.
- npm audit reported existing dependency paths (express/body-parser/qs/proxy-addr, concurrently/shell-quote, source-map-js), none through new ZIP libraries. No broad dependency upgrades performed.

### Exact next work
Review core boundary, then implement archive-jobs.ts and worker adapter. Reserve disk before capture/upload; one heavy operation. Persist lifecycle, random capability ID, and restore destination identity outside project under CONFIG_DIR. Expose raw-upload route before express.json. Worker must pass explicit workspace/root rather than rely on ambient user settings. On successful verified capture expose native attachment; restore upload preview comes before install. Guard duplicate restore commits and recover installed identity after request/server interruption. Clean only registered job-owned paths. Add route/job integration tests and browser flow. Then combined Binder job using same staged snapshot; existing Binder functions currently resolve live project through projects.ts and need an explicit snapshot-reader boundary.

### Usage / stop
Reached 15% five-hour remaining, 78% weekly, account-wide. Finishing verified checkpoint and handoff as requested. No reset consumed; no Studio source changed; no real browser storage touched. Next agent should refresh usage before continuing.

### Completed capacity gate
All nine archive tests passed. Binary-heavy files generated from random 256 KiB chunks, ZIP STORE for assets, not sparse-only payloads. Exact total saved sizes (metadata included):
- 256 MiB: 29.27 MiB incremental process RSS, 2.302 seconds capture/build/verify.
- 512 MiB: 11.75 MiB incremental process RSS, 8.736 seconds.
- 2 GiB: 25.16 MiB incremental process RSS, 27.923 seconds.
Total test duration 54.1 seconds including fixture writes. These are core-process measurements; repeat worker/HTTP/browser gates after integration. 2 GiB install was not exercised; KB and fixture install were. Final server TypeScript check and git diff --check passed.

## Checkpoint 2 — Release A integrated (2026-10-16)
Supersedes checkpoint-1 pending recovery items. Implemented worker bootstrap, archive-jobs lifecycle, raw HTTP upload/native download routes, disk reservation, one active heavy job/four retained slots, deadlines/TTL, cancellation, durable journal, restore receipt and restart recovery, status ledger, and Backups UI. Combined Binder package now renders from explicit snapshot-directory readers and includes verified inner backup.muse-backup.zip; both ZIP layers verified. Legacy routes and JSON import preserved.

New files: archive-jobs.ts, archive-routes.ts, archive-worker.mjs/.ts, archive-package.ts; web/src/archiveJobs.ts; archive-jobs.test.ts and archive-routes.test.ts. Existing projects.ts exposes readAgentsFromDirectory; project-resources/captureBinder/previewBinder accept optional explicit snapshot directory. Live readers unchanged by default.

Evidence: full server suite 221 passed / 2 opt-in capacity tests skipped; explicit worker suite all 9 passed including 2 GiB export, raw stream upload, validation and installation: 91.287 seconds, 71.62 MiB incremental process RSS. Eight browser tests passed: backups, selected Binder/package, 120,000-word manuscript with 80 MiB asset, three touch sizes. Server TypeScript + web build pass, existing chunk warnings remain. Real KB job drill: 92 files, 55,477,417 saved bytes, 3 documents, restored into temporary workspace only. Worker execArgv now [] because inheriting parent --input-type breaks file-based workers; bootstrap registers tsx itself.

Logs: /tmp/muse-release-a-server.log, /tmp/muse-jobs-capacity.log, /tmp/muse-jobs-browser.log, /tmp/muse-release-a-web.log, /tmp/muse-release-a-types.log, /tmp/muse-release-a-kb.log. Updated contract: docs/project-backups-contract.md. No live server restart or browser profile edits performed.

Studio source checkpoint created before changes at /home/dennisjcarroll/Desktop/Interactive_FV/.recovery-checkpoints/studio-before-slots-2026-10-16.tar.gz. SHA-256 b0914501a1f3b49f1b7a998e03798d97ead413d71b71d2fbb72d3d292d0bbb2a. Contains author HTML, studio modules, and served studio/index.html. Studio root still not Git-tracked.

Next: Studio IndexedDB slots and migration, then schema 1.4 formatting and Muse edition bridge. Real writing sessions remain user work; do not invent observations.

## Checkpoint 3 — Studio slots verified (2026-10-16)
Release A is committed and pushed as a48ec40 on Muse main. Studio remains a separate, untracked source tree; no Studio remote exists.

Studio B1/B2 implemented locally: project-library.js provides IndexedDB v2 slots, composite slot/asset keys, transaction-complete saves, CAS revisions, atomic migration, and legacy storage retention. project-slots.js connects project switcher, import/create/copy/reload, slot-scoped preferences/runtime/undo, asynchronous dirty-version saves, conflict recovery, and switching guards during media work. Existing imports and reset create new slots. Embedded builders open separate slots. Main author HTML and build.py embed modules; generated served copy rebuilt.

Verified isolated browser tests: studio/slots-check.cjs passes failed-save switch blocking, repeated import/media isolation, reload, stale-tab conflict/copy, legacy JSON and v1 IndexedDB migration, malformed migration recovery, and injected quota rollback. Existing studio/browser-check.cjs passes all 17 logged checks including offline editable builder/player, portable round trip, mobile upload, and offline reload. The builder test now scrolls its lazy-loaded image into view before checking decoded dimensions; probe confirmed valid stored media before this test correction. Earlier linear-reader-check.cjs and narration-check.cjs also passed. Logs /tmp/muse-studio-slots-check.log, /tmp/muse-studio-regression.log, /tmp/muse-studio-reader.log, /tmp/muse-studio-narration.log. No real browser storage touched.

Verified Studio source archive: /home/dennisjcarroll/Desktop/Interactive_FV/.recovery-checkpoints/studio-slots-verified-2026-10-16.tar.gz; SHA-256 6e07170aa3a95cf5f3fc35f741273ee03d84b9d72985a49fcfdb53b30ad04b84. Earlier pre-slots checkpoint retained. Documentation studio/PROJECT_LIBRARY.md explains local-origin scope and rollback limits.

Next: schema 1.4 structured emphasis and heading levels in editable source, both readers and portable projection; tests including Unicode, edit rebasing and undo. Then Muse edition recipe/export bridge. Five real writing sessions remain unperformed; never infer observations from automated tests.

Usage refreshed on continuation: 88% five-hour and 59% weekly remaining. No reset consumed. Previous approval-review rejection was caused by exhausted usage; authorized Studio writes succeeded after continuation.


## Checkpoint 4 — Studio formatting verified (2026-10-16)
Studio accepts schemas 1.0–1.4, normalizes to 1.4.0, preserves heading levels, nested bold/italic ranges, and plain text. New studio/inline-format.js is shared by editor preview, Studio reader, standalone reader, and MCP validator. studio/inline-editor.js adds selection/caret formatting and preview. Edits rebase grapheme-aligned UTF-16 ranges, boundary insertion stays plain unless explicitly styled, and undo restores marks/text together. Raw HTML stays inert. Reader projection strips museOrigin. Narration remains based on unchanged plain text. MCP validates nextSceneId routes and matching formatting ranges.

Found and fixed existing undo reentrancy: replacing a focused textarea during history restore emitted a stale change event that reapplied undone text. handleEdit now rejects events during history restoration/slot switch or from detached fields. Browser acceptance reproduces text/mark undo and now passes.

Evidence: 7 inline unit tests (including 2,000 deterministic overlapping-toggle cases); 4 MCP tests; formatting browser acceptance covers nested marks, heading levels, editing/undo/reload, both readers, Scroll/Page/next/Back/Contents, literal HTML, private receipt exclusion, 390/320 widths. Inspected final 320px screenshot after reveal animation. Full Studio browser regression passed all 17 logged checks; slot checks and narration checks passed again. Existing migration assertion now expects schema 1.4.0. Lazy-image tests explicitly scroll thumbnails into view before decode checks; no media assertions removed.

Logs: /tmp/muse-studio-inline-unit.log, /tmp/muse-studio-mcp.log, /tmp/muse-studio-formatting.log, /tmp/muse-studio-format-regression.log, /tmp/muse-studio-format-slots.log, /tmp/muse-studio-format-narration.log. Screenshots /tmp/story-studio-formatting/reader-320.png and reader-390.png. Studio docs: studio/FORMATTING.md and PROJECT_LIBRARY.md.

Source checkpoint /home/dennisjcarroll/Desktop/Interactive_FV/.recovery-checkpoints/studio-formatting-verified-2026-10-16.tar.gz SHA-256 4823eb623079c29782a8f941f6a3548325e11a2cc1dae7e424ddd287ea03057e. Includes main HTML, editable modules, generated served HTML, MCP source/package/tsconfig. Studio still has no Git repository or remote; no publication claimed.

## Checkpoint 5 — Muse edition foundation (2026-10-16)
New shared/story-edition.ts defines strict version-1 recipe/store and schema-1.4 block types. New server/src/editions.ts persists recipes, verifies selected IDs are manuscript documents, and exposes GET editions / PUT editions/:editionId through existing edit lock/history wrapper. Backup allowlist and both legacy/v2 restore validators include editions/recipes.json. New server/src/studio-conversion.ts converts Markdown tokens to plain text/marks and document warnings, preserves heading levels, generates deterministic block IDs, and never renders HTML. Dependency markdown-it pinned 15.0.3 with bundled TypeScript types.

Focused tests: 14 passed, 1 opt-in archive capacity test skipped. Edition save/undo/redo, archive restore round trip, malformed recipe rejection, unsupported Markdown warnings, nested/Unicode marks, and exact 120,000 words across 40 converted documents pass. Server TypeScript passes. Full server suite result recorded below when complete. The 120,000-word result proves conversion only, not end-to-end novel editing/import.

Exact next action: implement selected edition capture/preview and portable scene/image builder per docs/story-studio-editions-contract.md. Then extend archive worker/job download for edition artifacts and add selection UI beside Binder. Current edition routes save recipes only; preview/export is NOT exposed. Preserve all Release A behavior; edition jobs must not update full-backup status. Studio side is ready for schema 1.4 imports. Finish real three-chapter transfer gate and novel workflow before claiming Release B. Do not invent five human writing sessions.

Latest usage at checkpoint preparation: 18% five-hour / 48% weekly remaining, account-wide. No reset used. Stopping at agreed 15% handoff threshold after verification/commit. Refresh usage on continuation. Test server may still run on localhost:8947 with separate fresh Playwright contexts; real browser storage untouched.

Final foundation verification: complete server suite 227 passed, 2 opt-in capacity tests skipped (229 total), 16.96 seconds; log /tmp/muse-edition-full-server.log. Server TypeScript log /tmp/muse-edition-types.log is empty/success. git diff --check passes. Existing full capacity gate was completed in Release A and was not rerun for recipe-only policy changes.
