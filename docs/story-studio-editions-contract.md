# Story Studio edition foundation

Status: recipe persistence and Markdown conversion implemented. Selection UI, capture/preview, export jobs, portable image packaging, and end-to-end transfer remain pending.

## Saved recipes

`editions/recipes.json` is a version-1 store containing unique recipes. A recipe has `version`, `id`, `title`, `author`, ordered unique `documentIds`, and ordered explicit `images`. Each image placement has `id`, selected `documentId`, managed image `filename`, `caption`, and `alt`. IDs and lengths are validated; arbitrary paths, remote images, and unknown fields are rejected. The final bridge limit is 64 MiB; it is independent of full recovery capacity.

- `GET /api/projects/:id/editions` returns `{version:1, recipes:[...]}`.
- `PUT /api/projects/:id/editions/:editionId` accepts `{recipe: ...}` and returns `{recipe: ...}`. The route uses the existing project edit lock and `editions` undo scope. Selected IDs must refer to saved manuscript documents.

Both legacy JSON and v2 ZIP backup policies include the recipe store. Both validate its schema during restore. Document IDs and managed filenames survive restore; no original-project URL is stored in a recipe. Stale recipes may remain after later document deletion; export capture must report missing selections rather than substitute other prose.

## Conversion

`server/src/studio-conversion.ts` uses pinned markdown-it 15.0.3 with CommonMark tokens, HTML/linkification/typographic substitutions disabled. It returns Studio blocks and warnings, never rendered HTML. Paragraphs, heading levels, dividers, bold, and italics retain structured representation. IDs are deterministic for unchanged namespace, order, and block content.

Inline marks use UTF-16 offsets. Unsupported links become label plus destination; inline code loses code styling; lists and quotes preserve source markers as literal text; code blocks preserve literal contents. Markdown images produce omission warnings and text placeholders. HTML remains literal text. Emphasis splitting a Unicode grapheme is removed with a warning while preserving text. The export preview must name affected documents and require acknowledgement of presentation changes.

## Remaining implementation contract

1. Capture only selected manuscript metadata/bodies and explicitly selected managed image bytes. Reuse safe file-reader principles from `binder-capture.ts`: path restrictions, no symlinks, size checks before allocation, observed-change checks, hash comparison. Do not call a whole-project backup to prepare an edition.
2. Hash recipe and selected bytes. Preview returns snapshot hash, document-scoped warnings, and converted scene structure. Export must compare expected snapshot and reject stale selection.
3. One document becomes one scene; first is entry; direct `nextSceneId` links ordered scenes; final scene is ending. No choices. Images follow each document in placement order.
4. Preflight Base64 image cost and enforce final serialized 64 MiB limit, identifying largest selected images on failure. Embed existing Studio portable asset records. No remote fetching.
5. Add author-only `museOrigin`: source project, edition, recipe hash, document hashes, conversion version, source-to-scene mapping. Studio reader projection already excludes it.
6. Extend shared archive job infrastructure for bounded edition artifact generation and native download. Edition jobs must not claim full-backup verification or update backup-status ledger. Retain cancellation, resource reservation, lifecycle cleanup, and restart handling.
7. Add Muse selection/order/image/preview/export UI and a three-chapter bridge acceptance test. Use disposable browser storage; preserve existing Studio projects and assets. Test novel-scale save/reopen/order/export/import completeness, not only conversion.
