# ADR-001: Verified recovery, isolated Studio editions, evidence-led writing improvements

Status: Accepted for implementation; release gates not yet passed
Date: 2026-10-15
Decision owner: Dennis Carroll
Baseline: Muse main 2fe54db

## Context
Legacy backup embeds all bytes in JSON/Base64 and rejects projects over 50 MiB saved / 80 MiB encoded. Binder previews have already been decoupled from this limit. Studio currently has one localStorage project and shared IndexedDB assets. A safe bridge requires project isolation before import.

## Decision
Implement in order: file-backed, verified v2 ZIP recovery (2 GiB); Studio project slots and schema 1.4 formatting; explicit document-and-image edition export; real writing-session evidence. Legacy JSON import remains supported. One manuscript document maps to one Studio scene. Repeated imports create independent slots. No private planning material travels unless explicitly selected manuscript prose.

Archive layout: muse-backup.json plus project/<allowlisted relative path>. Manifest records version, source identity, timestamp, deterministic snapshot hash, path/size/SHA-256 for each file. Validate exact entry correspondence, source-original hashes, saved stores and manifest before installation. New project identity; no overwrites.

Limits: 2 GiB saved, 2 GiB + 64 MiB uploaded container, 10,000 files/directories, 16 MiB manifest, 50 MiB aggregate structured JSON, one active heavy job, 8 GiB managed temporary storage, 512 MiB free reserve, 30-minute active/ready deadlines, 60-second upload inactivity.

Prepare on disk, verify, then expose download. Browser sends raw File and downloads native attachment. Worker performs heavy validation. Private staged restore with durable reserved identity makes retries idempotent. Only owned temporary paths may be cleaned.

Studio: projects, projectBlobs keyed by slot and asset, meta stores in IndexedDB. Atomic legacy migration; preserve legacy source. Revision-aware saves and dirty-version acknowledgement; conflicts cannot silently overwrite. Slot-scoped media/preferences/undo. No deletion UI initially.

Bridge: reusable edition recipe, ordered unique manuscript IDs, explicit end-of-scene image placements, 64 MiB portable file cap, source hashes/receipt stripped from reader output. Markdown tokens become plain text plus UTF-16 bold/italic ranges, headings and dividers. No HTML execution. Update editor, both readers, project projection and MCP validation. Source changes require preview refresh.

## Options considered
| Option | Complexity | Cost | Scale | Familiarity | Decision |
| --- | --- | --- | --- | --- | --- |
| Raise Base64 cap | Low | High RAM | Poor | Existing code | Reject |
| Direct response ZIP stream | Medium | Low disk | Good, late failures | Node streams | Reject for verified recovery |
| Stage and verify ZIP | Medium | Extra disk/I/O | Bounded memory | Node streams plus ZIP libraries | Accept |
| Direct Studio directory writes | High coupling | Installation-specific | Local only | New integration | Defer |
| Portable Studio import | Medium | Small conversion layer | Existing format | Existing import flow | Accept |
| Bidirectional sync | High | Conflict handling | Complex after edits | New subsystem | Defer |

## Consequences
Extra temporary disk and two-pass archive I/O buy verified downloads and safe recovery. Archive capacity is distinct from browser edition capacity. Browser download initiation cannot prove durable save. Local slots remain origin-specific. Old Studio versions cannot read new slot storage or formatting. No cloud, retention, encryption, automatic scene splitting or sync in this release.

## Release gates / action items
- [x] Shared file-backed validation, ZIP capture/extraction, core safety tests (2026-10-15)
- [ ] Worker jobs, streaming HTTP/browser flow, cleanup and retry tests
- [ ] Combined Binder package from same staged snapshot
- [ ] Real KB restore into isolated test workspace; 2 GiB memory/capacity gate
- [ ] Studio source checkpoint, slot migration, revision conflicts
- [ ] Formatting schema and editor/dual-reader parity
- [ ] Three-chapter edition round trip and 120,000-word regression
- [ ] Five real writing sessions; top three evidence-backed fix specifications

Existing unrelated notes/screenshots must remain unstaged. Two context-probe tests had prior baseline failures: diagnose without weakening assertions. No tests may clear live browser data or overwrite live KB.

## Checkpoint evidence (2026-10-15)
Core archive tests: 9 passed, including 2 GiB capture/build/verification at 25.16 MiB incremental process RSS. Real KB restored in isolated temporary workspace. Full server suite: 210 passed before last two additional boundary cases; those passed in final core run. Source child-probe failures were sandbox restrictions; no test changes needed. Worker/HTTP/UI and Studio gates remain open. Detailed continuation: ../handoffs/recovery-studio-opus-5.5.md.
