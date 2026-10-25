import type { Metadata } from "next";
import type { GpuDevice } from "@/collector/types";
import { PageHeader } from "@/components/primitives/page-header";
import { DiskUsageList } from "@/components/resources/disk-usage-list";
import { HistoryResourceCharts, type HistoryChart } from "@/components/resources/history-resource-charts";
import { LiveResourceCharts } from "@/components/resources/live-resource-charts";
import { RangeSwitcher } from "@/components/resources/range-switcher";
import { ResourceStatTiles } from "@/components/resources/resource-stat-tiles";
import { getDatabase, type ServerLabDatabase } from "@/lib/database/client";
import { readCapability } from "@/lib/database/key-value";
import { HISTORY_RANGES, LIVE_RANGES, isHistoryRange, readLatestFilesystems, readRollupEntities, readRollupSeries, type HistoryRange } from "@/lib/queries/history-queries";
import { readLatestSystemSample, readSystemSamplesSince } from "@/lib/queries/system-queries";
import { readRenderTimestamp } from "@/lib/request-time";

export const metadata: Metadata = { title: "Resources" };
export const dynamic = "force-dynamic";

function buildHistoryCharts(database: ServerLabDatabase, range: HistoryRange, gpuDevices: readonly GpuDevice[]): HistoryChart[] {
  const series = (metric: string, entity = "") => readRollupSeries(database, metric, entity, range);
  const gpuEntities = readRollupEntities(database, "gpu_util", range);
  return [
    { title: "CPU", valueFormat: "percentage", lines: [{ label: "CPU", series: series("cpu_pct"), showsMaximum: true }] },
    { title: "Memory", subtitle: "% of total", valueFormat: "percentage", lines: [{ label: "Used", series: series("mem_pct"), showsMaximum: true }] },
    ...gpuEntities.map((entity) => ({ title: `GPU ${entity}`, subtitle: gpuDevices.find((device) => String(device.index) === entity)?.name, valueFormat: "percentage" as const, lines: [{ label: "Usage", series: series("gpu_util", entity), showsMaximum: true }] })),
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
  const isHistory = isHistoryRange(range);
  return (
    <>
      <PageHeader title="Resources" description={isHistory ? "History from 1-minute and 1-hour rollups: average, with the maximum dotted." : "Live host metrics, refreshed every 2 seconds."} actions={<RangeSwitcher currentRange={range} basePath="/resources" />} />
      <div className="mt-6">
        <ResourceStatTiles initialSample={readLatestSystemSample(database)} />
      </div>
      <div className="mt-6">
        {isHistory ? (
          <HistoryResourceCharts charts={buildHistoryCharts(database, range, gpuDevices)} spanMilliseconds={HISTORY_RANGES[range].spanMilliseconds} />
        ) : (
          <LiveResourceCharts initialSamples={readSystemSamplesSince(database, readRenderTimestamp() - LIVE_RANGES["1h"])} windowMilliseconds={LIVE_RANGES[range as keyof typeof LIVE_RANGES]} gpuDevices={gpuDevices} />
        )}
      </div>
      <div className="mt-6">
        <DiskUsageList filesystems={readLatestFilesystems(database)} />
      </div>
    </>
  );
}
