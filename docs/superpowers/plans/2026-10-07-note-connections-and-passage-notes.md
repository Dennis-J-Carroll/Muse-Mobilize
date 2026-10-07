# Note Connections and Passage Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notes carry tags and links that show up in the `#` panel and in Muse's view, and notes can attach to a selected passage of a manuscript document.

**Architecture:** Tags, links and the passage anchor live on `Thread` (optional fields, store `version` stays 1), so every edit is one atomic, undoable write through the existing `threadWrite`/`recordRejectable`. Slice A (tags/links, `#` panel, board filter, Muse sees note links) ships green before Slice B (passage notes, document popover, editor button). A shared `resolveThreadAnchors` is the single seam for later gutter markers.

**Tech Stack:** TypeScript, Express, node:test, React + zustand, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-note-connections-and-passage-notes-design.md` (approved). Builds on the shipped card-threads work (`docs/superpowers/specs/2026-10-06-card-threads-design.md`).

**Execution:** native, inline, on the user's explicit instruction to proceed after the advisor check.

## Global Constraints

- Thread store file stays `<project>/threads/threads.json` with `version: 1`; new fields are optional and old files read as "no tags, no links, no anchor".
- Limits: at most 12 tags and 12 links per note (`THREAD_TAG_MAX`, `THREAD_LINK_MAX`); note text 1 to 4000 characters.
- **Tolerant edits:** a re-save of a note's tags/links validates only *newly added* ids/targets. A tag id or linked card that was already on the note and has since disappeared (a tag created then undone, a removed card) is kept for tags? No: unknown tag ids already on the note are dropped silently; links to removed cards already on the note are kept and shown as "Card removed". Reads never fail on them.
- Combine requires the same card **and** the same passage (`samePassage`: equal quote, prefix and suffix, or both unanchored).
- A note anchor is allowed only on `document` targets and must match the saved text (`makePassageAnchor`); unsaved or stale selections are refused.
- Muse: every card, excerpt and document goes through `mayRead` for the replying agent; the model call stays outside any lock; replies stay in the thread only. For a **document-target thread** the document itself is always readable by a restricted agent (it is the "current" document); only *linked* manuscript documents obey the legacy `future_chapters` rule.
- All thread writes go through `threadWrite` (server) so each is one recorded edit; labels: "Add note", "Tag note", "Edit note", etc.
- **Environment lessons:** never `pkill -f` with a pattern that appears in your own command line (start servers as `cmd & SP=$!` and `kill $SP`); no bare `git stash`; use `command cp -f` (cp is aliased interactive); e2e needs `PW_CHANNEL=chrome` (bundled Chromium is not installed, do not download it); check ports 5277/5278 are free before Playwright and never stop the user's own dev servers; run server tests from `server/` and web helper tests from `web/` with `node --import tsx --test`.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Final whole-branch review: dispatch with `model: opus` explicitly.

## Review Focus

- A note's tag that no longer exists (created then undone) must not lock the note: re-saving its chips works and the tag is dropped. (Task A2 test.)
- A passage note whose text was edited: *moved* is found by context, *missing*/*ambiguous* keep the original quote and the note stays usable. (Tasks B1, B4 tests.)
- A restricted agent (legacy `future_chapters`) can still read the document a passage note is on, and never sees linked cards it may not read. (Task B3 test with the seed character agent's real context.)
- Jumping to a passage waits for the document and editor to load before revealing. (Task A5 `openNote`, B7 e2e.)
- Combine across different passages of one document is refused. (Tasks B1/B6 tests.)

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/threads.ts` (modify) | New optional `Thread` fields, limits, `samePassage`, `resolveThreadAnchors`. |
| `server/src/threads.ts` (modify) | Validate new fields on read; `setConnections`; create with tags/links/range; merge unions and passage rule. |
| `server/src/thread-reply.ts` (modify) | Note tags/links + linked excerpts; passage window; document readability rule. |
| `server/src/index.ts` (modify) | Create accepts new fields; `PUT /threads/:tid/connections`. |
| `web/src/api.ts` (modify) | `updateThreadConnections`, `createThread` range/tags/links. |
| `web/src/threadView.ts` (modify) | Join helpers; `threadsForTarget` anchored option; `canCombine` passage rule. |
| `web/src/threads.ts` (modify) | `setConnections`, `create` with range; popover store carries a pending range. |
| `web/src/openNote.ts` (new) | One jump helper for board, `#` panel and popover. |
| `web/src/components/ThreadChips.tsx` (new) | Tag/link chip row for a note. |
| `web/src/components/CardThread.tsx` (modify) | Chip row, passage quote, document mode (On passages / Whole document). |
| `web/src/panes/ThreadsPane.tsx` (modify) | Chips, quote, tag filter, `openNote`. |
| `web/src/components/ConnectionsPanel.tsx` (modify) | Read-only notes join. |
| `web/src/panes/EditorPane.tsx` (modify) | **Note** button. |
| `web/src/styles/threads.css` (modify) | Chips, quote, document mode. |
| tests | `web/test/threads-shared.test.ts`, `server/test/threads.test.ts`, `server/test/thread-reply.test.ts`, `web/test/threads.test.ts`, `e2e/threads.spec.ts` |

---

# Slice A: tags and links on notes

### Task A1: Shared fields, limits, and `samePassage`

**Files:** Modify `shared/threads.ts`; Test `web/test/threads-shared.test.ts`

**Interfaces:**
- Produces: `Thread.tagIds?: string[]`, `Thread.links?: ConnectionTarget[]`, `Thread.anchor?: PassageAnchor`; `THREAD_TAG_MAX = 12`, `THREAD_LINK_MAX = 12`; `samePassage(a?: PassageAnchor, b?: PassageAnchor): boolean`.

- [ ] **Step 1: failing test** — append to `web/test/threads-shared.test.ts`:

```ts
import { samePassage, THREAD_LINK_MAX, THREAD_TAG_MAX } from '../../shared/threads.ts';

test('samePassage compares quote, prefix and suffix, never start offsets; two unanchored notes match', () => {
  const a = { start: 10, end: 15, quote: 'lantern', prefix: 'Mara lit the ', suffix: ' at dusk' };
  assert.equal(samePassage(undefined, undefined), true);
  assert.equal(samePassage(a, undefined), false);
  assert.equal(samePassage(a, { ...a, start: 400, end: 407 }), true);
  assert.equal(samePassage(a, { ...a, suffix: ' at dawn' }), false);
  assert.equal(THREAD_TAG_MAX, 12);
  assert.equal(THREAD_LINK_MAX, 12);
});
```

- [ ] **Step 2:** run `cd web && node --import tsx --test test/threads-shared.test.ts` — Expected: FAIL (`samePassage` not exported).
- [ ] **Step 3: implement** in `shared/threads.ts`: change the import to `import type { ConnectionTarget, PassageAnchor } from './connections.js';`, add to `Thread`:

```ts
  /** Connection-store tag ids on this note; absent means none. */
  tagIds?: string[];
  /** Cards this note is about; absent means none. */
  links?: ConnectionTarget[];
  /** Passage this note is attached to; document targets only. */
  anchor?: PassageAnchor;
```

and below `THREAD_TEXT_MAX`:

```ts
export const THREAD_TAG_MAX = 12;
export const THREAD_LINK_MAX = 12;

/** Same passage means same text and surroundings; start offsets drift as the document is edited. */
export function samePassage(a?: PassageAnchor, b?: PassageAnchor): boolean {
  if (!a || !b) return !a && !b;
  return a.quote === b.quote && a.prefix === b.prefix && a.suffix === b.suffix;
}
```

- [ ] **Step 4:** run the test — Expected: PASS (5 tests).
- [ ] **Step 5: commit** `feat: thread tag/link/anchor fields and samePassage`.

### Task A2: Server store — tags, links, create, merge

**Files:** Modify `server/src/threads.ts`; Test `server/test/threads.test.ts`

