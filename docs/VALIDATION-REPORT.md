# ServerLab validation report — 2026-10-25, Ubuntu desktop (HP laptop), Ubuntu 26.04.1 LTS

## Summary
The first round (2026-10-25, below) validated the build, the Linux driver and the web UI on a real host and fixed the security findings. The second round (2026-11-01, at the end) covers the mobile menu, the Firewall and fail2ban pages and the new end-to-end suite.

## Environment
| Item | Value |
|---|---|
| OS | Ubuntu 26.04.1 LTS (resolute), **desktop** install (not Server) |
| Kernel | 7.0.0-38-generic |
| systemd | 259 (259.5-0ubuntu3.4) |
| cgroup | cgroup2fs |
| CPU / RAM | 8 threads (Skylake-H), 29 GiB |
| GPUs | Intel HD Graphics 530 (card1) + NVIDIA Quadro M2000M (card2), driver 580.178.04, `nvidia-smi` present, `intel_gpu_top` absent |
| hwmon | AC, hp, coretemp, iwlwifi_1_7, acpitz ×6, BAT0, nvme, pch_skylake |
| Node | not installed at start; installed from the Ubuntu archive (`nodejs` 22.22.1) |
| OpenSSH | OpenSSH_10.2p1 Ubuntu-2ubuntu3.6 (sshd installed, `ssh.service` inactive) |
| Docker | daemon active; admin user is not in the `docker` group |
| nginx | not running |
| Tailscale | running (tailnet address omitted) |
| Listeners at start | 127.0.0.53/54:53 (resolved), 127.0.0.1:5432 (PostgreSQL), 127.0.0.1:631 + [::1]:631 (CUPS), Tailscale IP high ports (tailscaled) |
| Login sources | journal (no sshd entries yet), `/var/log/auth.log` (empty, `syslog:adm 640`), `/var/log/wtmp` + `/var/log/btmp` present, **`last`/`lastb`/`wtmpdb` not installed** |

Starting state of the copy: the project was copied from macOS. It contained 1,680 AppleDouble `._*` files and `.DS_Store`, every file was mode 755, and `node_modules` was a macOS build (no Linux `better-sqlite3` binary). Cleaned up and committed as the git baseline `ed84db0`.

## Results
| # | Check | Result | Notes |
|---|---|---|---|
| 1 | `npm ci` on Linux | pass | 551 packages; native `better-sqlite3` and `@node-rs/argon2` load |
| 2 | `npm run lint` | pass | |
| 3 | `npm run type-check` | **fail → fixed** | Failed on a clean checkout (finding 2) |
| 4 | `npm test` | pass | 294 → 301 tests after the new parser tests |
| 5 | `npm run build` | pass | Next 16.4.2 + collector bundle, no warnings |
| 6 | `npm audit --omit=dev` | pass | 0 vulnerabilities |
| 7 | `npm audit` (dev) | 4 moderate | esbuild ≤0.24.2 via `drizzle-kit` → `@esbuild-kit/*`; dev-server-only advisory, `drizzle-kit` is only used for `db:generate`. Not shipped |
| 8 | `shellcheck deploy/*.sh` | pass | No warnings |
| 9 | Collector, Linux driver, as the desktop user (adm, no docker) | pass | Starts, no errors in the log, detects capabilities correctly (docker false, journal true, both GPUs, Tailscale, MagicDNS name) |
| 10 | CPU % | pass | 15.4 % vs `mpstat` 14.7 % over the same 20 s |
| 11 | Memory | pass | `mem_used` 7,065,038,848 = `free -b` used exactly; swap 0 = 0 |
| 12 | CPU temperature | pass | Equals coretemp `Package id 0` sysfs value on 5/5 reads |
| 13 | GPU | pass | NVIDIA: util, temp (42 °C), VRAM (6 MiB / 4096 MiB) match `nvidia-smi`; power N/A → null. Intel iGPU: "no stats" message as designed |
| 14 | Network | pass | wlp3s0 rx 4.80 MB/s vs 4.46 MB/s from `/proc/net/dev`, tx 73.3 vs 68.6 kB/s (30 s window, bursty traffic, 2 s sample alignment). tailscale0 excluded from the host total by design (its traffic is already counted on the physical NIC) |
| 15 | Disk I/O / usage | pass | nvme r/w within 15 % of `/proc/diskstats` over the same window; mounts = `df` minus pseudo filesystems (incl. an exfat USB disk) |
| 16 | Lobby | pass after fixes | docker, tailscaled, postgresql@18-main (Databases), gdm, bluetooth, iio-sensor-proxy, nvidia-persistenced; CUPS port 631 as "Port 631" (findings 3, 4, 6) |
| 17 | App usage | pass after fix | Memory matches `systemctl show -p MemoryCurrent` minus `inactive_file` (postgres 35.4 MiB vs 35.6 MiB) |
| 18 | Logins | partial | Journal readable via `adm`; no sshd events exist yet (ssh.service inactive). Web sign-ins recorded |
| 19 | Web UI (`next start`, 127.0.0.1:3100) + `npm run smoke` | pass | 17/17 checks; screenshots reviewed: no empty panels, units correct, GPU panels correct, no duplicate cards |

