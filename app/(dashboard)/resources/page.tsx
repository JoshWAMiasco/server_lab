import type { Metadata } from "next";
import type { GpuDevice, MachineInventory } from "@/collector/types";
import { PageHeader } from "@/components/primitives/page-header";
import { DiskUsageList } from "@/components/resources/disk-usage-list";
import { HistoryResourceCharts, type HistoryPanel } from "@/components/resources/history-resource-charts";
import { LiveResourceCharts } from "@/components/resources/live-resource-charts";
import { summarizeMemoryModules } from "@/components/resources/memory-overview";
import { RangeSwitcher } from "@/components/resources/range-switcher";
import { ResourceStatTiles } from "@/components/resources/resource-stat-tiles";
import { getDatabase, type ServerLabDatabase } from "@/lib/database/client";
import { readCapability } from "@/lib/database/key-value";
import { HISTORY_RANGES, LIVE_RANGES, isHistoryRange, readLatestFilesystems, readRollupEntities, readRollupSeries, type HistoryRange } from "@/lib/queries/history-queries";
import { readLatestSystemSample, readSystemSamplesSince } from "@/lib/queries/system-queries";
import { readCurrentUptimeStreak } from "@/lib/queries/uptime-queries";
import { readRenderTimestamp } from "@/lib/request-time";

export const metadata: Metadata = { title: "Resources" };
export const dynamic = "force-dynamic";

function readNumericEntities(database: ServerLabDatabase, metrics: readonly string[], range: HistoryRange): string[] {
  const entities = new Set(metrics.flatMap((metric) => readRollupEntities(database, metric, range)));
  return [...entities].sort((first, second) => Number(first) - Number(second) || first.localeCompare(second));
}

function buildHistoryCharts(database: ServerLabDatabase, range: HistoryRange, gpuDevices: readonly GpuDevice[]): HistoryPanel[] {
  const series = (metric: string, entity = "") => readRollupSeries(database, metric, entity, range);
  const gpuEntities = readNumericEntities(database, ["gpu_util", "gpu_vram_used"], range);
  const vramEntities = new Set(readRollupEntities(database, "gpu_vram_used", range));
  const coreEntities = readNumericEntities(database, ["cpu_core_pct"], range);
  const gpuName = (entity: string) => gpuDevices.find((device) => String(device.index) === entity)?.name;
  return [
    { title: "CPU", valueFormat: "percentage", lines: [{ label: "CPU", series: series("cpu_pct"), showsMaximum: true }] },
    { title: "Memory", subtitle: "% of total", valueFormat: "percentage", lines: [{ label: "Used", series: series("mem_pct"), showsMaximum: true }] },
    { kind: "cpu-cores", title: "Per core", cores: coreEntities.map((entity) => ({ coreIndex: Number(entity), series: series("cpu_core_pct", entity) })) },
    ...gpuEntities.flatMap((entity): HistoryPanel[] => [
      { title: `GPU ${entity} utilization`, subtitle: gpuName(entity), valueFormat: "percentage", lines: [{ label: "Utilization", series: series("gpu_util", entity), showsMaximum: true }] },
      { title: `GPU ${entity} VRAM`, subtitle: gpuName(entity), valueFormat: "bytes", lines: [{ label: "VRAM used", series: series("gpu_vram_used", entity), showsMaximum: true }], emptyMessage: vramEntities.has(entity) ? undefined : "VRAM not reported by this driver" },
    ]),
    { title: "Temperatures", valueFormat: "celsius", lines: [{ label: "CPU", series: series("cpu_temp_c"), showsMaximum: true }, ...gpuEntities.map((entity) => ({ label: `GPU ${entity}`, series: series("gpu_temp_c", entity) }))] },
    { title: "Network", valueFormat: "bytes-per-second", lines: [{ label: "Receive", series: series("net_rx_bps") }, { label: "Send", series: series("net_tx_bps") }] },
    { title: "Disk I/O", valueFormat: "bytes-per-second", lines: [{ label: "Read", series: series("disk_read_bps") }, { label: "Write", series: series("disk_write_bps") }] },
  ];
}

export default async function ResourcesPage({ searchParams }: PageProps<"/resources">) {
  const { range: requestedRange } = await searchParams;
  const range = typeof requestedRange === "string" && (requestedRange in LIVE_RANGES || isHistoryRange(requestedRange)) ? requestedRange : "5m";
  const database = getDatabase();
  const gpuDevices = readCapability<GpuDevice[]>(database, "gpus", []);
  const machineInventory = readCapability<MachineInventory | null>(database, "machineInventory", null);
  const memoryInventory = machineInventory?.memory ?? null;
  const renderTimestamp = readRenderTimestamp();
  const isHistory = isHistoryRange(range);
  return (
    <>
      <PageHeader title="Resources" description={isHistory ? "History from 1-minute and 1-hour rollups: average, with the maximum dotted." : "Live host metrics, refreshed every 2 seconds."} actions={<RangeSwitcher currentRange={range} basePath="/resources" />} />
      <div className="mt-6">
        <ResourceStatTiles initialSample={readLatestSystemSample(database)} uptimeStreak={readCurrentUptimeStreak(database)} renderTimestamp={renderTimestamp} memoryModuleCount={summarizeMemoryModules(memoryInventory)?.installedCount ?? null} />
      </div>
      <div className="mt-6">
        {isHistory ? (
          <HistoryResourceCharts charts={buildHistoryCharts(database, range, gpuDevices)} spanMilliseconds={HISTORY_RANGES[range].spanMilliseconds} />
        ) : (
          <LiveResourceCharts initialSamples={readSystemSamplesSince(database, renderTimestamp - LIVE_RANGES["1h"])} windowMilliseconds={LIVE_RANGES[range as keyof typeof LIVE_RANGES]} gpuDevices={gpuDevices} memoryInventory={memoryInventory} />
        )}
      </div>
      <div className="mt-6">
        <DiskUsageList filesystems={readLatestFilesystems(database)} />
      </div>
    </>
  );
}
