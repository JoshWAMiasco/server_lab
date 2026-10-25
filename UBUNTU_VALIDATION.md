# ServerLab: Ubuntu validation, security review and bug fixing

**For:** Claude Code, running on the Ubuntu Server host where ServerLab will live (or a disposable Ubuntu VM).
**Goal:** find out what actually works on real Linux, then find and fix bugs and security problems. Produce a written report.

Read `CLAUDE.md` (conventions, enforced by `npm run lint`), `README.md` and `docs/HARDENING.md` before you start. `spec.md` is read-only. The design lives in `docs/plan/`; its decision log (`docs/plan/00-overview.md`) records where the build deviates from the plan.

---

## 0. Ground rules

1. **This may be a production host.** Before changing anything system-wide (installing packages, units, nginx config, UFW), say what you are about to do and ask the user. Prefer a VM if one is available.
2. **Never expose ServerLab or any app to the internet or LAN.** No `tailscale funnel`, no `listen 0.0.0.0`, no UFW rules that open ports. Bind to 127.0.0.1 or the Tailscale IP only.
3. **Do not weaken security to make something work.** Examples: adding the web unit to the `docker` group, running the collector as root, removing systemd sandboxing, setting `COOKIE_SECURE=false` in production. If a privilege seems necessary, write it down as a finding and propose the narrowest option.
4. **The Docker client must stay GET-only** (`collector/sources/docker-client.ts`, guarded by `docker-client.test.ts`).
5. **Keep fixes small and tested.** For every bug: write or extend a test (vitest) that fails first, fix it, and re-run `npm test && npm run lint && npm run type-check`. Real-host output that exposes a parser bug becomes a fixture in `collector/__fixtures__/`. Replace real public IPs with documentation ranges (203.0.113.0/24, 198.51.100.0/24) and real usernames and hostnames with placeholders.
6. **Do not commit or push unless the user asks.** If the folder is not a git repository yet, suggest `git init` plus a first commit before you change anything, so every fix is reviewable.
7. **Record everything** in `docs/VALIDATION-REPORT.md` (format at the end). Write it as you go, not at the end.

---

## 1. Where the project stands (as of 2026-10-25)

| Area | Status |
|---|---|
| All v1 features (Lobby with custom icon upload, Resources, Applications, User Watcher, Alerts, Settings, auth) | Implemented. Exercised end to end on macOS with the **mock** driver |
| Unit tests | ~294 vitest tests pass. These include 219 parser tests using fixtures captured from Ubuntu 22.04/24.04/25.x output (not from this host) |
| Browser smoke test | `npm run smoke` passes against dev and production builds on macOS |
| `npm run build` (Next + collector bundle) | Passes on macOS, no warnings |
| **Linux driver** (`collector/drivers/linux/*`) | **Never run on Linux.** Every source is unverified on real hardware: /proc, hwmon, GPUs, cgroups, Docker, systemd, ss, nginx parsing, journal, wtmp/btmp, Tailscale |
| **`deploy/install.sh`, systemd units, timers, nginx examples** | **Never run.** Only `bash -n` was checked; shellcheck was not available |
| Security review | Self-reviewed on macOS (see §6 for what was fixed). No independent review on the target OS |

### Known risks and open questions

- **One transient `SQLITE_CORRUPT` ("database disk image is malformed")** was seen once in macOS **development** mode: the web process reported it while `sqlite3 PRAGMA integrity_check` said the file was fine. It could not be reproduced in production mode, even with 6 collector restarts under load. Watch for it on Linux. If it appears, capture the logs and the timing (collector restart? retention job? WAL checkpoint?) and investigate.
- **`ss -p` as a non-root user** only names processes the `serverlab` user owns, so listeners outside Docker, nginx and catalog units show as "Port N". Confirm this on the host and judge whether it is acceptable.
- **`last` output has no timezone.** `parse-last-output.ts` reads it in the collector's local timezone. Check that backfilled logins line up with `journalctl` times.
- **Intel iGPU stats** need `intel_gpu_top` plus `CAP_PERFMON`. They are disabled unless configured.
- **nginx parsing** handles includes, upstreams, `map` and `if`, but has only seen synthetic configs.
- **Web login events** are geolocated by the web process, which opens the GeoIP file once. After the monthly GeoIP update it keeps the old file until restarted (the update timer only restarts the collector).

---

## 2. Survey the environment (read-only)

Run these and paste the results into the report:

