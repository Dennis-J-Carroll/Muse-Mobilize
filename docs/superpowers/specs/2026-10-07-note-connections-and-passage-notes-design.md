# Note connections and passage notes — design

Date: 2026-10-07 · Status: draft for review · Builds on `2026-10-06-card-threads-design.md` (shipped on this branch)

## Goal

1. **Notes you can tag and link.** A note (thread) carries tags and links to other cards, and those show up
   in the `#` Tags & links panel, so "everything tagged #pacing" and "everything about Mara" include margin
   notes. This is also the cross-card case v1 deferred: one note can be *about* several cards without being
   merged across them.
2. **Notes on a highlighted passage.** A note can attach to a selected passage of a manuscript document and
   keep pointing at it as the text changes. Muse sees the passage and its surroundings instead of the head of
   the document.

Success: select a sentence, add a note, tag it, link it to a scene; find it from the `#` panel under that
tag and under the scene's "Linked from"; open it from the board and land on the passage; ask `@Muse` and get
an answer that quotes the passage; edit the text around the passage and the note still finds it, or says
plainly that it can't.

## Decisions taken in brainstorming

- Passage notes are shown **without in-text highlights** (the editor is a plain `textarea`): a "Note" button
  beside Tag / link, and a per-document list of passage notes. Gutter markers are a later addition behind one
  seam (`resolveThreadAnchors`, below). True inline highlights are out of scope.
- Notes show up in the `#` panel too (tag filter, backlinks, "Notes here"), read-only there.
- Tags and links live **on the note itself** (`Thread`), not in the connections store, so one edit is one
  atomic write and one undo entry.

## Out of scope

Gutter markers and inline highlights; combining notes across different cards (links replace it); Muse
proposing edits; searching note text from the `#` panel; tagging or linking from the `#` panel.

## Reuse

`PassageAnchor`, `makePassageAnchor`, `resolvePassageAnchor` (`shared/connections.ts`); `attachConnection`'s
range handling and its "save the document first" rule; `revealRange` (`EditorPane.tsx`); `storyRecords()`;
`requireTarget` / `connectionTarget` (`server/src/connections.ts`); `mayRead` and `cardSnapshot`
(`server/src/thread-reply.ts`); the thread store, `threadWrite` and `recordRejectable`.

## Data (`shared/threads.ts`, `server/src/threads.ts`)

```ts
interface Thread {
  // ...existing fields...
  tagIds?: string[];                 // connection-store tag ids; absent = none
  links?: ConnectionTarget[];        // cards this note is about; absent = none
  anchor?: PassageAnchor;            // only when target.kind === 'document'
}
```

