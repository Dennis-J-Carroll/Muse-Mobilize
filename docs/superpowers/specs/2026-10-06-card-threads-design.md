# Card Threads and Notes Board — design

Date: 2026-10-06 · Status: draft for review

## Goal

Any card in Muse Mobilize (document, character/world, plot node, scene, theme,
reference, goal) can carry a small comment thread, like the Claude Docs
comment popover: author, timestamp, replies, a resolve check, and an
"Ask Muse" input. Typing `@Muse` posts the thread plus the card's content to
the model and the answer lands back in the thread. A **Notes Board** lays out
every note from the current session so the user can edit, trash, and combine
them, then jump back into the card each one belongs to.

Success: add a note to any card kind in two clicks, get a Muse reply in
place, resolve it, reload and find it still there; open the board, tidy the
notes, click one and land back in its card with the thread open. Works on a
phone.

## Slices

1. **Threads** — store, API, `<CardThread>` popover, `@Muse` replies. (This ships first.)
2. **Notes Board** — a pane over the same store: edit, trash, combine, jump back.
3. **Apply edit (later, not built now)** — Muse proposes a field change; the user accepts it from the thread. Slice 1 only reserves the message field and a UI slot.

Out of scope for all slices: combining notes across different cards (follow-up; would add an `alsoTargets` list to `Thread`), multi-user, notifications, emoji reactions,
passage-level anchoring (reuses `PassageAnchor` later; documents anchor to the
whole document for now).

## Reuse

- `ConnectionTarget` (`shared/connections.ts`) already names all seven card
  kinds. Threads key on it, so no per-pane schema change.
- `storyRecords()` (`web/src/storyRecords.ts`) gives label, group and an
  `open()` for every target. The board's "jump back" calls `open()`.
- Storage and validation follow `server/src/connections.ts`: versioned JSON in
  the project dir, validated on read.
- Muse replies reuse the user's configured agent for voice and the existing
  provider layer (mock provider keeps tests offline).

## Data (`shared/threads.ts`, `server/src/threads.ts`)

File: `<project>/threads/threads.json`, `{ version: 1, threads: Thread[] }`.

```ts
interface Thread {
  id: string;
  target: ConnectionTarget;        // primary card
  status: 'open' | 'resolved';
  messages: ThreadMessage[];
  createdAt: string; updatedAt: string;
  trashedAt?: string;              // soft delete; board "Trash" lane
  mergedFrom?: string[];           // ids of threads folded into this one
}
interface ThreadMessage {
  id: string;
  author: { kind: 'user' } | { kind: 'muse'; agentId: string };
  text: string;
  createdAt: string;
  editedAt?: string;
  state?: 'pending' | 'failed';    // Muse replies only
  proposal?: { field: string; before: string; after: string }; // reserved for slice 3
}
```

"Session" for the board means threads created or touched since this browser
tab loaded, plus a filter to widen to Open or All. The client records its
session start; the server stays stateless about sessions.

## API (all under `/api/projects/:id/threads`)

- `GET ?target=kind:id` — threads for one card. `GET` with no target — all (board).
- `POST` — create thread `{target, text}`.
- `POST /:tid/messages` — add a user message `{text}`. If it contains
  `@Muse`, the server appends a `pending` Muse message, calls the model, and
  fills it in (or marks it `failed`). The response carries both messages.
- `POST /:tid/messages/:mid/retry` — re-run a failed Muse reply.
- `PATCH /:tid` — `{status}` resolve/reopen; `{trashed: boolean}` trash/restore.
- `PATCH /:tid/messages/:mid` — edit the text of a user message (sets `editedAt`).
- `POST /merge` — `{ids: string[]}` combine; the server rejects ids whose targets differ (slice 2).
- `DELETE /:tid` — permanent delete, allowed only for threads already in trash.

All writes go through one per-project lock like the other stores. Reads
validate and fail loudly on a malformed file; they never silently reset it.

## Muse reply

Context is built from the card's current saved fields (via the same readers
`connections.ts` already imports) plus the thread messages in order. `runAgent`
is document-centric, so slice 1 first checks whether it can take a non-document
target; if not, a thin function in `threads.ts` builds the prompt and calls
`provider.complete` using the chosen agent's persona. The model never sees
trashed threads. Errors from the provider leave the user's message saved and
the Muse message `failed` with a Retry button.

## UI

`web/src/components/CardThread.tsx` — a compact anchored popover, not a
floating editor. Header: author, relative time, ✓ resolve, ⋯ menu. Body:
messages with `@Muse` highlighted; Muse messages carry a small agent mark.
Footer: "Ask Muse…" input. The anchored card gets a ring highlight while the
thread is open. On phone it becomes a bottom sheet (`mobile.css`).

`<ThreadButton target />` — a 💬 button with an open-count badge, added to each
editor's header. Writing-focus layers: opening a thread inside focus mode keeps
the existing focus-layer rules (Escape closes the popover first).

State: a `threads` slice in `web/src/store.ts` with optimistic adds; a failed
POST rolls back and shows the existing error banner.

### Notes Board (slice 2)

A new pane type `notes`, registered like the Premise pane. A grid of note
cards (not a freeform canvas in v1), each showing the card label and group,
the first message, reply count, and status.

- **Edit** — click a note to edit its messages' text inline.
- **Trash** — move to a Trash lane; restore or delete forever from there. Uses the existing undo toast pattern.
- **Combine** — multi-select two or more notes **on the same card** and merge. Messages interleave by time; the earliest thread is kept and the others are recorded in `mergedFrom` and removed. One undo restores them. Selecting notes from different cards disables Combine with a hint ("Combine works within one card").
- **Jump back** — "Open card" calls the target's `open()` from `storyRecords()` and then opens its thread.
- Filters: This session (default), Open, Resolved, All, Trash.

## Errors and edge cases

- Card deleted while a thread exists: the board shows the note as "Card removed" and offers Trash only; threads are never auto-deleted.
- Concurrent edit: each PATCH carries `updatedAt`; a stale write gets 409 and the UI refetches.
- `@Muse` with no configured agent: inline notice linking to Agent Studio; message still saved.
- Empty text is rejected by both client and server.

## Testing

- Server: store validation (malformed, duplicate ids), create/reply/resolve/trash/restore/merge/permanent-delete rules, `@Muse` happy path and failure/retry with the mock provider, 409 on stale write.
- Web helpers: mention parsing, session filter, merge ordering.
- Playwright: add note → `@Muse` reply → resolve → reload persists; board: edit, trash, restore, combine, jump back; phone viewport for popover and board.

## Open questions to settle in planning

1. Can `runAgent` take a non-document target, or do we add the thin path?

## Decisions

- Combine is same-card only in v1 (decided 2026-10-06). Cross-card combining is a later follow-up.
