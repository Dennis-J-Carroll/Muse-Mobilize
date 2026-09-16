# Project Binder and Agent Studio

Status: **First implementation delivered**, 2026-09-14. See [the current usage guide](using-agent-studio-and-project-binder.md) for supported behavior and formats. The original design below is preserved as a proposal snapshot; its examples and future options are not all implemented interfaces.

Delivered: enforced per-record access, checked attachments and Source retrieval, writer-mediated excerpt sharing, Agent Studio, saved arrangements loaded as independent copies, ordered Binder recipes, HTML preview/download, PDF print action, and ZIP packaging with the existing backup restore route. Binder recipes and arrangements participate in saved-project backups. Reusable independent policy profiles, automatic consultation under shared grants, field-level views, direct ZIP import, and publication typesetting remain future work.

Working assumptions: the first export is a writer's whole-project binder, and agents remain separate until the writer shares material. Both can be adjusted without changing the foundations below.

## Context before implementation

| Capability | Current implementation | Gap |
| --- | --- | --- |
| Saved-project backup | Versioned JSON preserves supported saved documents, story stores, Sources, assets, agent YAML, and saved workspace files. | It is a restore format, not a presentable book or binder. Browser-only drafts and Saved Desks are excluded. |
| Quick Export | The current document can be rendered as Markdown, text, or DOCX. | No whole-project section ordering, card renderer, or binder preview. |
| Agent conversations | Agent panes show conversation, state, and broad context scopes. Definitions live in project YAML. | No dedicated create/edit workspace or per-card knowledge assignments. |
| Context selection | Runtime assembles broad scopes such as manuscript, notes, canon, and retrieved Sources. | `forbidden` only changes summary text; attachments bypass scope checks; the continuity role implicitly receives canon. |
| Consultation | Runtime checks contact rules and passes questions and answers between agents. | Contact permission does not prevent one agent from disclosing material another agent was not assigned. |

Code references: [`backups.ts`](../server/src/backups.ts), [`export.ts`](../server/src/export.ts), [`context.ts`](../server/src/context.ts), [`agents.ts`](../server/src/agents.ts), [`sources.ts`](../server/src/sources.ts), and [`AgentPane.tsx`](../web/src/panes/AgentPane.tsx).

## Decision 1: one editable binder recipe, several output formats

Build a **Project Binder**: an organized presentation of the project, assembled from existing saved records. The writer owns section order, included material, headings, explanatory text, and appearance. Export never rewrites the underlying story.

Keep three outputs distinct:

| Output | Intended use | Proposed behavior |
| --- | --- | --- |
| Readable binder | Reviewing or presenting the project | Navigable HTML with contents, cards, images, internal links, and print styles. Browser printing provides an initial PDF route. |
| Editable recipe | Arranging and reusing the presentation | Plain JSON with section order and stable record IDs. The app edits it visually; the writer can also edit the file. |
| Project package | Moving the editable project and its presentation together | Later, a conventional ZIP containing the existing backup JSON, recipe, rendered binder, referenced assets, and export receipt. |

A custom extension is possible, but it adds no capability by itself. Start with a recognizable ZIP. Adopt a Muse extension only when the application can validate and open that package. The current restore flow accepts the existing backup JSON, not these proposed recipes or packages.

PDF is a presentation output, not the editable master. HTML is the first presentation target because the same structured content can support navigation, responsive viewing, and printing. Exact page layout and publication-quality PDF typesetting remain separate work.

### Writer's flow

1. Open **Project → Export → Project Binder**.
2. Start from **Whole project**, **Selected material**, or **Reader manuscript**.
3. Arrange sections using drag handles and accessible Move up / Move down buttons. Add an introduction, rename a section heading, and choose cards or documents.
4. Review a contents list and preview. Show counts, omitted material, missing assets, and unsaved changes.
5. Save the recipe or download the rendered binder. Print the preview to PDF if desired.

The Whole project preset should offer every supported content family: manuscript, outlines, notes, characters, world, canon facts, plot, scenes, dialogue, themes, references, Sources, goals, connections, and optional agent definitions and recorded activity. The preview must distinguish included, excluded, and unsupported content; it must not silently claim completeness. Source extracts belong in readable sections; original source files belong in a package when selected. Unsupported originals remain downloadable, not falsely rendered.

Reader manuscript starts with story documents only. Full-project packages contain private project data even if the visible binder omits it. Label that distinction at download so a presentation cannot accidentally be mistaken for a safe-to-share archive.

### Content model

