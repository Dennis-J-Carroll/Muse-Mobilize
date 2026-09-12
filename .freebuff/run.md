# Muse-Mobilize — Run Doc

How to run the app from a fresh checkout of this repo (npm workspaces: `server/` + `web/`).

## 1. Reproduce the artifacts

There are **no uncommitted env files to copy** — this project keeps no `.env*` files.
All configuration is supplied through one settings file the app creates on first run
(`~/.muse-mobilize/settings.json`, overridable via the `MUSE_CONFIG_DIR` env var), so a
fresh checkout needs only dependencies installed at the repo root:

```bash
# System Node 12 is too old; the toolchain needs Node >= 20 (tsx, vite 6).
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm install
```

Optional (only needed to point the app at a specific project folder):
create `settings.json` in a directory and export `MUSE_CONFIG_DIR=<that directory>`.
Structure: `{ "workspaceRoot": "<abs path>", "defaultProvider": "mock" }`.

## 2. Run the servers

Two processes: Express API on **5178** and Vite (React) dev server on **5177**,
which proxies `/api` to 5178. Ports are defaults from `server/src/index.ts`
(`MUSE_PORT ?? 5178`) and `web/vite.config.ts` (`port: 5177, strictPort: true`).

```bash
# One-shot (concurrently, from the repo root — best for an interactive terminal):
npm run dev

# Or separately:
npm run dev:server   # Express API on 5178
npm run dev:web      # Vite UI on 5177
```

To use different ports, set `MUSE_PORT` for the API AND update the proxy target
in `web/vite.config.ts`, then run Vite with `--port <other>` (strictPort is on,
so a busy port fails fast instead of silently shifting).

Health checks: `curl http://localhost:5178/api/health` (API) and
`curl http://localhost:5177/` (UI should return the Vite index.html).

## 3. Detached launch (headless / CI / preview runners)

Two gotchas learned the hard way:

1. **Run Vite from inside `web/`**, not the repo root. Vite uses the CWD as its
   root, so `npx vite --config web/vite.config.ts` from the root serves the
   repo tree and `/` returns 404.
2. **Process-tree reaping**: launch managers may reap the process group of
   background children. Prefer `setsid` (own session) and run the real server
   binary (`npx vite`), not npm workspace wrappers (`npm -w web run dev`), so
   there is no intermediate npm process to lose.

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
cd web
setsid bash -c 'exec npx vite' > ../.freebuff/preview.log 2>&1 < /dev/null &
# Confirm after ~5s: pgrep -af 'node.*bin/vite' && curl -s -o /dev/null -w '%{http_code}' http://localhost:5177/
```

The Express API keeps running under its own `tsx watch`; start it the same way
if it is not already up: from `server/`, `setsid bash -c 'exec npx tsx src/index.ts'`.
