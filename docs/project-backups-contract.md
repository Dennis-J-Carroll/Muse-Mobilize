# Saved-project backup contract

The backup service captures saved files in one Muse project directory. Restore creates a separate project with a new ID and a name ending in ` (restored)`. It preserves the source project and any existing destination. It does not capture unsaved browser drafts, local storage, account settings, provider keys, or files outside the selected project.

## Version 2 ZIP jobs (default UI)

The Backups dialog now prepares `.muse-backup.zip` through worker jobs. A native download starts only after every archived file has been read back and SHA-256 verified. Upload sends the raw File, not JSON/Base64 or an in-memory download Blob. Legacy JSON import remains available when selecting a `.json` file.

Limits: 2 GiB saved files, 2 GiB + 64 MiB container, 10,000 files/directories, 16 MiB manifest, 50 MiB aggregate structured JSON. One heavy operation at a time; at most four retained active/ready jobs; 8 GiB reserved temporary storage; 512 MiB free disk reserve. Active and ready lifetimes are 30 minutes; idle upload timeout is 60 seconds. Jobs and status ledger live under `CONFIG_DIR/archive-jobs`, outside project capture.

`muse-backup.json` is the first ZIP entry. Its version-2 manifest contains sourceProjectId, capturedAt, snapshotHash, and ordered file records `{path,size,sha256}`. Every remaining entry is exactly `project/<path>`. Snapshot hash covers JSON tuples `[path,size,sha256]` in code-point path order. Explicit directory entries, encrypted/special entries, unlisted files, duplicates, path collisions, mismatched sizes/hashes, and invalid saved stores are rejected.

Routes:

- `POST /api/projects/:id/backup-jobs` prepares an archive.
- `POST /api/projects/:id/binder/package-jobs` accepts recipe and preview snapshotHash, capturing Binder and private backup from the same staged project.
- `POST /api/backup-imports` reserves filename/size; `PUT /api/archive-jobs/:jobId/upload` streams raw bytes.
- `GET /api/archive-jobs/:jobId` returns public state/progress/preview; `GET .../download` returns a verified attachment.
- `POST .../restore` accepts expected snapshotHash and installs a fresh project. Repeated requests return the same identity.
- `DELETE /api/archive-jobs/:jobId` cancels/discards temporary work. `GET /api/projects/:id/backup-status` returns last verification/restore records.

A durable journal records restore identity before installation. A private `.muse/restore-receipt.json` inside the installed project proves completion if server stops before updating its journal. This receipt is excluded from future project backups. Restart cancels unfinished operations and removes only job-owned work; verified ready jobs survive until expiry. Cancellation waits for worker writers to close. An empty exclusive destination reservation left by an abrupt crash is never recursively removed without ownership evidence.

Combined package contains binder.html, binder-recipe.json, receipt.json, README.txt, and backup.muse-backup.zip. Extract the inner backup for restore. The legacy package route remains compatible but retains its old size limits.

“Archive verified” and “download requested” do not attest that a browser saved a durable/off-device copy.

## Legacy version 1 service boundary

```ts
exportProjectBackup(projectId, { workspaceRoot? } = {}): Promise<ProjectBackup>
restoreProjectBackup(input: unknown, { workspaceRoot? } = {}): Promise<ProjectManifest>
```

Normal calls use the configured workspace and existing `projectDir` lookup. Supplying `workspaceRoot` isolates service calls from account settings; tests use only temporary fixture workspaces.

The version 1 JSON envelope is:

```json
{
  "format": "muse-project-backup",
  "version": 1,
  "sourceProjectId": "example",
  "capturedAt": "2026-09-06T12:00:00.000Z",
  "files": [
    { "path": "project.json", "size": 0, "sha256": "<64 lowercase hex characters>", "data": "<base64>" }
  ]
}
```

The file above illustrates the fields, not a restorable manifest. `size` is the decoded byte count. `sha256` covers the exact decoded file bytes. Binary assets use base64 without conversion through text. Files without identity or image-link changes are restored byte for byte.

The restore input may be a Buffer, JSON string, or parsed object. Buffer/string size is checked before JSON parsing. Object shape, every path, all claimed and base64-derived sizes, total size, and file count are checked before allocating decoded file buffers. Every digest and the manifest are validated before creating a staging directory.

## Included saved files

| Storage | Included paths |
| --- | --- |
| Project metadata | `project.json` |
| Documents | Markdown, `.markdown`, and `.txt` files under `manuscript/`, `outline/`, `notes/`, and `canon/` |
| Characters and world entities | `canon/canon.json` |
| Plot | `plot/plot.json` |
| Scenes and themes | `scenes/scenes.json` |
| References | `references/references.json` |
| Sources | `sources/index.json` and supported files under `sources/originals/`, `sources/extracted/`, and `sources/search/` |
| Goals | `goals/goals.json` |
| World map | `world/map.json` |
| Tags and connections | `connections/connections.json` |
| Managed/local assets | Regular files under `assets/` |
| Project agents | YAML files under `agents/` |
| Agent arrangements | `studio/arrangements.json` |
| Project Binder recipe | `binder/recipe.json` |
| Saved layouts | JSON files under `workspaces/` |
| Progress and revision history | `.muse/events.jsonl`, document files under `.muse/snapshots/` |

