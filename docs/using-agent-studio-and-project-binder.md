# Agent Studio and Project Binder

Implemented September 14, 2026. Both tools open from the tool menu or the Project menu. Existing projects do not need to be recreated.

## Set up independent Muse agents

1. Open **Agent Studio → New agent**. Give the agent a name, role, instructions, and optional goals. Choose a provider under **Model and budget**; `default` uses the provider configured in Settings.
2. Expand a knowledge category and choose **None**, **Selected records**, or **All — includes future records**. Selected records are fixed IDs. Exclusions override inclusions.
3. For **Muse — Plot**, assign Plot and selected Sources. For **Muse B — Mara**, assign only Mara under Characters. Leave other categories at None.
4. Use **Preview model context** with a question to inspect assigned content and retrieved Source passages. This preview uses the entered question without an attached selection; the conversation receipt describes what the actual run received.
5. Choose **Save agent**, then **Open conversation**. Advice uses assigned content plus what you type into the question. The offline mock confirms received context; a configured model provides writing advice.

New agents have no project access by default. A selected passage is included only when the selection option is enabled, its document is assigned, and its text matches the saved document. Attaching a document does not grant access. Sources are filtered before retrieval; empty selections never mean “all.” Cards do not automatically include linked cards, evidence documents, or other characters.

Reading a card includes the prose on that card. If Mara's summary already reveals the ending, assigning that card reveals that text. Use a separate briefing when a character needs a narrower perspective; the runtime cannot infer which sentences are spoilers.

**Existing agents:** the roster labels old definitions **Legacy scopes**. Saving one in Studio replaces its old scope configuration with the explicit assignments shown in the form and disables automatic consultation. No records are preselected during migration. Legacy exclusions now block their corresponding context paths; unknown exclusions require explicit configuration instead of silently being ignored.

## Share advice deliberately

Each reply includes **Share advice with another agent**. Choose a recipient and edit the excerpt before selecting **Share excerpt and ask**. That text is supplied for one run. It does not grant access to the originating agent's Sources or silently carry its whole conversation forward.

Managed agents cannot automatically consult other agents. Proposed edits are also off by default. When enabled, proposals must quote supplied target-document text and still require the writer's normal Accept action. Configuration changes during a run prevent stale results from being returned as current advice.

The context receipt records the policy revision, supplied record identities and content hashes, trimming, and whether an excerpt was explicitly shared. Source citations retain their chunk identities. Provider prompts and questions themselves are supplied information; changing an assignment cannot make a provider forget previously disclosed text.

## Save arrangements

Under **Saved arrangements**, name a group and select the saved managed agents to include. Saving captures their definitions and assignments. **Load … as new agents** makes fresh, independent copies with separate conversation identities. Existing agents remain available.

Agent definitions remain editable YAML under the project's `agents/` directory. Arrangements are saved in `studio/arrangements.json`. Use Studio for validated edits; stale policy saves are refused rather than overwriting newer assignments.

## Build a presentable project binder

1. Open **Project Binder**. Start with **Whole-project content** or **Reader manuscript**.
2. Set a title, introduction, paper size, and whether to include local images.
3. Expand sections to rename them, move them up or down, remove them, and select records. For a custom reading order within a section, use Selected records and its move controls.
4. Add any further sections. Whole-project content includes supported story records and Sources; agent definitions and activity are added explicitly. Save unfinished card forms before previewing.
5. Choose **Save binder recipe**, then **Preview binder**. Review the included/omitted counts and export notes.
6. Download **HTML** for a portable reading copy, or use **Print / Save PDF**. Choose the browser's PDF destination if available. HTML contains a contents list, responsive typography, print styles, and embedded local card images.

Preview captures saved project state. HTML download uses that captured rendering. If saved files change, refresh the preview before downloading or packaging. Unsaved browser drafts, browser Saved Desks, and provider settings are not included. Remote images are not fetched; missing or unsupported images produce export notes. Source sections show extracted text and provenance; original source files travel inside the private project backup.

This first renderer supports structured story cards and basic manuscript Markdown. It does not provide EPUB, whole-binder DOCX, exact publication typesetting, or automatic rendering of every possible embedded document format. Current-document Markdown/text/DOCX export remains available separately.

## Organize the export yourself

Use **Edit recipe as a file → Download recipe JSON**. Reorder `sections`, change section titles, or reorder the `ids` in a Selected section. Import the file back into Project Binder and preview it before exporting. Unknown fields and formats are rejected; deleted or missing record IDs produce visible notes.

The current schema is demonstrated in [binder-recipe-v1.json](examples/binder-recipe-v1.json). Replace its example document ID with a real ID from your downloaded recipe. The older proposal examples remain historical and are not current import formats.

The project stores its recipe in `binder/recipe.json`. Custom sections point to original records; rearranging them does not rewrite manuscript or card data. You can also edit the downloaded HTML independently when you want presentation changes outside the current controls.

## Move the complete saved project

Expand **Portable project package** and select the checkbox acknowledging private saved-project data. **Download project ZIP** includes:

- `binder.html`: readable presentation with included local card images.
- `binder-recipe.json`: editable presentation recipe.
- `project-backup.json`: supported saved project files, including original Sources, assets, agent definitions, arrangements, and saved recipe.
- `receipt.json`: render and snapshot identity.
- `README.txt`: opening and restoration instructions.

The private backup includes saved material even when excluded from the readable binder. To restore, extract `project-backup.json` and choose **Backups → Restore as new project**. Muse currently restores that JSON file, not the ZIP directly. The original project remains intact. Any newer unsaved recipe changes are still available in the ZIP's separate `binder-recipe.json`.

Existing backup limits still apply: 50 MiB saved files, 80 MiB JSON. Binder rendering is capped at 65 MiB and combined ZIP inputs at 120 MiB. Large projects can export selected sections and download their backup separately.

## Phone use

Use [the existing phone setup](testing-on-your-phone.md): `npm run dev:phone`, then open Vite's Network URL on the same trusted Wi-Fi. Expo Go is not required. Agent Studio uses a compact agent selector on phones; both dialogs scroll and retain a visible Back to workspace action. Reordering has buttons and does not require dragging.

Physical-phone keyboard, file download, and PDF destination behavior still need a device check. Browser emulation does not establish iOS or Android printing support on your particular phone.
