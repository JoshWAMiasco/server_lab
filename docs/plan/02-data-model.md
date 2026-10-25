# 02 — Data Model (SQLite + Drizzle)

All timestamps are **unix epoch milliseconds (INTEGER, UTC)**. Times are converted to the viewer's local time only in the UI.
Every metric and event table has `host_id INTEGER NOT NULL DEFAULT 1` for future multi-host support. It is omitted below for brevity.

PRAGMAs set on open: `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON`.

## Metrics

### `metric_samples` (raw, every 2 s, kept 24 h)
| col | type | note |
|---|---|---|
| id | INTEGER PK | |
| ts | INTEGER | indexed |
| cpu_pct | REAL | total |
| load1, load5, load15 | REAL | |
| mem_used, mem_total | INTEGER | bytes |
| swap_used, swap_total | INTEGER | |
| cpu_temp_c | REAL NULL | package / Tctl |
| net_rx_bps, net_tx_bps | REAL | sum of non-virtual interfaces |
| disk_read_bps, disk_write_bps | REAL | sum of physical devices |
| uptime_s | INTEGER | |

### Child tables (one row per sample per entity, same retention)
- `cpu_core_samples(sample_id, core, pct)`
- `net_iface_samples(sample_id, iface, rx_bps, tx_bps)`
- `disk_io_samples(sample_id, device, read_bps, write_bps)`
- `gpu_samples(sample_id, gpu_index, vendor, name, util_pct, vram_used, vram_total, temp_c, power_w NULL)`
- `temp_sensors(sample_id, label, temp_c)` (NVMe, chipset, etc.)

### `fs_usage` (every 60 s, one row per mount, kept 30 d)
`ts, mount, device, fstype, used, size`

### Rollups
`metric_rollups(bucket_ts, resolution, metric, entity, avg, max, min)`
- `resolution`: `'1m'` (kept 30 d) or `'1h'` (kept 365 d).
- `metric` and `entity` are strings, e.g. `('cpu_pct','')`, `('gpu_util','0')`, `('net_rx_bps','eth0')`.
- Unique index on `(resolution, metric, entity, bucket_ts)`.
- History charts query this table. Live charts use raw samples.

**Size estimate:** at 2 s with about 16 cores and a few interfaces, raw data is roughly 43k samples/day × ~25 rows ≈ 1M rows/day, about 60–80 MB. Rollups add a few MB. Pruning runs hourly.

## Apps

### `app_usage_samples` (every 10 s, raw kept 24 h, then rolled up to 1m/1h in `metric_rollups` as `app_mem` / `app_cpu`)
`ts, app_key, source ('docker'|'systemd'), cpu_pct, mem_bytes, mem_limit NULL`

## Lobby

### `discovered_items` (upserted by the collector)
| col | note |
|---|---|
| key | **stable id**: `docker:<container name>`, `systemd:<unit>`, `port:<proto>/<port>`, `nginx:<server_name>:<port>` |
| source | docker / systemd / port / nginx |
| raw_name, image, unit | |
| ports | JSON `[{"host":8096,"container":8096,"proto":"tcp"}]` |
| labels | JSON (docker labels) |
| catalog_id | matched catalog entry or NULL |
| state | running / exited / failed / unknown |
| health | healthy / unhealthy / starting / none |
| bind_scope | `local` / `tailnet` / `exposed`: the widest bind address across the item's listeners ([04](04-feature-lobby.md#exposure-check)) |
| via_nginx_key | key of the nginx site that proxies to this item, if any (its link then wins) |
| started_at | for uptime |
| first_seen, last_seen | items not seen for over 24 h are flagged "gone" |

### `lobby_items` (user-owned; overrides and manual entries)
| col | note |
|---|---|
| id | PK |
| key | NULL for manual items; otherwise FK-like reference to `discovered_items.key` |
| name, description, url, icon, category | NULL means "use detected or catalog value" |
| hidden | bool |
| sort_order | |
| health_check_url | optional HTTP probe for manual items |
| created_at, updated_at | |

The view the UI reads is `COALESCE(lobby_items.x, labels['serverlab.x'], catalog.x, discovered.raw_name)`.

## Users / auth

- `admin(id=1, password_hash, created_at, updated_at)`: a single row.
- `sessions(id_hash PK, created_at, expires_at, last_seen, ip, user_agent)`
- `login_throttle(ip, failures, locked_until)`

## User Watcher

### `login_events` (kept 365 d)
| col | note |
|---|---|
| id | |
| ts | indexed |
| channel | `ssh` / `web` / `console` |
| username | |
| result | `success` / `failure` / `invalid_user` |
| method | publickey / password / keyboard-interactive / web |
| src_ip | |
| src_port | |
| geo_country, geo_country_code, geo_city, geo_lat, geo_lon | NULL for LAN |
| network_tag | `public` / `lan` / `tailnet` |
| backfilled | bool: imported from history on first run rather than seen live |
| tailnet_device | name looked up from `tailscale status --json` |
| raw | original log line, for debugging |
| dedupe_hash | UNIQUE; prevents double insert on journal replay |

## Alerts
- `alert_rules(id, name, kind, metric, entity, op, threshold, for_s, cooldown_s, channels JSON, enabled)`
- `alert_events(id, rule_id, state('firing'|'resolved'), value, message, started_at, resolved_at, notified_at, acknowledged)`

## System
- `capabilities(key PK, value JSON, updated_at)`: detection results.
- `settings(key PK, value JSON)`: retention, sample interval, public hostname override, etc.
- `collector_heartbeat(id=1, ts, version)`: the UI shows "collector offline" if this is older than 30 s.

## Retention summary
| Data | Kept |
|---|---|
| raw samples (+children) | 24 h |
| app_usage raw | 24 h |
| 1-minute rollups | 30 d |
| 1-hour rollups | 365 d |
| fs_usage | 30 d |
| login_events | 365 d |
| alert_events | 90 d |
