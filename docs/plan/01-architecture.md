# 01 — Architecture

## Process layout

```
┌──────────────────── Linux homelab host ─────────────────────┐
│                                                             │
│  serverlab-collector.service   (Node 22 + tsx, user: serverlab)
│   ├─ sources/system   /proc, /sys, systeminformation        │
│   ├─ sources/gpu      nvidia-smi | amdgpu sysfs | intel_gpu_top
│   ├─ sources/disk     statfs + /proc/diskstats              │
│   ├─ sources/docker   /var/run/docker.sock (dockerode)      │
│   ├─ sources/systemd  systemctl show + cgroup v2            │
│   ├─ sources/ports    ss -tlnpH                             │
│   ├─ sources/auth     journalctl -f -o json  (+ wtmp)       │
│   ├─ jobs/rollup      raw → 1m → 1h, retention prune        │
│   └─ alerts/engine    evaluate rules → notify channels      │
│                 │  write (WAL)                              │
│                 ▼                                           │
│          /var/lib/serverlab/serverlab.db                    │
│                 ▲  read (+ write for user config/auth)      │
│                 │                                           │
│  serverlab-web.service   (next start -H 127.0.0.1 -p 3000)  │
│   ├─ RSC pages (Lobby, Resources, Apps, Watcher, Alerts…)   │
│   ├─ server actions (manual items, rules, settings, auth)   │
│   └─ GET /api/stream  (SSE: live samples)                   │
│                                                             │
└───────────────│─────────────────────────────────────────────┘
                │ nginx listen 100.x.y.z:443 ssl (tailscale cert) → 127.0.0.1:3000
                ▼
          your laptop / phone on the tailnet
```

## Why the collector is a separate process
- **Lifecycle:** Next.js dev HMR runs module-level intervals more than once, and `instrumentation.ts` timers are tied to the web server's lifetime. Restarting the web UI should not leave gaps in metrics.
- **Privilege split:** the collector needs read access to the docker socket, the journal and cgroups. The web process needs none of that, so a bug in the web process cannot reach those privileges.
- **Shared code:** both processes import `lib/db/*` and `lib/schema/*` from the same repo, so there is no protocol to keep in sync.

## Repo layout (proposed)
```
server_lab/
  app/                    Next.js App Router
    (auth)/login, setup
    (dashboard)/page.tsx (Lobby), resources/, apps/, watcher/, alerts/, settings/
    api/stream/route.ts   SSE
  components/             ported from template + new (live-line-chart, lobby-card…)
  configuration/ styles/ utilities/ hooks/   ported from template
  lib/
    db/                   client.ts (better-sqlite3 + drizzle), migrate.ts
    schema/               drizzle tables
    queries/              read helpers used by RSC pages
    auth/                 password, session, guard
  collector/
    index.ts              main loop / scheduler
    drivers/linux/*  drivers/mock/*
    sources/*  jobs/*  alerts/*
  catalog/                catalog.json + icons/*.svg
  deploy/                 systemd units, install.sh, env.example
  docs/                   plan/, HARDENING.md
  drizzle/                generated migrations
  proxy.ts                Next 16 request guard
```

## Data flow
1. **Every 2 s** the collector reads system metrics and inserts one row into `metric_samples`, plus child rows per core, interface, disk and GPU.
2. **Every 10 s** it refreshes app usage (Docker stats, cgroups) into `app_usage_samples`.
3. **Every 60 s** it runs Lobby discovery and upserts `discovered_items`.
4. **Continuously** it tails the journal for sshd and inserts into `login_events`.
5. **After each sample** the alert engine evaluates rules, then writes and sends `alert_events`.
6. **Every 1 min and every 1 h** the rollup job aggregates and prunes old rows.
7. **The web process** renders pages from SQLite on the server. `/api/stream` polls the newest sample id every 1 s and pushes new rows to connected clients.

## Live streaming (SSE)
- `GET /api/stream?topics=system,apps` returns `text/event-stream`. The route is Node runtime and `dynamic`.
- The server loop keeps the last id sent, runs `SELECT … WHERE id > ?` every 1 s, and emits `event: system`. It sends a heartbeat comment every 15 s and cleans up on abort.
- The client uses one shared `EventSource` hook (`useLiveStream`). Components subscribe to topics.
- On first load the page renders the last N minutes with RSC, so charts are never empty. SSE then appends.

## Collector drivers and capability detection
```ts
interface Source<T> {
  id: string
  detect(): Promise<boolean>  // e.g. nvidia-smi present? docker.sock readable?
  collect(): Promise<T>
}
```
- When it starts, the collector runs `detect()` on every source and writes the results to `capabilities` (e.g. `{gpu:"nvidia", docker:true, sensors:true}`).
- The UI reads `capabilities` and hides or greys out panels for missing sources.
- `COLLECTOR_DRIVER=mock` swaps in generators that produce realistic random-walk metrics, fake containers and fake logins. This is how the whole app runs on macOS during development.

## Configuration (`.env`)
```
DATABASE_PATH=/var/lib/serverlab/serverlab.db
COLLECTOR_DRIVER=linux            # linux | mock
SAMPLE_INTERVAL_MS=2000
PUBLIC_HOSTNAME=homelab.tail1234.ts.net   # for Lobby "open" URLs
GEOIP_DB_PATH=/var/lib/serverlab/dbip-city-lite.mmdb
NTFY_URL= DISCORD_WEBHOOK_URL= TELEGRAM_BOT_TOKEN= TELEGRAM_CHAT_ID=
SESSION_SECRET=...                # used for cookie signing
```

## Key libraries
| Concern | Choice |
|---|---|
| DB | `better-sqlite3`, `drizzle-orm`, `drizzle-kit` |
| System metrics | `systeminformation` (CPU, mem, temps, net, fs), plus direct `/proc` reads where cheaper |
| Docker | `dockerode` |
| GeoIP | `maxmind` (reads `.mmdb`; works with DB-IP Lite) |
| Auth | `@node-rs/argon2` |
| Validation | `zod` (already in template) |
| Collector runtime | `tsx` (dev), bundled with `tsup` / `esbuild` for prod |

## Future: multi-host
Sources write through a `Sink` interface that inserts into SQLite. A later "remote agent" would be the same collector with an `HttpSink` posting to `/api/ingest`. Every table already has a `host_id` column (default `1`), so no migration is needed.
