import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rollUpHours, rollUpMinutes } from "@/collector/jobs/rollup-job";
import { writeSystemSample } from "@/collector/storage/sample-writer";
import type { SystemSample } from "@/collector/types";
import type { ServerLabDatabase } from "@/lib/database/client";
import { createTemporaryDatabase } from "@/lib/testing/temporary-database";

const MINUTE = 60_000;

function sampleAt(timestamp: number, cpuPercent: number): SystemSample {
  return {
    timestamp,
    cpuPercent,
    corePercents: [cpuPercent, cpuPercent],
    loadAverages: [1, 1, 1],
    memory: { totalBytes: 1000, availableBytes: 500, usedBytes: 500, cachedBytes: 100, swapTotalBytes: 0, swapUsedBytes: 0 },
    cpuTemperatureCelsius: 50,
    temperatures: [],
    networkInterfaces: [{ interfaceName: "eth0", receivedBytesPerSecond: 100, transmittedBytesPerSecond: 50 }, { interfaceName: "tailscale0", receivedBytesPerSecond: 1000, transmittedBytesPerSecond: 1000 }],
    disks: [],
    gpus: [{ gpuIndex: 0, vendor: "nvidia", name: "Test GPU", utilizationPercent: cpuPercent / 2, memoryUsedBytes: 1, memoryTotalBytes: 2, temperatureCelsius: 60, powerWatts: null }],
    uptimeSeconds: 100,
  };
}

describe("rollups", () => {
  let database: ServerLabDatabase;
  let remove: () => void;
  beforeEach(() => ({ database, remove } = createTemporaryDatabase()));
  afterEach(() => remove());

  it("aggregates raw samples into 1-minute avg/max/min and is idempotent", () => {
    const minuteStart = 10 * MINUTE;
    for (const [offset, cpuPercent] of [[0, 10], [20_000, 20], [40_000, 60]] as const) writeSystemSample(database, sampleAt(minuteStart + offset, cpuPercent));
    rollUpMinutes(database, minuteStart, minuteStart + MINUTE);
    rollUpMinutes(database, minuteStart, minuteStart + MINUTE);
    const rows = database.$client.prepare("SELECT metric, entity, avg, max, min FROM metric_rollups WHERE resolution = '1m' AND metric IN ('cpu_pct', 'gpu_util', 'mem_pct') ORDER BY metric").all();
    expect(rows).toEqual([
      { metric: "cpu_pct", entity: "", avg: 30, max: 60, min: 10 },
      { metric: "gpu_util", entity: "0", avg: 15, max: 30, min: 5 },
      { metric: "mem_pct", entity: "", avg: 50, max: 50, min: 50 },
    ]);
  });

  it("excludes tailscale0 from the network totals", () => {
    writeSystemSample(database, sampleAt(MINUTE, 10));
    expect(database.$client.prepare("SELECT net_rx_bps AS received FROM metric_samples").get()).toEqual({ received: 100 });
  });

  it("builds 1-hour buckets from 1-minute buckets", () => {
    writeSystemSample(database, sampleAt(0, 10));
    writeSystemSample(database, sampleAt(30 * MINUTE, 50));
    rollUpMinutes(database, 0, 60 * MINUTE);
    rollUpHours(database, 0, 60 * MINUTE);
    expect(database.$client.prepare("SELECT avg, max, min FROM metric_rollups WHERE resolution = '1h' AND metric = 'cpu_pct'").get()).toEqual({ avg: 30, max: 50, min: 10 });
  });
});