```bash
lsb_release -a; uname -r; systemd --version | head -1
node -v; npm -v                                  # needs Node 22+
id; groups
ls -l /var/run/docker.sock; docker version --format '{{.Server.Version}}' 2>&1
systemctl is-active nginx tailscaled docker 2>&1
tailscale status --json | head -c 300; echo
ss -tlnpH | head -30
ls /sys/class/drm/; lspci | grep -iE 'vga|3d|display'
command -v nvidia-smi intel_gpu_top last lastb wtmpdb journalctl
ls /sys/class/hwmon/*/name 2>/dev/null | xargs -r cat
stat -fc %T /sys/fs/cgroup                       # must be cgroup2fs
journalctl -n 5 SYSLOG_IDENTIFIER=sshd + SYSLOG_IDENTIFIER=sshd-session -o short-iso
```

Note which Ubuntu release this is (22.04 / 24.04 / 25.x / 26.04), the OpenSSH version (`ssh -V`), and which login sources exist (journal, auth.log, wtmp, wtmpdb).

---

## 3. Build and static checks (as your normal user)

```bash
cd <project directory>
npm ci
npm run lint && npm run type-check && npm test
npm run build
npm audit --omit=dev            # report anything high or critical
npm audit                       # dev dependencies too; report, but they don't ship to runtime
```

Any failure here is a finding. Fix it before moving on.

---

## 4. Run the Linux driver outside systemd first

Do this **before** `install.sh`. Use a throwaway database so it never touches real data:

```bash
mkdir -p /tmp/serverlab-validate
export DATABASE_PATH=/tmp/serverlab-validate/serverlab.db COLLECTOR_DRIVER=linux COOKIE_SECURE=false
node dist/collector/index.js 2>&1 | tee /tmp/serverlab-validate/collector.log &
sleep 90
```

Then inspect what it wrote. The capabilities first:

```bash
sqlite3 -header -column "$DATABASE_PATH" "SELECT key, value FROM capabilities;"
```

Then check each source against the host's own tools. Record every mismatch:

| Check | ServerLab query | Compare with | Tolerance (from plan) |
|---|---|---|---|
| CPU % | `SELECT ts, cpu_pct FROM metric_samples ORDER BY id DESC LIMIT 5;` | `mpstat 2 3` or `top -bn2` | ±3 % |
| Memory | `SELECT mem_used, mem_total, swap_used FROM metric_samples ORDER BY id DESC LIMIT 1;` | `free -b` ("used" excludes cache) | ±3 % |
| CPU temperature | `cpu_temp_c` | `sensors` | ±1 °C (null in VMs is expected) |
| GPU | `SELECT * FROM gpu_samples ORDER BY rowid DESC LIMIT 3;` | `nvidia-smi` / `cat /sys/class/drm/card*/device/gpu_busy_percent` | ±3 %, ±1 °C |
| Network | `SELECT * FROM net_iface_samples ORDER BY rowid DESC LIMIT 6;` | `cat /proc/net/dev` twice, 2 s apart | interface set and rough rate |
| Disk I/O / usage | `disk_io_samples`, `fs_usage` | `iostat -dx 2 2`, `df -B1` | mounts match `df` minus pseudo filesystems |
| Lobby | `SELECT key, source, catalog_id, state, health, bind_scope, via_nginx_key FROM discovered_items;` | `docker ps -a`, `systemctl list-units --type=service --state=running`, `ss -tlnp`, nginx sites | every container and meaningful service present, correct exposure |
| App usage | `SELECT app_key, mem_bytes, cpu_pct FROM app_usage_samples ORDER BY id DESC LIMIT 30;` | `docker stats --no-stream`, `systemctl status <unit>` "Memory:" | ±5 % |
| Logins | `SELECT ts, channel, username, result, src_ip, network_tag, backfilled FROM login_events ORDER BY ts DESC LIMIT 20;` | `journalctl -u ssh`, `last -F -i -w`, `lastb` | times and counts line up |

Then start the web UI against the same database and look at every page:

```bash
printf '%s\n%s\n' 'validate-password-123' 'validate-password-123' | npx tsx scripts/serverlab-cli.ts reset-password
npx next start -H 127.0.0.1 -p 3100 &
```

Reach it through an SSH tunnel (`ssh -L 3100:127.0.0.1:3100 host`), not by binding it wider. Run the smoke test too:

```bash
npx playwright-core install chromium          # once; downloads a headless Chromium
BASE_URL=http://127.0.0.1:3100 SERVERLAB_PASSWORD=validate-password-123 SCREENSHOT_DIRECTORY=/tmp/serverlab-validate npm run smoke
```

