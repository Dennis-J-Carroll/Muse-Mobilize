# Premise Builder — Design

Date: 2026-09-28 · Branch: `feat/premise-builder` · Status: approved in conversation, awaiting spec review

## Intent

**What Dennis said:** the Premise Builder should serve both purposes per project — sharpen the premise of a book already underway (e.g. *King's Blood*) *and* spark new ideas. Muse's what-ifs should arrive as cards inside the builder. The builder should be its own pane (approach A).

**Outcome:** each project holds one *working premise* that every agent reads, plus a scratch list of *variants*. A writer can compose a premise from logline slots, write it freehand, ask Muse for three what-if twists, and keep, promote, or discard them without leaving the pane.

**Success looks like:**
- Opening "Premise Builder" from the Story Idea card menu shows the project's working premise, slots, and variants, and survives reload.
- "Ask Muse for 3 what-ifs" returns three cards within one provider call; each can be kept, promoted or discarded.
- Promoting never loses text: the previous working premise moves into the variants list.
- After a premise is set, any agent run includes it in context.
- Works fully offline with the mock provider (so e2e tests need no API key).

**Out of scope (v2):** canon contradiction check; turning a variant into a new project; premise history/versions beyond the variants list.

## Architecture

Follows the existing per-project JSON store pattern (`goals.ts`, `references.ts`):

```
web: Sidebar (Story Idea card) → openPane('premise') → PremisePane
       ├─ GET/PUT /api/projects/:id/premise        (store)
       └─ POST    /api/projects/:id/premise/what-ifs (provider call, returns cards, stores nothing)
server: premise.ts (read/write/normalize) · premise-what-ifs.ts (prompt + parse)
        context.ts adds the working premise to every agent's context
```

### Data — `premise/premise.json`

```ts
interface PremiseSlots { protagonist: string; want: string; obstacle: string; stakes: string; twist: string }
interface PremiseVariant { id: string; text: string; source: 'manual' | 'muse'; createdAt: string }
interface PremiseStore {
  version: 1;
  working: string;            // the one premise agents read; may be empty
  slots: PremiseSlots;
  variants: PremiseVariant[]; // newest first, capped at 50 (oldest dropped)
}
```

- Missing file → empty store (all strings empty, no variants).
- `writePremise` normalizes untrusted input: trims strings, caps `working` at 1,200 chars and each variant at 600, drops variants with empty text, assigns ids/timestamps to new ones, and dedupes identical text. Writes are atomic (temp file + rename), like `persistGoals`.
- `premise` is added to the backup store list in `index.ts` (`premise: 'premise/premise.json'`), so project backups and restores include it.

### Routes (`server/src/index.ts`)

| Route | Behavior |
|---|---|
| `GET /api/projects/:id/premise` | `{ premise: PremiseStore }` |
| `PUT /api/projects/:id/premise` | Whole-store replace after normalization; emits `premise.updated` `{ variants, hasWorking }`; returns `{ premise }` |
| `POST /api/projects/:id/premise/what-ifs` | Body `{ basis: string }` (working premise or composed logline). 400 if `basis` is empty. Resolves the default provider, calls `complete()` once, and returns `{ whatIfs: string[] }` (exactly 3 when parsing succeeds, fewer if the model returned fewer). Stores nothing. Emits `premise.what-ifs` `{ count }`. Provider errors surface as the normal error toast. |

### What-if generation (`server/src/premise-what-ifs.ts`)

- The system prompt asks for three escalating "what if…" variants of the basis. Each is one or two sentences that keeps the protagonist and changes want, obstacle, stakes or twist. The output format is `<what-if>…</what-if>` × 3.
- `parseWhatIfs(text)` reads the `<what-if>` blocks. If there are none, it falls back to numbered or bulleted lines. It trims, drops empties, and returns at most 3. Pure function, unit-tested.
- The prompt carries the marker `premise-what-ifs`. `mock.ts` recognizes it and returns three deterministic variants built from the basis: its first sentence truncated to 80 characters, followed by fixed twists ("…but the ally is the obstacle?", "…but winning costs the thing they wanted?", "…but the stakes were a lie?"). That lets e2e run offline and assert exact text.

### Agent context (`server/src/context.ts`)

When the working premise is non-empty, `buildContext` pushes a `premise` section for **every** agent, regardless of scope. It's capped at 1,200 chars, so it's cheap, and it's the project's shared truth. The per-agent scope config isn't changed, because existing agent YAML predates this and shouldn't need edits. A missing store is skipped silently.

### Web

- `types.ts`: add `'premise'` to `PaneType`; add the store types.
- `api.ts`: `premise(id)`, `updatePremise(id, store)`, `premiseWhatIfs(id, basis)`.
- `store.ts`: `premise: PremiseStore | null` is loaded with the other stores in `openProject`. `updatePremise(next)` does an optimistic set, then a PUT, and rolls back with an error toast on failure (mirrors `updateGoals`).
- `Sidebar.tsx`: Story Idea's `soon('Premise Builder')` becomes a real item that opens `openPane('premise', { title: 'Premise', region: 'main', focus: true })`.
- `WorkspaceCanvas.tsx` `PaneBody`: `premise → <PremisePane />`.
- `panes/PremisePane.tsx`, top to bottom:
  1. **Working premise.** A textarea. It saves on blur and on Ctrl+Enter, with an "unsaved" dot while dirty; a recoverable draft uses `useRecoverableDraft('premise','working',…)`, like the Goals forms. An empty state invites filling the slots.
  2. **Logline slots.** Five labeled inputs, saved on blur. Beneath them is a live composed sentence: "When {protagonist} wants {want}, {obstacle} stands in the way. If they fail, {stakes}. But {twist}." Empty slots drop out. The composer is a pure function `composeLogline(slots)` in `web/src/premise.ts`, unit-tested. Two buttons act on the composed sentence: **Use as working premise** (moves the old working premise into variants) and **Save as variant**.
  3. **What-ifs.** An **Ask Muse for 3 what-ifs** button uses the working premise, or the composed logline if there's no working premise, and is disabled when both are empty. A busy state shows while the call runs. Results render as cards with **Keep** (becomes a `muse` variant), **Promote** (becomes working; the old working becomes a variant) and **Discard**. Pending cards are session-only: they're lost on reload, which is intended.
  4. **Variants.** The saved list, newest first, with source badges (manual/muse) and **Promote** / **Delete**. Delete asks for confirmation only when the text is over 200 chars.
- Promotion logic is a pure function `promote(store, text)` in `web/src/premise.ts`. It returns the new store: `working = text`; the previous non-empty working premise is pushed as a variant if it isn't already present; the promoted text is removed from variants. Unit-tested.
- Styling matches the story-tool panes (`story-tools.css`), with the same glass cards and buttons. It must stay usable on phones: the 390px check in the E2E spec guards it.

## Error handling

- Load failure: the pane shows an inline error with a Retry button; other panes are unaffected.
- Save failure: optimistic state rolls back, an error toast appears, and the recoverable draft keeps the typed text.
- What-if failure (provider unavailable, timeout, or nothing parseable): a toast with the provider message; the button re-enables; nothing is stored.
- Project switch mid-request: stale responses are ignored, using the existing `projectSession` guard pattern.

## Testing

- **Server unit** (`node --test`): `writePremise` normalization (caps, dedupe, empty drops, missing file), `parseWhatIfs` (tags, numbered fallback, >3 truncation, garbage → []), and context injection (premise present, absent, over-long).
- **Web unit:** `composeLogline` and `promote`.
- **E2E** (`e2e/premise.spec.ts`, mock provider): open from the Story Idea card → fill slots → use as working premise → reload persists → ask for what-ifs → 3 cards → keep one, promote one → the old working premise appears in variants → at a 390px viewport the pane has no horizontal overflow and its buttons stay inside the viewport. (Context injection is covered by the server unit test, not e2e.)
- `tsc` clean. The full suite passes, apart from the known `references.spec.ts:142` flake.
