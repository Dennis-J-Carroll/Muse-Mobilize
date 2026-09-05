# Muse Mobilize acceptance results — 2026-09-04

Automated acceptance completed for uploads, Themes, References, Goals, and
Progress. All 11 Chromium scenarios pass against the real frontend and API.
This records behavioral verification; Dennis's writing workflow and usability
feedback can produce further acceptance findings.

## Acceptance matrix

| Area | Verified behavior | Browser test |
| --- | --- | --- |
| Uploads | Real file chooser → managed bytes → reference save → reload; decoded image, caption, attribution, source URL, and story link remain intact | `e2e/references.spec.ts` |
| Uploads | Valid PNG retained from batch containing text, forged PNG, and file exceeding 5 MiB; save/close/Escape blocked during transfer | `e2e/references.spec.ts` |
| Uploads | Overlapping chooser and synthetic file-drop batches preserve both images and caption written during upload | `e2e/references.spec.ts` |
| References | Quotes/web sources create and edit; filters/search and source URLs survive reload | `e2e/references.spec.ts` |
| References | Pending save cannot be resubmitted or dismissed; failed save retains draft; retry creates one reference and clears error | `e2e/references.spec.ts` |
| Themes | Metadata persists; scene order remains stable; absent → appears → echoes → fades → resolves → absent survives reload at every step | `e2e/themes.spec.ts` |
| Goals | 25000-word milestone saves and reloads | `e2e/goals.spec.ts` |
| Goals | 125-word / 17-minute session saves and reloads | `e2e/goals.spec.ts` |
| Goals | Pending route save blocks conflicting session save; completion, changed order, and session focus persist | `e2e/goals.spec.ts` |
| Progress | Editor save updates word flow; completed scenes and pending revision summaries reload; rejected revision leaves queue | `e2e/progress.spec.ts` |
| Progress | Accepted patch changes chart from 4 to 6 words and retains history after reload | `e2e/progress.spec.ts` |

## Reproduced defects and repairs

1. **Milestone target rejected by browser.** `min=1, step=100` permits 24901 or
   25001 but rejects placeholder example 25000. Changed step to 1. Browser
   regression failed before fix and passed afterward.
2. **Session targets constrained to arbitrary increments.** 125 words and 17
   minutes could not submit. Whole-number steps now match persisted contract.
3. **Reference metadata save was not protected.** Upload had a busy lock, but
   metadata save left submission, dismissal, and editing available. Added save
   state plus synchronous guard; pending fields/buttons are disabled. Failure
   keeps draft for retry.
4. **Successful reference retry retained old error toast.** Successful create or
   update now clears previous error feedback.
5. **Goals forms could submit overlapping store snapshots.** Shared save guard
   coordinates session and route writes. Requests include only changed section.
6. **Milestone movement reverted immediately.** Swapped list retained old order
   values; subsequent sort undid movement. Assign new order before persistence.
7. **Accepted patch omitted word-flow event.** Manuscript changed while chart
   remained at old count. Successful patch application now emits saved-word event.

Each repair is protected by a browser regression that was observed failing
before its corresponding fix. Scenarios use public UI/API interfaces; network
interception is limited to deliberate delay/failure cases.

## Re-run

```bash
npx playwright install chromium
npm run test:browser
npm test
node --import tsx --test web/test/image-upload.test.ts
npm run build
npx tsc -p server/tsconfig.json --noEmit
npx tsc -p e2e/tsconfig.json
git diff --check
```

- Browser suite: 11 passed, 0 failed (46.1 seconds on recorded complete run).
- Server tests: 11 files passed, 0 failed.
- Upload helper tests, frontend production build, server and browser-suite
  typechecks, and whitespace check passed.
- Fixtures also fail on unexpected browser runtime exceptions.

## Isolation and artifacts

`playwright.config.ts` launches `e2e/server.mts`. Runner creates a fresh
`muse-browser-*` directory under OS temp, supplies isolated settings through
`MUSE_CONFIG_DIR`, uses mock provider, and owns ports 5277/5278. It refuses to reuse
an existing server and cleans its own temporary directory on shutdown. Existing
development project data and provider settings are not test fixtures.

Failure screenshots/traces: `test-results/`. Local HTML report:
`playwright-report/index.html`. Both directories are ignored by Git.

In-app visual smoke also checked updated Goals layout and reference drawer.

## Limits and follow-up

- Chromium is the current browser target. Real PNG bytes are the primary image
  fixture; dedicated JPEG/WebP/GIF/AVIF decoding scenarios remain future coverage.
- File-drop coverage dispatches a browser `DataTransfer` event; it does not verify
  dragging from a native operating-system file manager.
- Scene and revision fixtures use public APIs. These tests do not claim complete
  Scene Board or AI model acceptance coverage.
- Full unresolved patch bodies still require durable storage after restart.
- Saved-word events missing from historical accepted patches are not backfilled.
- Managed-image garbage collection, reference deletion, and new JSON schemas
  remain separate next steps.
- Existing working-tree work stays uncommitted; `notes/` remains user-owned.
