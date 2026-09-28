# Constraint Generator — Design

Date: 2026-09-28 · Branch: `feat/constraint-generator` · Status: approved in conversation, awaiting spec review

## Intent

**What Dennis said:** the generator serves both uses, weighted **3:2 toward unsticking a live scene** over generic writing exercises. Rolled constraints get **pinned over the draft** being written. Approach A: a local deck plus the project's canon, with no AI in v1.

**Outcome:** from the Story Idea card, or one tap in the writing toolbar, a writer rolls five constraints. Three are drawn from their own canon (who, where, what) and two from a built-in craft deck. Any slot can be locked or rerolled, and the set pins as a slim banner above the manuscript. Each constraint can be ticked off as it's met.

**Success looks like:**
- A roll is instant (no network call to generate) and works offline and on the phone.
- With canon present, the point-of-view, place and anchor slots name real characters, locations and objects or rules from the project. With a canon type empty, that slot falls back to the built-in deck, so a roll never shows a blank slot.
- Locked slots survive "Reroll all", and rerolling one slot never returns the same text it replaces (when an alternative exists).
- A pinned set shows above every manuscript page in the project, on any device, and survives reload. Ticks and dismissal persist.

**Out of scope (v2):** custom user constraints, "Ask Muse to sharpen", roll history, timed sprints.

## Architecture

```
web: constraints.ts (pure: deck + rollSlot/rollAll)  ← canon from the store
     ConstraintsPane (Story Idea menu)  ─┐
     🎲 in writing toolbar (roll + pin) ─┼→ store.updateConstraints → PUT /api/projects/:id/constraints
     PinnedConstraints banner (EditorPane, manuscripts) ─┘
server: constraints.ts (read/write/normalize) → constraints/constraints.json
```

Generation lives entirely in the browser: the canon is already loaded there, and it keeps rolls instant. The server only stores the pinned set, so it follows the writer across devices.

### Data — `constraints/constraints.json`

```ts
type ConstraintSlot = 'pov' | 'place' | 'anchor' | 'restriction' | 'pressure';
interface ConstraintItem { slot: ConstraintSlot; text: string; done: boolean; entityId?: string }
interface ConstraintStore {
  version: 1;
  pinned: { id: string; pinnedAt: string; items: ConstraintItem[] } | null;
}
```

- Missing file → `{ version: 1, pinned: null }`.
- `writeConstraints` normalizes untrusted input. It keeps only known slots, trims `text` and caps it at 200 chars, drops items with empty text, allows at most one item per slot (in slot order `pov, place, anchor, restriction, pressure`), coerces `done` to boolean, and keeps `entityId` only if it's a non-empty string of at most 80 chars. A `pinned` with no surviving items becomes `null`. `id` and `pinnedAt` are assigned when missing. Writes are atomic (temp file + rename).
- Registered in the `index.ts` undo-scope store map as `constraints: 'constraints/constraints.json'`, labeled "Edit constraints". Also added to the `backups.ts` store list and root directories, so it's undoable and included in backups.

### Routes

| Route | Behavior |
|---|---|
| `GET /api/projects/:id/constraints` | `{ constraints: ConstraintStore }` |
| `PUT /api/projects/:id/constraints` | Whole-store replace after normalization. Emits `constraints.updated` `{ pinned: boolean, done, total }`. Returns `{ constraints }`. |

### Rolling — `web/src/constraints.ts` (pure, unit-tested; types-only imports)

- **Slot sources:**
  - `pov` ← canon `character`: "Tell it from {name}'s point of view."
  - `place` ← canon `location`: "Set it in {name}."
  - `anchor` ← canon `object`, else `rule`. For an object, one of: "{name} must change hands.", "{name} is lost, broken, or taken.", "Someone lies about {name}." For a rule: "The scene must test a rule: {name}."
  - `restriction` ← built-in deck.
  - `pressure` ← built-in deck.
  - Canon slots fall back to a small built-in deck for the same slot when their canon type is empty. For example, pov falls back to "Tell it from the point of view of whoever has the most to lose.", and place to "Move the scene somewhere it has never been."
