# Media Desk and Living Atlas integration

**Status:** Proposed; application implementation has not started.
**Date:** 2026-09-17
**Decider:** Dennis Carroll

## Context

Muse is a personal writers' room organized around editable artifacts. Agents are
optional collaborators. A media canvas should be useful for arranging images,
video, and audio without running an agent or selecting a model provider.

The proposed Media Desk is a dedicated domain surface beside World Building.
That separation fits the current architecture: panes are views of project data,
and World Building's canvas positions belong to canon entities. Reference
collages and playback state have different meanings from atlas landmarks.

The repository already supplies:

- `web/src/atlasCamera.ts`: camera coordinates and tested pinch/zoom math.
- `web/src/panes/WorldPane.tsx`: atlas-specific pointer handling, node movement,
  map layers, relationships, and inspector behavior.
- `server/src/assets.ts`: managed, size-limited image uploads with container
  signature checks and generated filenames.
- `server/src/references.ts`: reference records with attribution, notes, images,
  and typed links to story records.
- `shared/connections.ts` and `server/src/connections.ts`: stable record links,
  tags, and manuscript passage anchors.
- `server/src/history.ts`: serialized project edits and session undo.
- `server/src/backups.ts`: validated portable archives and fresh-project restore.

## Proposed decision

Create Media Desk as its own workspace pane, with its own versioned canvas store.
Share camera and gesture primitives, asset delivery conventions, and typed
connection contracts with existing domains. Keep media-specific data out of
`world-profile.schema.json`.

"Shared schemas" means common primitives and references. A media canvas and a
world profile retain separate domain schemas. World positions describe places;
media positions describe an arrangement chosen by the writer.

### Storage and identity

Suggested project-relative layout:

```text
<project>.muse/
  media/
    canvases/<canvas-id>.json
  assets/
    images/<generated-id>.<image-extension>
    media/<generated-id>.<audio-or-video-extension>
  world/map.json
  connections/connections.json
```

- Use the existing `assets/` root, which already participates in backups.
  Avoid introducing a second `project_assets/` convention.
- Give canvases, node placements, and assets stable identities. Reusing one
  asset in two positions must not require copying its bytes.
- Use the atlas camera contract `{ x, y, scale }`; extract it into a shared
  module when the second surface consumes it.
- Persist node position, dimensions, label/accessible description, asset
  reference, and intentional playback preferences. Keep playing/paused state,
  hover, focus, and pointer gestures in browser state. Commit a resume position
  on deliberate save/pause boundaries, not on every playback tick.
- Store project-relative asset references. Build delivery URLs for the current
  project at the API/UI boundary so restored projects use their own assets.
- Define bounded node/edge collections, unique identities, finite coordinates,
  supported media kinds, valid dimensions, and existing edge endpoints in
  `schemas/media-canvas.schema.json` and runtime validation.
- Save through atomic replacement and the existing project edit queue. Include
  a stale-write check so two browser sessions cannot silently replace each
  other's canvas changes.

### Asset delivery

Use same-origin `/api/projects/:id/assets/...` URLs. Vite already proxies `/api`
to the runtime. `http://localhost:5178` addresses the phone itself when the
writer opens Muse on a phone.

Extend managed uploads with an explicit audio/video format and size policy.
Validate content as well as declared MIME type, generate filenames on the server,
and constrain file access to the selected project's managed assets. Reuse image
validation where appropriate.

Audio/video delivery needs byte ranges, correct content types, HEAD responses,
and sensible missing-file errors. The current image route reads the whole file
into memory; it is not the delivery contract to copy for large clips. Installed
Express `sendFile`/`send` support byte ranges, but the route must also handle
streaming errors and client disconnects correctly.

Do not silently widen global JSON upload limits. Media uploads need their own
bounded body or streaming boundary.

### Backups, undo, and asset lifetime

The current portable archive permits **50 MiB of saved project files** and
**80 MiB encoded JSON**. Even modest video collections can exceed those limits.
Choose and document a small-reference-clip policy for the first version, or
design a separate streaming archive milestone before promising large collections.
No export should silently omit a media file.

The backup allowlist currently has no `media/` directory. Add and validate the
canvas stores, verify referenced asset inclusion, and test restore under a new
project identity before exposing the feature in the UI.

Canvas edits should participate in session undo without taking a new video-byte
snapshot for every move or playback event. Removing a placement and deleting an
asset are separate operations. Existing image garbage collection must account
for Media Desk references before sharing images with this new surface.

### Links and navigation

Use existing typed record identities: canon, plot, scene, theme, document, and
the other supported connection targets. Add a media target deliberately across
server validation, frontend navigation, and resource catalogs.