**Interfaces:**
- Consumes: A1 types; `readConnections`, `createTag` (`connections.ts`), `requireTarget`, `connectionTarget`.
- Produces: `setConnections(dir, threadId, { tagIds?, links?, expectedUpdatedAt? }): Promise<Thread>`; `createThread(dir, { target, text, tagIds?, links? })`; `mergeThreads` unions tags/links and refuses different passages.

- [ ] **Step 1: failing tests** — append to `server/test/threads.test.ts` (add imports `setConnections` from `../src/threads.js`, `createTag` from `../src/connections.js`):

```ts
test('notes take tags and links; unknown or self links are refused; limits and duplicates are enforced', async (t) => {
  const { dir, canon, plot } = await fixture(t);
  const fear = await createTag(dir, { label: 'fear' });
  const thread = await createThread(dir, { target: canon, text: 'note' });
  const tagged = await setConnections(dir, thread.id, { tagIds: [fear.id, fear.id], links: [plot, plot] });
  assert.deepEqual(tagged.tagIds, [fear.id]);
  assert.deepEqual(tagged.links, [plot]);
  await assert.rejects(setConnections(dir, thread.id, { tagIds: ['nope'] }), /No such tag/);
  await assert.rejects(setConnections(dir, thread.id, { links: [canon] }), /its own card/);
  await assert.rejects(setConnections(dir, thread.id, { links: [{ kind: 'plot', id: 'gone' }] }), /No such plot/);
  await assert.rejects(setConnections(dir, thread.id, { tagIds: Array.from({ length: 13 }, (_, i) => `t${i}`) }), /at most 12/);
  const cleared = await setConnections(dir, thread.id, { tagIds: [], links: [] });
  assert.equal(cleared.tagIds, undefined);
  assert.equal(cleared.links, undefined);
});

test('a tag that disappeared (created then undone) is dropped, not a lock on the note', async (t) => {
  const { dir, canon } = await fixture(t);
  const fear = await createTag(dir, { label: 'fear' });
  const thread = await createThread(dir, { target: canon, text: 'note' });
  await setConnections(dir, thread.id, { tagIds: [fear.id] });
  await fs.rm(path.join(dir, 'connections'), { recursive: true });           // what undoing "create tag" does
  const next = await createTag(dir, { label: 'pacing' });
  const resaved = await setConnections(dir, thread.id, { tagIds: [fear.id, next.id] });
  assert.deepEqual(resaved.tagIds, [next.id], 'the vanished tag is dropped; the new one is kept');
});

test('a link to a card that was removed stays on the note instead of blocking edits', async (t) => {
  const { dir, canon, plot } = await fixture(t);
  const thread = await createThread(dir, { target: canon, text: 'note' });
  await setConnections(dir, thread.id, { links: [plot] });
  await fs.rm(path.join(dir, 'plot'), { recursive: true });
  const fear = await createTag(dir, { label: 'fear' });
  const resaved = await setConnections(dir, thread.id, { tagIds: [fear.id], links: [plot] });
  assert.deepEqual(resaved.links, [plot]);
  assert.deepEqual(resaved.tagIds, [fear.id]);
});

test('create accepts tags and links; merge unions them and refuses different passages', async (t) => {
  const { dir, canon, plot } = await fixture(t);
  const fear = await createTag(dir, { label: 'fear' });
  const pace = await createTag(dir, { label: 'pacing' });
  const a = await createThread(dir, { target: canon, text: 'a', tagIds: [fear.id] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const b = await createThread(dir, { target: canon, text: 'b', tagIds: [pace.id, fear.id], links: [plot] });
  const merged = await mergeThreads(dir, [a.id, b.id]);
  assert.deepEqual(merged.tagIds, [fear.id, pace.id]);
  assert.deepEqual(merged.links, [plot]);
});

test('an old store file without the new fields still reads', async (t) => {
  const { dir, canon } = await fixture(t);
  const thread = await createThread(dir, { target: canon, text: 'note' });
  const stored = (await readThreads(dir)).threads[0];
  assert.equal(stored.tagIds, undefined);
  assert.equal(stored.id, thread.id);
});
```

- [ ] **Step 2:** `cd server && node --import tsx --test test/threads.test.ts` — Expected: FAIL (`setConnections` missing).
- [ ] **Step 3: implement** in `server/src/threads.ts`. Change the shared import to include `THREAD_TAG_MAX, THREAD_LINK_MAX, samePassage`; add imports `readConnections` (from `./connections.js`, alongside the existing ones). Add helpers and functions:

```ts
interface ConnectionInput { tagIds?: unknown; links?: unknown }

/** Dedupe, cap, and check. Only ids/targets that are NEW on the note are validated, so a tag undone
 * elsewhere or a card removed later never locks the note's own chips. */
async function checkedConnections(dir: string, own: ConnectionTarget, existing: Thread | undefined, input: ConnectionInput): Promise<{ tagIds?: string[]; links?: ConnectionTarget[] }> {
  const out: { tagIds?: string[]; links?: ConnectionTarget[] } = {};
  if (input.tagIds !== undefined) {
    if (!Array.isArray(input.tagIds) || input.tagIds.some((id) => typeof id !== 'string')) throw new Error('tagIds must be a list of tag ids');
    const wanted = [...new Set(input.tagIds as string[])];
    if (wanted.length > THREAD_TAG_MAX) throw new Error(`A note can have at most ${THREAD_TAG_MAX} tags`);
    const known = new Set((await readConnections(dir).catch(() => ({ tags: [] as { id: string }[] }))).tags.map((tag) => tag.id));
    const had = new Set(existing?.tagIds ?? []);
    const kept: string[] = [];
    for (const id of wanted) {
      if (known.has(id)) kept.push(id);
      else if (!had.has(id)) throw new Error(`No such tag: ${id}`);   // new and unknown: refuse; previously held and gone: drop
    }
    if (kept.length) out.tagIds = kept;
  }
  if (input.links !== undefined) {
    if (!Array.isArray(input.links)) throw new Error('links must be a list of cards');
    const seen = new Set<string>();
    const wanted: ConnectionTarget[] = [];
    for (const item of input.links) {
      const target = connectionTarget(item);
      const key = `${target.kind}:${target.id}`;
      if (!seen.has(key)) { seen.add(key); wanted.push(target); }
    }
    if (wanted.length > THREAD_LINK_MAX) throw new Error(`A note can link at most ${THREAD_LINK_MAX} cards`);
    const had = new Set((existing?.links ?? []).map((item) => `${item.kind}:${item.id}`));
    for (const target of wanted) {
      if (sameTarget(target, own)) throw new Error('A note cannot link to its own card');
      if (!had.has(`${target.kind}:${target.id}`)) await requireTarget(dir, target);
    }
    if (wanted.length) out.links = wanted;
  }
  return out;
}

export function setConnections(dir: string, threadId: string, input: ConnectionInput & { expectedUpdatedAt?: string }): Promise<Thread> {
  return mutate(dir, async (store) => {
    const thread = findThread(store, threadId);
    if (thread.trashedAt) throw new Error('Restore this note before editing it');
    guard(thread, input.expectedUpdatedAt);
    const next = await checkedConnections(dir, thread.target, thread, input);
    if (input.tagIds !== undefined) { if (next.tagIds) thread.tagIds = next.tagIds; else delete thread.tagIds; }
    if (input.links !== undefined) { if (next.links) thread.links = next.links; else delete thread.links; }
    touch(thread);
    return thread;
  });
}
```

Change `createThread` to accept `tagIds`/`links`: after `await requireTarget(dir, target);` add `const connections = await checkedConnections(dir, target, undefined, { tagIds: input.tagIds, links: input.links });` (skip when both undefined — `checkedConnections` already does nothing then) and spread `...connections` into the new thread object. Update its input type to `{ target; text; tagIds?: unknown; links?: unknown }`.

In `mergeThreads` after the same-target check add `if (!picked.every((thread) => samePassage(thread.anchor, picked[0].anchor))) throw new Error('Combine works within one passage');`, and after setting `primary.status` add:

