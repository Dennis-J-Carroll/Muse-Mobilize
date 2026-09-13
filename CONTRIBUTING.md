# Contributing to Muse · Mobilize

Thanks for wanting to work on this. Muse · Mobilize is a solo-maintained,
local-first creative workspace — contributions are welcome, but please read
this before opening a PR so your work has the best chance of landing.

## Before you start

For anything bigger than a typo or small bugfix, open an issue first
describing what you want to change and why. This avoids wasted work on
changes that don't fit the project's direction — especially around agent
scope/permission semantics, the project file format on disk, and provider
adapters.

## Contributor License Agreement (CLA)

This project is licensed under **AGPL-3.0** (see [LICENSE](LICENSE)). Because
AGPL's copyleft terms mean contributions can't later be relicensed without
each contributor's consent, every external contributor needs to sign a CLA
before a pull request can be merged.

A CLA-bot will comment on your first PR with a link to sign. Signing takes a
minute and only needs to happen once per GitHub account. PRs cannot be merged
until the CLA check passes.

## Development setup

```bash
npm install
npm run dev
```

See [README.md](README.md#run-it) for ports, the golden path, and project
layout under `~/MuseProjects/<story>.muse/`.

## Tests

```bash
npm test              # unit/integration (server workspace)
npx playwright install chromium
npm run test:browser  # browser acceptance tests
```

Add or update tests for any behavior change. `npm run test:browser` spins up
its own temporary project store on ports 5277/5278 — it does not touch your
real projects or provider settings.

## Pull requests

- Keep PRs scoped to one change. Unrelated cleanup makes review slower, not faster.
- Describe *why*, not just *what* — the diff already shows what changed.
- Update relevant docs in `docs/` when behavior or contracts change.
- Don't touch `agents/*.yml` scope/permission defaults or schema files in
  `schemas/` without discussing the change first — these are contracts other
  parts of the system (and other people's projects on disk) depend on.

## Code style

Match the surrounding file. There's no separate style guide beyond what's
already in the codebase — consistency with existing patterns is the bar.

## Reporting bugs / security issues

Open a GitHub issue for regular bugs. For anything that looks like a security
vulnerability (e.g. path traversal in project file handling, key leakage),
please do not open a public issue — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
for contact info and report it privately instead.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Participation
means agreeing to abide by it.
