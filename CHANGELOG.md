# Changelog

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
