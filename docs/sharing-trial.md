# Share an isolated Muse trial

Use a separate trial instance for a trusted tester. Do not tunnel the everyday development server: the normal local app has no login, and its settings can change the projects folder.

The trial launcher serves the built interface, stores projects and credentials under the ignored `.muse-local/share/` folder, and binds only to loopback. It never copies personal projects, provider keys, or inherited provider-key environment variables.

## Set up once

1. Install a current [official cloudflared release](https://developers.cloudflare.com/tunnel/downloads/) with `--allowed-mail` support. Put it on PATH, or at `.muse-local/share/bin/cloudflared`. Verify the release checksum when downloading a binary.
2. From the repository root, run `npm run share:setup`.
3. Open **http://127.0.0.1:5379/**, then **Model settings** (the cloud icon at the top right). Choose a hosted provider, enter a separate trial API key, select its model, and **Save & check**. This sends a small billable connection check. Set a provider-side spending cap where supported.
4. Stop setup with **Ctrl+C**. Its sample project and saved settings persist.
5. Run:

```sh
npm run share:start -- --email you@example.com --email tester@example.com
```

Email addresses are remembered locally for future runs. The launcher refuses to publish without individual email addresses and refuses cloudflared versions without email protection. For an explicit offline demonstration, add `--offline`; this forces the mock provider even when a live key is saved.

## Test and share

Open the printed HTTPS link. Cloudflare requires an email and one-time PIN; only the configured email addresses can reach Muse. Share the link directly with your tester.

Both invited people share the same trial project folder. This is a trusted-person trial, not a multi-user service with separate accounts or per-project permissions. Avoid simultaneous edits to the same document.

The shared interface can create and edit trial projects, export backups, and use the chosen model. Settings changes, local-model installation, and provider connection tests are blocked from the shared instance. Agent model overrides cannot switch to another provider or a more expensive model.

Live AI uses one provider call at a time, at most 60 calls per hour per running server, and at most 2,000 output tokens per call. Consultation calls count too. This limits use; it is not a currency budget. The counter resets when the server restarts.

The browser sends story context to the configured AI provider when an AI action is requested. The tunnel carries interface traffic through Cloudflare. The main local workspace remains separate.

## Stop, restart, and recover

- **Ctrl+C** in the sharing terminal stops the runtime and tunnel. Keep the host awake and connected while testing.
- Restart with `npm run share:start`; the protected URL changes. Saved trial projects stay in `.muse-local/share/projects/`.
- To change the key or model, stop sharing, run `npm run share:setup`, save the new connection, stop setup, then restart sharing.
- To change invited addresses, pass the full new list of `--email` flags on restart.
- Use **Backups** to export trial writing before deleting any local trial files.
- `--local-only` starts a locked trial at **http://127.0.0.1:5377/** without a tunnel, for host testing.

Cloudflare Quick Tunnels require no account or custom domain, have no uptime guarantee, and change hostname on restart. Their email protection requires an interactive browser. For a permanent address, use a named tunnel with Cloudflare Access. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