The proposed `backlinks: { worldLandmarkId, plotBeatId, characterIds }` is not the
current generic Connections contract. Avoid maintaining the same relationship
independently in both Connections and canvas JSON. Derive backlink previews from
one authoritative relationship store.

An atlas/plot/character preview should navigate using a stable canvas/node
identity. Media Desk resolves the node's current coordinates and centers it;
saved pixel coordinates alone become stale after the writer moves the node.
Missing or removed targets need a clear unavailable state.

Media-to-media diagram edges can remain part of the canvas artifact. Their
labels describe the writer's visual arrangement and do not automatically create
canon facts or plot causality.

### Rendering and playback

Extract `SpatialCanvas` and `useSpatialControls` around proven atlas behavior:
camera transforms, pan/pinch/wheel input, coordinate conversion, and gesture
cleanup. Keep landmark and media renderers domain-specific. Preserve the existing
atlas tests during extraction.

Use the project's existing CSS and etched-glass tokens. The current frontend
does not use Tailwind.

The supplied node sketch still needs:

- Real drag handlers that call `onUpdatePosition`, convert screen deltas through
  the camera scale, and handle pointer cancellation.
- Keyboard movement and explicit focus handling. `tabIndex` alone supplies
  focusability, not arrow-key behavior.
- An audio renderer; its current fallback renders audio as an image.
- Height/aspect-ratio behavior; supplied `dimensions.height` is unused.
- Predictable stacking and selection for overlapping nodes.
- Playback lifecycle handling for pane minimization, workspace changes, and
  unmounting. Focus moving into a video's own controls must not pause it through
  a bubbling parent blur handler.

Recommend explicit playback controls as the default. Muted preview-on-selection
can be optional. Keyboard navigation should not unexpectedly start playback.
Pausing a video stops playback; it does not by itself guarantee that decoded
frames and decoder resources are immediately released.

### Optional agent access

Media remains usable without agents. Future Agent Studio integration must use
the existing selected-resource permission model and distinguish metadata access
from permission to send media bytes or extracted frames to a provider.

Canvas coordinates and filenames do not establish visual understanding. Claims
about lighting, scene continuity, or video content require an explicit supported
inspection/transcription path and attributable evidence. Canvas metadata alone
must not be presented as such evidence.

## Alternatives considered

| Option | Benefit | Cost |
| --- | --- | --- |
| Dedicated Media Desk with shared primitives | Clear purpose and independent artifact; reusable interaction code | Requires explicit navigation, persistence, and cross-domain links |
| Media mode inside World Building | Reuses the visible atlas surface immediately | Mixes reference arrangements with world entities and atlas controls |
| Spatial view of References | Reuses existing attribution and story links | Current reference model supports image/quote/link, so audio/video and placement semantics still need design |

Dedicated Media Desk is the proposed direction. References remains a related
catalog surface; reuse its attribution and linkage concepts where appropriate.

## Implementation order and acceptance checks

1. **Runtime foundation:** shared primitive types, versioned canvas contract,
   validated managed media uploads/delivery, canvas persistence, stale-write
   handling, backup/restore, and undo integration.
2. **Usable Media Desk:** upload/place/select/move/resize/remove placements,
   image/video/audio renderers, accessible keyboard controls, and shared spatial
   interaction code with preserved atlas behavior.
3. **Cross-domain navigation:** derived previews in story records and stable
   node-focused navigation in both directions.
4. **Optional agent inspection:** explicit resource selection and supported
   media interpretation, after the manual workflow is useful.

Runtime work comes first, with tests in the same increment. Browser dragging
tests become meaningful once the Media Desk interaction exists.

| Boundary | Acceptance evidence |
| --- | --- |
| Asset upload/delivery | Accepted formats round-trip; wrong formats, unsafe paths, missing files, and oversized requests fail; HEAD and byte ranges behave correctly |
| Canvas save | Reload retains geometry/labels/edges; invalid endpoints are rejected; concurrent stale edits cannot overwrite current work |
| Portable artifact | Backup/restore retains exact media bytes and links under a new project ID; oversized archives fail visibly |
| Asset ownership | Removing a reference or placement cannot delete an asset still used elsewhere |
| Spatial interaction | Dragging at different zoom levels, touch pinch/pan, keyboard nudges, cancellation, and overlapping-node selection preserve intended positions |
| Playback | Native controls remain usable; hidden/minimized panes stop playback; keyboard focus does not unexpectedly start media |
| Navigation | Story-record preview opens the correct current node after moves, reload, and restore |
| Agent independence | Complete manual workflow works with the mock provider and no agent calls |

The implementation scope and first-version media size policy remain open for
selection. This note records the proposed architecture and repository findings;
it does not claim that Media Desk routes, storage, or UI have shipped.
