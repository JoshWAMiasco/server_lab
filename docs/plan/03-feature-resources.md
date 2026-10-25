# 03 — Feature: Resources Monitor (`/resources`)

> Spec: *"live visual graph of CPU, GPU, Memory Usage, Server Temperature, Network speed"*. Disk and uptime are added.

## Metrics and how they are collected (linux driver)
| Metric | Source | Notes |
|---|---|---|
| CPU % total and per core | `/proc/stat` delta between ticks | cheaper than `si.currentLoad()` every 2 s |
| Load avg | `/proc/loadavg` | |
| Memory / swap | `/proc/meminfo` (`MemTotal - MemAvailable`) | "used" excludes cache, like `free -h` |
| CPU temp | `/sys/class/hwmon/*` (`coretemp` / `k10temp` `Package`/`Tctl`) via `si.cpuTemperature()` | null if no sensors (common in VMs) |
| Other temps | hwmon `nvme`, `acpitz`, etc. → `temp_sensors` | |
| Network | `/proc/net/dev` delta; skip `lo`, `docker*`, `veth*`, `br-*`, `tailscale0` (configurable) | tailscale0 shown separately (toggle) |
| Disk I/O | `/proc/diskstats` sectors delta × 512; physical devices only (`sd*`, `nvme*n*`, `vd*`) | |
| Disk usage | `statfs` per mount from `/proc/mounts`; exclude `tmpfs`, `overlay`, `squashfs`, `proc`… | every 60 s |
| Uptime | `/proc/uptime` | |

### GPU (fully dynamic, no configuration)
Nothing is hard-coded or configured about the GPU. The collector detects it:
- **When it starts**, and **re-checks every 10 min** (cheap: list `/sys/class/drm/card*` plus `which nvidia-smi`). Changes are picked up without a restart: a driver installed later, a GPU added or removed, or an eGPU.
- **Every GPU found** is enumerated by PCI address. **Several GPUs and mixed vendors** are supported (e.g. an Intel iGPU plus an NVIDIA card). Each one gets its own chart series and tile, labelled with its model name (from `nvidia-smi` `name` or `/sys/.../device` + `pci.ids`).
- **Model and driver** are written to `capabilities.gpus` as `[{index, pciAddr, vendor, name, driver, statsAvailable}]`. The Resources page renders GPU panels from this list, so they appear and disappear as hardware changes.
- **GPU present but no stats available** (e.g. NVIDIA card without the driver, Intel without `CAP_PERFMON`): the tile shows the model name and "stats unavailable: install nvidia-driver-XXX" instead of hiding it.

| Vendor | Detect | Collect |
|---|---|---|
| NVIDIA | `nvidia-smi` on PATH | `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits` (one call per tick; or `-lms 2000` as a streaming child process to avoid spawn cost) |
| AMD | `/sys/class/drm/card*/device/vendor == 0x1002` | `gpu_busy_percent`, `mem_info_vram_used/total`, hwmon `temp1_input` |
| Intel | `vendor == 0x8086` | Best effort: `intel_gpu_top -J -s 2000` (needs `CAP_PERFMON` or root, see [09](09-hardening.md)); otherwise show only "Intel iGPU detected, no stats" |
| None | none of the above | GPU panel hidden (the tile reads "No GPU detected") |

## Page layout (wireframe)
```
┌ PAGE HEADER: RESOURCES ─────────── [5m][15m][1h] | [24h][7d][30d] ┐
│ ┌CPU 37%┐ ┌MEM 12.1/32G┐ ┌GPU 64%┐ ┌TEMP 58°C┐ ┌NET ↓12 ↑3 MB/s┐ ┌UP 12d┐ │  ← statistic-card ×6
├──────────────────────────────┬────────────────────────────────────┤
│ CPU (live line, total+cores) │ MEMORY (live area: used/cache/swap)│
├──────────────────────────────┼────────────────────────────────────┤
│ GPU util + VRAM (per GPU)    │ TEMPERATURES (multi-line, sensors) │
├──────────────────────────────┼────────────────────────────────────┤
│ NETWORK rx/tx per iface      │ DISK I/O read/write                │
├──────────────────────────────┴────────────────────────────────────┤
│ DISK USAGE  /  ███████░░░ 71%  412G/580G   /mnt/data ████░ 44% …   │ ← progress-bar list
└───────────────────────────────────────────────────────────────────┘
```
- **Live windows** (5m/15m/1h): raw samples via SSE, using `LiveLineChart`.
- **History windows** (24h/7d/30d): `metric_rollups` rendered on the server with the existing `line-chart`. Each point shows avg, with max as a faint second line.
- **Gauges:** the CPU and memory stat tiles get a small `donut-chart` ring (optional).
- **Colours:** charts use theme tokens via `readThemeColor`. Thresholds colour the tiles (`success` < 70% < `warning` < 90% < `danger`).

## New component: `LiveLineChart`
The template's `chart-canvas-implementation.tsx` rebuilds the chart whenever `JSON.stringify(spec)` changes, which is too expensive at 0.5 Hz across six charts.
- It creates one Chart.js instance on mount, reusing the template's registration and theme config builders.
- `push(point)` appends to the datasets, drops points older than the window, and calls `chart.update('none')` with no animation.
- It pauses when the tab is hidden (`document.visibilityState`).
- It uses a time axis with `chartjs-adapter-dayjs` (dayjs is already a dependency).

## Acceptance criteria
- With `COLLECTOR_DRIVER=mock` on macOS, every panel animates smoothly at 2 s and CPU usage stays below 5% in the browser.
- On a Linux box with no GPU, the GPU tile and panel are hidden and nothing errors.
- Values match `htop` / `free -h` / `nvidia-smi` within ±3% (CPU, mem) and ±1 °C.
- Switching to 7d loads in under 300 ms on 7 days of data.
- If the collector is stopped, a "Collector offline since …" banner appears within 30 s.
