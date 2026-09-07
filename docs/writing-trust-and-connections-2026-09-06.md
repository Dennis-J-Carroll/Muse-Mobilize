# Writing trust and connected story layer

## Delivered behavior

### Recovery: unfinished writing stays separate from saved files

Every manuscript edit updates a versioned browser-local recovery entry before the autosave timer runs. Save requests for the same project/document serialize; old replies cannot mark newer text saved or enter another project. On reload, a differing recovery copy is offered alongside the saved page. The writer chooses **Restore recovered draft** or **Keep saved version**. If the saved page changed independently, both versions are shown; no automatic overwrite occurs before that choice.

Characters, World, Plot, Scenes, Themes, References, and Goals milestone forms recover their fields when the same existing record or new-record form is reopened. Goals session targets also recover after tool switching and reload. Uploaded image references remain in recovered forms; binary image data stays in managed project assets, not local storage.

- Escape, docking, and the form's close control preserve recoverable fields. **Cancel** discards that form's own recovery revision.
- A successful save clears only the submitted revision. Keystrokes made during a save remain recoverable.
- Partial new-theme saves remember the created ID, so retry updates the same record.
- Browser quota/privacy failures show an explicit warning and preserve the previous durable copy. Affected forms stay mounted in the side drawer if closed; project switching is blocked while recovery reports storage failures.
- Pending browser-local drafts trigger the browser's leave-page warning while mounted. This is a safeguard, not a guarantee against browser crashes, storage clearing, or private browsing.
- Agent patch acceptance stops if document saving fails or recovery remains unresolved. If typing occurs while a patch is being applied, the saved patch and those keystrokes are offered as an explicit recovery choice.

Recovery is device/browser/origin-local and is not a portable backup. Reopen the same form to find its draft; editor geometry and the set of mounted forms are still session presentation state. Simultaneous editing of one project in multiple browsers/processes is not collaborative synchronization.

### Backups: saved projects, restored as new copies

**Backups → Download saved project** flushes loaded manuscript drafts and refuses capture if any remain dirty, awaiting recovery, or applying a patch. Save unfinished tool forms first: their browser-local draft fields are not included. Saved Desks are also browser-local and not included; saved project workspace files are included.

**Choose project backup → Restore as new project** validates the backup and creates a new project ID. It never overwrites the original. Managed image URLs are remapped only in known image fields; prose, quotes, captions, and external URLs remain unchanged.

The backup includes saved documents, lore, plot/scenes/themes, references/images, goals, world maps, tags/connections, project agents, workspace layouts, and revision/event history. Provider credentials and account settings are excluded. Keep backup copies outside this device.

Limits: 50 MiB decoded files, 80 MiB JSON, 10,000 files. Checksums, path allowlists, collision checks, bounded reads, and staged installation protect restoration. Edits detected during export cause a retryable capture error. Capture is not an OS-wide transaction.

See [the exact backup format and boundary](project-backups-contract.md).

### Connections: shared tags and stable story identities

**Connections** in the workspace opens a frosted-glass index across documents, characters/world records, plot beats, scenes, themes, references, and milestones. Search includes names, aliases, categories, motifs, and reference image tags. Filter by one shared tag and/or record type across these tools. Existing image/category tags remain distinct; they are not silently migrated into the shared registry.

- Inspect a record to attach shared tags or link another record.
- Rename a tag without breaking links: its ID stays unchanged.
- Use **Tag / link** on the manuscript, or select text and type **`!#`**, to attach a passage annotation.
- Typing `!#` immediately before or after an existing word uses that word. For multiword names, select the full name first. At an empty caret, it opens whole-document connections. Pasted `!#` text is not parsed as a command.
- Command characters do not remain in manuscript prose. The picker lets the writer choose the intended record; it does not guess canon from a matching name.
- Record editors expose a **# / Tags and links** control for saved records. New unsaved records must be saved before they can receive stable connections.
- **Linked from** shows incoming record/passage backlinks. **Passage annotations** lists a document's anchored tags and record links.
- **Go to passage** resolves the original quote plus adjacent context in current editor text. Missing or ambiguous matches are reported; it never silently falls back to stale offsets. **Unlink** removes that attachment only, preserving the tag, records, and prose; reselect text to reconnect it.
- **Open** uses the existing editable card forms. In writing focus, Escape dismisses the connections layer before its underlying card, and the card before writing focus. Browser-native fullscreen Escape remains browser-controlled.

Storage: `connections/connections.json`, version 1. Target identity is `(kind, id)`. Attachments carry exactly one tag or entity link; optional passage anchors use textarea-compatible UTF-16 offsets and 32 characters of context on each side. Mutation queues coordinate one server process, with atomic JSON replacement. Existing links to deleted records are not automatically cascaded.

This first connections index does not overlay permanent colored chips inside the plain-text textarea, apply global filters to every canvas, or merge existing tool-specific relationship models. The underlying manuscript remains plain Markdown.

## Acceptance pass for Dennis

Use a spare project or restore a backup as a new project first.

1. Edit a manuscript, then test reload recovery during a simulated save failure in a spare project. Inspect both versions before restoring.
2. Leave a character or reference form unfinished, dock it, reload, and reopen that same record. Check fields and images. Save, reopen, then test **Cancel** on a separate edit.
3. Set an unfinished session target; switch tools and return.
4. Download a saved project, make a distinguishable edit to the original, then restore the backup. Confirm the new copy has old text/images/tags while the original retains the later edit.
5. Select a passage, type `!#`, create a tag, and link a character. Open and edit that character in quiet focus. Test Escape through each layer.
6. Attach the same tag to a theme/reference. Rename it, reload, filter by tag/type, and follow the manuscript backlink.
7. Edit nearby passage context and confirm navigation reports a changed passage rather than selecting unrelated prose. Unlink and reconnect the intended text.
8. Check Firefox fullscreen/native Escape, mobile keyboard `!#`, touch dragging, long sessions, and comfortable zoom/font sizes. Automated Chromium checks cannot replace those hardware/browser checks.

## Continuation prompt

Verified checkpoint: 59/59 Chromium scenarios; 44 web node:test cases and seven bang-hash assertions; 15 server test files, including 15 connection-service and 11 backup-service cases; production build; server/e2e typechecks; and whitespace checks. Desktop and phone connection screenshots were inspected. The existing localhost:5177 preview health check returned `ok`; its browser tab was not reloaded.

Continue in `/home/dennisjcarroll/Desktop/creative/Muse-Mobilize` on `codex/floating-editor-integration`. Read `KNOWLEDGE.md` and this document. Preserve all existing changes, including earlier quiet-focus work, and leave unrelated `.claude/` and `notes/` alone. This implementation extends `8363d49`; use `git log -1 --oneline` and `git status --short` to identify the current committed checkpoint and any later edits.

Prioritize Dennis's acceptance findings; reproduce each as a failing regression before fixing. Verify recovery and backup boundaries before adding new views. Run web helper tests directly with `node --import tsx`, the server suite, production build, server/e2e typechecks, and the isolated Playwright suite. Keep QA data on the temporary 5277/5278 test runtime; do not reload or mutate the user's 5177 preview tab.

The later document-first `/mobilize` skill now supports read-only previews and approved new-project bundles; see [current scope](mobilize-and-export-roadmap.md). Structured import still needs first-class provenance, document maturity, and competing-account models. KingsBlood at `/home/dennisjcarroll/Desktop/creative/KingsBlood` remains read-only. The prior preview proposes Dermelius Royer, Jandell, and The Load They Bear; do not treat that proposal as permission to import or rewrite them.
