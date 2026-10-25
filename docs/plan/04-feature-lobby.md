# 04 — Feature: Server Lobby (`/`, home page)

> Spec: *"main entry point that overview number of applications installed, services, website hosted and databases. it detects applications hosted and has an icon if it is in services or in docker. user can also manually add… card ui with the title name, short description… how to open a url… what database installed like mysql, postgres"*

## Discovery sources (collector, every 60 s)
| Source | How | What it gives us |
|---|---|---|
| Docker | `dockerode.listContainers({all:true})` + `inspect` for health | name, image, state, health, ports, labels, `StartedAt` |
| systemd | `systemctl list-units --type=service --state=running,failed --output=json` then `systemctl show -p ActiveState,SubState,ActiveEnterTimestamp,Description,MainPID,FragmentPath` | unit, description, state, start time |
| Ports | `ss -tlnpH` | port → process name/PID (catches apps that are neither containers nor units, e.g. a manual `node server.js`) |
| nginx | parse the nginx config files (see below) | "websites hosted": server names, listen ports, static root or proxied app |

**systemd noise filter:** a built-in denylist (`systemd-*`, `dbus`, `getty@*`, `cron`, `polkit`, `udisks2`, `snapd*`, `ssh` (shown in the Watcher instead), `serverlab-*`, …). A unit is shown only if it matches the catalog or the user un-hides it from "Show system services".

**Dedup:** a Docker container's published ports also show up in `ss` as `docker-proxy`, so ports owned by `docker-proxy`/`containerd` are attached to the container and are not separate items.

## nginx site detection ("websites hosted")
- **Files read:** `/etc/nginx/nginx.conf`, following `include` directives (Ubuntu default: `/etc/nginx/conf.d/*.conf` and `/etc/nginx/sites-enabled/*`).
  - The files are read directly because they are world-readable on Ubuntu.
  - `nginx -T` is **not** used: it needs root, since it also reads the TLS keys.
- **Parsing:** a small tokenizer for nginx config syntax (braces, `;`, quotes, `#` comments). No regex over whole files.
- **Fields taken from each `server { }` block:**
  - `server_name` (list; `_` = default/catch-all)
  - `listen` (port, `ssl`, `default_server`)
  - `root`, which makes it a **static site**
  - `location / { proxy_pass http://127.0.0.1:8096; }`, which makes it a **reverse proxy**. The upstream port is matched to a discovered Docker/systemd item, so the website card says "→ Jellyfin" and the app card gets a "served via nginx" badge.
  - `upstream {}` blocks are resolved for `proxy_pass http://name`.
- **Key:** `nginx:<first server_name>:<listen port>`.
  - Category is `website`.
  - Description defaults to "Static site from /var/www/x" or "Reverse proxy to Jellyfin".
- **Change detection:** re-parse only when a config file's mtime changes.
- **nginx itself** (the systemd unit) still shows as one infra card with the number of sites it serves.
- **Not in v1:** nginx running *inside* Docker with mounted configs. Its container shows as a normal app.

## Catalog (`catalog/catalog.json`)
```json
{
  "id": "jellyfin",
  "name": "Jellyfin",
  "description": "Self-hosted media server for movies, TV and music.",
  "category": "app",            // app | website | database | infra | monitoring
  "icon": "jellyfin.svg",
  "match": { "image": ["jellyfin/jellyfin", "linuxserver/jellyfin"], "unit": ["jellyfin"], "process": ["jellyfin"] },
  "defaultPort": 8096,
  "urlPath": "/"
}
```
- Ship about 80 common homelab entries: Jellyfin, Plex, *arr apps, Home Assistant, Pi-hole, AdGuard, Nextcloud, Immich, Portainer, Grafana, Uptime Kuma, Vaultwarden, Gitea, Traefik, Nginx, Caddy, MySQL, MariaDB, Postgres, Redis, MongoDB, InfluxDB, and so on.
- **Icons:** SVGs from `homarr-labs/dashboard-icons` (Apache-2.0) are vendored into `catalog/icons/`. Nothing is loaded from a CDN. Unknown items get a lucide `Box` icon.
- **Matching order:** Docker label `serverlab.catalog` → image name (ignoring registry and tag) → unit name → process name.

## Docker label overrides (homepage-style)
`serverlab.name`, `serverlab.description`, `serverlab.url`, `serverlab.icon`, `serverlab.category`, `serverlab.hide=true`.

