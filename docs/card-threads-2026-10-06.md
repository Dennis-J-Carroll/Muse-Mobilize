# Card threads and Notes Board

## Using threads

- Every story card editor (character, world, plot, scene, theme, reference, goal) has a **Notes** button
  in its header, next to **#**. A badge shows how many notes are open.
- Write a note and press Enter. Start or include **@Muse** and Muse replies in the thread, using the
  card's saved fields, its tags and links (and cards linking to it), and the thread so far. Resolve with ✓, reopen with ↺, start another note with ＋.
- If Muse can't reply (no agent, provider error, or no answer within 90 seconds), your note is kept and a
  **Retry** appears. An agent restricted in Agent Studio never sees a card it is not allowed to read.
- Escape closes the thread first. On a phone the thread is a bottom sheet.

## Notes Board

Open **Story Idea → Notes Board**. Filters: This session (touched since this tab loaded), Open,
Resolved, All, Trash. After a reload, older notes are hidden by "This session"; the board says how
many and offers **Show all notes**.

- **Edit** your own notes. Muse replies are not editable.
- **Trash** moves a note to Trash; **Restore** brings it back; **Delete forever** only exists in Trash.
- **Combine** merges two or more notes on the **same card** into one thread (messages interleave by
  time). Notes on different cards cannot be combined yet.
- **Open card** opens the card and its thread. A note whose card was deleted shows "Card removed".
- Trash, combine, and edits are undoable with the app's normal undo.

## Tags and links on notes

- In a thread, the chip row under the header holds the note's tags (`#pacing`) and links to other cards
  (`↗ Return`). **+ Tag** picks an existing tag or creates one; **+ Link** searches your story cards.
  Click a chip to remove it. Each change is one undoable edit ("Tag note").
- The **Tags & links** (`#`) panel includes notes: choosing a tag lists **Notes tagged #…**, a card shows
  **Notes here**, and **Linked from** also lists notes that link to the card. **Open note** jumps to it.
- The Notes Board shows each note's tags and links and has a **Filter by tag** menu.
- `@Muse` also sees the note's own tags, the cards it links (title, plus a short excerpt of up to three),
  never anything the agent is not allowed to read.

## Where notes live

`<project>/threads/threads.json`. Notes are part of the project folder and are included in
portable project backups.

## Not built yet

Muse proposing a field edit you accept from the thread, combining notes across cards, passage-level
notes on manuscript text.
