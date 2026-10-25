# 05 — Feature: Application Resource Usage (`/apps`)

> Spec: *"in a ranking nice bar percentage visual + actual size in memory consumption for each application"*

## Collection (every 10 s)
| Source | Memory | CPU |
|---|---|---|
| Docker | `container.stats({stream:false})`: `memory_stats.usage - inactive_file` (matches `docker stats`) | `cpu_delta / system_delta × online_cpus × 100` |
| systemd | `/sys/fs/cgroup/system.slice/<unit>/memory.current` (minus `memory.stat:inactive_file`) | delta of `cpu.stat:usage_usec` / interval / ncpu |
| Port-only processes | `/proc/<pid>/status` VmRSS (+children) | `/proc/<pid>/stat` utime+stime delta |

- **Performance:** one-shot Docker stats takes about 1–2 s per container when run one after another, so calls run in parallel with a concurrency limit of 8. With more than 40 containers, consider reading Docker's cgroups directly (`/sys/fs/cgroup/system.slice/docker-<id>.scope/`), which is much cheaper. **Proposal: use cgroups for Docker as well and keep the API only as a fallback.**
- `app_key` is the same stable key as in Lobby `discovered_items`, so names, icons and overrides are shared.

## UI
```
┌ APPLICATIONS ─────────────── Sort: [Memory][CPU]  Source: [All][Docker][systemd] ┐
│ Total tracked: 9.4 GB of 32 GB host memory (29%)                                  │
│ 1 [icon] Immich-ML     🐳 ██████████████████░░░░░░░ 2.31 GB · 7.2%   CPU 12%  ~~spark~~ │
│ 2 [icon] Jellyfin      🐳 ███████████░░░░░░░░░░░░░░ 1.42 GB · 4.4%   CPU  3%  ~~spark~~ │
│ 3 [icon] postgres     sys ██████░░░░░░░░░░░░░░░░░░░ 812 MB · 2.5%   CPU  1%  ~~spark~~ │
│ …                                                                                 │
├──────────────────────────────┬────────────────────────────────────────────────────┤
│ Memory share (donut, top 8 + other) │ Selected app: mem/cpu history (24h, rollups) │
└──────────────────────────────┴────────────────────────────────────────────────────┘
```
- **Bars:** the template's `progress-bar`. The bar length is **% of host total memory**, and the text shows the actual size (`format-number` compact bytes). The CPU column shows % of total host CPU.
- **Tone:** bars are `brand` by default and turn `warning`/`danger` when the app is above 80%/95% of its own memory limit (when a limit is set).
- **Sparkline:** the template's `comparison-trend-chart` pattern, last 15 min. It is ported without its demo-data import.
- **Donut:** `donut-chart` with the top 8 plus "Other".
- **Live:** the list re-sorts on the SSE `apps` topic every 10 s. Rows animate position with a CSS transform transition.
- **Drill-down:** clicking a row shows its 24h/7d history from `metric_rollups` (`app_mem` / `app_cpu`).

## Acceptance criteria
- Memory for Docker apps is within ±5% of `docker stats`, and for systemd units within ±5% of `systemctl status` "Memory:".
- Sorting and filtering are client-side and instant.
- An app that stops drops off the live list but its history stays viewable.
