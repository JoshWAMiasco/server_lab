# 11 — Roadmap, Milestones and Open Questions

Each milestone can be demoed on its own. Everything through M6 can be built and tested on macOS with `COLLECTOR_DRIVER=mock`. Linux-specific sources are checked on the real server at the end of each milestone.

| # | Milestone | Done when… |
|---|---|---|
| **M0** | **Scaffold** | `npx create-next-app` (16.4) in the project folder (keeping `spec.md` and `docs/`. create-next-app refuses a non-empty folder, so scaffold into a temp dir and move the files in, or init by hand); template subset ported per [07](07-ui-and-template-port.md); demo imports removed; side menu shows the 6 ServerLab routes with empty states; Drizzle schema + first migration; `collector/` boots with the mock driver and writes a heartbeat; `npm run dev` starts web + collector together (`concurrently`); lint, typecheck and vitest pass. |
| **M1** | **Auth** | setup (with token), login, logout, sessions, throttle, `proxy.ts` + `requireSession`; criteria in [08](08-auth.md). |
| **M2** | **Resources Monitor** | system/GPU/disk sources (linux + mock), SSE `/api/stream`, `LiveLineChart`, history via rollups, retention prune; criteria in [03](03-feature-resources.md). |
| **M3** | **Server Lobby** | Docker/systemd/ports discovery, nginx site parsing, catalog (~80 entries + icons), labels, manual items, DB section, health and uptime; criteria in [04](04-feature-lobby.md). |
| **M4** | **App Usage** | cgroup-based Docker + systemd usage, ranked bars, donut, drill-down history; criteria in [05](05-feature-app-usage.md). |
| **M5** | **User Watcher** | journal tail with cursor, wtmp backfill, GeoIP + tailnet tagging, data grid, charts; criteria in [06](06-feature-user-watcher.md). |
| **M6** | **Alerts** | rules, engine, ntfy/Discord/Telegram, in-app notifications; criteria in [10](10-feature-alerts.md). |
| **M7** | **Deploy + Hardening** | `deploy/serverlab-web.service`, `deploy/serverlab-collector.service`, `deploy/install.sh` (user, dirs, build, migrate, geo DB download + timer, setup token), `docs/HARDENING.md` finalized from [09](09-hardening.md); `deploy/nginx/` example site + `tailnet-tls.conf` snippet + `tailscale-cert-renew.{service,timer}`; fresh install works end to end on clean **Ubuntu Server 22.04 and 24.04** VMs (with nginx + Docker + Tailscale), plus a smoke test on the current interim release. |

## Testing strategy
- **Unit (vitest):** log parsers (sshd, `ss`, `/proc/*` fixtures), catalog matching, rollup math, alert state machine, URL precedence.
- **Fixtures:** real `/proc/stat`, `/proc/meminfo`, `/proc/diskstats`, `nvidia-smi` CSV and `docker inspect` JSON captured from the actual server and stored in `collector/__fixtures__/`.
- **Integration:** the collector runs with the mock driver against a temp SQLite file and the expected rows are asserted.
- **E2E (later, optional):** Playwright smoke test (login → each page renders → SSE ticks).

## Open questions (to resolve together)
1. **Sample interval and retention:** are 2 s / 24 h raw / 30 d at 1 min / 365 d at 1 h good defaults? Should they be adjustable in Settings (needs a collector reload)?
2. **Timezone for notifications.** Proposed default: the server's timezone (`timedatectl`), changeable in Settings. The web UI always shows the viewer's browser time. *(Will apply this unless you object.)*

### Resolved (2026-10-23)
- **Distro:** Ubuntu Server. **All currently supported releases** (22.04 LTS, 24.04 LTS, 25.x interim, and 26.04 once released), detected at runtime ([06](06-feature-user-watcher.md)).
- **GPU:** fully dynamic. Any number of GPUs, mixed vendors, re-detected every 10 minutes, no configuration ([03](03-feature-resources.md#gpu-fully-dynamic-no-configuration)).
- **Websites hosted / reverse proxy:** nginx. Configs are parsed for sites ([04](04-feature-lobby.md#nginx-site-detection-websites-hosted)).
- **Hosting setup for all apps:** nginx is the single gateway on the Tailscale IP, with one port per app, a Tailscale cert, and apps bound to `127.0.0.1` ([09](09-hardening.md#recommended-setup-nginx-as-the-single-tailnet-gateway)). The Lobby flags anything "Exposed to LAN".
- **Link hostname:** Tailscale MagicDNS for now.
- **Docker socket:** direct access via the `docker` group on the collector unit only ([09](09-hardening.md#docker-socket-direct-access-accepted-risk)).
- **Login history backfill:** import everything still on the server, capped at 365 days.
- **World map:** none. Geolocation is shown as text and flag tags plus counts.

## Risks
| Risk | Mitigation |
|---|---|
| `systeminformation` is slow or spawns processes on some calls at 2 s | Read `/proc` directly for hot-path metrics; use `si` only for detection and slow-path data |
| Chart.js CPU cost with 6 live charts | `update('none')`, decimation plugin, pause on hidden tab |
| SQLite growth | Hourly prune + `PRAGMA incremental_vacuum`; size shown in Settings |
| sshd log format differences across Ubuntu/OpenSSH versions | Parser fixtures from Ubuntu 22.04, 24.04 and 25.x (`sshd` and `sshd-session`); auth.log fallback |
| nginx config edge cases (nested includes, variables, `map`) | Tokenizer + fixtures from real configs; unparseable blocks are skipped with a warning shown in Settings |
| Next 16 API churn (`proxy.ts`, `cacheComponents`) | Pin exact versions as in the template |
