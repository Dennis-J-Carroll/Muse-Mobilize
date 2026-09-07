# Preparation contract — version 1

This helper works offline using Node.js built-ins. No server, provider key, npm install, or source-repository scripts are needed. It writes artifacts only; it never calls Muse APIs.

## Selection input

```json
{
  "version": 1,
  "sourceId": "my-story",
  "projectName": "My Story — source pilot",
  "documents": [
    {
      "sourcePath": "lore/city.md",
      "title": "Glass City",
      "kind": "canon",
      "provenance": {
        "maturity": "stub",
        "reviewState": null,
        "authority": "Structured lore page",
        "notes": ["Competing accounts remain unresolved; no claims extracted."]
      }
    }
  ]
}
```

- `sourceId`: writer-chosen stable repository identity, 1–80 ASCII letters, digits, `_`, or `-`, starting with a letter/digit. If unspecified, a dry run may use a clearly labeled proposal; ask the writer to confirm it with the preview before packaging. Reuse it across relocated copies of the same source; do not reuse it for unrelated stories. It is not a filesystem path.
- `sourcePath`: explicit relative slash-separated `.md`, `.markdown`, or `.txt` path. No traversal, hidden components, symlinks, or case/Unicode-colliding duplicates. Spaces and Unicode names are supported. The helper does not recursively discover files.
- `kind`: `manuscript`, `outline`, `notes`, or `canon`. This is a document filing choice, not claim status. Array order is the selected import/display order, not inferred scene chronology.
- `title`: explicit display label, not automatically extracted from potentially misleading headings.
- `provenance`: optional; defaults to `null` maturity/reviewState/authority and empty notes. If present, include all four fields. Strings record reviewed source metadata; the helper does not infer or verify its truth. Preserve original metadata/frontmatter in source bytes as the evidence.
- Unknown fields and unsupported versions are rejected. Titles/project names/provenance strings: at most 1,000 characters. Notes: at most 20 entries of 2,000 characters each.

CONTESTED, OPEN GROUND, attribution, contextual aliases, and partial knowledge remain in the verbatim source. Version 1 does not parse them into Muse `CanonStatus` or `CanonFact`. Do not mislabel this as a completed structured-account schema.

## Preview, approval, bundle

Create output directories outside the source. Use absolute quoted paths, replacing these examples with actual selected paths. The helper refuses existing output files; use a new filename for a new revision.

```sh
node /absolute/skill/mobilize/scripts/mobilize.mjs preview \
  --source /absolute/story \
  --spec /absolute/output/selection.json \
  --out /absolute/output/preview.json
```

The preview contains `format: muse-mobilize-plan`, `version: 1`, `mode: new-project`, source identity, project name, document metadata, and `approvalHash`. Each document records relative source path, provenance, byte count, SHA-256, stable ID, generated destination path, and order. It contains no manuscript payload or absolute source root, but titles and provenance can still be private.

Review it with the writer. After explicit approval:

```sh
node /absolute/skill/mobilize/scripts/mobilize.mjs bundle \
  --source /absolute/story \
  --plan /absolute/output/preview.json \
  --approve EXACT_REVIEWED_HASH \
  --out /absolute/output/story.muse-backup.json
```

The approval hash covers the normalized plan, including mappings/provenance and source hashes. Editing a plan, changing a source, or using a different selection requires a new preview. Anyone able to calculate a hash can create one: the CLI guard binds approval to a snapshot, not to a user identity or security signature.

Output is a version 1 `muse-project-backup`, directly compatible with Muse's saved-project restore. It contains:

- `project.json` with selected document metadata plus a receipt document.
- Exact source bytes in generated `manuscript/`, `outline/`, `notes/`, or `canon/` document paths.
- `notes/mobilize-receipt.md`: a human-readable note with a version 1 `muse-mobilize-receipt` JSON block, `planHash`, source identity, source-to-destination mappings/hashes, and `claimExtraction: none`.

Document identity derives from source identity plus original relative path, not title or content. Repeating a preview is deterministic; changed prose keeps its document identity but changes the approval hash. Output timestamps can differ. A source rename is a new identity; rename tracking is deferred.

## Boundaries and failure behavior

- 1–1,000 selected documents; 8 MiB per source file; 40 MiB combined source data; 4 MiB selection/plan JSON. Final bundle obeys Muse's 50 MiB decoded and 80 MiB JSON limits.
- Invalid UTF-8, binary NULs, unsafe paths, symlinks/nonregular files, duplicate paths, malformed input, and changed sources stop preparation. Reads are bounded and checked for observed changes; this is not an OS-wide transaction against hostile concurrent filesystem mutation.
- Output parent must already exist outside the resolved source root. Publication is exclusive and complete; existing files are not replaced. Hard-link support is required for atomic publication on the output filesystem; an unsupported filesystem fails without replacing an output.
- Original relative links, inline images, and quoted paths remain unchanged. Linked targets and image assets are not automatically included and may not resolve in Muse. Present that limitation before approval.
- No credentials, agents, tool cards, tags, workspaces, or Saved Desks are generated. Empty/unsupported app stores are left to Muse's normal defaults.
- Restore creates a new project, never overwrites the source, and intentionally creates another copy on repeat. Version 1 has no target update/merge or import rollback command. Since preparation never applies to a target, discard an unwanted artifact rather than claiming a target rollback. Managing a restored copy requires separate explicit user direction.

## Verification

The shipped tests use isolated synthetic source trees and exercise the public helper/CLI functions. Muse's repository includes an integration test that restores a generated bundle through its real backup service and exports it again to verify bytes, identities, and receipt survival. Do not run tests against a live story workspace.