- `version` stays `1`: the fields are optional and old threads read as "no tags, no links, no anchor".
- Limits: at most 12 tags and 12 links per note.
- Write-time validation (all reads of other stores happen before the single write):
  - every `tagId` exists in the connections store;
  - every link passes `requireTarget` and is not the note's own card;
  - an anchor is allowed only on a `document` target and must match the saved document text
    (`makePassageAnchor` with the client's quote), so an unsaved or stale selection is refused;
  - duplicate tags and links are dropped, order kept.
- `mergeThreads` (same card **and** same anchor — both none, or equal quote and start): tags and links are
  unioned; the earliest note's anchor is kept.

### Shared helper: `resolveThreadAnchors`

```ts
resolveThreadAnchors(content: string, threads: Thread[]):
  { threadId: string; status: 'resolved' | 'missing' | 'ambiguous'; start?: number; end?: number }[]
```

Pure, built on `resolvePassageAnchor`. The passage list uses it now; gutter markers would consume the same
positions later without touching data, API or popover.

## API (additions under `/api/projects/:id/threads`)

- `POST /` accepts optional `range: { start, end, quote }` (document targets), `tagIds`, `links`.
- `PUT /:tid/connections` body `{ tagIds, links, expectedUpdatedAt? }` replaces both lists; its own undo
  entry, labelled "Tag note". A stale `expectedUpdatedAt` gives 409.
- Existing routes are unchanged. All writes keep going through `threadWrite` (recorded, atomic); the Muse
  call stays outside any lock.

## Editor: passage and document notes (`EditorPane.tsx`)

- A **Note** button beside Tag / link:
  - with text selected: starts a new note bound to that range;
  - with no selection: opens the document's whole-document notes.
- Like Tag / link it flushes and requires a saved document; if the document is dirty or in recovery it
  shows the same "Save or resolve the recovered document first" message instead of guessing.
- The popover for a document has two parts: **On passages** (a list: quote, status, reply count; clicking one
  selects the passage with `revealRange` and opens its thread) and **Whole document** (unanchored notes).
  A passage thread shows its quote above the messages.
- Status wording is honest and shown in the popover and on the board: *found*, *moved* (found by its
  surrounding text), *can't be found*, *matches more than once*. A note whose passage can't be resolved keeps
  its original quote and can still be read, replied to, tagged and trashed.

## Tagging and linking a note (`CardThread.tsx`)

A chip row under the popover header: `#fear ×`, `↗ Scene “Burning Gate” ×`, **+ Tag**, **+ Link**.
**+ Tag** picks an existing tag or creates one (reusing `api.createTag`); **+ Link** searches
`storyRecords()` (excluding the note's own card). Each change sends the full lists via
`PUT /:tid/connections` with the note's `updatedAt`.

## The `#` panel (`ConnectionsPanel.tsx`) — read-only join

Loads the threads store alongside the connections store. Trashed notes never appear.

- **Tag filter:** selecting a tag adds a **Notes tagged #…** section under the records list.
- **Inspecting a card:** **Notes here** (open notes on that card, with tags and reply count) and **Linked
  from** now also lists notes whose `links` include the card ("Note on *Arrival*: first words…").
- **Open note** reuses the board's jump, extracted into one shared helper (`openNote(thread)`): open the card
  (for a passage note, the document and `revealRange`), then the thread.
- A removed card shows "Card removed" with Open disabled; a missing tag shows "Missing tag", as today.

## Notes Board additions (`ThreadsPane.tsx`)

Cards show the passage quote, tag chips and link chips; a **Tag** filter (select) joins the existing filters;
"Open card" jumps to the passage for passage notes. Combine requires the same card and the same anchor.

## What Muse sees (`server/src/thread-reply.ts`)

- **Whole-card notes:** the card, its connections (already), plus the note's own tags and links, plus a short
  excerpt (about 800 characters) of up to 3 linked cards, since the writer pointed at them. Every card and
  excerpt passes `mayRead` for the replying agent first. Anchored tags are left out of the document-level
  connections block (they belong to passages).
- **Passage notes:** the document title, then the passage with about 1500 characters either side, marked
  inline (`«…»`), instead of the first 6000 characters. If the passage is missing or ambiguous, Muse gets
  the original quote and an explicit "location could not be resolved" line, with no window.
- A document the agent may not read stays "withheld". Card and document text keep being escaped in the
  prompt; Muse replies in the thread only.

## Errors and edge cases

- Deleted document or card: note stays, board and panel show "Card removed"; nothing is auto-deleted.
- Tags cannot be deleted by the app today, so a note's `tagIds` do not dangle; if the connections file is
  unreadable the panel and chips show an error and notes themselves still open.
- Selection collapsed to zero length: treated as no selection (whole-document notes).
- A concurrent edit to a note: the connections PUT and message edits carry `expectedUpdatedAt`; a 409 makes
  the UI refetch.

## Testing

- Shared: `resolveThreadAnchors` (resolved, moved, missing, ambiguous); merge rules for anchors.
- Server: validation (unknown tag, unknown link, self link, over 12, anchor on a non-document, stale quote),
  `PUT /connections` atomic and undoable, merge unions, old store files still read; Muse prompt for a
  whole-card note (own tags and links, linked excerpts, withheld for a restricted agent) and for a passage
  note (window, marked passage, unresolved wording).
- Web helpers: tag filter, notes-for-card and backlink joins, combine rule with anchors.
- Playwright: select text → Note → reply from `@Muse` quoting the passage → tag and link it → find it in the
  `#` panel by tag and under the scene's Linked from → reload → jump back to the passage; edit text around the
  passage and it still resolves; phone viewport for the chip row and document popover.

## Open questions for planning

1. Does the document popover's passage list fit the existing popover width on a phone, or should it be a
   second sheet? Decide when building, with a screenshot.
