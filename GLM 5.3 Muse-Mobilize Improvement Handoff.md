# Muse-Mobilize — Workspace Visibility, Story Sources, Retrieval, and Export

Repository:

`https://github.com/Dennis-J-Carroll/Muse-Mobilize`

## Your role

Act as the senior engineer responsible for implementing the next coherent feature slice of Muse-Mobilize.

Do not treat this as a greenfield redesign.

First inspect the existing repository, understand its architecture, tests, project-storage conventions, UX patterns, accessibility behavior, and trust model. Then extend the existing systems with the least disruptive design that satisfies the requirements below.

You are authorized to make the implementation decisions necessary to complete the work, but preserve the fundamental product model described here.

Do not stop after writing an architecture proposal. Execute the implementation, run the appropriate tests, repair regressions, document what changed, and leave the repository in a coherent state.

If some detail in this handoff conflicts with the actual codebase, preserve the intent and adapt the implementation to the repository rather than mechanically following an obsolete path or filename.

---

# 1. Product intent

Muse-Mobilize is a local-first, artifact-centered creative writing workspace.

The manuscript remains the writer's artifact.

Agents should orbit the writing process rather than silently taking control of it.

Important existing principles include:

- manuscript text remains portable;
- agent context is explicitly scoped;
- proposed manuscript changes remain reviewable;
- accepted changes are traceable;
- story Canon is intentionally distinguished from unconfirmed material;
- project data is locally understandable rather than hidden inside an opaque AI service;
- model providers should remain interchangeable;
- source material should retain provenance;
- the writer should be able to leave Muse with their writing.

This feature slice should strengthen those principles.

The three major goals are:

1. Improve visibility and usable space across the Desk/workspace.
2. Add a first-class searchable **Sources** system for existing story material.
3. Add easy manuscript export, especially `.docx`, without turning export into a publication-management burden.

---

# 2. Non-negotiable architectural rule

## Sources are not Canon.

An uploaded file is evidence available to the writer and agents.

It does **not** become authoritative merely because it has been imported.

Maintain a conceptual distinction between:

### Sources
Material supplied to Muse.

Examples:

- old manuscripts;
- PDFs;
- DOCX files;
- Markdown;
- notes;
- research;
- archived drafts;
- conversations;
- old lore documents;
- potentially contradictory material.

### Working story state
The manuscript, scenes, plot, character records, world records, themes, etc. currently being developed in Muse.

### Canon
Facts deliberately established through the Canon system.

The intended knowledge direction is:

`Sources → working interpretation → explicit Canon`

Never:

`uploaded file → automatic Canon`

Agents may use a Source as evidence, mention contradictions, compare Sources, or propose a Canon fact.

They may not silently promote Source claims to Canon.

---

# 3. Begin with a repository audit

Before changing code:

1. Read the current README.
2. Read `KNOWLEDGE.md`.
3. Read the existing design/acceptance documentation.
4. Read `docs/mobilize-and-export-roadmap.md`.
5. Inspect `skills/mobilize/`.
6. Inspect the project storage layer.
7. Inspect backup/restore behavior.
8. Inspect the Context Engine.
9. Inspect pane/workspace state.
10. Inspect current writing Focus behavior.
11. Inspect Saved Desk/workspace layout behavior.
12. Inspect current accessibility and responsive handling.
13. Inspect the browser tests.
14. Run the existing baseline tests before substantial modifications.

Pay particular attention to the existing implementations around:

- `web/src/App.tsx`
- `web/src/components/WorkspaceCanvas.tsx`
- `web/src/workspaceLayout.ts`
- `web/src/writingView.ts`
- `web/src/desks.ts`
- `web/src/store.ts`
- `web/src/api.ts`
- `server/src/context.ts`
- `server/src/types.ts`
- `server/src/projects.ts`
- route/server bootstrap files
- backup/restore services
- existing document APIs
- existing E2E tests.

Do not assume these are the only relevant files.

### Baseline

Run at minimum:

```bash
npm install
npm test
npm run build
npm run test:mobilize
```

Also run browser tests if the local Chromium environment is available:

```bash
npm run test:browser
```

Record the starting state before changing implementation.

Do not blame pre-existing failures on this work. Document them separately if they exist.

---

# 4. Work safely

Create a feature branch from the repository's actual current working/default branch.

Suggested branch name:

```text
feat/workspace-sources-export
```

Do not rewrite repository history.

Do not delete existing user-facing behavior merely because a cleaner implementation is possible.

Prefer additive migrations and backwards-compatible defaults.

Existing `.muse` projects must continue opening.

A project without Sources data must behave exactly like a project with an empty Sources collection.

Do not require users to regenerate existing projects.

---

# PHASE A — Improve Desk and workspace visibility

