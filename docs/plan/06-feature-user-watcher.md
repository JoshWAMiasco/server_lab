# 06 — Feature: User Watcher (`/watcher`)

> Spec: *"monitors user access login to your server. the user, timestamp, geolocation"*

## Event sources
| Source | Method | Captures |
|---|---|---|
| sshd (live) | spawn `journalctl -f -o json SYSLOG_IDENTIFIER=sshd SYSLOG_IDENTIFIER=sshd-session --after-cursor=<saved>`; persist `__CURSOR` so restarts resume without gaps or duplicates | `Accepted publickey for X from IP port P`, `Failed password for X`, `Invalid user X from IP`, `Connection closed by authenticating user` |
| sshd (fallback) | tail `/var/log/auth.log` (rsyslog, `adm` group) when there is no journal access | same regexes |
| History backfill (first run only) | journal (`--since "-365d"`), plus `last -F -i -w` (wtmp, or `wtmpdb last` on newer releases) and `lastb` (btmp, failed logins) | logins that happened **before ServerLab was installed** |
| Console / local | journal `_COMM=login`, `systemd-logind` `New session` | local TTY logins |
| ServerLab web | written directly by the auth module ([08](08-auth.md)) | web logins and failed attempts |

The parser is a pure function `parseSshdLine(msg) → LoginEvent | null`, unit-tested against real log samples from OpenSSH 8/9.

**History backfill:** ServerLab only sees logins live from the moment it is installed. On first run it also imports the login records Ubuntu already holds, so the Watcher isn't empty on day one.
- **Decision:** import **everything still available, capped at 365 days** (the retention limit).
- In practice that is usually only a few weeks to a few months: Ubuntu rotates `wtmp`/`btmp` monthly, and the journal is size-capped.
- It runs once in the background. A banner reads "Importing login history… 1,240 events". The events are tagged `backfilled` so they can be told apart from live ones.

**Ubuntu Server compatibility.** Every Ubuntu release that is currently supported, detected at runtime (no config):

| Release | OpenSSH | sshd log identifier | ssh unit | login records |
|---|---|---|---|---|
| 22.04 LTS | 8.9 | `sshd` | `ssh.service` | wtmp |
| 24.04 LTS | 9.6 | `sshd` | `ssh.socket` → `ssh.service` (socket-activated) | wtmp |
| 25.04 / 25.10 (interim) | 9.9+ | `sshd-session` (+ `sshd` for listener messages) | `ssh.socket` | wtmp or wtmpdb |
| 26.04 LTS (when released) | expected 10.x | as above | as above | wtmpdb |

- Filtering on `SYSLOG_IDENTIFIER` (both names) instead of the unit name handles socket activation and the sshd-session split.
- The collector checks for `wtmpdb` and `last` and uses whichever exists.
- `/var/log/auth.log` (rsyslog) is the fallback on every release.
- The journal is persistent by default on Ubuntu Server (`/var/log/journal`).

**Dedupe:** `dedupe_hash = sha1(ts + src_ip + src_port + username + result)`, with a UNIQUE constraint.

## Geolocation
- **Database:** **DB-IP "IP to City Lite"** `.mmdb` (CC-BY 4.0, free, no account). `install.sh` downloads it and a monthly systemd timer refreshes it. The `maxmind` npm reader is used.
  - Alternative: MaxMind GeoLite2-City if the user provides `MAXMIND_LICENSE_KEY`.
- **Network classification:**
  - `100.64.0.0/10` or `fd7a:115c:a1e0::/48` → `tailnet`. The device name and owner come from `tailscale status --json` (cached for 5 min).
  - RFC1918, loopback, link-local or ULA → `lan`
  - anything else → `public`, looked up in the GeoIP DB
- Lookups are offline, so no IP data leaves the server.

## UI
```
┌ USER WATCHER ──────────────────────── Range: [24h][7d][30d][All] ┐
│ ┌LOGINS TODAY 4┐ ┌FAILED 213┐ ┌UNIQUE IPs 37┐ ┌COUNTRIES 9┐      │
├───────────────────────────────┬──────────────────────────────────┤
│ Logins over time (stacked bar │ Failed attempts by country       │
│ success / failure per hour)   │ (horizontal bar, flag + name)    │
├───────────────────────────────┴──────────────────────────────────┤
│ DATA GRID                                                        │
│ Time ▾ | Result | User | Channel | Method | IP | Network | Location │
│ 22:14  ✔ success  joshua  ssh  publickey  100.101.2.3  TAILNET (macbook) │
│ 22:09  ✖ failure  root    ssh  password   185.x.x.x    PUBLIC  🇷🇺 Moscow │
│ [filters: result, user, channel, network, country] [Export CSV]  │
└──────────────────────────────────────────────────────────────────┘
```
- **Table:** the template's `data-grid` (TanStack: sort, filter, paginate, export). The row style follows `settings/device-history-section.tsx`.
- **Badges:** result (`success`/`danger` tone) and network tag (`info` for tailnet, `muted` for LAN, `warning` for public).
- **Charts:** `bar-chart` (stacked) and `bar-chart` (horizontal).
- **Flags:** emoji derived from the country code, so the template's demo flag images are not needed.
- **Live:** new rows slide in from the SSE `logins` topic.
- **No map (decided).** Geolocation is shown as text tags only: the country flag emoji, country, city, and a network tag. Counts appear in the summary tiles (countries, unique IPs) and the "failed by country" bar chart.

## Privacy note
IPs and locations are personal data. Retention defaults to 365 days and can be changed in Settings, and there is a "purge login history" button. See [09](09-hardening.md#data).

## Acceptance criteria
- An SSH login from another machine appears within 5 s.
- Parser fixtures from 22.04, 24.04 and 25.x all pass. On a fresh install, existing wtmp/btmp/journal history appears tagged `backfilled`.
- 1000 brute-force attempts are stored once each, and restarting the collector produces no duplicates.
- Tailnet logins show the device name, and LAN logins show "LAN" with no fake location.
- Parser unit tests pass on a fixture set of 30 or more real sshd lines.
