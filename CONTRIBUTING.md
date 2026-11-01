# Contributing to ServerLab

Thanks for helping. ServerLab is a small project for one server, so changes that keep it small, safe and easy to read are the most welcome.

## Before you start

- For anything bigger than a bug fix, open an issue first so we can agree on the approach.
- ServerLab only reads the host, except for the Firewall, fail2ban and GPU pages. Anything that adds a new way to change the host needs a strong reason and a design like the one in [HARDENING §6](docs/HARDENING.md#6-serverlab-process-privileges): unprivileged web process, request in the database, a fixed root unit allowed by polkit, strict validation, no shell.

## Set up

```bash
npm ci
cp deploy/env.example .env.local    # then set COLLECTOR_DRIVER=mock, DATABASE_PATH=./data/serverlab.db, COOKIE_SECURE=false
npm run dev
```

The mock driver fakes the whole host (metrics, containers, logins, UFW, fail2ban), so you can work on any OS without root.

## Checks

Run these before opening a pull request; CI runs the first three.

```bash
npm run lint
npm run type-check
npm test
npm run build && npm run test:e2e
```

If you change how the collector reads the host, add the real command output as a fixture in `collector/__fixtures__/` and a parser test next to the parser.

## Code conventions

`npm run lint` enforces most of these.

- **No abbreviations** in identifiers or file names: `database` not `db`, `temperature` not `temp`, `error` not `err`, `index` not `idx`. Identifiers are at least 3 characters (except `id`, `x`, `y`, `to`, `as`, `on`, `is`, `of`, `_`).
- **kebab-case file names**, named exports only (Next.js special files excepted), no barrel files.
- Exported functions in `components/`, `hooks/` and `utilities/` need a JSDoc block with an `@example`.
- Comments are block comments (`/* … */`) on their own lines; no `//` comments after code, no TODO/FIXME.
- Class names go through `mergeClassNames` from `@/utilities/merge-class-names`.
- Timestamps are Unix epoch milliseconds (UTC).
- The collector talks to Docker with GET requests only.
- UI copy is short and plain. Name things the way a user would.

## Pull requests

- Keep each pull request to one change, with a clear title and a sentence on why.
- Include screenshots for UI changes (desktop and a phone-width view).
- By contributing you agree that your work is released under the [MIT license](LICENSE).
