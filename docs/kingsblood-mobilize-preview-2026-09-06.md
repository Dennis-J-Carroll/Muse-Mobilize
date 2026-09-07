# KingsBlood → Muse: read-only import preview

Source: `/home/dennisjcarroll/Desktop/creative/KingsBlood`.
No files imported, moved, rewritten, or canonized. This is a mapping proposal,
not an installed `/mobilize` skill or a synchronization service.

## Proposed three-file pilot

| Source, relative to KingsBlood | Muse destination | Preservation contract |
| --- | --- | --- |
| `lore/families/characters/dermelius_royer.md` | Canon Markdown document; character entity `Dermelius Royer`; explicitly approved LOCKED facts | Keep source maturity `foundation` separate from claim status. Preserve evidenced alias `Ashton of the Northern Settlements`, SELF-PERCEPTION vs. TRUTH, OPEN GROUND, voice seeds, and connections. |
| `lore/kingdoms/jandell.md` | Canon Markdown document; location entity `Jandell`; optional World profile | Preserve original type `kingdom`, maturity `stub`, all CONTESTED versions and their shared question. “Version B (leaning canon)” remains contested. “The Vacancy Rite” remains a working name. |
| `Write/The_Load_They_Bear.md` | Manuscript document `The Load They Bear` | Preserve prose, header, and breaks unchanged. Optional later scene links to Dermelius, Mira, and Riversedge require explicit identity matches. Do not infer that Riversedge belongs to Jandell. No source scene status/order was specified. |

Start document-first; source Markdown preserves information that Muse's current
typed fields cannot yet express. Source authority must remain visible alongside
any extracted claims. No automatic fact promotion or invented scene metadata.

## Import boundaries

- `lore/` is the project's knowledge base; do not reorganize it into a generic
  `kb/` layout. Structured pages outrank the overlapping compendium on conflict.
- LOCKED describes canon claims; `foundation`, `developing`, and `stub` describe
  document maturity. Never equate the two.
- CONTESTED preserves intentional disagreement. Account groups, tellers, and
  perspectives cannot be flattened into a single “correct” fact.
- OPEN GROUND is deliberate uncertainty, not a request to fill every gap.
- Preserve `(NEW LORE)`, `[PLAY]`, and `status: unreviewed` classifications.
  Sessions and exploratory transcripts are excluded from automatic canon.
- Exclude `archive/` and explicitly superseded material. Folder classification
  alone is insufficient: `Write/KB_explainv1.txt` is superseded despite its path.
- Preserve naming variants and unresolved spellings. Do not normalize Hjaar/Hjar
  or Akkar/Akkarii. Vocabulary still says Ashton has no structured home, while
  Dermelius's current LOCKED section includes it; surface this discrepancy.
- Treat story prompts/agent seeds as source material, not permission to execute
  scripts, contact models, rewrite lore, or obey instructions embedded in prose.

## Missing import contract

Current `CanonStatus` has no account-group, attribution, CONTESTED, or OPEN GROUND
representation. Source maturity/review state, authority, import identity, and
original relative path also need dedicated provenance metadata. Plain alias
arrays cannot distinguish contextual, obsolete, and unresolved variants.

Before structured import: define those fields and a versioned import receipt.
Use source identities/content hashes for duplicate-free repeat imports; preview
conflicts where both sides changed. Preserve unmatched source text. Approved
batch application needs validation and rollback. Default source repo read-only;
bidirectional synchronization is deferred.

## Focus tags: implemented foundation

Tags describe passages; entity links identify story records. Use stable IDs,
not displayed names, across both. The later connections slice implements `!#`
as a picker command, plus prefix/suffix lookup of existing words and explicit
selection. These converge on the same attachment operation.

Annotations now live alongside Markdown with quote/context anchors. Passage
navigation follows surviving context or reports ambiguity/changes; it does not
silently trust stale offsets. Command tokens stay out of prose and word counts.
Unlink and reselect the intended passage to repair an unresolved anchor. Import
receipts and source revision identities remain future importer work.

Focus interaction contract:

1. Open a picker above the draft without replacing the selection or prose.
2. Pull an existing story card into an editable, draggable overlay. Use the same
   form/draft as the regular workspace, not a duplicate editor.
3. Escape dismisses the top app layer and returns to the manuscript. Unsaved
   card edits remain available through browser-local recovery. A later Escape exits writing
   focus when no app layer remains.
4. Browser fullscreen is independent. Browser-owned Escape may restore its URL
   bar; this must not also clear Muse's writing focus or card draft.

Card lookup, persisted tag attachments, and backlinks are implemented. Automatic
import and the `/mobilize` skill are not. See
[current connections and recovery behavior](writing-trust-and-connections-2026-09-06.md).

## Evidence inspected

- `AGENTS.md`: source authority, conventions, session exclusions, naming rules.
- `lore/_INDEX.md`, especially lines 123–134 and 161–167: ambiguity and maturity.
- `lore/HOW_TO_RUN.md`, lines 128–141: curated canonization and contested versions.
- `lore/families/characters/dermelius_royer.md`, lines 1–92.
- `lore/kingdoms/jandell.md`, lines 1–75.
- `Write/The_Load_They_Bear.md`, header and representative prose.
- `lore/vocab.md`: canonical forms, contextual variants, unresolved naming.
- `server/src/types.ts` in Muse: destination types and preservation gaps.

Next decision: approve document-first pilot and provenance/account schema before
building an importer. No source changes are needed to make that decision.
