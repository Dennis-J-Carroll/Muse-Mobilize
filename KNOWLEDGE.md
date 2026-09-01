# Muse-Mobilize Knowledge & Continuation Log

Last updated: 2026-09-01 by Codex, continuing Opus 5 work.

## Current goal

Prove and harden first milestone from handoff §37: writer selects manuscript text, asks specialized agent, sees agent consultation, reviews patch, accepts or rejects it, and keeps writing without leaving workspace.

## Repository state

- Project path: `/home/dennisjcarroll/Desktop/creative/Muse-Mobilize`
- Git boundary: project currently sits untracked inside parent `creative` repository on branch `master` at parent revision `2e12aa1`.
- Consequence: file timestamps, handoff, runtime event log, tests, and build output are current continuity evidence; project has no useful file-level commit history yet.
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

- Handoff phases 0–4 have substantial MVP implementations.
- Phase 5 canon store, watchers, Writers' Room, frozen-reader semantics, plugins, branches, and desktop packaging remain future work.
- Current automated coverage focuses on output parsing, malformed response tolerance, patch anchoring, and stale-patch refusal.

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
- Current project source is untracked in parent repository, so rollback and attribution remain weak.
- Phase 5 canon model needs product decisions for fact status, evidence links, and character knowledge boundaries before implementation.

## Suggested next step

Create tracked project baseline, then begin Phase 5 with smallest vertical slice: portable canon facts tied to manuscript evidence, readable by Continuity agent. Add runtime tests before UI expansion.

## Session log

- 2026-09-01 — Opus checkpoint reconstructed from handoff, source, timestamps, and project event log.
- 2026-09-01 — Baseline tests/build passed; full local UI rendered.
- 2026-09-01 — Duplicate patch-decision race fixed in patch card.
- 2026-09-01 — Continuation recorded here for next agent/session.
