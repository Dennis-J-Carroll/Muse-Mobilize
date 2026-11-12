# Source gate and tickets — design (2026-11-11)

## Why

The writer keeps large lore documents in Sources (the King's Blood Lore
Compendium is ~25,800 words). They want Muse to *prompt them* from that
material: point at subjects the document covers only thinly ("the more
shallow the subject, the more ripe"), quote what little exists, and ask
questions that open it up. The writer then develops ideas — often with pen
and paper, typed up later in Google Docs and exported as PDF or DOCX — and
brings the result back for Muse to respond to, and eventually for canon.

Today this fails twice. Muse only sees Sources when its scope includes
`sources`, and even then retrieval is keyword search over the question, so
"find a somewhat untouched thread" retrieves nothing useful. And each Muse
run is stateless, so a thread cannot be carried across visits.

## Goals

1. **Source gate.** An "Ask Muse about this source" button on an open source
   attaches that whole document to the Muse conversation, regardless of
   Muse's scopes, together with a computed depth map (every section and how
   many words it has).
2. **Ripe threads.** With a source attached, Muse points at thin subjects
   that connect to deeper ones, quoting the source with section names and
   asking questions.
3. **Tickets.** A ticket is an assignment that carries a thread across
   visits: title (the assignment), current wants, current threads, source
   quotes, starter questions, a status (open → out → returned → closed),
   returned files, and a short log of Muse exchanges about it.
   - The writer creates tickets directly.
   - Muse may *suggest* tickets inside a reply. A suggestion is never saved
     until the writer accepts it (optionally after editing) or dismisses it.
4. **Out.** Export a ticket as Markdown (default), DOCX or plain text. On
   devices with the Web Share API for files (phones), a Share button opens
   the system share sheet (LocalSend, Drive). Export marks the ticket "out".
5. **In.** Attach a returned file (`.pdf`, `.docx`, `.md`, `.txt`) to a
   ticket. It is imported through the existing Sources pipeline
   (classification `notes`, authority `working`) and linked to the ticket,
   which becomes "returned". A duplicate import links the existing source;
  a failed extraction is reported and not linked; a linked source deleted
  later shows as missing. "Work on with Muse" then sends the ticket, its
   source quotes and the returned files' text to Muse.

## Anti-goals (hard rules)

- Muse does not do the creative work. With a source or ticket attached it
  gives questions, references, directions and suggestions, and writes new
  lore only when the writer explicitly asks for it. This is stated in the
  run's system protocol.
- Muse never creates or edits a ticket by itself.
- Nothing reaches canon without the writer's review (existing reviewed
  transfers keep that rule).
- Muse never invents source content: quotes must come from the attached
  text, and the prompt says to mark suggestions as suggestions.

## Non-goals (later)

- Creating new canon records (house, lore, event) from a reply.
- A direct Google Drive / Google Docs link (needs a Google sign-in setup).
- Reading photographed handwriting.
- PDF *export* of tickets (PDF import is supported).

## How it works

### Server
- `shared/tickets.ts` — ticket types, limits, `ticketToMarkdown`.
- `server/src/tickets.ts` — store at `tickets/tickets.json` (atomic write,
  normalize untrusted input), CRUD, export render (reuses `renderExport`),
  attach-return (source must exist).
- `server/src/source-map.ts` — `sourceSections(text)` finds headings
  (Markdown `#`, `PART …:` lines, short numbered lines like `5\. House
  Maren`) and word counts per section; `renderDepthMap` lists them, thinnest
  flagged, plus how often each section's name appears in the manuscript
  chapters (so "not in my chapters yet" is counted, not guessed).
  Deterministic, no model involved. Sources without detectable headings
  (most PDFs) get no depth map, and the block says so.
- `runAgent` gains `focus: { sourceId?, ticketId? }`. The server builds a
  `<writer-attached-source>` block (depth map + full text up to 200,000
  characters, else depth map + a clearly marked truncation) and a
  `<writer-attached-ticket>` block (ticket, its last exchanges, returned
  files' text up to 30,000 characters each). These bypass agent scopes
  because the writer attached them explicitly, like the shared excerpt; the
  context receipt records it. **Deliberate exception (writer-approved
  2026-11-11):** the project rule is "retrieved passages only, never a whole
  file" (handoff §30). The gate sends the whole document, only when the
  writer presses the button, and the chip says so with the provider and
  model. Ollama runs refuse documents over 24,000 characters with a clear
  message instead of a provider error.
- Focus runs carry the last three exchanges of the same conversation
  (`history`, each answer capped at 4,000 characters), so "dig into the
  second one" works. The focus block is never forwarded to consulted agents.
- Focus runs get at least 4,000 output tokens so quoted threads and
  suggestion blocks are not truncated.
- A focus protocol is appended to the system prompt (the anti-goals above,
  plus the `<ticket-suggestion>` block format). `parseAgentOutput` extracts
  up to three suggestions into `run.ticketSuggestions`.
- A run with a ticket attached appends `{question, answer}` to the ticket's
  log (last 10 kept), giving the thread memory across visits.

### Web
- `conversationFocus.ts` — per-project attached source/ticket, cleared on
  project change; `askAboutSource`, `workOnTicket` open the Muse
  conversation.
- Agent pane shows the attachments as removable chips, sends `focus`, and
  offers a default question when the box is empty. Ticket suggestions in a
  reply render with Accept, Edit, Dismiss.
- Sources reading view: "Ask Muse about this source".
- New Tickets tool (pane type `tickets`): list by status, editor, export,
  share, attach returned file, work on with Muse, delete.

## Builder's calls (made by Claude, open to change)

- Returned files go through Sources rather than a separate store, so they
  are searchable and backed up like any source.
- Export (not a manual toggle) moves a ticket to "out"; attaching a return
  moves it to "returned"; "closed" is manual.
- Source focus stays attached across questions until removed; a ticket
  focus likewise.
