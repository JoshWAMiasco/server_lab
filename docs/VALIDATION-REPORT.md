# ServerLab validation report — 2026-10-25, Ubuntu desktop (HP laptop), Ubuntu 26.04.1 LTS

## Summary
_In progress._

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
| Tailscale | running, 100.126.119.91 |
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
| 1 | info | Logins | Ubuntu 26.04 removed `last`/`lastb` from util-linux; they now come from the `wtmpdb` package, which is not installed by default on this desktop. `/var/log/wtmp` and `btmp` still exist. The collector already falls back (journal, then auth.log) and skips wtmp backfill | accepted | none needed |

## Changes made
- `package.json`: `type-check` runs `next typegen` first (finding 2).
- `collector/parsers/parse-systemctl-show.ts` (+ test, fixture), `collector/drivers/linux/systemd-source.ts`, `collector/drivers/linux/app-usage-source.ts` (finding 3).
- `collector/drivers/linux/tailscale-source.ts` (+ test), `collector/drivers/linux/linux-driver.ts` (finding 4).
- `collector/drivers/linux/system-source.ts` rename (finding 5).
- Removed macOS `._*` / `.DS_Store` files, normalized modes (644, `deploy/*.sh` 755), added `._*` to `.gitignore`, `git init` + baseline commit.

## Open items for the user