```ts
    const tagIds = [...new Set(picked.flatMap((thread) => thread.tagIds ?? []))];
    const links = picked.flatMap((thread) => thread.links ?? []).filter((item, index, all) => all.findIndex((other) => sameTarget(other, item)) === index);
    if (tagIds.length) primary.tagIds = tagIds.slice(0, THREAD_TAG_MAX); else delete primary.tagIds;
    if (links.length) primary.links = links.slice(0, THREAD_LINK_MAX); else delete primary.links;
```

In `validateStore`, inside the thread loop add tolerant shape checks: `if (thread.tagIds !== undefined && (!Array.isArray(thread.tagIds) || thread.tagIds.some((id) => typeof id !== 'string'))) throw new Error('Malformed tagIds');` and `if (thread.links !== undefined) { if (!Array.isArray(thread.links)) throw new Error('Malformed links'); thread.links.forEach(connectionTarget); }`.

- [ ] **Step 4:** run `node --import tsx --test test/threads.test.ts` — Expected: PASS; `npx tsc --noEmit` shows only the baseline express errors.
- [ ] **Step 5: commit** `feat: note tags and links in the thread store`.

### Task A3: Routes and web API client

**Files:** Modify `server/src/index.ts`, `web/src/api.ts`

**Interfaces:**
- Produces: `POST /threads` accepts `tagIds`, `links`; `PUT /threads/:tid/connections` `{ tagIds?, links?, expectedUpdatedAt? }` → `{ thread }`; web `api.updateThreadConnections(id, tid, body)` and `api.createThread` body gains `tagIds?`, `links?`, `range?`.

- [ ] **Step 1:** in `server/src/index.ts` import `setConnections` from `./threads.js`. In `POST /threads` pass `tagIds: req.body?.tagIds, links: req.body?.links` into `createThread`. Add, before the `PUT /threads/:tid` route (the more specific path first):

```ts
app.put('/api/projects/:id/threads/:tid/connections', wrap(async (req, res) => {
  const dir = await projectDir(req.params.id);
  const { tagIds, links, expectedUpdatedAt } = req.body ?? {};
  const thread = await threadWrite(req, res, dir, 'Tag note', () => setConnections(dir, req.params.tid, { tagIds, links, expectedUpdatedAt }));
  res.json({ thread });
}));
```

- [ ] **Step 2:** in `web/src/api.ts` extend `createThread` body type to `{ target: ConnectionTarget; text: string; agentId?: string; tagIds?: string[]; links?: ConnectionTarget[]; range?: { start: number; end: number; quote: string } }` and add:

```ts
  updateThreadConnections: (id: string, threadId: string, body: { tagIds?: string[]; links?: ConnectionTarget[]; expectedUpdatedAt?: string }) =>
    req<{ thread: Thread }>(`/api/projects/${id}/threads/${threadId}/connections`, { method: 'PUT', body: JSON.stringify(body) }),
```

- [ ] **Step 3: verify** — `cd server && npx tsc --noEmit` (baseline errors only), `cd web && npx tsc --noEmit` clean. Live smoke on an isolated server (`MUSE_CONFIG_DIR=<tmp> MUSE_PORT=5293 node --import tsx server/src/index.ts & SP=$!`, then `kill $SP`): create a tag, create a scene and a thread, `PUT .../connections` with `{tagIds:[tag], links:[]}` returns the tag; an unknown tag returns 400.
- [ ] **Step 4: commit** `feat: note connections route and client`.

### Task A4: Muse sees a note's own tags and links

**Files:** Modify `server/src/thread-reply.ts`; Test `server/test/thread-reply.test.ts`

**Interfaces:**
- Consumes: A2 (`setConnections`), existing `mayRead`, `cardSnapshot`.
- Produces: prompt gains `<note-context>` (note tags, note links with ≤3 excerpts of ≤800 chars).

- [ ] **Step 1: failing test** — append (imports `setConnections` from `../src/threads.js`):

```ts
test("Muse sees a note's own tags and a short excerpt of the cards it links, and nothing the agent may not read", async (t) => {
  const { dir, target } = await fixture(t);
  const gate = await createPlotNode(dir, { title: 'Burning Gate', summary: 'The gate burns at dawn.' });
  const pace = await createTag(dir, { label: 'pacing' });
  const thread = await createThread(dir, { target, text: '@Muse how does this tie in?' });
  await setConnections(dir, thread.id, { tagIds: [pace.id], links: [{ kind: 'plot', id: gate.id }] });
  let seen = '';
  const spy: ModelProvider = { id: 'spy', complete: async (req: { messages: { content: string }[] }) => { seen = req.messages.map((m) => m.content).join('\n'); return { text: 'ok', model: 'spy' }; } } as unknown as ModelProvider;
  await respondAsMuse(dir, thread.id, agent('muse', 'muse'), spy);
  assert.match(seen, /<note-context>[\s\S]*note tags: #pacing[\s\S]*<\/note-context>/);
  assert.match(seen, /<linked-card [^>]*label="Burning Gate"[\s\S]*The gate burns at dawn/);
  const noPlot = { ...agent('muse', 'muse'), access: { version: 1, revision: 'r1', allow: [{ kind: 'character', selection: { mode: 'all' } }], deny: [], selection: false, proposeEdits: false } } as unknown as AgentDef;
  await respondAsMuse(dir, thread.id, noPlot, spy);
  assert.match(seen, /#pacing/);
  assert.doesNotMatch(seen, /Burning Gate|burns at dawn/);
});
```

- [ ] **Step 2:** run `node --import tsx --test test/thread-reply.test.ts` — Expected: FAIL (no `<note-context>`).
- [ ] **Step 3: implement** in `thread-reply.ts`: add

```ts
const LINK_EXCERPTS = 3;
const EXCERPT_CHARS = 800;

/** The note's own tags and links. Linked cards the agent may not read are left out entirely. */
export async function noteContext(dir: string, thread: Thread, agent?: AgentDef): Promise<string> {
  const lines: string[] = [];
  const tags = (await readConnections(dir).catch(() => ({ tags: [] as { id: string; label: string }[] }))).tags;
  const labels = (thread.tagIds ?? []).map((id) => tags.find((tag) => tag.id === id)?.label).filter(Boolean).map((label) => `#${label}`);
  if (labels.length) lines.push(`note tags: ${labels.join(', ')}`);
  const excerpts: string[] = [];
  const titles: string[] = [];
  for (const ref of thread.links ?? []) {
    if (!(await mayRead(dir, agent, ref))) continue;
    const { label, body } = await cardSnapshot(dir, ref);
    if (label === 'Removed card') continue;
    titles.push(`${KIND_NAME[ref.kind]} “${label}”`);
    if (excerpts.length < LINK_EXCERPTS) excerpts.push(`<linked-card kind="${ref.kind}" label="${label.replace(/"/g, '&quot;')}">\n${escapeTag(body.slice(0, EXCERPT_CHARS))}\n</linked-card>`);
  }
  if (titles.length) lines.push(`note links: ${titles.join('; ')}`);
  return lines.length || excerpts.length ? `<note-context>\n${[...lines, ...excerpts].join('\n')}\n</note-context>\n` : '';
}
```

Add `linked-card|note-context` to `escapeTag`'s tag list; extend `renderPrompt` with a `noteBlock: string` parameter placed right after `</card>` + connections; in `respondAsMuse` compute `const noteBlock = await noteContext(dir, thread, agent).catch(() => '');` next to `connections` and pass it. Update the protocol line to mention "the note's own tags and linked cards".

- [ ] **Step 4:** run `node --import tsx --test test/thread-reply.test.ts` — Expected: PASS.
- [ ] **Step 5: commit** `feat: Muse sees a note's tags and linked-card excerpts`.

### Task A5: Web helpers, store, and the shared `openNote`

**Files:** Create `web/src/openNote.ts`; Modify `web/src/threadView.ts`, `web/src/threads.ts`, `web/src/panes/ThreadsPane.tsx` (use `openNote`); Test `web/test/threads.test.ts`