## 5. Goal

The main Desk should feel more like a workspace than a single viewport that everything must fit inside.

The user needs more room to move around and inspect tools.

Several workspaces should also be capable of temporarily using nearly all available application space without invoking browser fullscreen and without being confused with manuscript Focus mode.

---

# 6. Preserve three distinct concepts

Do not collapse these concepts together.

## Normal Desk

The normal multi-pane environment.

## Expanded pane/workspace

One tool occupies most or all of the Muse application workspace.

The application chrome may remain.

The underlying Desk still exists.

Closing/restoring the expanded view returns the writer to the previous arrangement.

## Writing Focus

Existing manuscript-centric quiet writing mode.

Preserve its semantics.

## Browser Fullscreen

Existing browser Fullscreen API behavior.

Do not repurpose browser fullscreen as the generic workspace expansion mechanism.

---

# 7. Scrollable Desk

Investigate the current canvas/layout constraints.

Modify the main workspace so the user can have a larger usable vertical workspace instead of forcing all visible content into the viewport.

Desired behavior:

- the central workspace can scroll vertically when content extends beyond the visible region;
- normal page/application controls must remain usable;
- floating panes remain interactable;
- scroll behavior must not break pane dragging;
- pane resize handles must remain reachable;
- pane z-index behavior must remain correct;
- Saved Desk restoration must not unexpectedly relocate panes;
- focus restoration must remain correct;
- keyboard navigation must remain viable;
- laptop-size screens should gain usable workspace rather than additional clipping.

Avoid an uncontrolled infinite-canvas rewrite.

A normal browser scroll model is preferable unless the existing architecture strongly indicates otherwise.

The user should not lose track of the application because a pane was moved several screens away.

Consider reasonable workspace bounds/padding.

---

# 8. Improve pane maximization

There is already pane `sizeMode` behavior including `maximized`.

Do not create a redundant second maximization architecture unless necessary.

Instead, inspect and strengthen the existing implementation.

A maximized pane should:

- occupy essentially the full Muse workspace region;
- remain inside the application;
- preserve the sidebar/header behavior according to the existing design;
- retain its internal React state;
- preserve unsent form values;
- preserve textarea/editor state;
- preserve the Desk arrangement underneath it;
- restore to the exact prior pane state when unmaximized;
- work for non-editor workspaces;
- expose a clear Restore action;
- support Escape only if that does not conflict with existing Focus, modal, drawer, and browser-fullscreen semantics.

The existing portal/reparenting behavior appears deliberately designed to preserve component state. Preserve that property.

---

# 9. Make expansion especially useful for domain workspaces

Verify good expanded behavior for:

- Characters
- World Building
- Plot Outline
- Scenes
- Dialogue
- Themes
- References
- Goals
- Progress
- Canon
- Sources once it is added.

Some panes may require responsive CSS changes when given much more width.

Do not simply stretch narrow content indefinitely.

Use the additional space where appropriate.

Examples:

### Plot
Use the additional width for the narrative graph/current.

### World
Give the atlas/canvas meaningful room.

### Scenes
Allow longer scene lanes.

### Dialogue
Allow dialogue/subtext/knowledge columns to breathe.

### Themes
Increase matrix visibility.

### Characters
Allow dossier information and imagery to coexist more comfortably.

### Sources
Allow result browsing and source preview side by side on sufficiently wide screens.

---

# 10. Expansion controls

Use the existing visual language.

A pane header should communicate states clearly.

Conceptually:

```text
[Move] Pane title                 [Minimize] [Expand/Restore] [Close]
```

Do not introduce ambiguous icons without accessible labels.

Requirements:

- `title`
- `aria-label`
- keyboard focusability
- correct state announcement where appropriate.

---

# 11. Workspace regression tests

Add/update browser tests covering at least:

### Scroll

- content beyond normal viewport can be reached;
- workspace does not clip critical panes;
- scrolling does not alter manuscript content.

### Expand

- expand a Characters pane;
- verify it occupies expanded workspace;
- restore;
- verify prior layout/state returns.

### State preservation

Enter text into a tool/editor field.

Expand or reparent the pane.

Restore it.

Verify unsaved local input remains.

### Writing Focus

Ensure generic pane expansion does not break existing writing Focus behavior.

### Browser fullscreen

Ensure Escape handling remains correct.

### Small viewport

Verify expansion and restoration at a phone/small-tablet-like width without broken navigation.

---

# PHASE B — Add a first-class Sources system

# 12. Product name

Use **Sources** as the primary product term unless the current UX vocabulary strongly requires another label.

Avoid calling the feature “Knowledge Base” everywhere.

“Knowledge base” implies authority.

“Sources” correctly implies evidence.

