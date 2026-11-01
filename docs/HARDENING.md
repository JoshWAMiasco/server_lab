# ServerLab — Install and Hardening Guide

This guide is for the person installing ServerLab on their homelab server.

**Goal:** ServerLab is reachable **only over your Tailscale tailnet**. It is never reachable from the public internet, and not even from your LAN. It runs with as few privileges as possible.

**Supported hosts:** Ubuntu Server 22.04 LTS, 24.04 LTS, 25.x, 26.04 LTS. Bare metal or VM, with systemd.

**Order:** do sections 1 to 4 in order. If you already ran `install.sh`, continue with section 2. Then work through 5, and finish with the checks in [9. Verify](#9-verify).

## What you end up with
```
 tailnet device ──HTTPS──▶ 100.x.y.z:443   nginx ──▶ 127.0.0.1:3000  ServerLab (serverlab-web)
                           100.x.y.z:8096  nginx ──▶ 127.0.0.1:18096 Jellyfin (docker)
                           …one port per app, same hostname, same certificate

 serverlab-collector (no listener) ──▶ /var/lib/serverlab/serverlab.db ◀── serverlab-web
```

| Path | Owner, mode | What |
|---|---|---|
| `/opt/serverlab` | `root:serverlab`, group read-only | Code and build output |
| `/var/lib/serverlab/` | `serverlab:serverlab`, `700` | Data: `serverlab.db`, `setup-token`, `dbip-city-lite.mmdb` |
| `/var/cache/serverlab/` | `serverlab:serverlab`, `700` | Next.js runtime cache (`/opt/serverlab/.next/cache` links here) |
| `/etc/serverlab/serverlab.env` | `root:serverlab`, `640` | Configuration and secrets |
| `/etc/systemd/system/serverlab-web.service` | `root`, `644` | Web UI on `127.0.0.1:3000` |
| `/etc/systemd/system/serverlab-collector.service` | `root`, `644` | Metrics collector |
| `/etc/systemd/system/serverlab-collector.service.d/groups.conf` | `root`, `644` | Collector's extra groups (written by `install.sh`) |
| `/etc/systemd/system/serverlab-geoip-update.{service,timer}` | `root`, `644` | Monthly DB-IP download |
| `/usr/local/sbin/serverlab` | `root`, `755` | Admin command (`reset-password`, `migrate`) |

All source files are in the repository under `deploy/`.

---

## 1. Before you start

> **No Tailscale?** The standalone installer (README → "Without Tailscale") sets up nginx on a port you choose with a self-signed certificate instead of sections 2 and 3 below. Sections 5 (host hardening) and 6 (privileges) still apply. Restrict who can reach the port, for example with `--allow-from 192.168.1.0/24`, and keep SSH keys-only.


| Need | Why | Check |
|---|---|---|
| Ubuntu Server (see above) | Supported target | `lsb_release -d` |
| Node.js 22 or newer, system-wide | Runs both services | `node --version`, `which node` → `/usr/bin/node` |
| Tailscale | The only way in | `tailscale version` |
| nginx | The tailnet gateway | `nginx -v` |
| Docker (optional) | Container discovery and stats | `docker version` |

**Install Node.js 22 from NodeSource.** `install.sh` checks for it but does not install it for you.
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt-get install -y nodejs
```
Node from `nvm`, `snap` or a home directory does **not** work. The services run as `serverlab` with `ProtectHome=yes` and cannot see it.

**Get the code.** Clone it into your home directory. `install.sh` copies it to `/opt/serverlab`.
```bash
git clone <repository-url> ~/server_lab
cd ~/server_lab
```
All commands below with `deploy/...` paths run from this checkout.

---

## 2. Tailscale
1. **Install Tailscale and log in.**
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up --ssh   # --ssh is optional: Tailscale SSH instead of exposing sshd
   ```
2. **Enable MagicDNS and HTTPS certificates** in the Tailscale admin console (DNS page). Your server is now `<host>.<tailnet>.ts.net`.
3. **Restrict access with the tailnet policy.** Remove the default allow-all rule. Tag the server `tag:homelab` (Machines → ⋯ → Edit ACL tags). Then allow only yourself:
   ```json
   {
     "tagOwners": { "tag:homelab": ["you@example.com"] },
     "acls": [
       { "action": "accept", "src": ["you@example.com"], "dst": ["tag:homelab:22,443,8000-8999"] }
     ]
   }
   ```
   Use your own ports. With Tailscale SSH, also add an `ssh` rule for your user.
4. **Never use `tailscale funnel`.** Funnel publishes a service to the public internet.
5. **Remember two values.** The next sections use them:
   ```bash
   TS_IP=$(tailscale ip -4)
   TS_NAME=$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
   echo "$TS_IP $TS_NAME"
   ```

---

## 3. nginx as the single tailnet gateway

**Why:** MagicDNS gives the server **one hostname** and no subdomains. Name-based nginx vhosts would all collide on one port. Tailscale Serve allows only 3 HTTPS ports, and serving apps under sub-paths breaks many of them. So every app gets its own port on the same name and the same certificate.

**Rules:**
1. **Every app binds to `127.0.0.1` only.** Docker: `ports: ["127.0.0.1:18096:8096"]`. Docker-published ports **bypass UFW**, so this matters. Native services: set their listen address to `127.0.0.1`.
2. **nginx is the only network listener, and only on the Tailscale IP.** Every server block uses `listen 100.x.y.z:<port> ssl;`. Never `listen 80`, `0.0.0.0` or `[::]`. One unique port per app, so links are `https://<magicdns>:<port>`.
3. **One certificate for all sites**, from Tailscale, renewed by a timer.
4. **ServerLab is just another site** on port 443.

ServerLab checks these rules for you. The Lobby reads nginx's `listen` ports to build links, and flags any listener on `0.0.0.0`, `::` or a LAN IP as **"Exposed to LAN"**.

### 3.1 Install nginx and remove the default site
```bash
sudo apt-get install -y nginx
sudo rm -f /etc/nginx/sites-enabled/default   # it listens on 0.0.0.0:80
```

### 3.2 Start nginx after Tailscale
nginx must bind the 100.x address, which exists only once `tailscaled` is up. Order nginx after Tailscale, and allow binding the address early in case of a boot race.
```bash
sudo install -m 644 deploy/sysctl/60-serverlab-nonlocal-bind.conf /etc/sysctl.d/
sudo sysctl --system
sudo install -d -m 755 /etc/systemd/system/nginx.service.d
sudo install -m 644 deploy/nginx/nginx-after-tailscale.conf /etc/systemd/system/nginx.service.d/after-tailscale.conf
sudo systemctl daemon-reload
```

### 3.3 Tailscale certificate and renewal timer
Tailscale certificates last 90 days. `tailscale-cert-renew.timer` runs weekly. `tailscale cert` only renews when the certificate nears expiry, then nginx is reloaded.
```bash
sudo install -d -m 755 /etc/nginx/tls
sed "s/MAGICDNS_NAME/$TS_NAME/" deploy/tailscale-cert-renew.service \
  | sudo tee /etc/systemd/system/tailscale-cert-renew.service >/dev/null
sudo install -m 644 deploy/tailscale-cert-renew.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start tailscale-cert-renew.service     # fetches the first certificate
sudo systemctl enable --now tailscale-cert-renew.timer
ls -l /etc/nginx/tls/                                 # ts.crt 644, ts.key 600
```
The certificate is world-readable on purpose: ServerLab reads its expiry date for the "TLS cert expiring" alert. The key is root-only.

### 3.4 Shared TLS snippet and the ServerLab site
```bash
sudo install -m 644 deploy/nginx/snippets/tailnet-tls.conf /etc/nginx/snippets/
sed -e "s/TAILSCALE_IP/$TS_IP/" -e "s/MAGICDNS_NAME/$TS_NAME/" deploy/nginx/serverlab.conf \
  | sudo tee /etc/nginx/sites-available/serverlab.conf >/dev/null
sudo ln -sf /etc/nginx/sites-available/serverlab.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
| Snippet setting | Value |
|---|---|
| Certificate | `/etc/nginx/tls/ts.crt`, `/etc/nginx/tls/ts.key` |
| Protocols | TLS 1.2 and 1.3 |
| Headers | `Strict-Transport-Security`, `X-Content-Type-Options: nosniff` |
| Other | `server_tokens off`, session tickets off |

The ServerLab site proxies to `127.0.0.1:3000`. `/api/stream` (live data) has `proxy_buffering off`, `gzip off` and a 1-hour read timeout. nginx sets `X-Forwarded-For` to the real client address, overwriting anything the client sent.

On nginx 1.25.1 or newer (Ubuntu 25.04 and later), `listen … ssl http2` prints a deprecation warning. Replace it with `listen … ssl;` plus `http2 on;`.

### 3.5 Other apps
`deploy/nginx/example-app.conf` is a complete Jellyfin example: Docker publishes `127.0.0.1:18096`, nginx listens on `100.x.y.z:8096`. Copy it once per app, with a new port each time.
```bash
sed -e "s/TAILSCALE_IP/$TS_IP/" -e "s/MAGICDNS_NAME/$TS_NAME/" deploy/nginx/example-app.conf \
  | sudo tee /etc/nginx/sites-available/jellyfin.conf >/dev/null
sudo ln -sf /etc/nginx/sites-available/jellyfin.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. Install ServerLab
```bash
cd ~/server_lab
sudo deploy/install.sh
```
`install.sh` is safe to re-run. It does this:

| Step | Detail |
|---|---|
| Checks | Root, Ubuntu release, Node ≥ 22 in `/usr/bin` or `/usr/local/bin` |
| Packages | Installs missing `sqlite3 rsync curl openssl gzip ca-certificates build-essential python3` |
| User | System user `serverlab`: no login shell, no home |
| Directories | `/var/lib/serverlab` (700), `/var/cache/serverlab` (700), `/etc/serverlab` (750) |
| Code | `rsync` to `/opt/serverlab`, without `node_modules`, `.next`, `dist`, `.git`, `data`, `.env*` |
| Build | `npm ci` (lockfile), `npm audit`, `npm run build` as root, then `chown -R root:serverlab` and group read-only |
| Config | Creates `/etc/serverlab/serverlab.env` from `deploy/env.example` with a random `SESSION_SECRET`. Never overwrites an existing file |
| Units | Installs the units, writes the collector's `groups.conf`, `daemon-reload` |
| Database | Runs migrations as `serverlab` (`serverlab migrate`) |
| GeoIP | Downloads DB-IP City Lite (skip with `--no-geoip`) and enables the monthly timer |
| Setup token | Only while no admin exists. Writes `/var/lib/serverlab/setup-token` (600) and prints it |
| Start | Enables and restarts both units, then waits for the web UI to answer |

### 4.1 First run
1. Open `https://<magicdns>/setup` from a device on your tailnet.
2. Enter the **setup token** that `install.sh` printed. It is also in `/var/lib/serverlab/setup-token` (`sudo cat` it).
3. Choose an admin password of **12 or more characters**.

The token stops someone else on your tailnet from claiming the instance first. The app deletes it after setup, and `/setup` then returns 404.

Before nginx is ready you can tunnel the port: `ssh -L 3000:127.0.0.1:3000 you@server`, then open `http://localhost:3000/setup` in Chrome or Firefox. They accept the `Secure` session cookie on `localhost`.

### 4.2 Forgotten password
```bash
sudo serverlab reset-password
```
This runs the CLI as `serverlab` with the env file loaded. Without the wrapper:
```bash
sudo -u serverlab bash -c 'set -a; . /etc/serverlab/serverlab.env; set +a; cd /opt/serverlab && node_modules/.bin/tsx scripts/serverlab-cli.ts reset-password'
```

### 4.3 Update
```bash
cd ~/server_lab && git pull && sudo deploy/install.sh
```
Both units stop during the build and start again at the end. Migrations run automatically.

### 4.4 Uninstall
| Command | Effect |
|---|---|
| `sudo deploy/install.sh --uninstall` | Stops and removes the units and `/usr/local/sbin/serverlab`. Keeps code, data, config and the user |
| `sudo deploy/install.sh --uninstall --purge` | Also deletes `/var/lib/serverlab`, `/etc/serverlab`, `/var/cache/serverlab`, the `/opt/serverlab` copy and the user. Asks for confirmation (`--yes` skips it) |

nginx, Tailscale and the certificate timer are never touched.

---

## 5. Host hardening

### Firewall (UFW)
Allow your SSH path **before** enabling UFW, or you lock yourself out.
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow in on tailscale0
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp   # optional LAN SSH fallback
sudo ufw enable
```
Docker bypasses UFW for published ports. Bind container ports to `127.0.0.1:`, or use `ufw-docker`.

### SSH
Create `/etc/ssh/sshd_config.d/10-hardening.conf`:
```
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers you
```
Then `sudo sshd -t && sudo systemctl reload ssh`. Or turn sshd off entirely and use Tailscale SSH.

### fail2ban
Install it if SSH is reachable from anywhere other than the tailnet: `sudo apt-get install -y fail2ban`. The `sshd` jail is on by default. ServerLab's User Watcher shows the attempts.

### Automatic security updates
`unattended-upgrades` is installed by default. Check: `systemctl status unattended-upgrades`.

### Time sync
Login timestamps need an accurate clock. Check: `timedatectl status` shows `System clock synchronized: yes`.

---

## 6. ServerLab process privileges
Both units run as `serverlab`. Neither gets root or a capability by default.

| Unit | Extra groups | Network |
|---|---|---|
| `serverlab-web` | none | Loopback only (`IPAddressDeny=any`, `IPAddressAllow=localhost`) |
| `serverlab-collector` | from `groups.conf` (below) | Outbound only, for notifications. No listener |

### Collector groups
`install.sh` writes `/etc/systemd/system/serverlab-collector.service.d/groups.conf` with the groups below **that exist on the host**. A missing group would stop the unit from starting. Groups are added on the unit only, never with `usermod`, so the web process never has them.

| Group | Lets the collector read | Without it |
|---|---|---|
| `docker` | `/var/run/docker.sock` (containers, stats) | No container discovery or app usage for containers |
| `systemd-journal` | The journal (sshd logins) | Falls back to `/var/log/auth.log` |
| `adm` | `/var/log/auth.log` | Journal only |
| `utmp` | `/var/log/btmp` (660 `root:utmp`), read by `lastb` for failed-login history | No failed-login backfill |
| `video`, `render` | `/dev/dri` (AMD and Intel GPU) | GPU stats may be missing |

`utmp` normally also allows **writing** login records. The unit has `ProtectSystem=strict`, so `/var/log` and `/run/utmp` are read-only for the collector.

**After installing Docker later**, re-run `sudo deploy/install.sh`. Or add the group by hand:
```bash
sudoedit /etc/systemd/system/serverlab-collector.service.d/groups.conf   # add docker
sudo systemctl daemon-reload && sudo systemctl restart serverlab-collector
```

### Docker socket: direct access (accepted risk)
**Decision:** the collector reads `/var/run/docker.sock` directly, through `docker` group membership. It is simple and needs no extra container.

**The risk:** `docker` group membership is **effectively root**. Anyone who can run code as the collector can start a privileged container and take over the host. These mitigations keep that surface small:
- **Only the collector unit gets the `docker` group.** The web process, which faces the network, does not. This is the main reason the collector is a separate process.
- **The collector only makes GET requests** to the Docker API (list, inspect, stats). A unit test checks that the Docker client exposes no mutating calls.
- **The collector has no inbound listener.** It only writes to SQLite.
- **Dependencies are pinned.** `npm ci` uses the lockfile and `install.sh` runs `npm audit`. A compromised npm package is the realistic attack path.
- **Upgrade path:** [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) with `CONTAINERS=1 INFO=1` and everything else `0`. Then set `DOCKER_HOST=tcp://127.0.0.1:2375` in the env file and remove `docker` from `groups.conf`. No code changes.

### NVIDIA GPU power switch (hybrid-graphics laptops)
On hosts with `prime-select` (package `nvidia-prime`), `install.sh` adds Settings → **NVIDIA GPU power**. "Turn off" selects the PRIME `intel` profile: after the next reboot the desktop runs on the Intel GPU and the NVIDIA GPU is powered down. Older NVIDIA GPUs (before Turing) cannot power down by themselves, so this is the only way to stop them drawing power. "Turn on" selects `on-demand` again.

ServerLab changes the host in two places only: this switch and the Firewall / fail2ban pages (next section). Both are kept narrow:

| Piece | What it may do |
|---|---|
| Web process | Writes a request into the database. No privileges, as before |
| Collector | Starts `serverlab-gpu-mode@intel.service` or `serverlab-gpu-mode@on-demand.service`, and nothing else |
| `/etc/polkit-1/rules.d/60-serverlab-gpu-mode.rules` | Grants user `serverlab` the `start` verb on exactly those two units. No other unit, no stop or restart, no reboot |
| `/etc/systemd/system/serverlab-gpu-mode@.service` | Runs `prime-select %i` as root. Its `ExecCondition` refuses any profile other than `intel` and `on-demand` |

ServerLab never reboots the host: reboot yourself to apply the change. Settings shows "reboot to apply" until you do. To remove the feature, delete both files above and run `sudo systemctl daemon-reload`; `install.sh --uninstall` removes them too.

### Firewall and fail2ban pages
The **Firewall** page manages UFW and the **fail2ban** page bans and unbans addresses. Every control shows the exact command it runs (for example `sudo ufw allow in on tailscale0`), so the pages double as a reference for doing the same in a terminal. Both need root, so they go through one small helper:

| Piece | What it may do |
|---|---|
| Web process | Validates the request and writes it to the `host_action_requests` table. No privileges, as before |
| Collector | Writes the request to `/run/serverlab-host-action/inbox/` and starts `serverlab-host-action.service`, nothing else |
| `/etc/polkit-1/rules.d/61-serverlab-host-action.rules` | Grants user `serverlab` the `start` verb on exactly that unit. No other unit, no stop or restart |
| `/etc/systemd/system/serverlab-host-action.service` | Runs `/usr/local/libexec/serverlab/host-action.js` as root and exits |
| `/usr/local/libexec/serverlab/host-action.js` | Root-owned copy of `host-action/` (the serverlab user cannot edit it). Reads only regular, non-symlink files owned by `serverlab`, validates them with the same schema as the web app, and runs only `ufw` and `fail2ban-client` with fixed argument shapes, without a shell |
| `/etc/tmpfiles.d/serverlab-host-action.conf` | Creates `/run/serverlab-host-action/` (root), `inbox/` (serverlab may add files) and `outbox/` (serverlab may read results) at boot |

What the helper accepts, and nothing else: `ufw status`, `ufw show added`, `ufw --force enable`, `ufw disable`, `ufw default allow|deny|reject incoming|outgoing|routed`, `ufw logging off|low|medium|high|full`, `ufw allow|deny|reject|limit in|out [on IFACE] [proto tcp|udp] [from ADDRESS/CIDR] [to any port PORT] [comment TEXT]`, `ufw --force delete N` (only if rule N still matches the rule you clicked), and `fail2ban-client status|version|get JAIL bantime|findtime|maxretry|set JAIL banip|unbanip ADDRESS`. Interface names, jail names, addresses, ports and comments are checked against strict patterns before anything runs.

The Firewall page refuses to turn UFW on, set incoming traffic to deny, or delete a rule when that would leave no rule allowing SSH (port 22) or the `tailscale0` interface. You can override this after confirming you have console access.

fail2ban is not installed by ServerLab. If it is missing, the fail2ban page shows the commands to install it.

To remove the feature, delete the four files above and run `sudo systemctl daemon-reload`; `install.sh --uninstall` removes them too. Without them, both pages still show what an unprivileged user can see (whether UFW is enabled, its default policies, whether fail2ban is running) and are read-only.

### Intel GPU stats (optional)
`intel_gpu_top` needs `CAP_PERFMON`. Without it, the Resources page shows "Intel iGPU detected, no stats". To turn stats on:
```bash
sudo apt-get install -y intel-gpu-tools
sudo tee /etc/systemd/system/serverlab-collector.service.d/perfmon.conf >/dev/null <<'EOF'
[Service]
AmbientCapabilities=CAP_PERFMON
CapabilityBoundingSet=CAP_PERFMON
EOF
sudo systemctl daemon-reload && sudo systemctl restart serverlab-collector
```
`CAP_PERFMON` lets the collector read performance counters for the whole system. It is scoped to the collector unit only. Remove `perfmon.conf` to undo it.

### What the collector cannot see
- **Process names of other users' sockets.** `ss -tlnp` names processes only for sockets owned by `serverlab`. Listen addresses and ports are always visible, so the exposure check still works.
- **TLS keys.** nginx configs are parsed directly. `nginx -T` is not used, because it needs root.

### systemd sandbox
Check the result with `sudo systemd-analyze security serverlab-web serverlab-collector`.

| Setting | Web | Collector | Effect |
|---|---|---|---|
| `User=serverlab`, `NoNewPrivileges=yes` | ✓ | ✓ | No root, no setuid escalation |
| `CapabilityBoundingSet=` (empty) | ✓ | ✓ | No capabilities (collector: `CAP_PERFMON` only if you add it) |
| `ProtectSystem=strict` + `ReadWritePaths=/var/lib/serverlab` | ✓ | ✓ | Everything else is read-only (collector: also the host-action inbox) |
| `ProtectHome=yes`, `PrivateTmp=yes` | ✓ | ✓ | No home directories, private `/tmp` |
| `ProtectKernelTunables/Modules/Logs`, `ProtectControlGroups` | ✓ | ✓ | `/proc/sys`, `/sys` and cgroups read-only |
| `RestrictNamespaces`, `RestrictRealtime`, `RestrictSUIDSGID`, `LockPersonality` | ✓ | ✓ | Standard reductions |
| `MemoryDenyWriteExecute=no` | ✓ | ✓ | Required: V8's JIT needs it |
| `RestrictAddressFamilies` | `AF_UNIX AF_INET AF_INET6 AF_NETLINK` | same | Netlink: `ss` (collector) and `os.networkInterfaces()` (web) |
| `IPAddressAllow=localhost`, `IPAddressDeny=any` | ✓ | — | Web never talks to anything but nginx |
| `PrivateDevices`, `ProtectClock`, `ProtectProc=invisible` | ✓ | — | Collector needs `/dev/nvidia*`, `/dev/dri` and all of `/proc` |
| `SystemCallFilter=@system-service` | ✓ | — | GPU tools run by the collector need more |
| `CacheDirectory=serverlab` | ✓ | — | `/var/cache/serverlab` for the Next.js cache |

---

## 7. Notifications and secrets
Notification channels are configured in `/etc/serverlab/serverlab.env`. Empty means "not configured".

| Channel | Variables |
|---|---|
| ntfy | `NTFY_URL` (use a long random topic), optional `NTFY_TOKEN` |
| Discord | `DISCORD_WEBHOOK_URL` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |

```bash
sudoedit /etc/serverlab/serverlab.env
sudo systemctl restart serverlab-collector serverlab-web
```
Then use **Send test** in Settings. Secrets live only in this file (`640 root:serverlab`), never in the database. Keep the format `KEY=value`, with no spaces around `=` and no `export`.

---

## 8. Data

### Database
- `/var/lib/serverlab/serverlab.db`, mode `600`, in a `700` directory, owned by `serverlab`. SQLite in WAL mode.
- **Contents:** login usernames, IPs and their geolocation (personal data), hostnames, container and service names, metrics, the admin password hash and session hashes. **No plaintext secrets.**

### Backups
`.backup` is safe while ServerLab is running.
```bash
sudo install -d -m 700 /var/backups/serverlab
sudo sqlite3 /var/lib/serverlab/serverlab.db ".backup '/var/backups/serverlab/serverlab-$(date +%F).db'"
```
Include `/var/backups/serverlab` and `/etc/serverlab/serverlab.env` in your normal backup. The env file holds your notification secrets.

**Restore:**
```bash
sudo systemctl stop serverlab-web serverlab-collector
sudo rm -f /var/lib/serverlab/serverlab.db-wal /var/lib/serverlab/serverlab.db-shm
sudo install -m 600 -o serverlab -g serverlab /var/backups/serverlab/serverlab-2026-10-25.db /var/lib/serverlab/serverlab.db
sudo systemctl start serverlab-collector serverlab-web
```

### Retention
Old data is pruned every hour. The defaults are configurable in Settings, and login history can be purged there.

| Data | Kept |
|---|---|
| Raw samples, app usage samples | 24 h |
| 1-minute rollups, filesystem usage | 30 d |
| 1-hour rollups | 365 d |
| Login events | 365 d |
| Alert events | 90 d |

### Geolocation database
- **Source:** DB-IP "IP to City Lite", licensed CC BY 4.0. The license requires the credit line "IP Geolocation by DB-IP" wherever location data is shown.
- **Lookups are offline.** IP addresses are never sent anywhere.
- **Updates:** `serverlab-geoip-update.timer` runs `/opt/serverlab/deploy/geoip-update.sh` monthly, as `serverlab`, then restarts the collector. Run it now with `sudo systemctl start serverlab-geoip-update.service`.
- **Verification:** DB-IP does not publish checksums for the Lite files. Instead the script downloads over HTTPS only (TLS 1.2+), checks the archive with `gzip -t`, checks the size, and checks the MaxMind DB metadata marker (`\xab\xcd\xefMaxMind.com`). The old file is replaced only when every check passes.

---

## 9. Verify
Run these on the server after setup. Every check should match the expected result.

**Listeners.**
```bash
sudo ss -tlnp
```
| Expected | Process |
|---|---|
| `127.0.0.1:3000` | `node` (serverlab-web) |
| `100.x.y.z:443`, `100.x.y.z:<app ports>` | `nginx` |
| `127.0.0.1:<app ports>` | your apps and containers |
| `:22` | `sshd` (only if you keep it) |

Nothing else may listen on `0.0.0.0`, `[::]` or a LAN address. The Lobby shows no "Exposed to LAN" badges.

**Groups.**
```bash
systemctl show serverlab-collector -p SupplementaryGroups   # docker systemd-journal adm utmp video render (those that exist)
systemctl show serverlab-web -p SupplementaryGroups         # empty
id serverlab                                                # only the serverlab group
```

**Sandbox.**
```bash
sudo systemd-analyze security serverlab-web serverlab-collector
```

**Nothing public.**
```bash
tailscale funnel status   # "No serve config"
tailscale serve status    # "No serve config"
```

**From another machine on your LAN** (not on the tailnet), these must fail or time out:
```bash
curl -m 5 http://<server-lan-ip>:3000/
curl -m 5 -k https://<server-lan-ip>/
```

**Headers and auth** (on the server or any tailnet device, with `TS_NAME` from section 2):
```bash
curl -sI "https://$TS_NAME/login" | grep -iE 'strict-transport-security|content-security-policy|x-frame-options|referrer-policy|x-content-type-options'
curl -s -o /dev/null -w '%{http_code}\n' "https://$TS_NAME/api/stream"   # 401 without a session
```
Expect all five headers. HSTS and `nosniff` come from the nginx snippet. CSP, `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer` come from the app.

**Timers and certificate.**
```bash
systemctl list-timers 'serverlab-*' 'tailscale-cert-*'
openssl x509 -in /etc/nginx/tls/ts.crt -noout -subject -enddate
```

**Files.**
```bash
sudo stat -c '%a %U:%G %n' /var/lib/serverlab /var/lib/serverlab/serverlab.db /etc/serverlab/serverlab.env /opt/serverlab
# 700 serverlab:serverlab, 600 serverlab:serverlab, 640 root:serverlab, 750 root:serverlab
sudo test -e /var/lib/serverlab/setup-token && echo "setup not finished" || echo "token removed"
```

**Services and logs.**
```bash
systemctl is-active serverlab-web serverlab-collector nginx tailscaled
journalctl -u serverlab-web -u serverlab-collector --since "-10 min"
```

---

## 10. Checklist
- [ ] Admin password of 12+ characters; `/var/lib/serverlab/setup-token` is gone
- [ ] `SESSION_SECRET` in `/etc/serverlab/serverlab.env` is random (generated by `install.sh`)
- [ ] `COOKIE_SECURE=true`
- [ ] `ss -tlnp | grep 3000` shows `127.0.0.1:3000` only
- [ ] `sudo ss -tlnp` shows only `127.0.0.1`, `100.x.y.z` (nginx) and `:22` listeners; no "Exposed to LAN" badges
- [ ] `/etc/nginx/sites-enabled/default` is removed
- [ ] `tailscale funnel status` shows nothing exposed
- [ ] Tailnet policy has no allow-all rule; only you can reach `tag:homelab`
- [ ] `tailscale-cert-renew.timer` and `serverlab-geoip-update.timer` are active
- [ ] Only `serverlab-collector` has the `docker` group; `id serverlab` shows no `docker`
- [ ] UFW is active with default deny incoming; SSH has no password logins
- [ ] `npm audit` was clean during `install.sh`
- [ ] Security headers present (section 9)
- [ ] Database backups are scheduled and include `/etc/serverlab/serverlab.env`

---

## 11. Troubleshooting
| Symptom | Cause and fix |
|---|---|
| Unit fails with `status=216/GROUP` | A group in `groups.conf` no longer exists. Re-run `sudo deploy/install.sh` |
| Unit fails with `status=203/EXEC` | `node` is not in `/usr/bin` or `/usr/local/bin`. Install Node from NodeSource |
| nginx fails at boot: `cannot assign requested address` | Section 3.2: the sysctl file and the `after-tailscale.conf` drop-in |
| Login loops back to `/login` | You use plain `http://`. Use `https://<magicdns>/`. `COOKIE_SECURE=false` is for local testing only |
| Charts do not update live | `/api/stream` is buffered. Check the `location = /api/stream` block in the nginx site |
| No container data | `docker` is missing from `systemctl show serverlab-collector -p SupplementaryGroups` |
| No logins in the User Watcher | `systemd-journal` and `adm` missing from the collector's groups |
| NVIDIA GPU shows "stats unavailable" | Install the driver. `/dev/nvidia*` must exist at boot (`nvidia-persistenced`); the setuid `nvidia-modprobe` is blocked by `NoNewPrivileges` |
| Logins have no location | `ls -l /var/lib/serverlab/dbip-city-lite.mmdb`; then `sudo systemctl start serverlab-geoip-update.service` and `journalctl -u serverlab-geoip-update` |
| "TLS cert expiring" alert | The renewal failed: `journalctl -u tailscale-cert-renew`. HTTPS must be enabled in the Tailscale admin console |

---

## 12. Later (not in v1)
- Access without Tailscale: an nginx server block with Let's Encrypt (certbot) TLS, plus an extra auth layer (Authelia or Authentik via `auth_request`, or Cloudflare Access).
- docker-socket-proxy instead of direct `docker.sock` access (section 6).
- SSO with Tailscale identity instead of a password.
- 2FA (TOTP) for the admin.
