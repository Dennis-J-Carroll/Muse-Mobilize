# Agent Studio and Project Binder validation

Validated September 14, 2026, using isolated test projects and the offline mock provider.

## Delivered

- Runtime context filtering with explicit allow/deny assignments, exclusion precedence, restricted linked records, filtered Source retrieval, and configuration-change checks around provider calls.
- Agent Studio for independent saved agents, context previews, saved arrangements, and deliberate sharing of a reply excerpt.
- Project Binder with ordered sections and records, editable JSON recipes, HTML presentation, browser printing/PDF, and a portable ZIP containing the saved-project backup.

See [the feature guide](using-agent-studio-and-project-binder.md) for usage and current limits.

## Checks

| Check | Result |
| --- | --- |
| Server suite, `npm test` | 124 tests passed |
| Frontend unit suite, `node --import tsx --test web/test/*.test.ts` | 45 test entries passed |
| Full browser suite, `npm run test:browser` | 79 passed; one new Binder print-observation test failed |
| Final feature suite, `npm run test:browser -- e2e/project-tools.spec.ts` | 5 passed after the preview and print-observation fixes |
| Production frontend build, `npm run build` | Passed after final changes |
| Server TypeScript and `git diff --check` | Passed |

The full browser run's failure came from observing a print event inside a script-disabled preview frame. The test now observes the native event from the parent page. Inspection also found and fixed a separate contents-link bug: an inline preview inherited the app URL, so its anchors could navigate back to the app. The preview now has its own Blob document URL. Final tests exercise contents navigation, native print invocation, real Chromium PDF generation, HTML/ZIP download, and stale-preview rejection.

All 80 distinct browser scenarios passed across the full run and the targeted rerun. The entire 80-test suite was not rerun after the final preview change.

## Mobile coverage

Touch-enabled Chromium checks cover 320×568, 390×844, and 844×390 viewports. Both tools fit without horizontal overflow; Back controls meet the 44px target. Mobile Agent Studio uses a compact agent selector. Screenshots of the final 320px Studio and 390px Binder layouts were reviewed.

No physical iPhone or Android device was tested. Browser emulation does not establish native keyboard, file-picker, gesture, download, or printing behavior. Follow [the phone checklist](testing-on-your-phone.md) to finish those checks on your own device.

## Scope limits

- Automated agent tests inspect mock-provider inputs and cover private sentinels, empty assignments, exclusions, linked records, selection validation, mid-run policy changes, and patch boundaries. They do not prove that a provider forgets previously shared information.
- Binder ZIP restoration uses the existing JSON-backup restore path after extracting `project-backup.json`; direct ZIP import is not implemented.
- Excluding records from the readable binder does not exclude them from its optional private saved-project backup.
- No deployment, commit, or migration of existing agent definitions was performed. Legacy definitions migrate only when saved in Studio.