Look at the screenshots in `/tmp/serverlab-validate/`. Check for empty panels, wrong units, a GPU panel on a GPU-less host, and missing or duplicated Lobby cards.

Also run the collector **as a user like the production one** (no docker, journal or adm groups) to confirm every source degrades instead of crashing:

```bash
sudo -u nobody env DATABASE_PATH=/tmp/serverlab-validate/nobody.db COLLECTOR_DRIVER=linux node dist/collector/index.js
```

Stop everything and delete `/tmp/serverlab-validate` afterwards.

---

## 5. Install for real (ask the user first)

Follow `docs/HARDENING.md` §2–§4 and run `sudo deploy/install.sh`. Then work through `docs/HARDENING.md` **§9 Verify** and **§10 Checklist** item by item and record the result of each in the report. Additionally:

```bash
systemd-analyze security serverlab-web.service serverlab-collector.service
systemctl show serverlab-collector -p SupplementaryGroups -p User
systemctl show serverlab-web -p SupplementaryGroups -p IPAddressDeny
journalctl -u serverlab-web -u serverlab-collector --since -10min --no-pager | grep -iE 'error|warn|denied|EACCES|EPERM' | head -50
sudo -u serverlab test -w /opt/serverlab && echo "BAD: code is writable by serverlab"
stat -c '%a %U:%G %n' /var/lib/serverlab /var/lib/serverlab/* /etc/serverlab/serverlab.env
ss -tlnp | grep -E ':3000|node'                # must be 127.0.0.1 only
curl -sI https://<magicdns>/login | grep -iE 'strict-transport|content-security|x-frame|referrer'
```

The sandbox (`ProtectSystem=strict`, `ProtectProc`, `RestrictAddressFamilies`) is the most likely place for Linux-only breakage: `EACCES`/`EPERM` in the journal, empty GPU or temperature data that worked in §4, a Next cache write error. Fix by granting the narrowest permission, and record each change.

---

## 6. Feature acceptance tests (from `docs/plan/*`)

Run each one and record pass or fail:

1. **Setup:** `/setup` needs the token printed by `install.sh`. A wrong token is rejected and counts toward the IP lockout. After setup, `/setup` returns 404 and `/var/lib/serverlab/setup-token` is gone.
2. **Auth:** anonymous `/resources` redirects to `/login`; anonymous `/api/stream` returns 401. The 6th wrong password within 15 minutes gets "Locked, try again in 15:00". Deleting a row from `sessions` logs that browser out on its next navigation. `sudo serverlab reset-password` works.
3. **User Watcher:** an SSH login from another machine appears within 5 s. A Tailscale login shows the device name; a LAN login shows "LAN" with no location. Restarting the collector creates no duplicates (`SELECT dedupe_hash, count(*) FROM login_events GROUP BY 1 HAVING count(*) > 1;` returns nothing). Ten failed logins from one IP (`for i in $(seq 10); do ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no invalid-user@<host> true; done` from another box) send exactly one "SSH brute force" notification.
4. **Lobby:** uploading a custom icon (Edit → Upload icon) shows it on the card. Without an upload the card keeps the catalog icon. Every container and catalog unit appears within 60 s, with the right icon and source badge. Renaming or hiding a container survives `docker compose up -d --force-recreate`. Postgres or MySQL show under Databases. A test container published on `0.0.0.0` gets "Exposed to LAN" and fires "Service exposed".
5. **Alerts:** `stress-ng --cpu 0 -t 6m` fires "High CPU" at about 5 min and resolves after it ends: one firing and one resolved notification. `docker stop <container>` sends "Service down" within 70 s. Restarting the collector while an alert is firing sends no duplicate. Settings → "Send test" works for each configured channel.
6. **Resources:** with the collector stopped, the "Collector offline" banner appears within 60 s. 7d history loads in under 300 ms (`curl -w '%{time_total}'` with a session cookie). Collector CPU stays low (`pidstat -p $(pgrep -f dist/collector) 5 6`). Report the average.
7. **Retention / growth:** after a few hours, record the DB size (`ls -l /var/lib/serverlab`) and row counts per table. The plan estimates 60–80 MB of raw data per day on a 16-core host.

---

## 7. Security review: where to look