## Databases
- Category `database` from the catalog, **or** a heuristic: listening on 3306 (MySQL/MariaDB), 5432 (Postgres), 6379 (Redis), 27017 (Mongo), 8086 (InfluxDB), or a process named `mysqld|mariadbd|postgres|redis-server|mongod`.
- They are shown in their own "Databases" row with engine, port and source (Docker or systemd).
- Engine version is best effort, from the image tag or `postgres --version`.
- v1 does not connect to the databases.

## URL ("how to open")
Precedence:
1. User override
2. `serverlab.url` label
3. `http(s)://${PUBLIC_HOSTNAME}:${hostPort}${catalog.urlPath}`

`PUBLIC_HOSTNAME` defaults to the Tailscale MagicDNS name from `tailscale status --json` (`Self.DNSName`, trailing dot removed), falling back to the hostname.

**Decision:** links always use **MagicDNS** for now, including for nginx sites (`http(s)://<magicdns>:<listen port>`). The site's `server_name`s are shown on the card as info only.
- **One port per app:** the recommended setup in [09](09-hardening.md#recommended-setup-nginx-as-the-single-tailnet-gateway) gives every app its own nginx port on the Tailscale IP, so each link is unique.
- **App reachable both directly and through nginx:** the **nginx link wins** (it is HTTPS and goes through the gateway). The app's own `127.0.0.1` port is not linked.
- **Sites that still share a port** (name-based vhosts) get a warning tooltip: "Shares port 443 with N sites, link opens the default site". Fix: give the site its own port.

## Exposure check
`ss -tlnp` already tells us the bind address of every listener, so each card gets an exposure badge:

| Bind address | Badge |
|---|---|
| `127.0.0.1` / `::1` | none (private) |
| Tailscale IP (`100.64.0.0/10`, `fd7a:115c:a1e0::/48`) | `Tailnet` (info) |
| `0.0.0.0` / `::` / a LAN IP | **`Exposed to LAN`** (warning). For Docker, shown when a published port has no `127.0.0.1:` host IP. |

The Lobby header shows a count ("2 services exposed"). An `item_exposed` alert event ([10](10-feature-alerts.md)) fires when something new starts listening on all interfaces. `sshd` on `:22` is allow-listed by default.
Items with no HTTP port (e.g. Postgres) show a "copy connection string" button instead of "Open".

## Health and uptime
| Source | Status dot | Uptime |
|---|---|---|
| Docker | `running`+`healthy`/no healthcheck → green; `starting` → yellow; `unhealthy` → red; `exited` → grey | `State.StartedAt` |
| systemd | `active` → green; `activating` → yellow; `failed` → red; `inactive` → grey | `ActiveEnterTimestamp` |
| Manual | optional `health_check_url` probed every 60 s (2xx/3xx = green) | none |

## Page layout
```
┌ LOBBY ─────────────────────────────── [+ Add item] [⟳ Rescan] ┐
│ ┌APPS 14┐ ┌SERVICES 6┐ ┌WEBSITES 3┐ ┌DATABASES 2┐                │
│ [All][Apps][Services][Websites][Databases]   🔍 filter   [Docker☐ systemd☐] │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│ │[icon] Jellyfin  🐳 ● up 3d │ │ …           │                     │
│ │ Self-hosted media server…  │                                     │
│ │ :8096        [Open ↗] [⋯]  │                                     │
│ └─────────────┘ └─────────────┘ …                                │
│ DATABASES                                                        │
│ ┌ Postgres 16  🐳 :5432 ● ┐ ┌ Redis 7  systemd :6379 ● ┐          │
└──────────────────────────────────────────────────────────────────┘
```
- **Card:** `Card` (HUD brackets), catalog icon, source badge (`Badge` with a Docker or systemd glyph), `StatusIndicator`, and an uptime label.
- **⋯ menu** (`dropdown-menu`): Edit (opens a `slideover` with a `validated-form`), Hide, Copy URL, and "View usage" (links to `/apps#key`).
- **Add item:** a slideover with name, description, URL, icon (picked from the catalog icons), category, and optional health URL.
- "Hidden items" can be expanded at the bottom to un-hide.

## Acceptance criteria
- On a host with 5 containers and 2 catalog systemd units, all 7 appear within 60 s, each with the correct icon and source badge.
- Renaming or hiding a detected item survives a container being recreated, because the key is the container name.
- A manual item is saved, edited and deleted. Its health dot reflects the probe.
- Postgres and MySQL appear under Databases whether they run in Docker or natively.
- Lobby renders in under 200 ms (server) with 100 items.
