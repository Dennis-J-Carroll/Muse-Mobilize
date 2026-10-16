# Story Studio editions

Status: implemented and verified with three chapters plus images and a 120,000-word, 40-document fixture. Studio is a separate local source tree; its slot and formatting changes are checkpointed there, not published by the Muse Git push.

## Saved recipes

`editions/recipes.json` is a version-1 store containing unique recipes. A recipe has `version`, `id`, `title`, `author`, ordered unique `documentIds`, and ordered explicit `images`. Each image placement has `id`, selected `documentId`, managed image `filename`, `caption`, and `alt`. IDs and lengths are validated; arbitrary paths, remote images, and unknown fields are rejected. The final bridge limit is 64 MiB; it is independent of full recovery capacity.

- `GET /api/projects/:id/editions` returns `{version:1, recipes:[...]}`.
- `PUT /api/projects/:id/editions/:editionId` accepts `{recipe: ...}` and returns `{recipe: ...}`. The route uses the existing project edit lock and `editions` undo scope. Selected IDs must refer to saved manuscript documents.

Both legacy JSON and v2 ZIP backup policies include the recipe store. Both validate its schema during restore. Document IDs and managed filenames survive restore; no original-project URL is stored in a recipe. Stale recipes may remain after later document deletion; export capture must report missing selections rather than substitute other prose.

## Conversion

`server/src/studio-conversion.ts` uses pinned markdown-it 15.0.3 with CommonMark tokens, HTML/linkification/typographic substitutions disabled. It returns Studio blocks and warnings, never rendered HTML. Paragraphs, heading levels, dividers, bold, and italics retain structured representation. IDs are deterministic for unchanged namespace, order, and block content.

Inline marks use UTF-16 offsets. Unsupported links become label plus destination; inline code loses code styling; lists and quotes preserve source markers as literal text; code blocks preserve literal contents. Markdown images produce omission warnings and text placeholders. HTML remains literal text. Emphasis splitting a Unicode grapheme is removed with a warning while preserving text. The export preview must name affected documents and require acknowledgement of presentation changes.

## Selected capture and portable artifact

`server/src/edition-export.ts` reads selected manuscript metadata/bodies and explicitly selected managed images. It rejects unsafe paths and symlinks, checks sizes before allocation, compares file identity before/after reads and again after conversion, and hashes the selection. Unselected assets and prose do not contribute to the export or its snapshot hash. This detects observed changes; it is not a transactional snapshot against arbitrary external writers.

Metadata reads are capped at 16 MiB; aggregate manuscript input at 64 MiB. Image Base64 cost is checked before reads, including repeated placements. Final serialized output is capped at 64 MiB and identifies the largest selected images on overflow. Unlike the streamed 2 GiB recovery path, this bounded adaptation format intentionally uses in-memory conversion in a worker. No remote images are fetched.

One document becomes one scene; first scene is entry, direct `nextSceneId` links preserve order, final scene is ending. No choices are generated. Images follow each document in placement order. Studio schema is `1.4.0`. Deterministic IDs preserve stable source mapping. Author-only `museOrigin` records source project, edition, recipe hash, snapshot hash, document hashes, conversion version and scene mapping. Studio standalone reader projection removes that receipt.

## Job interfaces

| Route | Request / result |
| --- | --- |
| `GET /api/projects/:id/editions/catalog` | Saved manuscript IDs/titles and managed image metadata; no prose bodies. |
| `POST /api/projects/:id/editions/preview-jobs` | `{recipe}` starts a selected capture/conversion job. |
| `GET /api/archive-jobs/:jobId` | Shared lifecycle; ready preview includes `editionPreviewUrl`. |
| `GET /api/archive-jobs/:jobId/edition-preview` | Snapshot hash, document-scoped warnings, converted blocks and image placements. |
| `POST /api/projects/:id/editions/export-jobs` | `{recipe,snapshotHash,acknowledgeWarnings}` requires the reviewed snapshot. |
| `GET /api/archive-jobs/:jobId/download` | Ready export attachment named `.storyweaver.json`. |
| `DELETE /api/archive-jobs/:jobId` | Cancel/discard registered temporary work. |

Edition jobs share the heavy-operation lock, disk reservations, expiration, cancellation and restart cleanup. Each initially reserves 128 MiB, reduced to actual artifact bytes on success. They never update full-backup verification status. The final file uses ordinary attachment download; preview JSON remains bounded at 64 MiB. Source/recipe changes return `EDITION_CHANGED`; warnings require explicit acknowledgement. Preview artifacts are discarded after loading; downloaded artifacts remain available until replaced, closed or expired.

## Author flow

1. Open **Story Studio** beside Project Binder. Select saved manuscript documents and arrange their order.
2. Choose images for each document; set captions and alternative text. Only chosen images transfer.
3. Preview. Open manuscript edits are flushed first; unresolved recovered drafts block export. Save unfinished card forms separately.
4. Review document-specific formatting warnings and acknowledge them when present. Export; changed source requires a new preview.
5. In the updated Studio, use **Import** to select the downloaded `.storyweaver.json`. Import creates an independent project slot, including repeat imports of the same file.

Saved editions are reusable selection recipes, not copies of manuscript text. Muse remains the writing source. Studio edits do not synchronize back. Slots are local to that browser origin; export Studio work for portable copies. Backup, readable Binder and Story Studio adaptation serve different purposes.

## Verification

`server/test/edition-export.test.ts` covers ordering, marks, embedded images, private exclusions, stale snapshots, warnings, unsafe inputs, input/output limits and job restart/cleanup. Existing recipe tests cover save/history and backup restore.

`e2e/story-studio.spec.ts` covers Muse selection/reordering/acknowledgement, stale-source rejection, native download and recipe reopen. With `STUDIO_HTML` set to the built editable Studio HTML, it also verifies separate import slots, retained existing media, reload, editing, both readers, receipt exclusion and a 120,000-word/40-document save/reopen/order/export/import fixture. Narrow Muse previews are checked at 320px and 390px.

```sh
PW_CHANNEL=chrome STUDIO_HTML='/path/to/amber_eyes_desert_interactive(2).html' npm run test:browser -- e2e/story-studio.spec.ts
```

These automated checks do not substitute for the five real writing sessions in [the writing reliability log](writing-reliability-sessions.md).