Already hardened on macOS (verify these still hold, don't redo them): the open-redirect check after login (`lib/authentication/safe-next-path.ts`), CSV formula injection in exports (`components/data-grid/export-rows.ts`), `http(s)`-only URLs from Docker labels (`lib/queries/lobby-queries.ts`), the setup-token brute-force throttle, no shell when looking up programs (`collector/drivers/linux/run-command.ts`), the sliding session cookie (`proxy.ts`), and validated icon uploads served with a sandboxing CSP (`lib/lobby/custom-icon-validation.ts`, `app/custom-icons/[iconId]/route.ts`).

Review these with an attacker's mindset. The realistic attackers are another device on the tailnet, a malicious container, an SSH brute-forcer controlling usernames, and a compromised npm dependency:

| Area | Files | Questions |
|---|---|---|
| Server actions authorization | `app/actions/*.ts` | Does every action except `signIn`/`completeSetup` call `requireSession` first? Is every input validated (zod) and bounded? |
| Session and cookies | `lib/authentication/*`, `proxy.ts` | Token entropy, hashing, expiry, `Secure`/`HttpOnly`/`SameSite=Strict` in production, revocation after a password change. Is client-IP detection (`X-Real-IP` / `X-Forwarded-For`) spoofable given the real nginx config? |
| Attacker-controlled strings reaching the UI | sshd usernames, container names/labels, nginx `server_name`, systemd descriptions | Any `dangerouslySetInnerHTML`, unescaped HTML (print/HTML export), log injection, oversized values? Try SSH usernames containing `<script>`, `=cmd`, very long strings, unicode RTL characters |
| Command execution | `collector/drivers/linux/*` | Only `execFile`/`spawn` with constant program names and argument arrays? Could a container name, unit name or file name become an argument that changes behaviour (e.g. a leading `-`)? |
| Paths | `app/catalog-icons/[iconName]/route.ts`, `collector/drivers/linux/nginx-source.ts` | Path traversal, symlink following in nginx includes (`/etc/nginx` writable by others?), include loops, huge files |
| SSE | `app/api/stream/route.ts` | Auth on connect; what happens when the session is revoked while a stream is open (it currently stays open; decide whether that matters); connection limits and memory per client |
| SSRF | `collector/jobs/manual-health-job.ts`, notifiers | The admin-supplied health-check URL is fetched by the collector, which can reach the LAN and metadata endpoints. Acceptable for a single-admin app? Document it |
| Icon uploads | `lib/lobby/custom-icon-validation.ts`, `lib/lobby/custom-icon-store.ts`, `app/custom-icons/[iconId]/route.ts`, `next.config.ts` | Try to bypass the SVG checks (encodings, `<use href>` to external files, CSS `url()`, polyglot PNG+HTML files). Confirm the response keeps `sandbox` CSP and `nosniff`, that anonymous requests are refused, and that unused uploads are pruned |
| Docker | `collector/sources/docker-client.ts` | Still GET-only? Socket path from `DOCKER_HOST` only? |
| CSP and headers | `next.config.ts` | `script-src 'unsafe-inline'` is required by Next without nonces. Is a nonce-based CSP feasible now? |
| systemd sandbox | `deploy/*.service` | Use the `systemd-analyze security` exposure scores; tighten anything not needed |
| Secrets | `/etc/serverlab/serverlab.env`, logs | Do webhook URLs or tokens ever appear in logs, the UI, error messages or the database? |
| Dependencies | `package-lock.json` | `npm audit` results; any package with install scripts that runs during `npm ci` as root in `install.sh` |
| Database | `lib/database/*` | File modes (600), WAL/shm modes, backups readable by whom? |

For each real issue: give its severity, a reproduction, the fix and a test.

---

## 8. Report format: `docs/VALIDATION-REPORT.md`

```markdown
# ServerLab validation report — <date>, <hostname>, Ubuntu <release>

## Summary
<3–5 sentences: what works, what doesn't, what was fixed, what still needs the user>

## Environment
<output of §2, condensed>

## Results
| # | Check | Result | Notes |
|---|---|---|---|

## Findings
| # | Severity (critical/high/medium/low/info) | Area | Finding | Status (fixed/open/accepted) | Fix / test |
|---|---|---|---|---|---|

## Changes made
<files changed, why, tests added; system changes made with the user's approval>

## Open items for the user
<decisions only the user can make, e.g. accepted risks, privileges to grant>
```

When you finish, re-run `npm run lint && npm run type-check && npm test && npm run build`, rebuild and restart the units (`sudo deploy/install.sh` re-runs safely), run `npm run smoke` against the installed instance, and paste the results into the report.
