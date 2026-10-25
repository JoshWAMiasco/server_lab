# 10 — Feature: Alerts (`/alerts`), added beyond the spec

## Rule model
```ts
type AlertRule = {
  id: number
  name: string
  kind: 'threshold' | 'event'
  metric?: 'cpu_pct' | 'mem_pct' | 'cpu_temp_c' | 'gpu_temp_c' | 'gpu_util' | 'disk_used_pct' | 'app_mem' | …
  entity?: string           // e.g. mount '/', gpu '0', app key
  op?: '>' | '<'
  threshold?: number
  forSeconds?: number       // must stay true this long before firing
  event?: 'login_failed_burst' | 'login_new_country' | 'item_down' | 'collector_offline'
  params?: Record<string, number | string>  // e.g. {count:5, windowS:600}
  cooldownSeconds: number   // min gap between repeat notifications
  channels: ('ntfy' | 'discord' | 'telegram' | 'inapp')[]
  enabled: boolean
}
```

## Default rules (seeded, editable)
| Rule | Condition |
|---|---|
| High CPU | `cpu_pct > 90` for 5 min |
| High memory | `mem_pct > 95` for 2 min |
| CPU hot | `cpu_temp_c > 85` for 1 min |
| GPU hot | `gpu_temp_c > 85` for 1 min (only if a GPU is detected) |
| Disk almost full | `disk_used_pct > 90` on any mount |
| SSH brute force | ≥ 5 failed logins from one IP within 10 min |
| New country login | **successful** login from a country never seen before |
| Service down | a Lobby item goes running → stopped/failed/unhealthy (not hidden items) |
| Service exposed | a listener appears on `0.0.0.0` / `::` / a LAN IP (`item_exposed`; `sshd :22` allow-listed) |
| TLS cert expiring | the Tailscale cert in `/etc/nginx/tls/` expires in under 14 days (the renewal timer failed) |
| Collector offline | evaluated by the **web** process: heartbeat older than 60 s (in-app only) |

## Engine (in the collector)
- Threshold rules are evaluated after each sample. In-memory state per `(rule, entity)` goes `pending → firing → resolved`.
- Event rules are triggered from the login and discovery code paths.
- When a rule fires: insert into `alert_events`, then notify each channel. When it resolves: update `resolved_at` and send a "resolved" message.
- On restart, open `firing` events are reloaded so nothing is sent twice.

## Channels
| Channel | Config (env) | Transport |
|---|---|---|
| ntfy | `NTFY_URL` (e.g. `https://ntfy.sh/my-secret-topic` or self-hosted), optional `NTFY_TOKEN` | POST with `Title`, `Priority`, `Tags` headers |
| Discord | `DISCORD_WEBHOOK_URL` | POST embed (red for firing, green for resolved) |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | `sendMessage` (Markdown) |
| In-app | always on | top-bar notifications panel + toast via SSE |

Secrets live only in the env file. Settings shows each channel as "configured / not configured" with a **Send test** button.

## UI
- **Rules tab:** a table of rules with enable toggles and an edit slideover (`validated-form`).
- **History tab:** a `data-grid` of `alert_events` (state badge, value, started, duration, acknowledged).
- **Top bar:** the bell shows the count of firing alerts, and the panel lists recent events with "Acknowledge".
- **Side menu:** the ALERTS item shows a red badge while anything is firing.

## Acceptance criteria
- `stress-ng --cpu 0 -t 6m` fires "High CPU" at about 5 minutes and resolves after the run finishes. Exactly one firing notification and one resolved notification are sent.
- 10 failed SSH logins from one IP send exactly one brute-force notification per cooldown.
- `docker stop jellyfin` sends "Service down: Jellyfin" within 70 s.
- Restarting the collector during a firing alert sends no duplicate notification.