Internally, services may use terms such as retrieval/index/search.

---

# 13. Sources workspace

Add Sources as a proper Muse workspace/pane.

It should eventually support three jobs:

1. Add existing material.
2. Search existing material.
3. Ask agents to reason over selected/retrieved material.

The writer should be able to use Sources without invoking an AI model.

---

# 14. Initial supported source formats

Required:

```text
.md
.txt
.docx
.pdf
```

Optional if implementation is clean and low risk:

```text
.rtf
```

Do not implement arbitrary binary ingestion.

Do not crawl directories without explicit user action.

Do not follow remote URLs automatically.

Do not OCR arbitrary images during this phase.

---

# 15. Source data model

Design the precise model after inspecting existing project conventions.

It should represent concepts equivalent to:

```ts
type SourceType =
  | 'markdown'
  | 'text'
  | 'docx'
  | 'pdf';

type SourceClassification =
  | 'manuscript'
  | 'notes'
  | 'research'
  | 'reference'
  | 'archive'
  | 'other';

type SourceAuthority =
  | 'unknown'
  | 'historical'
  | 'working'
  | 'authoritative';
```

A source record should conceptually retain:

```ts
interface StorySource {
  id: string;

  title: string;
  originalName: string;

  sourceType: SourceType;
  classification: SourceClassification;
  authority: SourceAuthority;

  importedAt: string;
  updatedAt: string;

  sourceHash: string;

  originalPath?: string;

  extractionStatus:
    | 'pending'
    | 'ready'
    | 'partial'
    | 'failed';

  extractionWarning?: string;

  textLength: number;
  chunkCount: number;
}
```

Adapt naming to repository conventions.

---

# 16. Preserve original provenance

For every imported Source, retain enough information to establish:

- original filename;
- content hash;
- import time;
- parsing/extraction status;
- source classification;
- authority status;
- relationship between extracted text and original file;
- whether the Source has changed/replaced an older Source.

Do not silently overwrite an existing Source simply because another file has the same filename.

Use content hashes.

If an identical file is uploaded twice, preferably detect this and offer/reuse the existing source rather than duplicating extracted data.

If same name + different hash:

treat it as distinct/new version unless the user deliberately chooses otherwise.

Do not silently infer “latest is authoritative.”

---

# 17. Source file storage

Inspect existing project and backup storage conventions before deciding exact paths.

A reasonable shape may resemble:

```text
<project>.muse/
└── sources/
    ├── index.json
    ├── originals/
    ├── extracted/
    └── search/
```

but do not force this structure if it conflicts with current project abstractions.

Requirements:

- project remains understandable;
- no global hidden database is required to use the project;
- backing data remains project-scoped;
- backup/restore can include Sources;
- Source removal cleans its managed index data safely;
- Source IDs remain stable;
- extracted text can be regenerated from the original where possible.

Avoid a system where the only representation of an imported story file is an opaque vector database.

---

# 18. File safety

Treat uploaded files as untrusted input.

Implement:

- normalized safe file names;
- path traversal protection;
- MIME/extension checks where appropriate;
- bounded upload size;
- bounded parsing memory;
- explicit parser failures;
- no executable file support;
- no automatic macros;
- no arbitrary shell execution;
- no automatic remote-resource fetching;
- safe error messages.

DOCX is a ZIP-based format. Do not blindly trust archive contents.

PDF parsing should operate on local supplied bytes only.

---

# 19. Extraction behavior

## Markdown

Preserve useful text and heading boundaries.

## Plain text

Preserve text.

## DOCX

Extract:

- paragraphs;
- headings where available;
- basic list structure where possible.

Do not attempt pixel-perfect Word reconstruction.

## PDF

Extract embedded text and page boundaries.

Retain page number/location metadata.

If a PDF contains little/no usable embedded text, report something such as:

```text
Text extraction was limited. This may be a scanned PDF.
```

Do not silently run OCR.

Do not claim the file was successfully indexed if meaningful searchable text was not extracted.

---

# PHASE C — Chunking and search

# 20. Search must work offline

A writer must be able to search imported Sources without:

- an OpenAI key;
- an Anthropic key;
- a Gemini key;
- an xAI key;
- internet access;
- an Ollama installation.

Therefore lexical/full-text search is mandatory and is the baseline retrieval system.

---

# 21. Chunk representation

Create deterministic Source chunks.

Conceptually:

```ts
interface SourceChunk {
  id: string;
  sourceId: string;

  text: string;

  ordinal: number;

  location: {
    page?: number;
    heading?: string;
    paragraph?: number;
    start?: number;
    end?: number;
  };

  hash: string;
}
```

Chunking should respect structure where possible.

Prefer:

- headings;
- paragraphs;
- scenes;
- page boundaries

