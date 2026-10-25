# 09 — Hardening Guide (draft)

> This draft becomes `docs/HARDENING.md` in M7. It is written for the person installing ServerLab on their homelab.
> **Goal:** ServerLab is reachable **only over your Tailscale tailnet**, never from the public internet or even the LAN, and it runs with as few privileges as possible.

## 1. Remote access with Tailscale
1. **Install Tailscale on the server and log in.**
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up --ssh   # --ssh optional: Tailscale SSH instead of exposing sshd
   ```
2. **Enable MagicDNS and HTTPS certificates** in the Tailscale admin console (DNS page).
3. **Apply the recommended gateway pattern (below)** to ServerLab *and* every other hosted app.
4. **Restrict it with ACLs.** Add a policy rule so that only your user (or tag) can reach the server's app ports:
   ```json
   { "action": "accept", "src": ["you@example.com"], "dst": ["tag:homelab:443,8000-8999"] }
   ```
5. **Set `PUBLIC_HOSTNAME`** to the MagicDNS name so Lobby "Open" links work from your devices.
6. **Do not** use `tailscale funnel`, which exposes services to the public internet.

### Recommended setup: nginx as the single tailnet gateway
**Why this setup:** you run several hosted apps, but MagicDNS gives the server only **one hostname** (`<host>.<tailnet>.ts.net`, no subdomains). Name-based nginx vhosts would all collide on one port. Tailscale Serve allows only 3 HTTPS ports (443, 8443, 10000), and serving apps under sub-paths breaks many of them. So:

```
 tailnet device ──HTTPS──▶ 100.x.y.z:443   nginx ──▶ 127.0.0.1:3000  ServerLab
                           100.x.y.z:8096  nginx ──▶ 127.0.0.1:18096 Jellyfin (docker)
                           100.x.y.z:8443  nginx ──▶ 127.0.0.1:18443 Nextcloud
                           …one port per app, same hostname, same cert
```
**Rules:**
1. **Every app binds to `127.0.0.1` only.**
   - Docker: `ports: ["127.0.0.1:18096:8096"]`. This matters because Docker-published ports **bypass UFW**.
   - Native services: set their bind/listen address to `127.0.0.1`.
2. **nginx is the only thing listening on the network, and only on the Tailscale IP.** Every server block uses `listen 100.x.y.z:<port> ssl;`, never `listen 80` / `0.0.0.0`. Use one **unique port per app**, so links are just `https://<magicdns>:<port>`.
3. **One certificate for all sites**, from Tailscale. It is valid for the MagicDNS name and works on any port:
   ```bash
   sudo mkdir -p /etc/nginx/tls
   sudo tailscale cert --cert-file /etc/nginx/tls/ts.crt --key-file /etc/nginx/tls/ts.key <host>.<tailnet>.ts.net
   ```
   Renew it with a monthly systemd timer (`deploy/tailscale-cert-renew.{service,timer}` runs the command above and then `systemctl reload nginx`), because the certs last 90 days.
4. **Shared snippet** `/etc/nginx/snippets/tailnet-tls.conf`: `ssl_certificate*`, `ssl_protocols TLSv1.2 TLSv1.3`, HSTS, `server_tokens off`, `client_max_body_size` per app.
5. **ServerLab itself** is just another site: `listen 100.x.y.z:443 ssl;` proxies to `127.0.0.1:3000`, with `proxy_buffering off` for the SSE stream. `serverlab-web` runs `next start -H 127.0.0.1`.
6. **Startup ordering:** nginx must start after tailscaled has its IP. Add a drop-in `After=tailscaled.service` with `Wants=tailscaled.service`, plus `net.ipv4.ip_nonlocal_bind=1` so nginx can bind the 100.x address even if Tailscale is still coming up.

ServerLab supports this setup directly. The Lobby reads nginx's `listen` ports to build the links, and **flags any app listening on `0.0.0.0` or `::` as "Exposed to LAN"** (see [04](04-feature-lobby.md#exposure-check)).

