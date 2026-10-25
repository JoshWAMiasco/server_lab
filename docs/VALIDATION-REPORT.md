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

## Findings
| # | Severity | Area | Finding | Status | Fix / test |
|---|---|---|---|---|---|
| 1 | info | Logins | Ubuntu 26.04 removed `last`/`lastb` from util-linux; they now come from the `wtmpdb` package, which is not installed by default on this desktop. `/var/log/wtmp` and `btmp` still exist. The collector already falls back (journal, then auth.log) and skips wtmp backfill | accepted | none needed |

## Changes made
- Removed macOS `._*` / `.DS_Store` files, normalized modes (644, `deploy/*.sh` 755), added `._*` to `.gitignore`, `git init` + baseline commit.

## Open items for the user