over arbitrary fixed character windows.

Use overlap only when useful.

Do not make chunks so large that retrieval becomes useless.

Do not make them so tiny that prose loses context.

---

# 22. Lexical retrieval

Implement a deterministic Source search service.

It should support:

- exact term matching;
- normalized case;
- multi-word queries;
- fiction-specific names;
- phrase matching where practical;
- ranked results;
- source filtering;
- classification filtering;
- authority filtering;
- snippets;
- Source title;
- Source location/page/heading.

Exact fictional names must work very well.

Examples:

```text
Helroth
Savair
Eye of Sorofee
Kiala Wes
Wayward Poles
```

Do not make semantic retrieval a prerequisite for searching these.

---

# 23. Search API abstraction

Do not hard-code the UI directly to one search algorithm.

Introduce an abstraction equivalent to:

```ts
interface SourceSearchRequest {
  query: string;
  sourceIds?: string[];
  classifications?: SourceClassification[];
  authorities?: SourceAuthority[];
  limit?: number;
}

interface SourceSearchHit {
  sourceId: string;
  chunkId: string;

  score: number;

  title: string;
  snippet: string;

  location: SourceLocation;

  retrievalMethod:
    | 'lexical'
    | 'semantic'
    | 'hybrid';
}
```

Adapt details as necessary.

This creates a clean seam for semantic retrieval later.

---

# 24. Semantic retrieval

The long-term design should support hybrid:

```text
lexical
   +
semantic
   ↓
merge/rerank
   ↓
best passages
```

However:

## Do not compromise the release to force embeddings into this phase.

Semantic retrieval may be implemented now only if it can be done cleanly without violating:

- local-first operation;
- provider independence;
- reasonable install size;
- reasonable memory usage;
- testability;
- graceful offline behavior.

If a semantic backend would add substantial architectural risk, implement the abstraction and lexical engine now and document semantic retrieval as the next adapter.

A good offline lexical system plus agent-assisted query reformulation is more valuable than a fragile vector implementation.

Do not add a heavyweight external vector database just to check a box.

---

# PHASE D — Sources UI

# 25. Sources main view

Build a clean Sources workspace.

Conceptually:

```text
SOURCES

[ Search story material...                         ]

[All] [Manuscripts] [Notes] [Research] [Archive]

------------------------------------------------

Amber Eyes Draft.pdf
184 pages
Manuscript · Historical
Indexed

------------------------------------------------

Flameverse Lorebook.docx
Reference · Working
Indexed
```

Include:

```text
Add Sources
```

or an equivalent import action.

---

# 26. Search result presentation

A search result should prioritize the source material itself rather than an AI summary.

Example:

```text
Savair Notes.md
────────────────────────────

"...the island exists between the currents..."

Section: Interdimensional Island
Match: high

[Open source]
[Ask Muse about this]
```

Do not make raw numeric relevance scores prominent unless they help.

---

# 27. Source preview

Opening a Source should let the writer inspect extracted material.

Support:

- Source title;
- metadata;
- classification;
- authority;
- source hash/version info where appropriate;
- extraction warnings;
- searchable text;
- location/page indication;
- direct jump from search result to matched passage.

The user should be able to understand why a search result was returned.

---

# 28. Source metadata editing

Allow the writer to change at least:

```text
Classification
Authority
Display title
```

Changes to metadata must not modify the original file content.

---

# PHASE E — Agent integration

# 29. Extend agent context deliberately

The current agent architecture uses explicit context scopes.

Add a Sources-aware scope.

Preferred concept:

```ts
'sources'
```

rather than an ambiguous:

```ts
'knowledge'
```

Update the appropriate type definitions.

Do not automatically give every agent access to Sources.

Agent access remains explicit.

---

# 30. Retrieval should occur before prompt assembly

Do not dump all Source files into model context.

The intended path is:

```text
User question
     ↓
Source search
     ↓
Top relevant chunks
     ↓
Context Engine
     ↓
Agent
```

The Context Engine should receive only retrieved Source passages that fit the context budget.

Preserve existing total/section context-budget concepts.

---

# 31. Context provenance

Every agent answer should retain human-readable context provenance.

Existing Muse behavior already reports context summaries.

Extend that pattern.

Conceptually:

```text
Context used

✓ Current scene
✓ Canon — 8 facts
✓ Sources — 5 passages from 3 documents
○ Outline
```

The exact UI can follow existing patterns.

---

# 32. Source citations

When an agent relies on Source material, let the writer inspect the evidence.

Conceptually:

```text
Sources used

Amber Eyes Draft.pdf
Chapter 7 · page 82

Savair Notes.md
Interdimensional Island
```

Clicking should open the appropriate Source location when possible.

