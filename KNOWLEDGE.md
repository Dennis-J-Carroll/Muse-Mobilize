# Muse-Mobilize Knowledge & Continuation Log

Last updated: 2026-09-01 by Codex, continuing Opus 5 work.

## Current goal

Phase 5 continuity and canon vertical slice is complete. Next goal: choose Phase 6 watcher/event-subscription scope or harden Phase 5 before expanding automation.

## Repository state

- Project path: `/home/dennisjcarroll/Desktop/creative/Muse-Mobilize`
- Git boundary: isolated repository on branch `main`.
- Baseline commit: `ccbb660` (`chore: establish Muse-Mobilize baseline`).
- Parent `creative` repository no longer determines project history.
- Product/architecture source: `muse-mobilize-handoff/MUSE_MOBILIZE_HANDOFF.md`
- Run commands: `npm run dev`, `npm test`, `npm run build`

## Project compass

- Purpose: local-first, artifact-centered multi-agent writing workspace where manuscript stays sovereign and agent edits remain reviewable.
- Input → process → output: manuscript selection + question → scoped context → role agent/model provider → optional explicit consultation → anchored patch → writer decision → snapshot + event history.
- Frontend: React/Vite workspace shell in `web/src`, Zustand orchestration in `web/src/store.ts`.
- Runtime: Express/TypeScript in `server/src/index.ts`.
- Core agent flow: `server/src/agents.ts`.
- Provider-neutral response parsing and patch anchoring: `server/src/protocol.ts`.
- Local project persistence: `server/src/projects.ts`; append-only history: `server/src/events.ts`.
- Portable canon store and agent rendering: `server/src/canon.ts`.
- Providers: deterministic offline mock, Anthropic, and Ollama under `server/src/providers/`.

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

- No frontend interaction test harness currently protects patch-card single-flight behavior.
- Server patch-apply endpoint is safe against changed source text but not idempotent by patch ID; client guard handles normal UI double-submit, while retry-safe API behavior remains future hardening.
- Canon writes use whole-file JSON replacement; concurrent writers could overwrite each other. Single-user MVP is safe, multi-user work is not.
- Entity editing/deletion and fact deletion are not exposed yet.
- Character knowledge cutoffs remain Phase 8; current character entities represent stable identity, not revision-specific knowledge.
- Existing agent YAML is never silently rewritten. Pre-Phase-5 Continuity agents receive canon through role fallback but retain their original prompt text.

## Suggested next step

Before Phase 6, add frontend interaction tests and decide watcher authority: notify-only, suggest, or patch. Recommended first watcher: debounced Continuity notification on manuscript save, never automatic manuscript writes.

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

## Session log

- 2026-09-01 — Opus checkpoint reconstructed from handoff, source, timestamps, and project event log.
- 2026-09-01 — Baseline tests/build passed; full local UI rendered.
- 2026-09-01 — Duplicate patch-decision race fixed in patch card.
- 2026-09-01 — Continuation recorded here for next agent/session.
- 2026-09-01 — Isolated Git repository initialized; baseline committed at `ccbb660`.
- 2026-09-01 — Phase 5 canon store, API, Continuity context, and Canon pane implemented through red-green tests.
