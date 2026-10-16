# Writing reliability: five-session evidence log

Status: ready for real writing sessions. No sessions or friction findings have been recorded. Automated recovery and transfer tests are evidence about those operations, not evidence that every writing workflow is reliable.

Use your normal project and writing habits. Each session lasts at least 30 minutes. Keep a verified portable backup before the first session. Do not deliberately risk live work to reproduce a suspected loss; preserve what remains and use a copy for diagnosis. No keystroke recording or prose telemetry is needed.

## Sessions

| Session | Focus | Date / duration | What to check | Observations |
| --- | --- | --- | --- | --- |
| 1 | Drafting and reopening | Pending | Write, wait for save, reopen the same document; confirm latest text. | Pending |
| 2 | Scene cards and manuscript | Pending | Link planning cards to manuscript; move between them without losing writing context. | Pending |
| 3 | Revision and undo | Pending | Revise a passage; undo/redo expected changes; reopen and compare saved result. | Pending |
| 4 | Research and return | Pending | Consult Sources/notes, then return to the intended prose and location. | Pending |
| 5 | Publication check | Pending | Export a selected edition, import into a new Studio slot, inspect order/text/images and standalone reader. | Pending |

## Friction entry template

Copy one entry per problem. Short descriptions suffice; include private prose only if you choose.

- Session / time:
- Task:
- Expected behavior:
- Actual behavior:
- Reproduction steps:
- Recurrence (including other sessions):
- Time lost:
- Severity (data loss / blocked / disruptive / minor):
- Workaround and recovery cost:
- Evidence (optional screenshot, error, document ID, app version):

## Choosing the next three fixes

1. Investigate any reproducible data loss or false-save indication first.
2. Prioritize problems repeated in at least two sessions.
3. Rank the rest by frequency, disruption and recovery cost.

After observations exist, write up to three bounded fix specifications. Each needs the reproduction, actual/expected behavior, affected component, acceptance test, scope boundaries and recovery implications. If fewer than three findings have evidence, report fewer; do not invent work to fill the list.

## Fix specification template

- Finding and supporting session IDs:
- Reproduction:
- Expected result:
- Proposed change:
- Acceptance test:
- Included scope:
- Excluded scope:
- Data/migration risks:

Scheduled backups, cloud sync, bidirectional Studio updates, automatic scene splitting and broad redesign remain deferred.