Do not generate fake citations.

Every displayed citation must map to an actual retrieved chunk.

---

# 33. Agent behavior

Support queries such as:

```text
Find everything I wrote about Savair's island.

Did I ever establish how old Kiala was here?

Where did I first mention Helroth?

Do any of these older drafts contradict this paragraph?

What descriptions of this city appear in my earlier work?

Have I used this artifact before?
```

Agents should distinguish:

```text
Source says...
Canon says...
Current manuscript says...
```

Do not flatten them into one truth layer.

---

# 34. Continuity conflict workflow

A useful interaction to support, if practical:

Writer highlights:

```text
"The last Helroth crossed Sorofee before the poles were raised."
```

Sources retrieval finds:

```text
"The Wayward Poles had stood for nearly two centuries
before the first Helroth entered Sorofee."
```

Muse may present:

```text
Possible continuity conflict

Earlier source:
Amber Eyes Draft 3
Chapter 7

Source authority: Historical

[Open source]
[Ask Continuity]
[Dismiss]
```

Do not automatically alter the manuscript.

Do not automatically alter Canon.

Do not automatically declare one version correct.

---

# 35. Ask about selected Source results

Allow the user to manually select one or more Source passages and pass them into an agent inquiry.

This should coexist with automated retrieval.

Manual attachment is valuable because the writer may know which evidence matters.

Reuse existing attachment/context mechanisms if possible.

---

# PHASE F — Quick manuscript export

# 36. Goal

A writer should be able to take the current manuscript/document out of Muse and continue working elsewhere.

This is **Quick Export**, not the full publishing system.

Required initial formats:

```text
Markdown (.md)
Word (.docx)
Plain text (.txt)
```

Optional in this slice if stable:

```text
PDF (.pdf)
```

Do not let PDF delay DOCX.

---

# 37. Export UX

Provide a simple action associated with the active writing document.

Conceptually:

```text
Export
├── Word (.docx)
├── Markdown (.md)
├── Plain text (.txt)
└── PDF (.pdf)        optional
```

Do not require the user to construct an Edition merely to download the current chapter as Word.

---

# 38. Dirty-document behavior

This is important.

If the visible editor contains unsaved text, Quick Export must not unexpectedly export an older server copy.

Determine how current draft persistence works.

Before exporting, either:

1. reliably flush/save the current document and export that exact saved revision,

or

2. deliberately export the visible editor content through a safe explicit export request.

Choose whichever better matches the existing architecture.

Test this behavior.

The downloaded file must match what the writer believed they exported.

---

# 39. Markdown export

Markdown export should preserve the underlying manuscript content faithfully.

Do not reformat or rewrite prose.

Prefer exporting the existing Markdown bytes/content as-is where possible.

---

# 40. Plain text export

Convert Markdown into readable plain prose/text.

Preserve:

- paragraph separation;
- chapter/section text;
- scene breaks in an understandable form;
- Unicode.

Do not leave piles of Markdown syntax unless the syntax conveys useful visible structure.

---

# 41. DOCX export

DOCX is required.

The purpose is editing interoperability with:

- Microsoft Word;
- Google Docs;
- LibreOffice;
- Apple Pages;
- editors/publishers using Word workflows.

Map common Markdown structures sensibly.

Support at minimum:

- document title when appropriate;
- headings;
- paragraphs;
- bold;
- italics;
- ordered/unordered lists;
- block quotes;
- scene breaks/horizontal rules;
- Unicode punctuation;
- Unicode characters.

Preserve prose exactly.

Do not ask a model to transform the manuscript during export.

Export is deterministic rendering, not generation.

---

# 42. DOCX styling

Keep initial styling restrained and professional.

Do not bake presentation-heavy design into the manuscript export.

A neutral manuscript-like DOCX is preferable.

Possible defaults:

- normal page margins;
- readable body style;
- heading styles;
- standard paragraph spacing;
- proper document metadata when available.

Do not make pagination part of manuscript content.

---

# 43. Export provenance

Quick Export should create an event/log record containing enough information to identify:

- document ID;
- source revision/hash if available;
- output format;
- renderer version;
- time.

Do not write export metadata into the manuscript itself.

Do not force a sidecar receipt download for Quick Export unless existing product patterns make that desirable.

The more formal Edition pipeline can have stronger receipts.

---

# 44. Export safety

Quick Export must never:

- mutate the manuscript;
- overwrite project files silently;
- promote Source content;
- change Canon;
- change story records;
- reformat the saved source Markdown;
- include private Sources/notes merely because they exist.

Quick Export means:

**this document → chosen external representation**

nothing more.

---

# PHASE G — Backups and portability

# 45. Update project archive behavior

Sources are project data.