## 2. Host hardening
- **Firewall (UFW):**
  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow in on tailscale0
  sudo ufw allow from 192.168.1.0/24 to any port 22   # optional LAN SSH fallback
  sudo ufw enable
  ```
  Docker bypasses UFW for published ports. Bind container ports to `127.0.0.1:` or the Tailscale IP, or use `ufw-docker`.
- **SSH** (`/etc/ssh/sshd_config.d/10-hardening.conf`): `PasswordAuthentication no`, `PermitRootLogin no`, `KbdInteractiveAuthentication no`, `AllowUsers <you>`. Or turn sshd off entirely and use Tailscale SSH.
- **fail2ban** for sshd if SSH is exposed anywhere other than the tailnet. The User Watcher will show the attempts.
- **Automatic security updates:** `unattended-upgrades` (installed by default on Ubuntu Server; check with `systemctl status unattended-upgrades`).
- **nginx:** follow the gateway rules in §1. With UFW's default deny and nginx bound only to the Tailscale IP, nothing is reachable from LAN or internet except SSH (if you allow it).
- **Time sync** (`systemd-timesyncd`), so login timestamps are accurate.

## 3. ServerLab process privileges
| Unit | User | Extra groups | Why |
|---|---|---|---|
| `serverlab-web` | `serverlab` | none | reads/writes the DB only |
| `serverlab-collector` | `serverlab` | `docker` (container discovery and stats), `systemd-journal` (read sshd logs), `adm` (auth.log fallback), `video`/`render` (AMD/Intel GPU sysfs) | read-only host visibility |

### Docker socket: direct access (accepted risk)
**Decision:** the collector reads `/var/run/docker.sock` directly through `docker` group membership. This is simple and has no extra container.
**The risk:** `docker` group membership is **effectively root**. Anyone who can run code as the `serverlab` user can start a privileged container and take over the host. These mitigations keep that surface small:
- **The web process is not in the `docker` group.** Only the collector unit gets it, via `SupplementaryGroups=docker` on the unit rather than a permanent `usermod`. This is the main reason the collector is a separate process.
- **The collector code only makes GET requests** to the Docker API (list, inspect, stats). A code-review rule and a unit test check that the docker client wrapper exposes no mutating calls.
- **The collector has no inbound network listener.** It only writes to SQLite, so the only way to reach it is through the local filesystem.
- **Dependencies are pinned** (`npm ci`, lockfile, `npm audit` in the build), because a compromised npm dependency in the collector is the realistic attack path.
- **Upgrade path (later):** move to [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) (`CONTAINERS=1 INFO=1`, everything else `0`). The collector only needs `DOCKER_HOST=tcp://127.0.0.1:2375` and removal from the `docker` group; no code changes.

### Intel GPU stats
`intel_gpu_top` needs `CAP_PERFMON`. Either set `AmbientCapabilities=CAP_PERFMON` on the collector unit (scoped and documented) or leave Intel GPU stats off.

### systemd sandboxing (both units)
```ini
[Service]
User=serverlab
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/lib/serverlab
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes          # read-only cgroup access still works
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
LockPersonality=yes
MemoryDenyWriteExecute=no         # V8 JIT needs W+X
SystemCallArchitectures=native
CapabilityBoundingSet=            # empty (unless CAP_PERFMON for Intel)
```
For the web unit, also add `IPAddressAllow=localhost` and `IPAddressDeny=any` (it never needs outbound access).

## 4. Data
- The DB lives at `/var/lib/serverlab/serverlab.db`, with the directory at mode `700` and the file at `600`, owned by `serverlab`.
- **Contents:** login IPs and geolocation (personal data), hostnames, container names. **No secrets.** Notification tokens are kept in `/etc/serverlab/serverlab.env` (mode `640`, `root:serverlab`).
- **Backups:** `sqlite3 serverlab.db ".backup /backup/serverlab-$(date +%F).db"` (safe with WAL). Include them in your normal backup.
- **Retention:** configurable in Settings, defaults in [02](02-data-model.md#retention-summary). Login history can be purged.
- **Geo DB:** DB-IP Lite is downloaded over HTTPS and its checksum is verified. Lookups are offline.

## 5. Application security checklist
- [ ] Admin password of 12 or more characters; setup token removed after first run
- [ ] `SESSION_SECRET` is random (`openssl rand -base64 32`)
- [ ] Web unit is bound to 127.0.0.1 (check with `ss -tlnp | grep 3000`)
- [ ] `tailscale funnel status` shows nothing exposed
- [ ] `sudo ss -tlnp` shows only `127.0.0.1`, `100.x.y.z` (nginx) and `:22` listeners; ServerLab's Lobby shows no "Exposed to LAN" badges
- [ ] Tailscale cert renewal timer is active (`systemctl list-timers | grep tailscale-cert`)
- [ ] Only `serverlab-collector` has the `docker` group (`SupplementaryGroups=docker`); `id serverlab` shows no `docker` group for the web unit
- [ ] `npm audit` is clean at build time; `npm ci` uses the lockfile
- [ ] Security headers are set in `next.config.ts`: CSP (self only, no inline scripts beyond what Next needs), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`

## 6. Later (not in v1)
- Access without Tailscale: an nginx server block for ServerLab with Let's Encrypt (certbot) TLS, plus an extra auth layer (Authelia/Authentik via `auth_request`, or Cloudflare Access).
- Move from direct docker.sock access to docker-socket-proxy (see §3).
- SSO via Tailscale identity (e.g. `tailscale serve` identity headers, or nginx `auth_request` to the Tailscale nginx-auth helper) instead of a password.
- 2FA (TOTP) for the admin.
