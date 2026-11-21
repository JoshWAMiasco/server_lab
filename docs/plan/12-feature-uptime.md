# 12 — Feature: Uptime history (`/uptime`)

> Added in 1.2.0. Not in `spec.md`.

## Rule
**Uptime is a streak.** A reboot does not reset it. A shutdown (power-off or halt) does, and so does an unexpected stop such as a crash, power loss or hard reset. The Resources "Uptime" tile and the Uptime page both show the streak. The kernel's own uptime (time since the last boot) is shown next to it as "current boot".

## Data: `boot_sessions`
There is one row per kernel boot, keyed by `/proc/sys/kernel/random/boot_id`.

| Column | Meaning |
|---|---|
| `booted_at` | `btime` from `/proc/stat`, so it is stable across collector restarts |
| `last_seen_at` | Moved every 30 s, and on SIGTERM |
| `ended_at` | `last_seen_at` when the boot was closed |
| `end_kind` | `reboot`, `shutdown`, `crash`, or null for the current boot |
| `streak_started_at` | Inherited after a reboot, otherwise this boot's `booted_at` |

The rows are never pruned, because each one is a few bytes per boot.

## How a boot's end is classified (`collector/jobs/boot-session-job.ts`)
1. **On SIGTERM**, the collector runs `systemctl list-jobs`.
   - A queued `reboot.target`, `kexec.target` or `soft-reboot.target` records `reboot`.
   - A queued `poweroff.target` or `halt.target` records `shutdown`.
   - Anything else is a plain `systemctl stop` or `restart` of the collector, and nothing is recorded.
2. **At the next start**, if the boot id changed and the previous row has no `end_kind`, the collector reads `journalctl -b -1` for "Reached target … Reboot / Power-Off".
3. **Otherwise** the boot is recorded as `crash`.

A collector restart within the same boot keeps the row. It also clears an `end_kind` that was recorded by a shutdown that never happened.

## Page
- **Tiles:**
  - Uptime streak, ticking live, with its reboot count.
  - Current boot.
  - Longest streak.
  - Reboots, shutdowns and crashes in the window.
  - Availability, which is time up divided by time recorded in the window.
- **Timeline:** up segments, each ending in a marker coloured by how it ended.
- **Table:** a DataGrid of every boot, with CSV, JSON and HTML export.
- **Ranges:** 7d, 30d, 90d and all.

## Limits
- History starts at the first collector run; earlier boots are not imported.
- If the collector was not running during the boot before the current one, the journal classification still describes that boot. It may mislabel a longer gap.