Ensure project backups account for the newly introduced Source records and managed Source files.

Verify:

- Source metadata survives backup;
- Source files survive backup when intended;
- extracted text survives or is safely regenerable;
- search index can be regenerated;
- restoring a project does not overwrite the original;
- source hashes remain stable.

Do not accidentally include:

- API credentials;
- provider settings;
- unrelated files outside the project;
- arbitrary absolute paths.

---

# 46. Search index policy

Prefer treating the search index as derived data.

If reasonable:

```text
Source originals = authoritative imported artifact
Extracted source text = reproducible intermediate
Search index = regenerable derived data
```

If backup size or compatibility favors regenerating the index on restore, do so.

Document the decision.

---

# PHASE H — Tests

# 47. Server/unit tests

Add meaningful tests for:

## Source ingestion

- Markdown import;
- text import;
- DOCX import;
- PDF import;
- invalid file;
- extraction failure;
- duplicate hash;
- same filename/different hash.

## Safety

- path traversal attempt;
- malformed name;
- unsupported extension;
- excessive size behavior if limits are implemented;
- parser failure does not corrupt project.

## Chunking

- deterministic IDs/order;
- headings retained;
- page metadata retained for PDF;
- same input produces stable chunk representation.

## Search

- exact fictional name;
- multi-word query;
- phrase;
- ranking;
- filters;
- missing query;
- Source deletion removes hits.

## Context

- agent without `sources` scope receives no retrieved Source text;
- agent with `sources` scope receives relevant chunks;
- context budget remains enforced;
- context summary reports Sources;
- Source text remains labeled separately from Canon.

## Export

- Markdown fidelity;
- TXT conversion;
- DOCX generated successfully;
- Unicode preserved;
- headings preserved;
- dirty/current-document behavior as designed;
- export does not modify source.

---

# 48. Browser/E2E tests

Add scenarios covering:

### Workspace

- Desk scroll;
- expand;
- restore;
- state preservation.

### Sources

- open Sources;
- upload a fixture;
- see indexed status;
- search a unique phrase;
- open result;
- navigate to passage.

### Agent

Using Mock/offline provider where possible:

- ask question with Source scope;
- verify context summary indicates retrieved Source data;
- verify Source evidence is visible.

Do not make browser tests depend on a paid API.

### Export

- type/edit manuscript;
- Quick Export;
- verify a file download occurs;
- verify correct filename/format;
- at least inspect Markdown/TXT content in automated tests;
- use server/unit-level inspection for detailed DOCX structure if browser binary verification is awkward.

---

# PHASE I — Documentation

# 49. Update README

Document the feature without turning the README into an implementation log.

Add concise explanations for:

### Expanded workspaces

Explain the difference between pane expansion and manuscript Focus if needed.

### Sources

Explain:

> Sources lets you import and search existing story material without automatically treating it as Canon.

Mention supported formats.

Mention offline search.

Mention agent-assisted retrieval if implemented.

### Export

Explain Quick Export.

State supported formats.

---

# 50. Add focused implementation documentation

Create an implementation/acceptance document under `docs/`.

Suggested name:

```text
docs/sources-retrieval-export-2026-09-12.md
```

Include:

- architecture;
- project storage layout;
- ingestion rules;
- Source vs Canon boundary;
- chunking strategy;
- retrieval strategy;
- agent context integration;
- export architecture;
- safety rules;
- tests run;
- known limits;
- future semantic-retrieval seam.

Update `KNOWLEDGE.md` with durable architectural facts only.

Do not turn `KNOWLEDGE.md` into a chronological diary.

---

# PHASE J — Explicitly out of scope for this implementation

Unless they fall out almost trivially from the work above, do **not** expand scope into:

- full publishing workflow;
- EPUB;
- elaborate PDF book typesetting;
- print-on-demand;
- automated OCR;
- cloud-hosted vector database;
- automatic internet research;
- automatic Source-to-Canon promotion;
- automatic lore extraction;
- automatic rewriting of imported files;
- two-way DOCX synchronization;
- Google Docs synchronization;
- automatic bidirectional Source sync;
- directory watchers;
- collaborative cloud editing;
- arbitrary plugins;
- complete semantic retrieval infrastructure if it destabilizes offline operation.

Those can come later.

---

# 51. Preserve a seam for future Edition export

The repository already distinguishes:

```text
Project Archive
Reader Edition
Adaptation Project
```

Do not collapse those concepts.

Quick Export is separate.

Future workflow may resemble:

```text
Build Edition

Title page        ✓
Chapter 1         ✓
Chapter 2         ✓
Interlude         ✕
Chapter 3         ✓

Format
DOCX
EPUB
PDF

Preview
```

Do not need to implement that full system now.

