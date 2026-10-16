# Recovery / Studio implementation handoff for Opus 5.5

Status: implementation started; no release gate complete yet.
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
