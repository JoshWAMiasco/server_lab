# Changelog

## 1.2.0 — 2026-11-21

### Added
- **Machine page** (`/machine`) shows every part of the host, drawn as a cut-away of the machine that matches its form factor (tower, laptop, mini PC or rack server).
  - **Parts covered:** motherboard, BIOS, CPUs, GPUs, RAM modules, disks and network adapters. Click a part to see its details.
  - **Live data:** CPU, GPU, RAM and disk badges update in place.
- **Uptime page** (`/uptime`) records every boot with how it ended (reboot, shutdown, or crash / power loss). It shows a timeline, the longest streak, availability, and a table that can be exported.
- **Memory modules:** the installed sticks are detected by slot, with size, type, speed, manufacturer and part number. This uses a new root oneshot unit, `serverlab-hardware-inventory.service`, that runs `dmidecode` at boot.
- **Updates with backup and rollback:**
  - `./update-serverlab.sh` is the easy way in. It remembers your server and offers a menu: update, quick update, preview, undo, backups, status and logs.
  - `scripts/update-server.sh you@server` runs from your workstation. It checks this copy, uploads it over SSH and updates the server.
  - `deploy/update.sh` runs on the server. Before installing, it stops ServerLab and saves the database and the current code to `/var/lib/serverlab/backups/`, keeping the newest 5.
  - Both install types are supported: standalone and Tailscale.
  - After installing it checks that the services, the web UI and the collector are working. If they are not, it rolls back on its own.
  - To undo an update yourself, run `sudo bash /opt/serverlab/deploy/update.sh --rollback`.
- **Offline USB installer for Ubuntu 24.04 (x86_64):**
  - Build it with `scripts/build-offline-installer.sh`, and write it to a USB drive with `sudo scripts/write-installer-usb.sh /dev/sdX`.
  - On the server, run `sudo bash install.sh`. No internet is needed.
  - The USB carries Node.js, ServerLab with its npm modules, the Ubuntu packages it uses (nginx, Tailscale, sqlite3, dmidecode, polkit) and the GeoIP database.
  - The installer checks every file before changing anything. On a server that already runs ServerLab, it updates it with a backup.
- **Development:** `MOCK_GPU_COUNT`, `MOCK_CPU_CORES` and `MOCK_FORM_FACTOR` shape the mock host.

### Changed
- **Uptime is now a streak:** reboots no longer reset it; a shutdown or crash does.
- **Resources, CPU:** every CPU core has its own mini chart instead of faint lines in the CPU chart. Per-core history comes from a new `cpu_core_pct` rollup.
- **Resources, GPUs:**
  - Each GPU has its own block, with separate Utilization and VRAM charts (live and history). The page adapts to any number of GPUs from mixed vendors.
  - With 3 or more GPUs, an "All GPUs" summary strip is added.
- **GPU readings:** AMD GPUs report power draw, and Intel discrete GPUs report VRAM when the driver exposes it.

## 1.1.0 — 2026-11-01

### Added
- **Standalone installer** (`serverlab-installer-1.1.0.zip`): one script, `sudo bash install.sh --port 8443`, installs ServerLab on any Ubuntu server without Tailscale. It installs Node.js and nginx if needed, publishes ServerLab on the port you choose over HTTPS with a self-signed certificate (or plain HTTP with `--http`), opens the port in UFW when it is active, and remembers your choices for updates. Build it with `scripts/build-installer.sh`.
- `install.sh --app-port N` (and `WEB_PORT` in `/etc/serverlab/serverlab.env`): run the web app on another local port when 3000 is taken.

### Changed
- The README logo sits on its own dark banner, so it reads on GitHub's light and dark themes.

## 1.0.0 — 2026-11-01

The first public release of ServerLab: a small, Grafana-like dashboard for one homelab server, reachable only over your Tailscale tailnet.

### Monitoring
- **Lobby:** every Docker container, systemd service, nginx site and database on the server, with icons, health, uptime and Open links. Flags anything exposed to the LAN; add items and icons by hand.
- **Resources:** live CPU, memory, GPUs (NVIDIA, AMD, Intel), temperatures, network and disk, with 24 h, 7 d and 30 d history.
- **Applications:** CPU and memory per container and service, ranked.
- **User Watcher:** SSH, console and web sign-ins with offline geolocation; imports existing login history.
- **Alerts:** ready-made and custom rules, delivered in-app and to ntfy, Discord or Telegram.

### New in this release
- **Firewall page (UFW):** turn the firewall on and off, set default policies and logging, list, add and delete rules. Every control shows the exact `ufw` command it runs; the add-rule form previews it as you type. A lockout guard asks for confirmation before anything could cut off SSH or Tailscale access.
- **fail2ban page:** jails, banned addresses, unban and manual ban, each showing its `fail2ban-client` command, with setup steps and a starter `jail.local` when fail2ban is missing.
- **Activity log** on both pages with every command that ran, its exit code and output.
- **Root helper** (`serverlab-host-action.service`) behind both pages: a polkit rule lets the unprivileged `serverlab` user start only this unit, which re-validates each request and runs only `ufw` and `fail2ban-client`, without a shell.
- **Mobile:** the menu is now a drawer that closes on a tap outside it, a link, the close button or Escape; every page fits a phone screen.
- **New logo** ("Bastion"), app icons and social preview.
- **Tests:** 456 unit tests and a 38-test Playwright end-to-end suite (desktop and phone); CI on every push.

### Fixed
- The mobile menu could not be closed by tapping outside it, stayed open after navigating, and closed by itself while scrolling.
- The top bar, Lobby tabs and chart headers overflowed narrow screens.
- Page titles are real headings for screen readers.

### Upgrading from a pre-release install
`git pull && sudo deploy/install.sh`. Data, settings and the admin password are kept; one database migration runs automatically.