- Recipes reference stable IDs, never filesystem paths or display names as identity.
- Section selection is explicit: `all` or `selected`. Missing sections are excluded. An empty selected list stays empty.
- Each render resolves the recipe to an ordered snapshot of records and revision hashes. Preview and download use the same snapshot; changed data requires a refreshed preview.
- Headings and introductory prose belong to the recipe. Manuscript prose and card fields remain in their original stores.
- Render only supported fields. Show links to included records; do not silently add linked material. Handle omitted endpoints consistently in connections and diagrams.
- Treat card prose and imported material as content, never executable templates. Escape rendered markup and validate links and local assets. Do not fetch remote images automatically to complete a package.
- Preserve Unicode, paragraph breaks, image captions, attribution, and source identity. Include originals only through the existing bounded archive mechanism or an equally validated package asset layer.
- Font, spacing, page size, and colors are presentation settings; they never modify manuscript text.

Example: [`project-binder.recipe.example.json`](examples/project-binder.recipe.example.json). Reordering `sections` changes the proposed binder's reading order. IDs are synthetic and must be replaced by app-selected project IDs before a future importer can use the recipe.

### Alternatives considered

| Option | Benefit | Tradeoff |
| --- | --- | --- |
| PDF only | Familiar single deliverable | Poor editable source; cannot restore the project or easily rearrange cards. |
| Existing backup only | Already portable and validated | Not a presentable reading experience. |
| Proprietary binary format first | Could eventually support one-click opening | Adds tooling and migration work before the writer can organize anything. |
| Recipe + readable output + optional ZIP | Writer can arrange content; existing archive remains useful | Requires a section renderer and clear boundaries between presentation and private archive. |

**Proposed choice:** recipe and HTML preview first; PDF through print; packaged project after restore support is designed. Add whole-binder DOCX after section semantics settle, reusing the existing single-document exporter where appropriate.

## Decision 2: dedicated Agent Studio with explicit knowledge assignments

Add an **Agents** workspace for configuring agents. Conversation panes remain available alongside the manuscript, while the workspace owns creation, duplication, assignments, and saved arrangements.

Desktop: agent roster on the left, selected agent settings in the center, resolved knowledge preview on the right. Phone: roster → agent → Knowledge / Behavior / Sharing tabs, with a persistent Back action and visible save state. Choosing an agent must not crowd the manuscript with permanent configuration panes.

### Separate four concepts

1. **Agent instance:** name, role, instructions, goals, model, budget, and its own conversation identity. Duplicating Muse creates another independent instance, not an alias for the same run history.
2. **Knowledge assignment:** which saved resources the runtime may supply to that instance.
3. **Actions:** advice, proposed edits, or other explicitly supported capabilities. Reading a character does not grant permission to edit it. Accepted edits remain writer-controlled.
4. **Arrangement:** named set of agent instances, their assignment bindings, and permitted communication. Workspace layout can refer to the arrangement but must not control permissions.

First version can store assignments directly on instances. Separate reusable profiles only when useful; avoid making the writer maintain three separate configuration screens for a two-agent setup.

### Knowledge controls

For each feature, offer **None / Selected cards / All**. Documents and Sources use the same pattern. Selected material stays a fixed ID list; All clearly includes future records in that category. An explicit exclusion takes precedence over an inclusion. New agents start with no project material assigned.

Examples:

| Agent | Assigned knowledge | Available contribution | Sharing |
| --- | --- | --- | --- |
| Muse — Plot | Plot cards and selected Sources | Structure, causality, contradictions in assigned material | Replies to writer only |
| Muse B — Mara | Only Mara's character card | Motivation, voice, character-focused possibilities | Replies to writer only |
| Line editor | Selected manuscript passage | Propose small edits to that passage | Replies to writer only |

The writer can read all three responses and write using whichever input helps. Reading those replies does not automatically give the agents access to one another's material. An explicit **Share excerpt with…** action can pass selected advice to another agent for a particular run and record that disclosure.

Card access means the fields actually stored on that card, not everything linked to it. A character card may itself mention plot events; access controls cannot infer which sentences count as spoilers. The writer must be able to inspect the exact card content and provide a separate briefing when a narrower perspective is needed. Field-level views and character-at-a-point-in-the-story snapshots are later extensions.

### Runtime contract before UI promises isolation

Resolve a versioned access policy before collecting model context. Use the same resolver for direct questions, selection attachments, document attachments, Source retrieval, and any consultation. All provider-bound paths must pass through it.

