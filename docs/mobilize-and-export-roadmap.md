# Mobilize preparation and story export

## Delivered: document-first Mobilize skill

Canonical package: `skills/mobilize/`. Its `SKILL.md` supports Codex and Claude Code; the helper runs offline with Node.js built-ins. No app UI or active story data changes are required.

Version 1 reads an explicit source selection, creates a hashed preview, and—after the writer approves that exact preview—produces a Muse-restorable project JSON. It preserves original Markdown/text bytes and records source identity, relative paths, hashes, maturity, review state, authority, and mapping notes in a Notes receipt.

It does not extract structured character/world facts, create connections, copy images, fix relative links, or synchronize edits. Source contradictions, unknowns, and prompts stay intact. Repeated packaging uses stable document IDs; repeated Muse restoration creates separate projects. Do not describe that as duplicate-free in-place import.

Run `npm run test:mobilize` for standalone helper checks; `npm test` includes the actual backup-service restore/export round trip. Skill metadata can be checked with the installed skill-creator validator. Use synthetic or temporary projects for mutation tests, never the live story preview.

Installation copies the package into each host's personal skills folder. Keep the repository package as the maintained source; compare copies after updates. Codex uses `$mobilize`; Claude Code uses `/mobilize`. New sessions may be needed to discover a newly installed skill. No provider credentials are needed by the helper.

## Next import work

1. Writer reviews the current KingsBlood three-document preview and its provenance/exclusions before packaging it. Restore requires its own explicit destination choice.
2. Define first-class contested-account, claim-attribution, alias-context, maturity, and provenance fields before structured card extraction. A receipt does not pretend to implement those app models.
3. Add managed-asset inclusion and link resolution with source-relative mapping evidence; never silently rewrite prose or follow arbitrary remote URLs.
4. Design previewed updates: prior receipt + source hash + current Muse hash, unchanged/no-op detection, source-only changes, target-only changes, two-sided conflicts, explicit batch approval, and rollback. No automatic overwrite or bidirectional sync.

## Export seed: three separate products

| Output | Purpose | Status / boundary |
| --- | --- | --- |
| Project archive | Restore editable Muse project data | Existing saved-project JSON backup includes saved documents, lore/tool stores, images, connections, and saved workspace files. It excludes unsaved browser drafts, provider settings, and browser-local Saved Desks. |
| Reader edition | Present selected story material to readers | Proposed: ordered manuscript selection, title/credits, section breaks, front/back matter, and preview; then Markdown/text, DOCX, EPUB, and PDF renderers. Private lore, seeds, revision notes, and spoilers stay excluded unless explicitly selected. |
| Adaptation project | Build a comic, screenplay, illustrated edition, or other presentation | Proposed: separate editable adaptation linked to source passages/scenes. Comic pages/panels, captions, dialogue, images, alt text, and reading order need their own model—not an automatic relabeling of prose. |

JSON remains the interchange/archive layer, not the reader-facing format. A “complete desk archive” would need a versioned portable Saved Desk snapshot and asset/link checks; current backups must not claim to restore browser-only layouts or drafts.

### Smallest useful publication milestone

Start with an **Edition** manifest: stable document IDs, explicit reading order, approved title/front matter, included/excluded sections, and source revision hashes. Provide a preview before writing output. Assemble Markdown first; add one renderer at a time. This avoids mixing backup completeness with publication choices.

Every output should carry an export receipt identifying source revision and renderer/version. Keep render-only typography and pagination separate from manuscript content. An adaptation may add or change content only as an explicitly reviewed derivative, without rewriting the original story.

### Acceptance gates for future exports

- Backup round trip retains saved text, assets, connections, and supported layout data without touching the original.
- Reader output matches selected order, Unicode, paragraph/scene breaks, and approved inclusions; private lore and notes do not leak by default.
- Missing assets, unresolved links, overflow, and unsupported formatting are visible before export.
- Comic/script adaptations preserve traceable source links, allow independent editing, and never present inferred details as original canon.
- Re-export reports source changes rather than implying an old rendering is current. Output files are never silently overwritten.

This document plants the product boundary and sequencing. Publication renderers, portable Saved Desks, structured extraction, and synchronization are not implemented by this slice.