Ensure Quick Export does not make future Edition architecture impossible.

---

# 52. Preserve a seam for future hybrid retrieval

Even if this implementation ships with lexical search only, design the retrieval boundary so future search can become:

```text
lexical retrieval
       +
semantic retrieval
       ↓
merge
       ↓
rerank
       ↓
Context Engine
```

The UI should not need to be rewritten merely because the search backend improves.

---

# 53. UX principles

Keep Muse visually calm.

Do not make Sources feel like an enterprise document-management system.

Do not cover every result in badges.

Prioritize:

- title;
- useful snippet;
- location;
- provenance;
- obvious next action.

The writer should be able to understand:

> Where did this information come from?

without being overwhelmed by metadata.

---

# 54. Product-language principles

Prefer:

```text
Source
Sources
Search Sources
Source material
Historical
Working
Authoritative
Open source
Ask Muse
```

Avoid unnecessarily technical user-facing terminology such as:

```text
embedding
vector
chunk ID
RAG
cosine similarity
BM25
retrieval pipeline
```

Those concepts belong in implementation/docs, not ordinary writer UX.

---

# 55. Agent trust rules

Maintain these rules throughout implementation.

1. Never present retrieved Source material as Canon unless Canon independently establishes it.
2. Never invent a Source citation.
3. Never modify Source files during search.
4. Never modify manuscript text merely because retrieval finds a contradiction.
5. Never hide which material an agent used when provenance can reasonably be shown.
6. Never leak content from Sources outside the current project.
7. Never send every Source to a hosted model.
8. Only send selected/retrieved material that is permitted by context scope.
9. Respect agent context budgets.
10. Keep user approval authoritative for manuscript changes.

---

# 56. Performance expectations

The application should remain responsive with a reasonably sized story archive.

Do not perform expensive full-corpus work on every keystroke.

Debounce interactive search appropriately.

Do not repeatedly parse original DOCX/PDF files during every search.

Extraction occurs on import/update.

Search operates against prepared text/index data.

Do not re-embed/re-index unchanged Sources unnecessarily if semantic indexing is eventually present.

Use hashes to determine whether work is needed.

---

# 57. Error handling

Errors must be recoverable.

Examples:

```text
This PDF could be imported, but very little searchable text was found.

This DOCX could not be read. The original file was not added to the project.

Search index is unavailable. Rebuild index.

Export failed. Your manuscript was not changed.
```

Do not swallow errors silently.

Do not corrupt the project because one Source cannot be parsed.

---

# 58. Accessibility

Preserve or improve existing accessibility.

Ensure:

- labels on icon buttons;
- keyboard access to Sources search;
- keyboard access to search results;
- correct focus restoration after closing expanded views;
- correct modal/drawer Escape ordering;
- no color-only authority/status indicators;
- screen-reader-readable extraction warnings;
- expansion state is understandable.

---

# 59. Mobile/small-screen behavior

Do not attempt to reproduce the entire desktop spatial Desk on a phone.

Follow existing responsive patterns.

At small widths:

- Sources should become a straightforward stacked layout;
- search results should remain usable;
- source preview may replace the result list or open as a layer;
- expanded pane should behave sensibly;
- export should remain reachable;
- tool drawers should remain usable.

Desktop Desk state must not be damaged merely because the project was opened at a narrow viewport.

---

# 60. Suggested implementation order

Execute in this order unless repository evidence strongly justifies another sequence:

```text
0. Baseline audit/tests

1. Scrollable workspace
2. Improved generic pane expansion/restore
3. Workspace regression tests

4. Sources domain model
5. Source project persistence
6. Upload/import API
7. Markdown/TXT extraction
8. DOCX extraction
9. PDF extraction
10. Source backup/restore

11. Deterministic chunking
12. Offline lexical search service
13. Sources search API
14. Sources workspace UI
15. Source preview/navigation

16. `sources` agent context scope
17. retrieval → ContextEngine integration
18. provenance/citation UI
19. agent-assisted Source questions

20. Markdown Quick Export
21. TXT Quick Export
22. DOCX Quick Export
23. export event/provenance logging

24. Full test suite
25. browser acceptance tests
26. documentation
27. final cleanup
```

---

# 61. Commit strategy

Prefer coherent commits rather than one giant commit.

A reasonable progression:

```text
feat: improve scrollable workspace and pane expansion

feat: add project-scoped story sources

feat: add source extraction and offline search

feat: integrate source retrieval with agent context

feat: add manuscript quick export

test: cover sources retrieval workspace and export

docs: document sources retrieval and export
```

Adapt to actual work.

Do not artificially split tightly coupled code merely for commit count.

---

# 62. Quality gate after each major phase

After a substantial phase:

