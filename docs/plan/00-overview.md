# 00 — ServerLab Overview

> Status: **v1 implemented** (2026-10-25). Built and tested on macOS with the mock driver; the Linux driver has not run on a real Ubuntu host yet. Deviations from these plans are logged at the end of the decision log.
> Source spec: `spec.md` in the repository root (read-only).

## Vision
ServerLab is a small, Grafana-like dashboard for **one homelab server**. It answers four questions quickly:

1. **What is running here?** → Server Lobby
2. **How hard is the box working?** → Resources Monitor
3. **Which app is using it?** → Application Usage
4. **Who has been logging in?** → User Watcher

It is meant to look good and need no setup. It is not a general observability platform.

## Scope (v1)
| # | Feature | Source | Plan file |
|---|---------|--------|-----------|
| 1 | User Watcher: logins, timestamp, geolocation | spec | [06](06-feature-user-watcher.md) |
| 2 | Resources Monitor: live CPU, GPU, memory, temperature, network | spec | [03](03-feature-resources.md) |
| 2b | Disk usage + I/O, host uptime | **added** | [03](03-feature-resources.md) |
| 3 | Server Lobby: detected apps, services, websites, DBs; manual add | spec | [04](04-feature-lobby.md) |
| 3b | Health status + uptime on Lobby cards | **added** | [04](04-feature-lobby.md) |
| 4 | Application Usage: ranked bars, % and actual memory | spec | [05](05-feature-app-usage.md) |
| 5 | Alerts: threshold rules sent to ntfy, Discord or Telegram | **added** | [10](10-feature-alerts.md) |
| 6 | Admin login | **added** | [08](08-auth.md) |
| 7 | Hardening documentation (Tailscale) | spec | [09](09-hardening.md) |

## Non-goals (v1)
- Monitoring more than one server (the design leaves room for it; see [01](01-architecture.md#future-multi-host)).
- Multiple users, roles, SSO.
- A query language, user-built dashboards, plugins.
- Starting, stopping or restarting containers and services (read-only monitoring). The NVIDIA GPU power switch is the one, narrow exception (see the decision log).
- Windows or macOS hosts. Production is Linux only. macOS is used only for development, with the mock driver.
- Docker Compose deployment.

## Decision log
| Date | Decision | Why |
|------|----------|-----|
| 2026-10-23 | Project lives in its own repository (next to `spec.md`; plans in `docs/plan/`) | Keeps the plan next to the code |
| 2026-10-23 | Template `next-web-template-red-alert` is only copied from, never edited | Spec |
| 2026-10-23 | Runs **on the monitored host**, monitors one server | Simplest; no agent protocol to secure |
| 2026-10-23 | GPU support: NVIDIA, AMD, Intel, or none, detected at runtime | User's hardware varies |
| 2026-10-23 | Single admin password (argon2id) plus session cookie | Tailscale is the outer wall, this is the inner wall |
| 2026-10-23 | v1 adds disk/I-O, health and uptime, alerts | User accepted these suggestions |
| 2026-10-23 | Full red-alert theme with all decorations | User preference |
| 2026-10-23 | Deploy with bare-metal systemd (two units) | Direct host visibility, fewer privileged mounts |
| 2026-10-23 | Collector runs as its own process, separate from Next.js | See [01](01-architecture.md) |
| 2026-10-23 | SQLite through better-sqlite3 + Drizzle, WAL mode | Spec says SQLite; typed schema and migrations |
| 2026-10-23 | Live data over SSE, not WebSockets | Works with plain `next start`, no custom server |
| 2026-10-23 | Target OS: **Ubuntu Server, all currently supported releases** (22.04 LTS, 24.04 LTS, 25.x, 26.04 when out) | Must work on common versions; differences are detected at runtime |
| 2026-10-23 | GPU is **fully dynamic**: multiple GPUs and mixed vendors, re-detected every 10 min | Hardware may change |
| 2026-10-23 | **Recommended hosting setup:** nginx is the single gateway on the Tailscale IP, one port per app, Tailscale cert, apps bound to 127.0.0.1 | Most secure option for several apps behind one MagicDNS name |
| 2026-10-23 | Lobby **exposure check**: flag listeners on 0.0.0.0, `::` or a LAN IP | Enforces the setup above |
| 2026-10-23 | Login history backfill: everything still on the server, capped at 365 d | Watcher isn't empty on day one |
| 2026-10-23 | No world map; geolocation shown as text and flag tags plus counts | User preference |
| 2026-10-23 | Web server: **nginx**. Lobby parses nginx configs to find "websites hosted" | User preference |
| 2026-10-23 | Lobby links use the **Tailscale MagicDNS** name for now; nginx `server_name`s are shown but not used for links | No public or LAN DNS yet |
| 2026-10-23 | Collector gets **direct docker.sock access** (`docker` group); no socket proxy | Simpler. The root-equivalent risk is accepted and documented in [09](09-hardening.md) |
| 2026-10-25 | `cacheComponents` is **off**; dashboard pages use `dynamic = "force-dynamic"` | Every page reads live SQLite data per request; synchronous better-sqlite3 reads are invisible to Cache Components and would be prerendered at build time |
| 2026-10-25 | Small **GET-only Docker client** over the socket (`collector/sources/docker-client.ts`) instead of `dockerode` | Enforces the read-only rule in code; a test fails if any non-GET method or mutating endpoint appears |
| 2026-10-25 | No `systeminformation`; metrics read straight from `/proc` and `/sys` (hwmon, drm, cgroup v2) | Cheaper at 2 s, no child processes; parsers are pure and fixture-tested |
| 2026-10-25 | Live charts use a linear time axis; no `chartjs-adapter-dayjs` | One dependency fewer; ticks are formatted directly |
| 2026-10-25 | `xlsx` export dropped (CSV, JSON, HTML and print remain) | `xlsx@0.18.5` on npm has unpatched advisories |
| 2026-10-25 | Folders: `lib/database` (not `lib/db`), `app/(authentication)` (not `(auth)`) | The template's lint rules forbid abbreviations |
| 2026-10-25 | Settings "Send test" is queued in SQLite and sent by the collector | The web unit has `IPAddressDeny=any`, so it cannot reach ntfy/Discord/Telegram |
| 2026-10-25 | One-shot alerts (brute force, new country) stay "firing" until acknowledged; acknowledging resolves them | They have no "back to normal" state |
| 2026-10-25 | Unmatched systemd units with no listener are stored but hidden behind "Show system services" | Keeps the Lobby to things you host while still making everything discoverable |
| 2026-10-25 | **Exception to read-only:** Settings → "NVIDIA GPU power" switches `prime-select` between `intel` (GPU off) and `on-demand`. The web only writes a request; the collector starts `serverlab-gpu-mode@intel.service` or `@on-demand.service`, the only units a polkit rule lets `serverlab` start. Applies after a reboot; ServerLab never reboots the host | Requested for a laptop used as a headless server: its Maxwell GPU cannot power down by itself (no runtime D3), so it draws power 24/7 unless the PRIME profile turns it off |

## Glossary
- **Sample**: one reading of host metrics, taken every 2 s.
- **Rollup**: an aggregated sample (1-minute or 1-hour avg and max).
- **Lobby item**: a card in the Lobby, either *detected* (Docker, systemd, port) or *manual*.
- **Catalog**: a bundled JSON file that maps known software (e.g. `postgres`) to a name, description, icon and category.
- **Driver**: the collector backend, `linux` (real) or `mock` (fake data for development).
