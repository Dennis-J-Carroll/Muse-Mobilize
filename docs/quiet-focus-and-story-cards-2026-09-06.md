# Quiet writing focus and layered story cards

## Controls

- Enter **Focus** from a manuscript. **Hide controls** removes the title,
  appearance controls, toolbar, and font notices from the writing surface.
- The small feather button restores controls. This preference persists in this
  browser; it does not hide controls in the normal workspace or change prose.
- **Fullscreen** requests browser fullscreen separately, including body-portaled
  cards. **Restore browser** brings browser chrome back without leaving Muse
  writing focus. Unsupported or denied requests show a fallback message.
- **Story cards**, or **Alt+Shift+K** while writing focus is active, opens record
  lookup. The shortcut works with controls hidden. Ctrl+Shift+K is deliberately
  not used because Firefox reserves it for Web Console.
- Search character/world names and aliases/categories, plot and scene titles,
  theme names/motifs, reference titles/image tags, and milestone titles.
- Pull a card into its existing draggable editor. Previously open editors also
  appear under **Open editors · session drafts**, including unsaved new cards.
- Escape or the card's **Return to writing** button docks the current card and
  restores the manuscript's selection. Saving uses the same API and form as the
  regular workspace. No duplicate form is created for the same record.
- Escape in the picker dismisses the picker only. Escape with no app layer
  returns to the original workspace unless browser fullscreen owns that key.

## Browser boundary

Muse cannot suppress browser security controls. Native Escape may restore browser
chrome before the page receives a key event; another Escape can then dismiss the
app card/picker. Browser fullscreen exit never intentionally clears writing focus.
The visible card control is always available if the browser consumes Escape.

Fullscreen requests use the document root, not the manuscript element, so all
editor portals and notifications share the fullscreen tree. Requests require a
user gesture; no automatic fullscreen request runs on reload.

References: [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API),
[Firefox keyboard shortcuts](https://firefox-source-docs.mozilla.org/devtools-user/keyboard_shortcuts/index.html).

## State and scope

Writing focus and layer selection live in presentation state. Neither changes
workspace geometry, document contents, scene order, or canon status. Only the
chosen editor becomes visible over focus; other mounted drafts remain intact.
Focus layers trap keyboard Tab and return focus to the existing textarea.

The later writing-trust slice adds browser-local form recovery. Escape and Close
preserve recoverable fields; explicit Cancel discards them. Reopen the same form
after reload. Save fields before exporting a portable project backup. Saved Desks
remain layout records, not draft backups.

Shared tags, passage annotations, backlinks, and `!#` commands now reuse these
editor entry points and layer rules. See [writing trust and connections](writing-trust-and-connections-2026-09-06.md).
The [KingsBlood mapping](kingsblood-mobilize-preview-2026-09-06.md) remains a read-only import proposal.

## Verification

Final gate: **48/48 Chromium scenarios pass**, **25 web helper tests**, **13 server
test files**, production build, server/e2e typechecks, and diff check pass.

New browser scenarios cover hidden controls/selection/reload/phone layout,
fullscreen entry/exit/denial, layered Escape, keyboard lookup, parked draft reuse,
modal Tab behavior, and all seven record-editor save paths over the manuscript.
Tests use isolated temporary projects on 5277/5278, not the live story.

Native Firefox/OS fullscreen Escape, browser toolbar reveal, mobile keyboards,
and prolonged writing comfort still need hands-on acceptance. Headless Chromium
tests cannot prove operating-system chrome behavior.

Try: Focus → Fullscreen → Hide controls → Alt+Shift+K → choose a story card →
edit → Escape → resume writing.