## Findings
| # | Severity | Area | Finding | Status | Fix / test |
|---|---|---|---|---|---|
| 2 | low | Tooling | `npm run type-check` failed on a fresh clone with TS2304 `PageProps`/`LayoutProps`: those globals are generated into `.next/types`, which only existed on the Mac from an earlier build | fixed | `type-check` now runs `next typegen && tsc --noEmit` |
| 3 | medium | App usage | Template systemd units (`postgresql@18-main.service`, any `foo@bar.service`) live in `system.slice/system-foo.slice/`, but app usage read `system.slice/<unit>`, so they had **no CPU/memory data** and were missing from the Applications page | fixed | Read `ControlGroup` from `systemctl show`; new `collector/parsers/parse-systemctl-show.ts` + test + fixture `systemctl-show-ubuntu-26.04.txt` |
| 4 | low | Lobby | tailscaled's PeerAPI listeners (random port per Tailscale IP, new on each restart) appeared as two unnamed "Port N" cards on **every** install, with "Open" links | fixed | Ports read from `tailscale status --json` `Self.PeerAPIURL` and attributed to `tailscaled.service`; `tailscale-source.test.ts` |
| 5 | low | Code quality | `SystemReader`'s constructor parameter was named `includedExtraInterfaces` but holds `NETWORK_INTERFACE_EXCLUDE` | fixed | Renamed |
| 6 | info | Lobby | CUPS (desktop only) is on the unit denylist, and `ss` can't name root's `cupsd`, so 127.0.0.1:631 shows as "Port 631". Correctly scoped as local | accepted | Rare on servers; hide it per card if needed |
| 7 | low | Resources | ACPI thermal zone `acpitz_5` reports a constant 0.0 °C and is charted | open | Could drop exact-0 readings from non-CPU hwmon sensors |
| 8 | low | User Watcher | Logins from loopback (e.g. through the SSH tunnel HARDENING §4.1 suggests) are tagged "LAN". This is documented behaviour of `classifyNetworkTag`, but misleading | open | Needs a `local` network tag (schema enum, badges, filters); a design decision |
| 9 | info | Tooling | Ubuntu 26.04 ships uutils coreutils: `date +%3N` prints 9 digits. Project scripts only use `stat -c`, `readlink -f`, `date +%F`, all verified working | accepted | none |
| 10 | medium | Auth | **Concurrent sign-in requests bypassed the lockout.** `signIn` checked the lock, awaited argon2, then recorded the failure, so N parallel guesses from one IP were all verified | fixed | `verifyWithThrottle` (`lib/authentication/login-throttle.ts`) records the attempt synchronously before verifying; test fires 10 concurrent attempts and asserts exactly 5 verifications |
| 11 | medium | Auth | `X-Real-IP`/`X-Forwarded-For` are trusted from any client that reaches 127.0.0.1:3000 directly (local process, `network_mode: host` container, SSH tunnel). Rotating fake IPs evades the per-IP lockout. Through the shipped nginx config it is **not** spoofable (nginx overwrites both) | partly fixed | Values must now be IP addresses (`pickClientAddress` + test), so junk/oversized strings no longer reach the Watcher or throttle table. Full fix (nginx-to-app shared secret header) is an open item |
| 12 | low-medium | User Watcher | **SSH usernames could forge the source IP.** Logging in as `evil from 100.64.0.7 port 1` made the lazy regex record 100.64.0.7 (tailnet) instead of the real address: evades the per-IP brute-force alert, frames other hosts | fixed | Greedy usernames + tail anchored to end of line (`parse-sshd-line.ts`); 4 new cases |
| 13 | low | User Watcher | **Any local user could forge SSH logins** with `logger -t sshd "Accepted password for root from <ip> …"` (SYSLOG_IDENTIFIER is client-set), incl. triggering "new country" alerts | fixed (journal) | `parseJournalEntry` requires journald's trusted `_UID=0`; `login-source.test.ts`. The `/var/log/auth.log` fallback cannot tell them apart (accepted; only used without journal access). Runtime check that real OpenSSH 10.2 pre-auth lines carry `_UID=0`: see §6.3 |
| 14 | low | Secrets | A malformed `DISCORD_WEBHOOK_URL`/`NTFY_URL`/Telegram token put the **secret into error text** (`Failed to parse URL from discord.com/api/webhooks/…/TOKEN`), which was stored in `settings`, shown on the Settings page and logged to the journal | fixed | `postWithTimeout` maps errors to `invalid URL` / `network error` / `timed out` / `HTTP <status>`; `notifiers.test.ts` |
| 15 | info | Icon uploads | SVG validator bypass via CSS escapes (`u\72l(`, `@\69mport`) and XML char refs (`&#117;rl(`). Not exploitable: served with `sandbox` CSP and rendered via `<img>` | fixed | Reject `\` and `&#`; 4 new cases; all 82 catalog SVGs still pass |
| 16 | info | Lobby | Docker labels are stored unbounded (`serverlab.name`/`description` untruncated); React escapes them, so display/DB bloat only | open | Cap label count/length in `docker-source.ts` |
| 17 | info | nginx parsing | Include walker reads before `stat` and follows symlinks; a FIFO/`/dev/zero` include would hang the collector. Only root controls `/etc/nginx` | open | `stat` first, require `isFile()`, cap size |
| 18 | info | SSE | A revoked session's open `/api/stream` stays open until nginx's 1 h timeout | accepted | Single admin; revalidate the session periodically if it matters |
| 19 | info | SSRF | Admin-supplied health-check URLs are fetched by the collector (can reach LAN). Admin-only, blind (healthy/unhealthy), no redirects | accepted | Documented |
| 1 | info | Logins | Ubuntu 26.04 removed `last`/`lastb` from util-linux; they now come from the `wtmpdb` package, which is not installed by default on this desktop. `/var/log/wtmp` and `btmp` still exist. The collector already falls back (journal, then auth.log) and skips wtmp backfill | accepted | none needed |