This is an allowlist. Account configuration, dotfiles, Git files, arbitrary root files, and browser/cache directories are excluded. A nested `project.json` is not an accepted asset or document. Empty directories are not serialized.

## Limits and validation

- Maximum JSON input/output: 80 MiB.
- Maximum total decoded saved files: 50 MiB, including metadata. Restore also checks the resulting file total after identity/link changes.
- Maximum files: 10,000. Export also bounds directory traversal at 10,000 directories.
- Limit errors retain `413 / BACKUP_TOO_LARGE` and identify the exceeded dimension and observed usage (including exact byte counts). Export inventories bounded file metadata before rejecting a saved-byte total, so it can report the total and largest storage category without reading file bodies. Counts stop at the first over-limit entry; validation totals may be partial and are labeled “at least.”
- Paths: relative slash-separated paths, at most 1,024 UTF-8 bytes, 32 components, and 255 bytes per component. Reject absolute paths, traversal, backslashes, NUL/control characters, Windows device names, trailing dots/spaces, and hidden components other than the allowed `.muse` root.
- Reject duplicate paths, case/Unicode-normalization collisions, conflicting directory spellings, and file/directory collisions.
- Export rejects symbolic links and nonregular entries within the selected saved paths. Restore accepts only regular-file records; archive fields describing links, modes, or targets are rejected.
- Base64 must use the canonical alphabet and padding, without whitespace. Every declared byte count and SHA-256 digest must match.
- The envelope and manifest use their explicit version 1 fields. A manifest must have matching source identity, a name, valid timestamps, unique document IDs, and valid document metadata. Every document path must reference an included document file. Nested/extra document metadata is rejected.
- Included structured story stores must contain JSON objects with `version: 1`. The service preserves store contents; normal store APIs retain responsibility for their domain semantics.

## Identity, image links, and installation

The new ID is `<sourceProjectId>-restored-<UUID>`. Restore rejects a source ID too long to append that suffix within filesystem filename limits. Project creation/update timestamps become the restore time. Document and story-object IDs are preserved.

Only these managed-image `src` fields are remapped from `/api/projects/<sourceProjectId>/assets/images/<name>` to the new project:

- Canon entities: `character.references.images[]` and `world.images[]`.
- Plot nodes: `images[]`.
- Reference items: `images[]`.
- World map: `image`.

Captions, tags, summaries, notes, prose, quoted JSON/text, source URLs, and URLs belonging to another project keep their original values. No recursive string replacement is performed.

After validation and link preparation, restore writes files with exclusive creation into a private staging directory under the workspace. It exclusively reserves the new destination and atomically renames the complete staging directory over that operation's own empty reservation. If the destination already exists, restore fails with a collision and preserves it. Failure cleanup removes only this operation's staging directory and, if still owned and empty, its destination reservation. It never recursively removes a destination or unrelated staging directories.

## Capture consistency and HTTP integration

Export inventories saved paths and their sizes before reading data. It opens files without following a final symlink, compares inode/device/mode/size/modification/change metadata before and after bounded reads, validates the captured archive, and compares a final inventory. Observed edits, additions, removals, or replacement during capture prevent a successful export. This detects concurrent writes; it is not an operating-system transaction or a guarantee against a write occurring after the final checks. Save current edits and avoid editing during capture; retry if a change is reported.

The route integration should provide:

- `GET /api/projects/:id/backup`: JSON attachment download.
- `POST /api/projects/restore`: JSON backup body; register `express.raw({ type: 'application/json', limit: '80mb' })` before the general 8 MB JSON parser, then pass the Buffer to `restoreProjectBackup`.

`BackupError` exposes `status` and `code`: malformed/unsupported input is `400 / INVALID_BACKUP`; limits are `413 / BACKUP_TOO_LARGE`; detected capture changes are `409 / PROJECT_CHANGED`; destination conflicts are `409 / RESTORE_COLLISION`; a missing fixture project is `404 / PROJECT_NOT_FOUND`. Unexpected filesystem errors propagate to the application's normal error handler.

Readable Project Binder preview, HTML, and printing use a separate selected-content capture and are not subject to full-backup limits. The binder verify endpoint requires both the recipe and its preview snapshot hash. Renderer `muse-binder-2` fingerprints recipe/order, selected render content, linked titles, missing selections, catalog count, and included local image bytes. Preview renders captured inputs and checks another capture before returning. Download verification checks those inputs again. These checks detect observed concurrent changes; they are not an operating-system transaction. The ZIP path still builds and validates the complete backup and rechecks selected binder inputs after capture.

## Verification

`server/test/backups.test.ts` uses isolated temporary files. It covers binary and all-store round trips, repeated restore identities, source preservation, targeted image links, configuration exclusion, traversal/collisions, malformed metadata/payloads, size/count limits, symlink refusal, changes during capture, an existing empty destination, and cleanup after an installation failure. No user story, real project, browser, or running server is used by these tests.
