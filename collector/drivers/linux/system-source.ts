import { readHardwareTemperatures } from "@/collector/drivers/linux/hardware-monitor-source";
import { readTextFile } from "@/collector/drivers/linux/run-command";
import { parseDiskstats } from "@/collector/parsers/parse-diskstats";
import { parseLoadAverage } from "@/collector/parsers/parse-load-average";
import { parseMeminfo } from "@/collector/parsers/parse-meminfo";
import { isPhysicalInterface, parseProcNetDevice } from "@/collector/parsers/parse-proc-net-dev";
import { computeCorePercents, computeCpuPercent, parseProcStat } from "@/collector/parsers/parse-proc-stat";
import { parseUptime } from "@/collector/parsers/parse-uptime";
import type { DiskCounters, NetworkInterfaceCounters, ProcessorStatistics, SystemSample } from "@/collector/types";

interface PreviousCounters {
  timestamp: number;
  processor: ProcessorStatistics;
  interfaces: Map<string, NetworkInterfaceCounters>;
  disks: Map<string, DiskCounters>;
}

function perSecond(current: number, previous: number | undefined, elapsedSeconds: number): number {
  if (previous === undefined || elapsedSeconds <= 0 || current < previous) return 0;
  return (current - previous) / elapsedSeconds;
}

/**
 * Reads host metrics straight from /proc and /sys (cheaper than spawning tools every 2 s). Rates
 * (CPU %, network and disk bytes per second) are deltas against the previous call, so the first
 * call reports zeros.
 */
export class SystemReader {
  private previous: PreviousCounters | null = null;

  constructor(private readonly excludedExtraInterfaces: readonly string[] = (process.env.NETWORK_INTERFACE_EXCLUDE ?? "").split(",").filter(Boolean)) {}

  async read(): Promise<Omit<SystemSample, "gpus">> {
    const timestamp = Date.now();
    const [statText, meminfoText, loadText, uptimeText, networkDeviceText, diskstatsText, temperatures] = await Promise.all([
      readTextFile("/proc/stat"),
      readTextFile("/proc/meminfo"),
      readTextFile("/proc/loadavg"),
      readTextFile("/proc/uptime"),
      readTextFile("/proc/net/dev"),
      readTextFile("/proc/diskstats"),
      readHardwareTemperatures(),
    ]);
    const processor = parseProcStat(statText ?? "");
    const interfaces = parseProcNetDevice(networkDeviceText ?? "").filter((counters) => isPhysicalInterface(counters.interfaceName, this.excludedExtraInterfaces, true));
    const disks = parseDiskstats(diskstatsText ?? "");
    const previous = this.previous;
    const elapsedSeconds = previous ? (timestamp - previous.timestamp) / 1000 : 0;
    this.previous = { timestamp, processor, interfaces: new Map(interfaces.map((counters) => [counters.interfaceName, counters])), disks: new Map(disks.map((counters) => [counters.deviceName, counters])) };

    return {
      timestamp,
      cpuPercent: previous ? computeCpuPercent(previous.processor.aggregate, processor.aggregate) : 0,
      corePercents: previous ? computeCorePercents(previous.processor.cores, processor.cores) : processor.cores.map(() => 0),
      loadAverages: parseLoadAverage(loadText ?? "0 0 0"),
      memory: parseMeminfo(meminfoText ?? ""),
      cpuTemperatureCelsius: temperatures.cpuCelsius,
      temperatures: temperatures.otherSensors,
      networkInterfaces: interfaces.map((counters) => ({
        interfaceName: counters.interfaceName,
        receivedBytesPerSecond: perSecond(counters.receivedBytes, previous?.interfaces.get(counters.interfaceName)?.receivedBytes, elapsedSeconds),
        transmittedBytesPerSecond: perSecond(counters.transmittedBytes, previous?.interfaces.get(counters.interfaceName)?.transmittedBytes, elapsedSeconds),
      })),
      disks: disks.map((counters) => ({
        deviceName: counters.deviceName,
        readBytesPerSecond: perSecond(counters.readBytes, previous?.disks.get(counters.deviceName)?.readBytes, elapsedSeconds),
        writtenBytesPerSecond: perSecond(counters.writtenBytes, previous?.disks.get(counters.deviceName)?.writtenBytes, elapsedSeconds),
      })),
      uptimeSeconds: parseUptime(uptimeText ?? "0 0"),
    };
  }
}
