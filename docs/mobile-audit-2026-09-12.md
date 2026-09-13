# Mobile readiness audit — 2026-09-12

Follow-up verification and phone launch setup: 2026-09-13.

## Assessment

Muse-Mobilize has a substantial working local-first product: manuscript editing,
autosave and recovery, reviewable agent patches, nine story workspaces, floating
story editors, Workbench, saved desks, Connections, backups, Sources import and
lexical retrieval, and document export. It remains a browser frontend connected
to a local Node runtime, rather than a standalone phone application.

The initial mobile layout worked at ordinary phone widths, but was not reliable
on small or short screens. This audit found and repaired concrete layout failures.
Physical iOS and Android acceptance remains necessary before calling mobile
support complete.

## Scope and isolation

- Chromium with mobile viewport behavior and touch input enabled; actions use
  Playwright `tap()` rather than only desktop clicks.
- Viewports: 320×568, 390×844, 430×932, 768×1024, and 844×390 landscape.
- Eleven surfaces: Drafting, Characters, World Building, Plot Outline, Scenes,
  Dialogue, Themes, References, Goals, Progress, and Sources, plus Settings.
- Long project names intentionally stress the shell.
- A fresh temporary project store and offline mock provider run on 5277/5278.
  No personal manuscripts, account keys, or live provider calls are used.
- File inputs use test buffers. Native operating-system file pickers are not tested.

## Findings and changes

| Finding | Evidence before change | Resolution |
| --- | --- | --- |
| Small-phone canvas squeezed out by headers | Only 70.5px of canvas at 320×568; the draft and scene board were clipped | Short screens allow outer page scrolling and reserve a 420px canvas; long project headings truncate |
| Landscape nearly unusable | Only 9.25px of canvas at 844×390 | Same short-screen rule preserves the working area without changing stored pane arrangements |
| Small primary touch controls | Multiple navigation and writing buttons were 30–34px high | Core navigation, pane, writing, save, drawer, and recall controls receive at least 44×44px targets for coarse pointers |
| Focus exit displayed a keyboard hint on phones | Mobile CSS hid the button text and retained “Esc” | Touch users see “Back to workspace”; the keyboard hint is hidden |
| Export choices clipped outside the editor | A wrapped Export button placed its right-aligned menu beyond the pane's left edge | The menu is anchored within the writing toolbar; the repaired probe verifies actual pointer access |
| Settings competed for limited vertical space | Provider rail and fixed sections crowded editable settings; landscape margins could put the modal below the viewport | Short-screen Settings uses dynamic viewport height, matching backdrop padding, and a scrollable engine area |
| Small form text on touch devices | Many primary form fields used 12–14px text | Main writing and story-editor fields use 16px text for coarse pointers; native iOS focus behavior still requires device testing |

Short screens intentionally scroll vertically. The fix preserves access to every
control and allows writing Focus to remain a full-screen surface. It does not
redesign the dense workspace into a phone-specific navigation system.

### Visual evidence

- [Small phone before fixes](mobile-audit/before-small-phone.png)
- [Small phone after fixes, scrolled to the draft](mobile-audit/after-small-phone.png)
- [Landscape before fixes](mobile-audit/before-landscape.png)
- [Landscape after fixes, scrolled to the draft](mobile-audit/after-landscape.png)
- [Quiet writing on a 320px phone](mobile-audit/quiet-phone.png)
- [Sources on a 390px phone](mobile-audit/sources-phone.png)

## Repeatable checks

```bash
npm run test:browser -- e2e/mobile.spec.ts
npm run test:browser
npm test
node --import tsx --test web/test/*.test.ts
npm run test:mobilize
npm run build
npx tsc --noEmit -p server/tsconfig.json
npx tsc --noEmit -p e2e/tsconfig.json
```

The mobile suite checks page width, working canvas height, Settings bounds and
field access, writing focus/quiet mode, autosave verified through the API, reload
persistence, export downloads, story-card lookup, all seven editor forms with
dock/recall/save, Sources import/search/edit persistence, and backup download.
Screenshots and JSON layout observations are attached to the Playwright report.

Verified results:

- All **10 touch-enabled mobile scenarios passed** after the final application
  CSS changes, including all five viewports, seven editor types, writing, Sources,
  export, and backup download.
- **107 server tests**, **45 frontend runner entries** (including the file with
  seven bang-hash assertions), and **6 Mobilize helper tests** passed.
- Production build and server/e2e TypeScript checks passed. No dependency changes.
- `npm run dev:phone` was smoke-tested with temporary projects and the mock provider.
  Both the page and API health returned HTTP 200 through `192.168.1.4:5177` from
  the computer. The smoke server was stopped afterward; this does not establish
  that a particular phone/router/firewall combination can connect.

The original broad browser run was interrupted. Follow-up batches repair stale
Maximize selectors, an uninitialized export probe, and geometry tests that did
not normalize scroll position. Refer to the final follow-up result below rather
than treating the interrupted run as a clean full-suite pass.

Final follow-up: **15/15 scenarios passed** in the drawer, Workbench,
workspace-export, workspace-windows, world-map, writing-focus, and writing-fonts
batch. The export pointer probe and all four floating-editor scenarios also
passed in the earlier follow-up. Every one of the 75 browser scenarios has a
passing result across the audit and targeted reruns; a fresh uninterrupted
75-test run was not performed. The latest full mobile batch passed all 10 mobile
scenarios. The final e2e TypeScript check and whitespace check also passed.

Run this final regression batch independently when needed:

```bash
npm run test:browser -- e2e/tool-drawer.spec.ts e2e/workbench.spec.ts e2e/workspace-export.spec.ts e2e/workspace-windows.spec.ts e2e/world-map.spec.ts e2e/writing-focus.spec.ts e2e/writing-fonts.spec.ts
```

## Remaining acceptance work

- Real iPhone Safari and Android Chrome: software keyboard open/close, dictation,
  autocorrect, composition, native text-selection handles, and long writing sessions.
- Browser chrome changes, safe areas, pinch zoom, native fullscreen restrictions,
  and rotation while a floating editor is open. A resized emulated viewport does
  not reproduce every visual-viewport/keyboard interaction.
- Native camera/gallery/file selection and downloaded-file handling.
- Finger dragging and pinch gestures on World/Plot canvases and scene material.
  This audit proves navigation and form taps, not every multi-touch interaction.
- Screen-reader, contrast, zoom, and comprehensive target-spacing audit. Small
  secondary controls and metadata remain; this is not a WCAG certification.
- Phone connectivity: opt-in `npm run dev:phone` now enables Vite's LAN listener.
  Follow [the phone-testing guide](testing-on-your-phone.md). Normal frontend
  startup remains local. No remote hosting, authentication, sync, offline install,
  or deployment was added.

For comfortable phone drafting, use **Focus → Hide controls**. Reveal controls
with the feather button and tap **Back to workspace** to return.