```bash
npm test
npm run build
```

Run relevant targeted tests during development.

Before final completion:

```bash
npm test
npm run build
npm run test:mobilize
npm run test:browser
```

If browser dependencies cannot run, state exactly why.

Do not claim tests passed unless they actually ran successfully.

---

# 63. Definition of done — Workspace

Workspace work is complete when:

- normal Desk can scroll when needed;
- content is not artificially clipped to one viewport;
- generic panes can expand;
- expanded panes can restore;
- previous Desk state survives restore;
- local component state survives expansion;
- writing Focus still works;
- browser fullscreen still works;
- small-screen behavior remains sane;
- browser tests cover the core interactions.

---

# 64. Definition of done — Sources

Sources work is complete when:

- user can import MD;
- user can import TXT;
- user can import DOCX;
- user can import PDF;
- Source metadata persists;
- Source content is project-scoped;
- Source provenance is retained;
- Source classification can be edited;
- Source authority can be edited;
- exact-name search works offline;
- ranked search results show real passages;
- clicking results opens relevant material;
- Sources survive project backup/restore;
- importing a Source does not change Canon;
- errors do not corrupt the project.

---

# 65. Definition of done — Agent retrieval

Agent retrieval is complete when:

- `sources` is a real context scope;
- agents without permission receive no Source content;
- agents with permission can receive relevant Source chunks;
- Source context respects budgets;
- context summary identifies Source usage;
- displayed citations point to actual retrieved material;
- agent responses can distinguish Source from Canon;
- Mock/offline flows remain usable;
- no paid model is required for basic Source search.

---

# 66. Definition of done — Export

Export work is complete when:

- current writing document can export as `.md`;
- current writing document can export as `.txt`;
- current writing document can export as `.docx`;
- visible/current draft content is exported correctly;
- Unicode survives;
- common Markdown structure survives appropriately in DOCX;
- export does not alter manuscript content;
- export does not include unrelated private project material;
- export action is logged appropriately;
- failures clearly state manuscript was not changed.

PDF is a bonus for this phase, not a prerequisite for completion.

---

# 67. Final verification

Before declaring completion, perform a realistic manual flow.

Create or use a temporary/synthetic project.

Do not use a valuable live manuscript for destructive testing.

Flow:

```text
1. Open Muse.
2. Verify normal manuscript editing.
3. Move/resize panes.
4. Scroll the Desk.
5. Expand Characters.
6. Restore Characters.
7. Verify layout remained intact.

8. Open Sources.
9. Import a Markdown file.
10. Import a DOCX.
11. Import a PDF.
12. Classify one as Historical.
13. Classify another as Working.

14. Search an exact fictional name.
15. Search a multi-word concept.
16. Open a result.
17. Verify provenance/location.

18. Ask an allowed agent about the Sources.
19. Verify retrieved evidence.
20. Verify context summary.
21. Verify citations.
22. Ask an agent without Sources scope.
23. Verify Source material is withheld.

24. Edit the manuscript.
25. Quick Export DOCX.
26. Open/inspect exported DOCX.
27. Verify newest prose is present.
28. Export Markdown.
29. Verify source fidelity.

30. Back up project.
31. Restore as separate project.
32. Verify Sources survived.
33. Verify search still works or cleanly rebuilds.
```

---

# 68. Final report

When implementation is complete, return a concise engineering report containing:

## Implemented
Describe what actually shipped.

## Architecture
Explain the important new storage/retrieval/export boundaries.

## Important files changed
List major files and their purpose.

## Data compatibility
Explain old-project behavior and any migration/default behavior.

## Tests
Report exact commands run and results.

## Known limitations
Be explicit.

For example:

- scanned PDFs need OCR;
- semantic retrieval deferred;
- PDF export deferred;
- DOCX formatting intentionally limited.

## Recommended next phase
Suggest the highest-value follow-up without implementing unrelated scope.

## Commits
List commit SHAs/messages if commits were created.

---

# 69. Guiding product model

Use this as the mental model for every implementation decision:

```text
                     MUSE · MOBILIZE

                           STORY
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
       SOURCES            WORKSPACE           OUTPUT
          │                  │                  │
    old drafts           manuscript         Markdown
    PDFs                 characters         DOCX
    notes                world              TXT
    research             plot              future PDF
    archives             scenes            future EPUB
          │              dialogue
          │              themes
          │                  │
          └──── RETRIEVAL ───┤
                             │
                           AGENTS
                             │
                       suggestions
                             │
                           CANON
```

The key behavior is:

**existing creative material becomes traversable without becoming unquestioned truth.**

**Agents can help the writer find and interpret it without owning it.**

**The writer's manuscript remains portable and can leave Muse whenever desired.**

Build toward that.