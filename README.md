# ServerLab

A minimalist, Grafana-like dashboard for **one homelab server**. It runs on the server it monitors, stores everything in SQLite, and is reachable only over your Tailscale tailnet.

It answers four questions quickly:

1. **What is running here?** Server Lobby
2. **How hard is the box working?** Resources Monitor
3. **Which app is using it?** Application Usage
4. **Who has been logging in?** User Watcher

## Features
| Feature | What you get |
|---|---|
| Server Lobby | Cards for detected Docker containers, systemd services, nginx sites and databases, with icons, descriptions and "Open" links. Add anything it misses by hand, and upload your own icon for any card. Health status, uptime, and an "Exposed to LAN" badge for anything not bound to loopback or the Tailscale IP |
| Resources Monitor | Live CPU, GPU (NVIDIA, AMD, Intel; several at once), memory, temperatures, network, disk usage and I/O, host uptime. History for 24 h, 7 d and 30 d |
| Application Usage | Ranked bars of CPU and memory per app, as a percentage and in real units |
| User Watcher | SSH and web logins with user, time, success or failure, and offline geolocation (country and city). Backfills history already on the server |
| Alerts | Threshold and event rules (high CPU, disk almost full, SSH brute force, new country login, service down, exposed service, certificate expiring), sent to ntfy, Discord, Telegram or in-app |
| Admin login | One local admin (argon2id), session cookies, login throttling |

Monitoring is read-only: ServerLab never starts, stops or changes containers and services. The one exception is opt-in hardware control on hybrid-graphics laptops: Settings can switch the NVIDIA GPU off or back on (`prime-select`, applied at the next reboot) through two fixed root units allowed by a polkit rule. See [HARDENING §6](docs/HARDENING.md#nvidia-gpu-power-switch-hybrid-graphics-laptops).

## Tech stack
Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · SQLite (better-sqlite3 + Drizzle, WAL) · Chart.js · a separate Node collector process · Server-Sent Events for live data.

Production runs bare-metal on Ubuntu Server as two systemd units: `serverlab-web` (`next start` on `127.0.0.1:3000`) and `serverlab-collector`.

## Development (macOS)
Requires Node.js 22 (`.nvmrc`). On macOS the collector uses the **mock driver**, which generates realistic metrics, containers and logins.

```bash
nvm use
npm install
cat > .env.local <<'EOF'
COLLECTOR_DRIVER=mock
DATABASE_PATH=./data/serverlab.db
COOKIE_SECURE=false
EOF
npm run dev
```
`npm run dev` starts the web UI and the collector together. Open <http://localhost:3000/setup>.

In development the setup token is read from `./data/setup-token`. It is created automatically on first run and printed in the terminal. `deploy/env.example` documents every other variable.

## Production install
On the Ubuntu server, with Node.js 22 installed system-wide:
```bash
git clone <repository-url> ~/server_lab
cd ~/server_lab
sudo deploy/install.sh
```
`install.sh` creates the `serverlab` user, builds into `/opt/serverlab`, writes `/etc/serverlab/serverlab.env`, migrates the database in `/var/lib/serverlab`, downloads the geolocation database, starts both units and prints a one-time setup token. Re-run it to update.

Then follow **[docs/HARDENING.md](docs/HARDENING.md)**: Tailscale, nginx as the tailnet gateway, firewall, and the verification checklist. Forgot the password? `sudo serverlab reset-password`.

## Project layout
```
app/              Next.js App Router: (dashboard) pages, (authentication) login and setup, api/stream (SSE)
components/       UI components (ported template + ServerLab components)
configuration/    Route map, navigation, theme settings
hooks/ styles/ utilities/
lib/              Code shared by the web process and the collector
  database/       better-sqlite3 + Drizzle client, retention
  schema/         Drizzle tables
  queries/        Read helpers for server components
  authentication/ Passwords, sessions, setup token, login throttling
collector/        The metrics process: drivers/linux, drivers/mock, sources, jobs, alerts
catalog/          Known software (catalog.json) and vendored icons
drizzle/          SQL migrations
scripts/          migrate.ts, serverlab-cli.ts (reset-password)
deploy/           systemd units, install.sh, env.example, nginx examples, timers
docs/             HARDENING.md (install and hardening guide), plan/ (design notes)
```

## Scripts
| Script | What it does |
|---|---|
| `npm run dev` | Web UI (`next dev`) and collector (`tsx watch`) together |
| `npm run dev:web` | Web UI only |
| `npm run dev:collector` | Collector only, restarting on changes |
| `npm run build` | `next build`, then bundles the collector to `dist/collector/index.js` (tsup) |
| `npm run build:collector` | Collector bundle only |
| `npm run start` | Production web UI on `127.0.0.1:3000` |
| `npm run start:collector` | Production collector (`node dist/collector/index.js`) |
| `npm run db:generate` | Generate a migration from schema changes (drizzle-kit) |
| `npm run db:migrate` | Apply migrations (both processes also migrate on start) |
| `npm run serverlab -- <command>` | Admin CLI, e.g. `reset-password` |
| `npm run lint` | ESLint, including the naming conventions in `CLAUDE.md` |
| `npm run type-check` | TypeScript, no emit |
| `npm test` | Vitest unit tests |

## Known limitations
- **Process names for listeners.** The collector runs as the unprivileged `serverlab` user, and `ss -p` only names processes that user owns. Listeners that aren't Docker ports, nginx ports or a catalog unit's default port show up as "Port N" without a process name. Exposure checks still work, because bind addresses are always visible.
- **Intel GPU stats** need `intel_gpu_top` and `CAP_PERFMON` (see `docs/HARDENING.md`). Without them the iGPU is listed with "no stats".
- **nginx inside Docker** is not parsed. Its container shows as a normal app.
- **Linux driver status.** The parsers are tested against captured Ubuntu 22.04, 24.04 and 25.x output. The full Linux driver still needs its first run on a real host; the mock driver covers everything else on macOS.

## Third-party data and assets
- **Geolocation:** [IP Geolocation by DB-IP](https://db-ip.com). The DB-IP "IP to City Lite" database is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It is downloaded at install time and monthly, not stored in this repository.
- **Icons:** application icons in `catalog/icons/` come from [dashboard-icons](https://github.com/homarr-labs/dashboard-icons), licensed under Apache-2.0. Product names and logos belong to their owners.