- New policy: default deny; exclusions win; unknown resource kinds and malformed assignments fail closed. Missing or deleted IDs never fall back to an entire category.
- Existing agents: show their legacy behavior and provide a migration preview. Do not silently reinterpret old scope strings as a precise new policy or label legacy agents isolated.
- Remove implicit role grants under the new policy. A continuity role is a behavior, not an unconditional grant to all canon.
- Filter Sources before ranking and reading chunks. `searchSources` already accepts `sourceIds`, but its current empty list means unfiltered search. The access resolver must short-circuit a denied or empty allowed set instead of passing `[]` and searching everything.
- Canon facts need explicit membership rules. Do not expose all canon when one character is selected. Related entities, evidence documents, attachments, edges, citations, and metadata must not expand access through links. For an initial strict view, omit a relationship or evidence entry whose referenced resource is not permitted; do not hydrate it automatically.
- Provide adapters for actual feature stores. Existing `outline` scope reads an outline document; it does not provide access to Plot graph nodes. Characters and world entities share canon storage but remain separately selectable.
- User questions and deliberate shared excerpts are additional supplied context. Label these explicit disclosures. A policy cannot prevent a writer from typing information into a question, or make a provider forget an earlier disclosure.
- Resolve one policy revision per run, check it again before dispatch, and prevent queued work from silently using revoked grants. Keep earlier replies visible to the writer, but do not reuse earlier broader context in future narrower model runs.
- Record what was actually sent: policy version, allowed record IDs, excerpts/chunks, omitted or trimmed material, and explicit handoffs. Keep that receipt in writer-facing diagnostics; do not list forbidden titles in model context.

### Consultation is a knowledge transfer

Default for newly isolated agents: no automatic consultation. An agent with access to the plot can reveal it in either a question or an answer, even if the recipient's own retrieval respects its assignments. A prompt saying “don't reveal secrets” does not enforce isolation.

First release supports writer-mediated sharing of an exact excerpt. A later connected arrangement may explicitly allow cross-agent disclosure, with a visible explanation that connected replies can carry knowledge beyond each agent's original assignments. Contact rules alone are not an isolation guarantee.

Strict automatic consultation would require both the consultation question and answering context to be generated from an approved shared context, with no prior broader conversation supplied. Taking an intersection only when building the recipient's context does not remove private details already written into the question. Defer that feature until its information flow is designed and tested.

Example: [`agent-arrangement.example.json`](examples/agent-arrangement.example.json). This shows the requested two-Muse arrangement without automatic knowledge sharing. It is a proposed interchange shape, not valid current agent YAML.

### Alternatives considered

| Option | Benefit | Tradeoff |
| --- | --- | --- |
| More system-prompt instructions | Fast to experiment with persona | Does not prevent restricted material from reaching a model. |
| Broad feature scopes only | Small extension of current code | Cannot express one character or selected Sources. |
| Typed per-record grants + dedicated workspace | Supports independent perspectives and many arrangements | Requires runtime adapters, migration, and context-boundary tests. |

**Proposed choice:** typed per-record grants, writer-mediated sharing, and a dedicated workspace. Preserve conversation panes and explicit patch review.

## Consequences and delivery order

Both features reference the same saved records, so they can share a typed project resource catalog. Export rendering and agent authorization remain separate: inclusion in a binder never grants agent access, and changing an agent's knowledge never changes project content.

1. **Resource catalog and access enforcement:** define record identity, resolver, and adapters for existing stores. Test outgoing context with synthetic private sentinel content; verify denied IDs, empty lists, attachments, role fallbacks, citations, and consultation paths. No UI claim of isolation before these checks pass.
2. **Agent Studio:** create/duplicate/edit instances, choose individual records, preview resolved knowledge, save arrangements, and manually share exact excerpts. Keep legacy behavior clearly identified until migrated.
3. **Project Binder:** ordered recipe editor, section adapters, saved-data snapshot, HTML preview/download, and print styles. Reuse the catalog without reusing authorization policy as export selection.
4. **Portable package:** bounded ZIP packaging and validation, recipe/arrangement schema versions, backup allowlist updates for any new saved files, identity remapping, and tested restore into a separate project. Do not claim new configuration is portable until round-trip tests pass.

Binder and Studio interfaces should inherit the mobile work already completed: single-panel flows, touch-sized controls, no drag-only actions, scrolling forms, and previews that fit narrow screens. Test 320px, typical phone widths, short landscape, and desktop; validate keyboard and touch selection, unsaved changes, reload persistence, and long names.

Binder acceptance: exact selected order and contents; no missing material concealed; Unicode and images preserved; internal links coherent; predictable page breaks; escaping verified; changed source data invalidates the preview; exporting leaves saved story bytes unchanged. Physical-phone printing still needs device testing.

### Writer-owned choices

The examples are deliberately editable. The main choices are the first binder's section order, whether Sources should appear as a full appendix or selected excerpts, and what each Muse instance should know. These are product choices, not permission to migrate existing agents or export a real project. No story data or current agent behavior was changed while preparing this design.
