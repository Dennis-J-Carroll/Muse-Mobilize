# Muse · Mobilize

> A writers' room you can assemble around the page.

A local-first, artifact-centered multi-agent creative workspace. The manuscript
is a plain Markdown file on your disk; agents orbit it and propose reviewable
patches. Nothing is written into your draft without your explicit accept.

## Run it

```bash
npm install
npm run dev
```

Then open **http://localhost:5177** (Vite opens it for you).

Two processes start:

| process | port | what it is |
|---|---|---|
| `web` | 5177 | Vite + React workspace shell |
| `server` | 5178 | project runtime: filesystem, events, agents, model providers |

No API key is needed to try it. The default provider is **Mock (offline)**,
which walks the whole path — it comments on your real selection, raises a real
consultation with another agent, and proposes a real patch anchored to your text.

## The golden path

1. A project is created for you on first run, seeded with a short chapter.
2. Highlight a few sentences in the centre pane.
3. The bar above the draft lights up: **Ask → Muse / Continuity / Editor / Architect / Kiala**.
4. The agent reads only its declared scope, and may consult another agent —
   you see the consultation, the question, and the reply.
5. A **Proposed revision** card appears: before, after, and the reason.
6. **Accept**, **Reject**, or **Modify** the replacement text and then accept.
7. The change lands in the draft, a snapshot is taken, and the activity log records it.
8. Keep typing. Nothing blocks.

## Using a real model

Open **Settings** (the ⋮ button top-left, or the cloud icon top-right):

- **Anthropic** — paste an API key. Stored in `~/.muse-mobilize/settings.json`
  on your machine only, never inside the project folder, never in git.
- **Ollama** — point at `http://localhost:11434` and name a pulled model.
  The dot next to the provider shows whether it is actually reachable.

An agent whose file says `provider: default` follows this setting. Agent
identities never change when the engine does.

## Your project on disk

```
~/MuseProjects/<your-story>.muse/
├── project.json
├── manuscript/chapter-01.md      ← plain Markdown, open it anywhere
├── outline/outline.md
├── notes/scratchpad.md
├── canon/
│   ├── canon.json                ← portable entities, facts, statuses, evidence
│   └── characters/
├── plot/plot.json                ← branching through-line, folios, and typed edges
├── agents/*.yml                  ← edit these to change an agent
├── workspaces/*.json
└── .muse/
    ├── events.jsonl              ← append-only creative history
    └── snapshots/                ← taken before every accepted patch
```

Edit `agents/*.yml` in any text editor and reload the browser: scope,
permissions, budgets and system prompts are all yours.

## Editing an agent

```yaml
context:
  scope: [selection, current_scene, notes]   # what it may see
communication:
  may_contact: [continuity, architect]       # who it may consult
budget:
  max_steps: 3                               # consultation rounds, enforced by the runtime
```

Permission is checked in both directions before any agent-to-agent contact, and
a refused contact is written to the event log.

## Characters workspace

Click **Characters** to bring cast workspace into focus. It is a domain surface,
not another launcher menu:

- Connected cast line for selecting active story characters.
- Focused dossier with story function, physical presence, goals, fears, and canon trail.
- Vision, Audio, and Proximity sensory bands with hierarchical indicators.
- Category filters such as `active cast`, `council`, or `protagonist`.
- Edge drawer for creating or revising character profiles and reference-image URLs.
- Direct handoff to matching character agent or Continuity canon.

Character profile contract lives at `schemas/character-profile.schema.json`.

## World Building workspace

Click **World Building** to open the Living Atlas directly. Canvas mode is the
default domain surface instead of another launcher menu:

- Pan and zoom an open spatial field; drag landmarks to persistent positions.
- Add places, factions, objects, events, rules, and lore through an edge drawer.
- Record era, atmosphere, story significance, categories, aliases, and summary.
- Draw relationship threads backed by proposed canon facts.
- Use **Pages** for an editorial atlas index and open bound lore documents.
- Move focused landmarks with arrow keys; hold Shift for larger steps.

World profile contract lives at `schemas/world-profile.schema.json`.

## Plot Outline workspace

Click **Plot Outline** to open a braided story current directly. It is a
narrative-order surface rather than a card board or spatial world map:

- Arrange beat, turn, reveal, climax, and resolution knots along telling order.
- Expand manuscript strips in place or open a focused folio with goal, conflict,
  stakes, outcome, and planning notes.
- Draw typed `sequence`, `branch`, `merge`, and `cause` threads between beats.
- Bind a beat to a manuscript or planning document for direct page handoff.
- Drag knots or move them with arrow keys; hold Shift for larger steps.
- Add up to three optional World Atlas anchors per beat. World pins stay hidden
  until requested; Atlas backlinks appear only on referenced landmarks.

Plot graph contract lives at `schemas/plot-graph.schema.json`.

## Canon and continuity

Use **canon trail** inside Characters or World Building workspace. Plot Outline
may reference canon-backed World landmarks without copying their data.

- Create stable character, location, organization, object, event, rule, or lore entities.
- Capture facts as `idea`, `proposed`, `established`, `canonical`, `retconned`, or `deprecated`.
- Highlight manuscript text before capturing a fact to attach exact evidence.
- Promote facts explicitly; new facts default to `proposed`.
- Continuity receives status-labelled canon and privileges `established` and `canonical` facts.

Canon stays in readable JSON inside story project. Older projects need no migration;
missing `canon.json` behaves as empty canon until first entity or fact is captured.

## Tests

```bash
npm test
```

Covers canon persistence, character profiles and sensory metadata, world
profiles and canvas coordinates, branching plot persistence, sparse World
anchors, stable relationship edges, fact promotion, evidence-aware context,
validation, agent output parsing, patch anchoring, and stale-patch refusal.

## What is not built yet

Semantic retrieval, watchers, Writers' Room orchestration, frozen readers,
version-control branches, plugins, and desktop packaging. The seams are in
place for all of them; see `muse-mobilize-handoff/MUSE_MOBILIZE_HANDOFF.md` §32.