**Interfaces:**
- Produces: `notesTaggedWith(threads, tagId)`, `notesLinkingTo(threads, target)`, `noteSummary(thread, max?)`, `threadsForTarget(threads, target, opts?: { anchored?: boolean })`; store `setConnections(threadId, { tagIds?, links? }): Promise<Thread|null>`; `openNote(thread): Promise<boolean>`.

- [ ] **Step 1: failing tests** — append to `web/test/threads.test.ts` (extend the import list):

```ts
test('join helpers ignore trash and read tags and links', () => {
  const list = [
    make('a', { tagIds: ['t1'], links: [{ kind: 'scene', id: 's9' }] }),
    make('b', { tagIds: ['t1'], trashedAt: T0 }),
    make('c', { links: [{ kind: 'scene', id: 's9' }, { kind: 'plot', id: 'p1' }] }),
    make('d'),
  ];
  assert.deepEqual(notesTaggedWith(list, 't1').map((t) => t.id), ['a']);
  assert.deepEqual(notesLinkingTo(list, { kind: 'scene', id: 's9' }).map((t) => t.id), ['a', 'c']);
  assert.deepEqual(notesLinkingTo(list, { kind: 'scene', id: 'none' }), []);
});

test('noteSummary is the first words of the first note, trimmed', () => {
  const long = make('x', { messages: [{ id: 'm', author: { kind: 'user' }, text: 'word '.repeat(40), createdAt: T0 }] });
  assert.ok(noteSummary(long, 30).length <= 31);
  assert.match(noteSummary(long, 30), /…$/);
  assert.equal(noteSummary(make('y')), 'y');
});

test('threadsForTarget can split whole-document notes from passage notes', () => {
  const anchor = { start: 0, end: 4, quote: 'text', prefix: '', suffix: '' };
  const doc = { kind: 'document' as const, id: 'd1' };
  const list = [make('whole', { target: doc }), make('passage', { target: doc, anchor })];
  assert.deepEqual(threadsForTarget(list, doc).map((t) => t.id).sort(), ['passage', 'whole']);
  assert.deepEqual(threadsForTarget(list, doc, { anchored: true }).map((t) => t.id), ['passage']);
  assert.deepEqual(threadsForTarget(list, doc, { anchored: false }).map((t) => t.id), ['whole']);
});
```

- [ ] **Step 2:** run `cd web && node --import tsx --test test/threads.test.ts` — Expected: FAIL (exports missing).
- [ ] **Step 3: implement** in `web/src/threadView.ts`: replace `threadsForTarget` with

```ts
export function threadsForTarget(threads: Thread[], target: ConnectionTarget, options: { anchored?: boolean } = {}): Thread[] {
  return threads
    .filter((thread) => !thread.trashedAt && sameTarget(thread.target, target)
      && (options.anchored === undefined || Boolean(thread.anchor) === options.anchored))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || time(b.createdAt) - time(a.createdAt));
}

export const notesTaggedWith = (threads: Thread[], tagId: string) => threads.filter((thread) => !thread.trashedAt && thread.tagIds?.includes(tagId));
export const notesLinkingTo = (threads: Thread[], target: ConnectionTarget) => threads.filter((thread) => !thread.trashedAt && thread.links?.some((link) => sameTarget(link, target)));
export function noteSummary(thread: Thread, max = 80): string {
  const text = (thread.messages[0]?.text ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
```

`openCount` keeps calling `threadsForTarget(threads, target)`. Update `canCombine` in the same file: add `import { samePassage, sameTarget } from '../../shared/threads';` and after the same-card check `if (!picked.every((thread) => samePassage(thread.anchor, picked[0].anchor))) return { ok: false, reason: 'Combine works within one passage' };` (and add its assertion to the existing canCombine test: two notes on one document with different quotes → `ok` false, reason as above).

In `web/src/threads.ts` add to the state interface and implementation:

```ts
  setConnections: (threadId: string, input: { tagIds?: string[]; links?: ConnectionTarget[] }) => Promise<Thread | null>;
  // ...
    setConnections: (threadId, input) => apply((id) => api.updateThreadConnections(id, threadId, { ...input, expectedUpdatedAt: get().threads.find((t) => t.id === threadId)?.updatedAt })),
```

and change `create` to `create: (target, text, extra) => apply((id) => api.createThread(id, { target, text, ...extra }), { thinking: hasMuseMention(text) })` with signature `create: (target: ConnectionTarget, text: string, extra?: { range?: { start: number; end: number; quote: string }; tagIds?: string[]; links?: ConnectionTarget[] }) => Promise<Thread | null>`.

Create `web/src/openNote.ts`:

```ts
import { resolvePassageAnchor } from '../../shared/connections';
import type { Thread } from '../../shared/threads';
import { sameTarget } from '../../shared/threads';
import { editorRefs, revealRange } from './panes/EditorPane';
import { loadStoryRecords, storyRecords } from './storyRecords';
import { useStore } from './store';
import { useThreadPopover } from './threads';

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Opens a note's card (and, for a passage note, selects the passage once the editor has mounted), then its thread. */
export async function openNote(thread: Thread): Promise<boolean> {
  await loadStoryRecords();
  const record = storyRecords().find((item) => sameTarget(item.target, thread.target));
  if (!record) return false;
  const documentId = thread.target.id;
  if (thread.anchor && thread.target.kind === 'document') {
    await useStore.getState().loadDoc(documentId);
    record.open();
    const doc = useStore.getState().docs[documentId];
    const resolved = doc ? resolvePassageAnchor(doc.content, thread.anchor) : null;
    if (resolved?.status === 'resolved') {
      for (let frame = 0; frame < 60 && !editorRefs.get(documentId); frame++) await nextFrame();
      if (editorRefs.get(documentId)) revealRange(documentId, resolved.start, resolved.end);
    }
  } else record.open();
  await nextFrame();
  useThreadPopover.getState().open(thread.target, thread.id);
  return true;
}
```

In `ThreadsPane.tsx` replace the body of `jump()` with `await openNote(thread);` (import it; drop now-unused imports).

- [ ] **Step 4:** run `node --import tsx --test test/threads.test.ts test/threads-store.test.ts test/threads-shared.test.ts` — Expected: PASS; `npx tsc --noEmit` clean; `npm run build` ok.
- [ ] **Step 5: commit** `feat: note join helpers, setConnections action, shared openNote`.

### Task A6: Chip row in the popover and chips + tag filter on the board

**Files:** Create `web/src/components/ThreadChips.tsx`; Modify `web/src/components/CardThread.tsx`, `web/src/panes/ThreadsPane.tsx`, `web/src/styles/threads.css`

**Interfaces:**
- Consumes: A5 (`setConnections`), `api.connections`, `api.createTag`, `storyRecords`.
- Produces: `<ThreadChips thread tags={...} />` and a board **Tag** filter.

- [ ] **Step 1: write `ThreadChips.tsx`**:

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { ConnectionTarget, StoryTag } from '../../../shared/connections';
import { sameTarget } from '../../../shared/threads';
import type { Thread } from '../../../shared/threads';
import { api } from '../api';
import { useStore } from '../store';
import { loadStoryRecords, storyRecords } from '../storyRecords';
import { useThreads } from '../threads';

