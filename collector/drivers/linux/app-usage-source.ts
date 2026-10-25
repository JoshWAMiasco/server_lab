import fileSystem from "node:fs/promises";
import operatingSystem from "node:os";
import { readTextFile } from "@/collector/drivers/linux/run-command";
import { parseCgroupCpuStat, parseCgroupMemoryStat } from "@/collector/parsers/parse-cgroup";
import { readContainerStatistics } from "@/collector/sources/docker-client";
import type { AppUsageReading, DiscoveredItem } from "@/collector/types";

const CGROUP_ROOT = "/sys/fs/cgroup";
const CLOCK_TICKS_PER_SECOND = 100;

interface CpuCounter {
  timestamp: number;
  usageMicroseconds: number;
}

async function firstExistingDirectory(candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      if ((await fileSystem.stat(candidate)).isDirectory()) return candidate;
    } catch {
      /* Try the next layout. */
    }
  }
  return null;
}

async function readCgroupUsage(cgroupPath: string): Promise<{ memoryBytes: number; memoryLimitBytes: number | null; usageMicroseconds: number } | null> {
  const [currentText, statText, maximumText, cpuText] = await Promise.all([
    readTextFile(`${cgroupPath}/memory.current`),
    readTextFile(`${cgroupPath}/memory.stat`),
    readTextFile(`${cgroupPath}/memory.max`),
    readTextFile(`${cgroupPath}/cpu.stat`),
  ]);
  if (currentText === null || cpuText === null) return null;
  const inactiveFileBytes = parseCgroupMemoryStat(statText ?? "").inactiveFileBytes ?? 0;
  const memoryLimit = maximumText?.trim() === "max" || maximumText === null ? null : Number(maximumText.trim());
  return {
    memoryBytes: Math.max(0, Number(currentText.trim()) - inactiveFileBytes),
    memoryLimitBytes: memoryLimit !== null && Number.isFinite(memoryLimit) ? memoryLimit : null,
    usageMicroseconds: parseCgroupCpuStat(cpuText).usageMicroseconds ?? 0,
  };
}

/**
 * Per-app memory and CPU. Docker containers and systemd units are read from cgroup v2 (cheap, and
 * matches `docker stats` / `systemctl status` because inactive file cache is subtracted); the
 * Docker API is only a fallback. Bare processes use /proc/<pid>. CPU is % of the whole host.
 */
export class AppUsageSource {
  private readonly previousCpu = new Map<string, CpuCounter>();
  private readonly processorCount = operatingSystem.availableParallelism();

  private computeCpuPercent(appKey: string, usageMicroseconds: number, timestamp: number): number {
    const previous = this.previousCpu.get(appKey);
    this.previousCpu.set(appKey, { timestamp, usageMicroseconds });
    if (!previous || usageMicroseconds < previous.usageMicroseconds) return 0;
    const elapsedMicroseconds = (timestamp - previous.timestamp) * 1000;
    return elapsedMicroseconds > 0 ? Math.min(100, ((usageMicroseconds - previous.usageMicroseconds) / (elapsedMicroseconds * this.processorCount)) * 100) : 0;
  }

  private async readDocker(item: DiscoveredItem, timestamp: number): Promise<AppUsageReading | null> {
    const containerId = String(item.extra.containerId ?? "");
    if (!containerId) return null;
    const cgroupPath = await firstExistingDirectory([`${CGROUP_ROOT}/system.slice/docker-${containerId}.scope`, `${CGROUP_ROOT}/docker/${containerId}`]);
    const cgroupUsage = cgroupPath ? await readCgroupUsage(cgroupPath) : null;
    if (cgroupUsage) {
      return { appKey: item.key, source: "docker", cpuPercent: this.computeCpuPercent(item.key, cgroupUsage.usageMicroseconds, timestamp), memoryBytes: cgroupUsage.memoryBytes, memoryLimitBytes: cgroupUsage.memoryLimitBytes };
    }
    try {
      const statistics = await readContainerStatistics(containerId);
      const inactiveFileBytes = statistics.memory_stats.stats?.inactive_file ?? statistics.memory_stats.stats?.total_inactive_file ?? 0;
      const cpuDelta = statistics.cpu_stats.cpu_usage.total_usage - statistics.precpu_stats.cpu_usage.total_usage;
      const systemDelta = (statistics.cpu_stats.system_cpu_usage ?? 0) - (statistics.precpu_stats.system_cpu_usage ?? 0);
      const memoryLimit = statistics.memory_stats.limit ?? null;
      return {
        appKey: item.key,
        source: "docker",
        cpuPercent: systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0,
        memoryBytes: Math.max(0, (statistics.memory_stats.usage ?? 0) - inactiveFileBytes),
        memoryLimitBytes: memoryLimit && memoryLimit < operatingSystem.totalmem() ? memoryLimit : null,
      };
    } catch {
      return null;
    }
  }

  private async readSystemd(item: DiscoveredItem, timestamp: number): Promise<AppUsageReading | null> {
    if (!item.unit) return null;
    const cgroupUsage = await readCgroupUsage(`${CGROUP_ROOT}/system.slice/${item.unit}`);
    if (!cgroupUsage) return null;
    return { appKey: item.key, source: "systemd", cpuPercent: this.computeCpuPercent(item.key, cgroupUsage.usageMicroseconds, timestamp), memoryBytes: cgroupUsage.memoryBytes, memoryLimitBytes: cgroupUsage.memoryLimitBytes };
  }

  private async readProcess(item: DiscoveredItem, timestamp: number): Promise<AppUsageReading | null> {
    const processId = Number(item.extra.processId);
    if (!Number.isInteger(processId) || processId <= 0) return null;
    const [statusText, statText] = await Promise.all([readTextFile(`/proc/${processId}/status`), readTextFile(`/proc/${processId}/stat`)]);
    if (!statusText || !statText) return null;
    const residentKilobytes = Number(/^VmRSS:\s+(\d+)/m.exec(statusText)?.[1] ?? 0);
    const statFields = statText.slice(statText.lastIndexOf(")") + 2).split(" ");
    const cpuTicks = Number(statFields[11] ?? 0) + Number(statFields[12] ?? 0);
    return { appKey: item.key, source: "port", cpuPercent: this.computeCpuPercent(item.key, (cpuTicks / CLOCK_TICKS_PER_SECOND) * 1_000_000, timestamp), memoryBytes: residentKilobytes * 1024, memoryLimitBytes: null };
  }

  async read(items: readonly DiscoveredItem[]): Promise<AppUsageReading[]> {
    const timestamp = Date.now();
    const readings = await Promise.all(
      items
        .filter((item) => item.state === "running")
        .map((item) => {
          if (item.source === "docker") return this.readDocker(item, timestamp);
          if (item.source === "systemd") return this.readSystemd(item, timestamp);
          if (item.source === "port") return this.readProcess(item, timestamp);
          return Promise.resolve(null);
        }),
    );
    return readings.filter((reading): reading is AppUsageReading => reading !== null);
  }
}
