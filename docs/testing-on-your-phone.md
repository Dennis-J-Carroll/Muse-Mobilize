# Test Muse-Mobilize on your phone

Use Safari on iPhone or Chrome on Android. Muse currently uses React DOM, Vite,
and a Node API; it is not an Expo/React Native project. Expo Go does not directly
run this application. Native packaging or a PWA can be considered later, after
the browser experience is comfortable.

## Start

1. Connect the computer and phone to the same trusted home Wi-Fi. The computer
   can also use Ethernet on that same router. Avoid an isolated guest network.
2. If Muse is already running in a terminal, stop that process with **Ctrl+C**.
   Both launch commands use ports 5177 and 5178; do not run them simultaneously.
3. In a terminal on the computer, run:

   ```bash
   cd /home/dennisjcarroll/Desktop/creative/Muse-Mobilize
   npm run dev:phone
   ```

4. Open the **Network** URL printed by Vite in your phone's browser. For this
   computer, the Wi-Fi address observed on September 13, 2026 was
   **http://192.168.1.4:5177**. Use the current printed URL if the address changes.
   Do not enter `localhost` on the phone: that refers to the phone itself.
5. Keep the terminal open and the computer awake. **Ctrl+C** stops the phone
   server when you finish. For normal computer-only frontend access, use
   `npm run dev` again.

`dev:phone` enables Vite's LAN listener only for that run. Both processes stop
if either exits. The browser uses Vite's existing `/api` proxy; you do not need
to configure API URLs or provider keys on your phone.

## Data and access

The phone opens the same saved projects as the computer. Changes save on the
computer. Create a **Phone test** project from the project menu for experiments,
and use the **Mock (offline)** provider to avoid model charges.

Unfinished form recovery and Saved Desks are browser-local. They will not follow
you from the computer browser to the phone; save forms first. This is live access
to the computer, not phone storage, offline operation, or cloud sync. Avoid editing
the same document in both browsers at once; simultaneous editing is not covered
by this audit.

**Use a trusted private network. Muse's development API has no login; devices
that can reach the server can access or change project data. Do not forward these
ports through your router or publish this server through a public tunnel.**

## Ten-minute hands-on check

1. Open **Phone test**. Swipe the tool rail horizontally and visit Characters,
   Scenes, Sources, and Goals. Scroll inside each tool and rotate the phone.
2. Open **Drafting** and tap into the manuscript. On narrow phone screens,
   navigation and workspace controls collapse into the **Workspace** button.
   Tap it to reopen them, or collapse them manually before writing. Check that
   reopening preserves your text and selection. For a full-screen page, use
   **Focus → Hide controls**. Type several paragraphs with the software keyboard;
   check line spacing on both Paper and Glass, and that opening or closing the
   keyboard keeps the draft and controls reachable. Try autocorrect, dictation,
   selection, copy, and paste.
3. Hide the keyboard, reveal controls using the feather, then choose
   **Back to workspace**. Reload and check that the saved text remains.
4. Open **Story cards** in Focus. Create or edit a character, send the form to
   the side, recall it, and save. Check that keyboard and footer actions remain
   reachable in portrait and landscape.
5. In References, choose an image from the phone gallery. Add a caption and save.
   In Sources, choose a text/Markdown file and try searching its contents.
6. Use **Export → Markdown** and **Export → Word**. Open the downloads through
   the phone's file/download interface. Try **Backups → Download saved project**.
7. Try moving a World landmark and Plot beat with a finger. In World Atlas,
   pinch to zoom in and out, then lift one finger and keep panning. Use workspace
   Undo/Redo after a landmark move. See [mobile editing and undo](mobile-editing-and-undo.md)
   for history scope, lifetime, and a focused gesture checklist.
8. Open **Agent Studio**. Create an agent, assign one character, preview its
   context, and save. Open its conversation and verify the context receipt.
9. Open **Project Binder**. Choose Reader manuscript, preview it, and download
   HTML. Try **Print / Save PDF** and inspect the phone's available destinations.
   See [the feature guide](using-agent-studio-and-project-binder.md) for editable
   recipes, selected sections, and private project packages.

Native keyboards, file pickers, text selection, and gestures are the main reasons
for this device check: desktop browser emulation does not fully reproduce them.

## If the phone cannot connect

- First verify Muse works on the computer at **http://localhost:5177**.
- Check that the phone uses the Wi-Fi Network URL, including `http://` and `:5177`.
  Ignore Docker/virtual-machine addresses such as `172.17.*` or `192.168.122.*`.
- Ensure neither device is isolated by guest Wi-Fi or a VPN route. Temporarily
  disconnect a VPN if it prevents local-network access.
- If the computer firewall blocks incoming connections, allow TCP port **5177**
  from the trusted local subnet. Do not disable the entire firewall.
- A “port already in use” error means another Muse process needs to be stopped.
- Keep the computer awake. This setup stops serving when it sleeps or shuts down.

References: [Vite server host options](https://vite.dev/config/server-options#server-host),
[Expo core concepts](https://docs.expo.dev/core-concepts/).