- **Built-in decks:** about 20 restrictions (no dialogue tags; one room only; under 300 words; present tense; no adverbs; only dialogue; a single paragraph; no word "said"; start mid-action; …) and about 20 pressures (someone lies; a secret surfaces; end on an unanswered question; the weather turns; someone leaves early; an object breaks; a promise is broken; …), plus about 6 fallbacks per canon slot.
- `rollSlot(slot, canon, avoidText, rng)` returns a `ConstraintItem` with `done: false` and `entityId` set for canon picks. It never returns `avoidText` when another option exists.
- `rollAll(canon, current, locked, rng)` keeps locked slots from `current`, rolls the rest, and returns all five in slot order.
- `rng` is injectable (defaulting to `Math.random`), so tests are deterministic.
- The 3:2 weighting comes from the slot mix itself: three canon slots and two deck slots.

### Web

- `types.ts`: add the constraint types, and `'constraints'` to `PaneType` (also `desks.ts` allowed types, default title "Constraints", region `main`).
- `api.ts`: `constraints(id)`, `updateConstraints(id, store)`.
- `store.ts`: `constraints: ConstraintStore | null`. `loadConstraints()`, and an optimistic, queued `updateConstraints(next)` with rollback on failure (same shape as `updatePremise`). Undo reloads the store when `constraints/constraints.json` is among the restored files. The store is reset on project switch, and canon is loaded on demand when rolling, via the existing `loadCanon` if `canon` is null.
- `Sidebar.tsx`: `soon('Constraint Generator')` → opens `openPane('constraints', { title: 'Constraints', region: 'main', focus: true })`.
- `panes/ConstraintsPane.tsx`: five slot rows, each with a label, the constraint text, a lock toggle (`aria-pressed`) and a reroll button. Below them are **Reroll all** (unlocked slots) and **Pin to draft**, which replaces the pinned set with `done: false` on every item and then docks the generator into the Tools drawer, so the manuscript and its banner come forward. The pane opens with the pinned set if there is one, otherwise with a fresh roll. The rolled set lives in pane state until pinned. A status line reads "Pinned over your draft" or "Not pinned".
- `components/PinnedConstraints.tsx`: rendered in `EditorPane` for manuscripts, between the toolbar and the draft, and visible even when writing tools are folded. It's a slim row of chips, each with a checkbox (ticking toggles `done` and persists), plus a small **Reroll** (rerolls not-done items and keeps done ones) and **×** (unpin at once, with no confirmation, since Undo restores it). In focus mode it stays, compact. It's one row at every width; chips that don't fit scroll horizontally, so the banner never grows taller than one row.
- Writing toolbar: a **🎲** button labeled "Roll constraints". It rolls all five (no locks), pins them, and returns focus to the draft.
- Styles: `story-tools.css` for the pane and `writing-page.css` for the banner and dice button. Colors come from the existing tokens.

## Error handling

- Load failure: the pane shows an inline error with Retry, and the banner simply doesn't render.
- Save failure: optimistic state rolls back, with an error toast "Constraints not saved: …".
- Canon still loading when rolling: the roll waits for `loadCanon()`. If canon fails to load, canon slots use the fallback deck and a notice explains why.

## Testing

- **Server unit:** `writeConstraints` normalization (unknown slots, caps, one per slot, order, empty → null, done coercion, missing file).
- **Web unit:** `rollSlot` (canon pick with entityId, fallback when empty, never repeats `avoidText`, anchor prefers object and falls back to rule) and `rollAll` (locks kept, slot order, all five present). A seeded rng makes both deterministic.
- **E2E** (`e2e/constraints.spec.ts`): create a character, location and object through the canon API → open from the Story Idea card → the three canon slots name those entities → lock place, reroll all → place unchanged → pin → the banner shows 5 chips above the manuscript → tick one → reload → the tick and pin persist → the toolbar 🎲 replaces the pin → unpin removes the banner. A 390px check covers the banner and pane staying inside the viewport.
- `tsc` clean, production build clean, full e2e passing.