/** Tags and links of one note. Every change sends the full lists in one atomic, undoable write. */
export function ThreadChips({ thread }: { thread: Thread }) {
  const projectId = useStore((state) => state.project?.id);
  const busy = useThreads((state) => state.busy);
  const [tags, setTags] = useState<StoryTag[]>([]);
  const [mode, setMode] = useState<'tag' | 'link' | null>(null);
  const [query, setQuery] = useState('');
  const [newTag, setNewTag] = useState('');
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (!projectId) return;
    void loadStoryRecords();
    void api.connections(projectId).then((result) => setTags(result.connections.tags)).catch(() => setProblem('Tags could not load.'));
  }, [projectId, thread.id]);
  const records = storyRecords();
  const tagIds = thread.tagIds ?? [];
  const links = thread.links ?? [];
  const labelFor = (target: ConnectionTarget) => records.find((item) => sameTarget(item.target, target))?.label ?? 'Card removed';
  const save = (next: { tagIds?: string[]; links?: ConnectionTarget[] }) => void useThreads.getState().setConnections(thread.id, next);
  const matches = useMemo(() => records.filter((item) => !sameTarget(item.target, thread.target) && !links.some((link) => sameTarget(link, item.target))
    && `${item.group} ${item.words}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 6), [records, links, query, thread.target]);

  return <div className="thread-chips">
    {tagIds.map((id) => <button key={id} type="button" className="thread-chip" disabled={busy} aria-label={`Remove tag ${tags.find((tag) => tag.id === id)?.label ?? 'Missing tag'}`}
      onClick={() => save({ tagIds: tagIds.filter((item) => item !== id) })}>#{tags.find((tag) => tag.id === id)?.label ?? 'Missing tag'} ×</button>)}
    {links.map((link) => <button key={`${link.kind}:${link.id}`} type="button" className="thread-chip" disabled={busy} aria-label={`Remove link ${labelFor(link)}`}
      onClick={() => save({ links: links.filter((item) => !sameTarget(item, link)) })}>↗ {labelFor(link)} ×</button>)}
    <button type="button" className="thread-chip is-add" disabled={busy} onClick={() => setMode(mode === 'tag' ? null : 'tag')}>+ Tag</button>
    <button type="button" className="thread-chip is-add" disabled={busy} onClick={() => setMode(mode === 'link' ? null : 'link')}>+ Link</button>
    {problem && <span className="thread-failed" role="alert">{problem}</span>}
    {mode === 'tag' && <div className="thread-picker">
      <select aria-label="Existing tag" value="" onChange={(event) => { if (event.target.value) { save({ tagIds: [...tagIds, event.target.value] }); setMode(null); } }}>
        <option value="">Choose a tag…</option>{tags.filter((tag) => !tagIds.includes(tag.id)).map((tag) => <option key={tag.id} value={tag.id}>{tag.label}</option>)}
      </select>
      <form onSubmit={(event) => { event.preventDefault(); const label = newTag.trim(); if (!label || !projectId) return;
        void api.createTag(projectId, label).then(({ tag }) => { setTags((all) => all.some((item) => item.id === tag.id) ? all : [...all, tag]); save({ tagIds: [...new Set([...tagIds, tag.id])] }); setNewTag(''); setMode(null); })
          .catch((err) => setProblem(String(err?.message ?? err))); }}>
        <input aria-label="New tag" maxLength={80} value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="New tag" /><button disabled={!newTag.trim()}>Add</button>
      </form>
    </div>}
    {mode === 'link' && <div className="thread-picker">
      <input aria-label="Find a card to link" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, alias, motif…" />
      <ul>{matches.map((item) => <li key={`${item.target.kind}:${item.target.id}`}>
        <button type="button" aria-label={`Link ${item.group}: ${item.label}`} onClick={() => { save({ links: [...links, item.target] }); setMode(null); setQuery(''); }}>{item.group}: {item.label}</button></li>)}</ul>
    </div>}
  </div>;
}
```

- [ ] **Step 2:** in `CardThread.tsx` render `{thread && !thread.trashedAt && <ThreadChips thread={thread} />}` directly under the `thread-resolved` line (import it).
- [ ] **Step 3:** in `ThreadsPane.tsx` show read-only chips on each note card (`#tag` and `↗ card` text from the loaded tag list and `cardLabel`), and add a **Tag** `<select aria-label="Filter by tag">` in the toolbar (options: Any tag + tags from `api.connections`); `visible` additionally filters `thread.tagIds?.includes(tagFilter)` when set.
- [ ] **Step 4:** append CSS to `threads.css` for `.thread-chips` (flex wrap, gap 4px, padding 6px 12px), `.thread-chip` (pill: `border:1px solid var(--line); background:none; border-radius:12px; padding:2px 8px; font-size:11px; color:var(--ink-mid); cursor:pointer`), `.thread-chip.is-add` (dashed border), `.thread-picker` (flex column, gap 4px, full width) and `.board-chips` (same pill, non-interactive).
- [ ] **Step 5: verify** `cd web && npx tsc --noEmit && npm run build` — Expected: clean. Manual check deferred to the Task A8 e2e.
- [ ] **Step 6: commit** `feat: tag and link notes from the thread; chips and tag filter on the board`.

### Task A7: `#` panel join

**Files:** Modify `web/src/components/ConnectionsPanel.tsx`

**Interfaces:**
- Consumes: A5 (`notesTaggedWith`, `notesLinkingTo`, `noteSummary`, `threadsForTarget`, `openNote`), `useThreads`.

- [ ] **Step 1:** in `ConnectionContents` add `const threads = useThreads((state) => state.threads);` and `useEffect(() => { void useThreads.getState().ensureLoaded(); }, [projectId]);`. Add a small inner component:

```tsx
function NoteRow({ thread, label, onOpen }: { thread: Thread; label: string; onOpen: () => void }) {
  return <li><small>{label}</small> <span>{noteSummary(thread)}</span> <button type="button" aria-label={`Open note: ${noteSummary(thread, 40)}`} onClick={onOpen}>Open note</button></li>;
}
```

- [ ] **Step 2:** inside the `context &&` section, after "Linked from" and before "Passage annotations", add: **Notes here** (`threadsForTarget(threads, context.target)` where `status==='open'`) and extend **Linked from** with `notesLinkingTo(threads, context.target)` rendered as `NoteRow` with label `Note on ${name(thread.target)}`. `onOpen={() => { closeConnections(false); void openNote(thread); }}`.
- [ ] **Step 3:** below the records list (`.connections-records`), when `filter` (a tag id) is set, add `<h4>Notes tagged #{selectedTag?.label}</h4>` and the `notesTaggedWith(threads, filter)` list as `NoteRow` with label `Note on ${name(thread.target)}` (a removed card shows `Card removed`, since `name()` returns "Missing …": map that to "Card removed" for threads).
- [ ] **Step 4: verify** `cd web && npx tsc --noEmit && npm run build`.
- [ ] **Step 5: commit** `feat: notes in the Tags & links panel (tag filter, notes here, linked from)`.

### Task A8: Slice A end-to-end and gate

**Files:** Modify `e2e/threads.spec.ts`, `docs/card-threads-2026-10-06.md`

- [ ] **Step 1: add e2e** (use the existing `seedScene`, `openSceneCard`, `openNotesBoard` helpers):

```ts
test('a note takes a tag and a link, and shows up in the # panel by tag and under the linked card', async ({ page, projectId, request }) => {
  const arrival = await seedScene(request, projectId, 'Arrival');
  await seedScene(request, projectId, 'Return');
  await seedThread(request, projectId, arrival, 'Opening feels thin');
  const card = await openSceneCard(page, 'Arrival');
  await card.getByRole('button', { name: /^Notes/ }).click();
  const thread = page.getByRole('dialog', { name: 'Notes on Arrival', exact: true });
  await thread.getByRole('button', { name: '+ Tag' }).click();
  await thread.getByLabel('New tag', { exact: true }).fill('pacing');
  await thread.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(thread.getByRole('button', { name: 'Remove tag pacing' })).toBeVisible();
  await thread.getByRole('button', { name: '+ Link' }).click();
  await thread.getByLabel('Find a card to link').fill('Return');
  await thread.getByRole('button', { name: /^Link Scene: Return/ }).click();
  await expect(thread.getByRole('button', { name: 'Remove link Return' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Open connections', exact: true }).press('Enter');
  const panel = page.getByRole('dialog', { name: 'Tags and connections', exact: true });
  await panel.getByRole('button', { name: 'Filter tag pacing', exact: true }).click();
  await expect(panel.getByText('Opening feels thin')).toBeVisible();
  await panel.getByRole('button', { name: 'All records', exact: true }).click();
  await panel.getByRole('button', { name: /^Inspect Scene: Return/ }).click();
  await expect(panel.getByText('Note on Arrival')).toBeVisible();
});

test('undoing the tag leaves the note editable', async ({ page, projectId, request }) => {
  const arrival = await seedScene(request, projectId, 'Arrival');
  const session = await page.evaluate(() => sessionStorage.getItem('muse:undo-session'));
  await request.post(`/api/projects/${projectId}/threads`, { headers: { 'x-muse-history-session': session! }, data: { target: { kind: 'scene', id: arrival }, text: 'Tag me' } });
  const board = await openNotesBoard(page);
  await expect(board.getByText('Tag me')).toBeVisible();
});
```

(The second test is a placeholder-free smoke of the board path; the vanished-tag rule itself is covered by the server test in Task A2.)

- [ ] **Step 2:** run `PW_CHANNEL=chrome npx playwright test e2e/threads.spec.ts --reporter=line` — Expected: all pass; fix selectors (not product code) unless a real defect appears (then a failing unit test first).
- [ ] **Step 3:** update `docs/card-threads-2026-10-06.md` with a "Tags and links on notes" section (chips in the thread, `#` panel, board tag filter, Muse sees note links and short excerpts).
- [ ] **Step 4: gate** — run all of: `cd server && node --import tsx --test test/*.test.ts`; `cd web && for f in test/*.test.ts; do node --import tsx --test "$f"; done; npx tsc --noEmit; npm run build`; `PW_CHANNEL=chrome npx playwright test e2e/threads.spec.ts`. Expected: all green (the known baseline failures are `references.spec.ts:142` and `writing-fonts.spec.ts:3` only).
- [ ] **Step 5: commit** `test: slice A e2e and docs`.

---

# Slice B: passage notes

### Task B1: `resolveThreadAnchors` with a *moved* state

**Files:** Modify `shared/threads.ts`; Test `web/test/threads-shared.test.ts`

**Interfaces:**
- Produces: `type AnchorState = { threadId: string; status: 'resolved' | 'moved' | 'missing' | 'ambiguous'; start?: number; end?: number }`; `resolveThreadAnchors(content: string, threads: Thread[]): AnchorState[]` (only threads with an anchor).

- [ ] **Step 1: failing test** (imports `makePassageAnchor` from `../../shared/connections.ts`):

```ts
test('resolveThreadAnchors reports resolved, moved, missing and ambiguous passages', () => {
  const text = 'Mara lit the lantern at dusk. The harbour held its breath.';
  const start = text.indexOf('lantern');
  const anchor = makePassageAnchor(text, start, start + 7, 'lantern');
  const note = (id: string): Thread => ({ id, target: { kind: 'document', id: 'd' }, status: 'open', messages: [], createdAt: '2026-10-06T10:00:00.000Z', updatedAt: '2026-10-06T10:00:00.000Z', anchor });
  assert.deepEqual(resolveThreadAnchors(text, [note('a')]).map((s) => s.status), ['resolved']);
  const shifted = `Intro added here. ${text}`;
  const moved = resolveThreadAnchors(shifted, [note('a')])[0];
  assert.equal(moved.status, 'moved');
  assert.equal(shifted.slice(moved.start, moved.end), 'lantern');
  assert.equal(resolveThreadAnchors('Nothing alike.', [note('a')])[0].status, 'missing');
  const twice = `${text} ${text}`;
  assert.equal(resolveThreadAnchors(twice, [note('a')])[0].status, 'ambiguous');
  assert.deepEqual(resolveThreadAnchors(text, [{ ...note('b'), anchor: undefined }]), []);
});
```

- [ ] **Step 2:** run the file — Expected: FAIL (export missing).
- [ ] **Step 3: implement** (import `resolvePassageAnchor` from `./connections.js`):

```ts
export interface AnchorState { threadId: string; status: 'resolved' | 'moved' | 'missing' | 'ambiguous'; start?: number; end?: number }

/** The one place passage notes are located. The passage list uses it; gutter markers would read the same positions. */
export function resolveThreadAnchors(content: string, threads: Thread[]): AnchorState[] {
  return threads.filter((thread) => thread.anchor).map((thread) => {
    const found = resolvePassageAnchor(content, thread.anchor!);
    if (found.status !== 'resolved') return { threadId: thread.id, status: found.status };
    return { threadId: thread.id, status: found.start === thread.anchor!.start ? 'resolved' as const : 'moved' as const, start: found.start, end: found.end };
  });
}
```

- [ ] **Step 4:** run — Expected: PASS. If the "moved" fixture resolves as `ambiguous`, lengthen the prefix text in the fixture rather than changing the helper.
- [ ] **Step 5: commit** `feat: resolveThreadAnchors seam with moved state`.

### Task B2: Server — create a note on a passage

**Files:** Modify `server/src/threads.ts`, `server/src/index.ts`; Test `server/test/threads.test.ts`

**Interfaces:**
- Produces: `createThread(dir, { target, text, range?, tagIds?, links? })` where `range = { start, end, quote }` builds `anchor` with `makePassageAnchor` against the saved document text; allowed only on `document` targets.

- [ ] **Step 1: failing tests** — the fixture's `project.json` has `documents: []`; add a helper in the test that writes a document:

```ts
async function withDocument(dir: string) {
  await fs.mkdir(path.join(dir, 'manuscript'), { recursive: true });
  await fs.writeFile(path.join(dir, 'manuscript/one.md'), 'Mara lit the lantern at dusk.');
  await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify({ id: 'test-project', name: 'Test', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    documents: [{ id: 'one', title: 'One', kind: 'manuscript', path: 'manuscript/one.md', order: 0 }] }));
  return { kind: 'document' as const, id: 'one' };
}

test('a passage note stores an anchor built from the saved text; stale, empty and non-document ranges are refused', async (t) => {
  const { dir, canon } = await fixture(t);
  const doc = await withDocument(dir);
  const start = 'Mara lit the '.length;
  const thread = await createThread(dir, { target: doc, text: 'why a lantern?', range: { start, end: start + 7, quote: 'lantern' } });
  assert.equal(thread.anchor?.quote, 'lantern');
  assert.equal(thread.anchor?.start, start);
  await assert.rejects(createThread(dir, { target: doc, text: 'x', range: { start, end: start + 7, quote: 'lanterns' } }), /no longer matches/);
  await assert.rejects(createThread(dir, { target: doc, text: 'x', range: { start: 3, end: 3, quote: '' } }), /nonempty/);
  await assert.rejects(createThread(dir, { target: canon, text: 'x', range: { start: 0, end: 1, quote: 'a' } }), /document/);
  const whole = await createThread(dir, { target: doc, text: 'whole document note' });
  assert.equal(whole.anchor, undefined);
});

test('combine refuses different passages of one document', async (t) => {
  const { dir } = await fixture(t);
  const doc = await withDocument(dir);
  const a = await createThread(dir, { target: doc, text: 'a', range: { start: 0, end: 4, quote: 'Mara' } });
  const b = await createThread(dir, { target: doc, text: 'b', range: { start: 13, end: 20, quote: 'lantern' } });
  await assert.rejects(mergeThreads(dir, [a.id, b.id]), /within one passage/);
});
```

- [ ] **Step 2:** run — Expected: FAIL (`range` ignored; anchor undefined).
- [ ] **Step 3: implement** in `createThread`: import `makePassageAnchor` from `../../shared/connections.js`, `safeJoin` from `./paths.js`, `ProjectManifest` from `./types.js`. After `requireTarget` (it returns the document meta for document targets):

```ts
  let anchor: PassageAnchor | undefined;
  if (input.range !== undefined) {
    if (target.kind !== 'document') throw new Error('Passage notes are only supported on documents');
    const meta = await requireTarget(dir, target);
    const r = input.range as { start: number; end: number; quote: string };
    if (!meta || typeof r?.quote !== 'string') throw new Error('Passage note requires the selected quote');
    const content = await fs.readFile(safeJoin(dir, meta.path), 'utf8');
    anchor = makePassageAnchor(content, r.start, r.end, r.quote);
  }
```

(`requireTarget` is already awaited earlier; reuse its return value instead of calling twice: `const meta = await requireTarget(dir, target);` once.) Add `...(anchor ? { anchor } : {})` to the created thread; add `range?: unknown` to the input type. In `validateStore` add `if (thread.anchor !== undefined && (thread.target as any).kind !== 'document') throw new Error('Anchor on a non-document note');`. In `index.ts` `POST /threads` pass `range: req.body?.range`.

- [ ] **Step 4:** run `node --import tsx --test test/threads.test.ts` — Expected: PASS.
- [ ] **Step 5: commit** `feat: create a note on a passage with a saved-text anchor`.

### Task B3: Muse sees the passage; document readability; anchored tags out of the document block

**Files:** Modify `server/src/thread-reply.ts`; Test `server/test/thread-reply.test.ts`

**Interfaces:**
- Consumes: B2 (anchor on threads), `resolvePassageAnchor`.
- Produces: for anchored threads the prompt carries `<passage>` instead of the head of the document; `mayRead` gains a `current` option so a document thread's own document is readable.

- [ ] **Step 1: failing tests** — append (add `withDocument`-style helper locally, and a character-agent fixture matching the seed's real context):

```ts
async function docFixture(t: TestContext) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-passage-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const body = `${'Earlier prose. '.repeat(200)}Mara lit the lantern at dusk. ${'Later prose. '.repeat(200)}`;
  await fs.mkdir(path.join(dir, 'manuscript'), { recursive: true });
  await fs.writeFile(path.join(dir, 'manuscript/one.md'), body);
  await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify({ id: 'p', name: 'T', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    documents: [{ id: 'one', title: 'One', kind: 'manuscript', path: 'manuscript/one.md', order: 0 }, { id: 'two', title: 'Two', kind: 'manuscript', path: 'manuscript/one.md', order: 1 }] }));
  return { dir, body, doc: { kind: 'document' as const, id: 'one' } };
}
const spyProvider = (sink: { seen: string }): ModelProvider => ({ id: 'spy', complete: async (req: { messages: { content: string }[] }) => { sink.seen = req.messages.map((m) => m.content).join('\n'); return { text: 'ok', model: 'spy' }; } } as unknown as ModelProvider);

test('a passage note sends the quote with its surroundings, not the head of the document', async (t) => {
  const { dir, body, doc } = await docFixture(t);
  const start = body.indexOf('lantern');
  const thread = await createThread(dir, { target: doc, text: '@Muse why a lantern?', range: { start, end: start + 7, quote: 'lantern' } });
  const sink = { seen: '' };
  await respondAsMuse(dir, thread.id, agent('muse', 'muse'), spyProvider(sink));
  assert.match(sink.seen, /<passage[^>]*>[\s\S]*Mara lit the «lantern» at dusk\./);
  assert.ok(sink.seen.length < 6000, 'a window, not the document');
  assert.doesNotMatch(sink.seen, /(Earlier prose\. ){60}/);
});

test('a passage that can no longer be found is reported honestly with the original quote', async (t) => {
  const { dir, body, doc } = await docFixture(t);
  const start = body.indexOf('lantern');
  const thread = await createThread(dir, { target: doc, text: '@Muse still there?', range: { start, end: start + 7, quote: 'lantern' } });
  await fs.writeFile(path.join(dir, 'manuscript/one.md'), 'Completely rewritten.');
  const sink = { seen: '' };
  await respondAsMuse(dir, thread.id, agent('muse', 'muse'), spyProvider(sink));
  assert.match(sink.seen, /location could not be resolved/i);
  assert.match(sink.seen, /lantern/);
});

test('an agent restricted from future chapters can still read the document its own note is on', async (t) => {
  const { dir, body, doc } = await docFixture(t);
  const start = body.indexOf('lantern');
  const thread = await createThread(dir, { target: doc, text: '@Muse thoughts?', range: { start, end: start + 7, quote: 'lantern' } });
  const restricted = { ...agent('character', 'character'), context: { scope: ['selection', 'current_scene'], forbidden: ['future_chapters'] } } as unknown as AgentDef;
  const sink = { seen: '' };
  await respondAsMuse(dir, thread.id, restricted, spyProvider(sink));
  assert.match(sink.seen, /«lantern»/);
  assert.doesNotMatch(sink.seen, /Withheld/);
});
```

- [ ] **Step 2:** run — Expected: FAIL.
- [ ] **Step 3: implement** in `thread-reply.ts`:
  - `mayRead(dir, agent, target, options: { current?: boolean } = {})`: in the legacy `document` branch, `return !forbidden.has(doc.kind) && !(forbidden.has('future_chapters') && doc.kind === 'manuscript' && !options.current);`. For the card-thread call sites (`cardSnapshot`, `cardConnections`'s first check) pass `{ current: true }` when `target.kind === 'document'` and the target is the thread's own card (the explicit-access branch is unchanged). Linked cards and backlinks keep the strict default.
  - `passageBlock(dir, thread, agent)`: if `thread.anchor` and target is a document and `mayRead(..., { current: true })`: read the file via the manifest (as `cardSnapshot` does), `resolvePassageAnchor(content, thread.anchor)`; if resolved, `before = content.slice(Math.max(0, start - 1500), start)`, `after = content.slice(end, end + 1500)`, return `<passage document="TITLE" status="found">\n${before}«${quote}»${after}\n</passage>`; if not resolved, return `<passage document="TITLE" status="unresolved">\nThe passage's location could not be resolved (${status}); the original quote was:\n${thread.anchor.quote}\n</passage>`.
  - In `respondAsMuse`, when `thread.anchor` exists use `passageBlock` in place of the `<card>` body: build the card element as `<card kind="document" id=… label=…>\n${passageBlock}\n</card>`; skip the 6000-char document dump.
  - In `cardConnections`, ignore attachments that have an `anchor` when computing the document-level `tags` (`if (item.anchor) continue;` for the own-target branch).
  - Add `passage` to `escapeTag`'s list.
- [ ] **Step 4:** run `node --import tsx --test test/thread-reply.test.ts test/threads.test.ts` — Expected: PASS.
- [ ] **Step 5: commit** `feat: Muse sees a passage with its surroundings; document notes readable for restricted agents`.

### Task B4: Popover — document mode, passage quote, anchor status

**Files:** Modify `web/src/threads.ts`, `web/src/components/CardThread.tsx`, `web/src/styles/threads.css`; Test `web/test/threads-store.test.ts` (small)

**Interfaces:**
- Consumes: B1 `resolveThreadAnchors`, A5 `threadsForTarget(…, { anchored })`, `openNote`, `revealRange`.
- Produces: popover store `open(target, threadId?, range?)` carrying a pending range; document popover with **On passages** and **Whole document**.

- [ ] **Step 1: failing store test** — in `web/test/threads-store.test.ts` add: `create(target, 'hello', { range })` posts the range (stub `fetch`, capture the body, assert `JSON.parse(body).range.quote === 'lantern'`).
- [ ] **Step 2:** run — Expected: FAIL until `create` forwards `extra` (done in A5) — if A5 already forwards it, this test passes at once; in that case keep it as a regression test and note that in the ledger.
- [ ] **Step 3: implement** popover store: `open: (target, threadId?, range?) => set({ target, threadId: threadId ?? null, range: range ?? null, opener })`; `close` clears `range`. In `CardThread.tsx`:
  - `ThreadPopover` receives `range` from the store; when present, `composingNew` starts true and `send()` calls `create(target, body, { range })`; the header shows the quote (`<blockquote className="thread-quote">`).
  - For `target.kind === 'document'`: load the doc (`useStore.getState().loadDoc`), compute `resolveThreadAnchors(doc.content, passageThreads)`; render **On passages** (list of passage threads: quote (≤80 chars), status badge text: `found` / `moved` / `can't be found` / `matches more than once`, reply count; clicking calls `openNote(thread)`) and **Whole document** (threads without anchor, with the existing ‹ n/N › switcher limited to that group). The selected thread's messages and chips render below as today.
  - Anchored thread header always shows its quote with the status badge; if status is missing/ambiguous show the explanatory line "This passage can't be located in the current text; the original quote is kept."
- [ ] **Step 4:** CSS for `.thread-quote` (left border accent, italic, 12px, max-height 4.5em overflow hidden), `.thread-status`, `.thread-passages`.
- [ ] **Step 5: verify** `cd web && node --import tsx --test test/threads-store.test.ts && npx tsc --noEmit && npm run build`.
- [ ] **Step 6: commit** `feat: document popover with passage list, quote header, and honest anchor status`.

### Task B5: Editor **Note** button

**Files:** Modify `web/src/panes/EditorPane.tsx`

**Interfaces:**
- Consumes: B4 popover store (`open(target, undefined, range)`), `flushDoc`.

- [ ] **Step 1: implement** next to `connectSelection`:

```tsx
  const noteSelection = async () => {
    const el = ref.current;
    if (!el || doc?.recovery) return;
    const start = el.selectionStart; const end = el.selectionEnd;
    await useStore.getState().flushDoc(docId);
    const saved = useStore.getState().docs[docId];
    if (!saved || saved.dirty || saved.recovery) { useStore.setState({ error: 'Save or resolve the recovered document before adding a note.' }); return; }
    const quote = saved.content.slice(start, end);
    useThreadPopover.getState().open({ kind: 'document', id: docId }, undefined, end > start && quote.trim() ? { start, end, quote } : undefined);
  };
```

and a button after "Tag / link": `<button type="button" aria-label="Note on selection" title="Add a note on the selected text, or open this document's notes" disabled={Boolean(doc.recovery)} onPointerDown={(event) => event.preventDefault()} onClick={() => void noteSelection()}>Note</button>`. Import `useThreadPopover` from `../threads`.

- [ ] **Step 2: verify** `cd web && npx tsc --noEmit && npm run build`.
- [ ] **Step 3: commit** `feat: Note button in the editor for passage and document notes`.

### Task B6: Board — passage quote, jump, tag filter already in; combine rule

**Files:** Modify `web/src/panes/ThreadsPane.tsx`

- [ ] **Step 1:** in `NoteCard` show `thread.anchor` as `<blockquote className="thread-quote">` under the header; "Open card" already uses `openNote` (A5) so it lands on the passage. `canCombine` (A5) already enforces the passage rule; the hint text appears via the existing `board-hint`.
- [ ] **Step 2: verify** `tsc` + `build`.
- [ ] **Step 3: commit** `feat: passage quote on board notes`.

### Task B7: Slice B end-to-end, docs, full verification

**Files:** Modify `e2e/threads.spec.ts`, `docs/card-threads-2026-10-06.md`

- [ ] **Step 1: add e2e**:

```ts
test('a passage note is created from a selection, answered by @Muse, found from the # panel, and jumped back to after reload', async ({ page, projectId, request }) => {
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.fill('Mara lit the lantern at dusk. The harbour held its breath.');
  await page.getByRole('button', { name: 'Save', exact: true }).click().catch(() => {});      // flush; autosave also covers this
  await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(13, 20); });
  await page.getByRole('button', { name: 'Note on selection', exact: true }).click();
  const thread = page.getByRole('dialog', { name: /^Notes on / });
  await expect(thread.locator('.thread-quote')).toContainText('lantern');
  await thread.getByLabel('Add a note or ask Muse').fill('@Muse why a lantern?');
  await thread.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread.getByText(/Muse \(mock\) on "/)).toBeVisible();
  await thread.getByRole('button', { name: '+ Tag' }).click();
  await thread.getByLabel('New tag', { exact: true }).fill('imagery');
  await thread.getByRole('button', { name: 'Add', exact: true }).click();
  await page.keyboard.press('Escape');

  await page.reload();
  const board = await openNotesBoard(page);
  await board.getByRole('button', { name: 'Show all notes' }).click();
  await expect(board.locator('.thread-quote')).toContainText('lantern');
  await board.getByRole('button', { name: 'Open card' }).click();
  await expect(page.locator('.pane-editor textarea.draft')).toBeFocused();
  const selected = await page.locator('.pane-editor textarea.draft').evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));
  expect(selected).toBe('lantern');
});

test('after the text around a passage is edited the note still finds it; after the quote is deleted it says so', async ({ page, projectId, request }) => {
  const draft = page.locator('.pane-editor textarea.draft');
  await draft.fill('Mara lit the lantern at dusk. The harbour held its breath.');
  await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(13, 20); });
  await page.getByRole('button', { name: 'Note on selection', exact: true }).click();
  const thread = page.getByRole('dialog', { name: /^Notes on / });
  await thread.getByLabel('Add a note or ask Muse').fill('keep an eye on this');
  await thread.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread.getByText('keep an eye on this')).toBeVisible();
  await page.keyboard.press('Escape');
  await draft.fill('Intro added. Mara lit the lantern at dusk. The harbour held its breath.');
  await page.getByRole('button', { name: 'Note on selection', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /^Notes on / }).getByText(/found|moved/i)).toBeVisible();
  await page.keyboard.press('Escape');
  await draft.fill('Completely rewritten.');
  await page.getByRole('button', { name: 'Note on selection', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /^Notes on / }).getByText(/can't be found/i)).toBeVisible();
});
```

(Notes: the editor autosaves; if the first test finds the document dirty, wait for the save indicator used by other e2e specs, e.g. `e2e/connections.spec.ts`, before clicking Note. Phone-viewport check: reuse the phone test pattern, assert the document popover stays within 390px.)

- [ ] **Step 2:** run `PW_CHANNEL=chrome npx playwright test e2e/threads.spec.ts --reporter=line`; fix selectors, not product code, unless a real defect appears (failing unit test first).
- [ ] **Step 3:** update `docs/card-threads-2026-10-06.md` (Note button, passage list and statuses, tags/links on notes) and remove "passage-level notes" and "combining across cards" from "Not built yet" (replace with "gutter markers / inline highlights").
- [ ] **Step 4: full verification** — server suite, every web helper test file, `npx tsc --noEmit` in `web/`, `npm run build`, and the **full** Playwright suite (`PW_CHANNEL=chrome timeout 590 npx playwright test --reporter=line > /tmp/pw.txt`, ~8 minutes, run in the background and wait on `finished`). Expected: only the two known baseline failures.
- [ ] **Step 5: commit** `test: slice B e2e; docs`.

---

## Self-review

- **Spec coverage:** data fields and limits (A1, A2); validation incl. tolerant edits (A2); merge unions and same-passage rule (A2, A5); API (A3, B2); `resolveThreadAnchors` with moved (B1); editor Note button (B5); document popover with passages and statuses (B4); chip row (A6); `#` panel (A7); board (A6, B6); Muse (A4, B3); testing (every task + A8/B7). Out-of-scope items (gutter markers, inline highlights, cross-card combine, `#`-panel tagging) are not built.
- **Advisor points:** seed `future_chapters` belongs to the character agent, handled by the `current` option and a test with that exact context (B3); vanished tags tolerated (A2 tests); jump waits for doc + editor (`openNote`, A5); `moved` in the type (B1); same passage = quote+prefix+suffix (A1); `threadsForTarget` anchored split (A5); two slices each ending green (A8, B7); environment lessons in Global Constraints; opus review.
- **Placeholder scan:** UI tasks A6/A7/B4/B6 describe composition with concrete code for the non-obvious parts (`ThreadChips`, `NoteRow`, `openNote`, `noteSelection`); remaining JSX wiring follows the surrounding component patterns and is verified by tsc, build and e2e.
- **Type consistency:** `setConnections`, `samePassage`, `resolveThreadAnchors`, `threadsForTarget(…, { anchored })`, `notesTaggedWith`, `notesLinkingTo`, `noteSummary`, `openNote`, `useThreadPopover.open(target, threadId?, range?)` are used with the same names across tasks.