## Changes made
- `package.json`: `type-check` runs `next typegen` first (finding 2).
- `collector/parsers/parse-systemctl-show.ts` (+ test, fixture), `collector/drivers/linux/systemd-source.ts`, `collector/drivers/linux/app-usage-source.ts` (finding 3).
- `collector/drivers/linux/tailscale-source.ts` (+ test), `collector/drivers/linux/linux-driver.ts` (finding 4).
- `collector/drivers/linux/system-source.ts` rename (finding 5).
- Security fixes (findings 10–15): `lib/authentication/login-throttle.ts`, `app/actions/authentication-actions.ts`, `lib/authentication/request-context.ts`, `collector/parsers/parse-sshd-line.ts`, `collector/drivers/linux/login-source.ts`, `collector/alerts/notifiers.ts`, `lib/lobby/custom-icon-validation.ts`, each with tests. Total tests: 320.
- Removed macOS `._*` / `.DS_Store` files, normalized modes (644, `deploy/*.sh` 755), added `._*` to `.gitignore`, `git init` + baseline commit.

## Open items for the user
- **Finding 11:** to make the client IP unspoofable for local processes, nginx would send a secret header (`proxy_set_header X-ServerLab-Proxy <secret>`) that the app checks against the env file. Changes `install.sh` and the nginx site. Decide whether that threat (local process / host-network container) matters for you.
- **Finding 8:** add a `local` network tag for loopback logins?

---

# Round 2 — 2026-11-01: mobile menu, Firewall and fail2ban pages, end-to-end tests

Same host (Ubuntu 26.04.1 LTS). UFW is installed but **not enabled** (`/etc/ufw/ufw.conf`: `ENABLED=no`; the `ufw` systemd unit reports "active" only because it is a one-shot boot script). fail2ban is not installed.

## Results
| # | Check | Result | Notes |
|---|---|---|---|
| 1 | `npm run lint` | pass | |
| 2 | `npm run type-check` | pass | |
| 3 | `npm test` | pass | 456 tests (was 332): new parsers for `ufw status` / `ufw show added` / `fail2ban-client`, command builders, validation (injection strings, CIDR, ports), lockout guard, the root helper (symlinks, file ownership, bad JSON, request id mismatch), the collector job |
| 4 | `npm run build` | pass | web app, collector, and the self-contained root helper (`dist/host-action/index.js`, only Node built-ins) |
| 5 | `npm run test:e2e` (Playwright, Chromium 1248) | pass | 37 tests: setup and sign-in, 8 pages × desktop and Pixel 7 (no console errors, no sideways scroll), SSE, mobile drawer, firewall add/delete/lockout, fail2ban ban/unban |
| 6 | Root helper refuses to run as non-root | pass | `node dist/host-action/index.js` exits 1 |
| 7 | Root helper on the real host (`install.sh`, polkit, real `ufw`/`fail2ban-client`) | **not yet run** | needs sudo; see "Open items" |

## Findings
| # | Severity | Finding | Fix |
|---|---|---|---|
| R2-1 | High (mobile) | The mobile menu backdrop was a CSS pseudo-element, so tapping outside the menu did nothing; links did not close it; every `resize` (fired by mobile address bars while scrolling) closed it; no Escape, scroll lock or focus trap | Headless UI dialog drawer below 1280px; closes on tap outside, link, close button, Escape and route change |
| R2-2 | Medium (mobile) | Top bar, Lobby group tabs and chart headers overflowed 390px screens (sideways scrolling) | Responsive classes; breadcrumb hidden below 768px |
| R2-3 | Low (a11y) | Page titles were `<div>`s: pages had no heading | `PageHeader` renders an `<h1>` |
| R2-4 | Low | A `sr-only` table heading escaped its scroll container and widened the page on phones | Scroll container is `relative` |

## Open items for the user
- Re-run `sudo deploy/install.sh` to install the helper (unit, polkit rule, tmpfiles), then check the Firewall page against `sudo ufw status numbered` and `sudo ufw show added`.
- Optional: `sudo apt install fail2ban`, then check the fail2ban page against `sudo fail2ban-client status sshd`, and ban/unban a documentation address (`198.51.100.77`) from the page.
