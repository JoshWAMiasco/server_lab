"use client";

import { BarChart3 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { readAppHistory } from "@/app/actions/history-actions";
import { AppUsageRow } from "@/components/apps/app-usage-row";
import { DonutChart } from "@/components/charts/donut-chart";
import { LineChart } from "@/components/charts/line-chart";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { FormSelect } from "@/components/primitives/form-select";
import { ChartPanel } from "@/components/resources/chart-panel";
import { SERIES_COLOR_NAMES } from "@/components/resources/metric-tones";
import { useLiveStream } from "@/hooks/use-live-stream";
import type { AppIdentity, AppUsageOverview } from "@/lib/queries/app-usage-queries";
import type { HistorySeries } from "@/lib/queries/history-queries";
import type { LiveAppUsage } from "@/lib/queries/live-types";
import { formatBytes } from "@/utilities/format-number";
import { mergeClassNames } from "@/utilities/merge-class-names";

type SortKey = "memory" | "cpu";
type SourceFilter = "all" | "docker" | "systemd";
type HistoryRange = "24h" | "7d" | "30d";

const SPARKLINE_WINDOW_MILLISECONDS = 15 * 60_000;
const DONUT_SEGMENT_COUNT = 8;

function SegmentedControl<Value extends string>({ label, value, options, onChange }: { label: string; value: Value; options: readonly { value: Value; label: string }[]; onChange: (value: Value) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-foreground-subtle uppercase">{label}</span>
      <div className="flex border border-line bg-surface p-0.5">
        {options.map((option) => (
          <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={mergeClassNames("cursor-pointer px-3 py-1 text-xs", value === option.value ? "bg-brand text-on-primary" : "text-foreground-muted hover:text-foreground")}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatBucket(timestamp: number, range: HistoryRange): string {
  const date = new Date(timestamp);
  return range === "24h" ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/**
 * The Applications page body: total tracked memory, the ranked list (re-sorted live every 10 s,
 * rows glide to their new position), a memory-share donut and the selected app's history.
 * Sorting and filtering happen in the browser.
 *
 * @example
 * <AppUsageBoard overview={readAppUsageOverview(database)} />
 */
export function AppUsageBoard({ overview }: { overview: AppUsageOverview }) {
  const [usages, setUsages] = useState<LiveAppUsage[]>(overview.batch?.usages ?? []);
  const [sparklines, setSparklines] = useState(overview.sparklines);
  const [sortKey, setSortKey] = useState<SortKey>("memory");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedAppKey, setSelectedAppKey] = useState<string | null>(null);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("24h");
  const [history, setHistory] = useState<{ memory: HistorySeries; cpu: HistorySeries } | null>(null);
  const [isLoadingHistory, startHistoryTransition] = useTransition();
  const listReference = useRef<HTMLDivElement>(null);
  const previousPositions = useRef(new Map<string, number>());

  useLiveStream("apps", (batch) => {
    setUsages(batch.usages);
    setSparklines((previous) => {
      const next: typeof previous = {};
      for (const usage of batch.usages) next[usage.appKey] = [...(previous[usage.appKey] ?? []), { timestamp: batch.timestamp, memoryBytes: usage.memoryBytes, cpuPercent: usage.cpuPercent }].filter((point) => point.timestamp >= batch.timestamp - SPARKLINE_WINDOW_MILLISECONDS);
      return next;
    });
  });

  useEffect(() => {
    const hashKey = decodeURIComponent(window.location.hash.slice(1));
    if (hashKey) queueMicrotask(() => setSelectedAppKey(hashKey));
  }, []);

  useEffect(() => {
    if (!selectedAppKey) return;
    startHistoryTransition(async () => setHistory(await readAppHistory(selectedAppKey, historyRange)));
  }, [selectedAppKey, historyRange]);

  const identityOf = (appKey: string): AppIdentity => overview.identities[appKey] ?? { name: appKey.replace(/^\w+:/, ""), iconFileName: null, source: (appKey.split(":")[0] as AppIdentity["source"]) ?? "port" };
  const visibleUsages = usages.filter((usage) => sourceFilter === "all" || usage.source === sourceFilter).sort((left, right) => (sortKey === "memory" ? right.memoryBytes - left.memoryBytes : right.cpuPercent - left.cpuPercent));
  const totalTracked = usages.reduce((total, usage) => total + usage.memoryBytes, 0);
  const orderKey = visibleUsages.map((usage) => usage.appKey).join("|");

  useLayoutEffect(() => {
    const rows = listReference.current?.querySelectorAll<HTMLElement>("[data-app-key]") ?? [];
    for (const row of rows) {
      const appKey = row.dataset.appKey ?? "";
      const top = row.getBoundingClientRect().top;
      const previousTop = previousPositions.current.get(appKey);
      if (previousTop !== undefined && previousTop !== top) {
        row.animate([{ transform: `translateY(${previousTop - top}px)` }, { transform: "translateY(0)" }], { duration: 450, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
      previousPositions.current.set(appKey, top);
    }
  }, [orderKey]);

  const memoryRanked = [...usages].sort((left, right) => right.memoryBytes - left.memoryBytes);
  const donutSegments = [
    ...memoryRanked.slice(0, DONUT_SEGMENT_COUNT).map((usage, usageIndex) => ({ label: identityOf(usage.appKey).name, value: Math.round(usage.memoryBytes / 1_048_576), colorName: SERIES_COLOR_NAMES[usageIndex % SERIES_COLOR_NAMES.length] ?? "brand", opacity: 0.75 })),
    ...(memoryRanked.length > DONUT_SEGMENT_COUNT ? [{ label: "Other", value: Math.round(memoryRanked.slice(DONUT_SEGMENT_COUNT).reduce((total, usage) => total + usage.memoryBytes, 0) / 1_048_576), colorName: "foreground-faint" as const, opacity: 0.6 }] : []),
  ];
  const historyLabels = history?.memory.bucketTimestamps.map((timestamp) => formatBucket(timestamp, historyRange)) ?? [];
  const historyOptions = [...new Set([...usages.map((usage) => usage.appKey), ...overview.historyAppKeys])].map((appKey) => ({ value: appKey, label: `${identityOf(appKey).name}${usages.some((usage) => usage.appKey === appKey) ? "" : " (stopped)"}` }));

  return (
    <div className="grid grid-cols-12 gap-5">
      <Card className="col-span-12 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line/60 px-5 py-4 lg:flex-row lg:items-center">
          <div>
            Total tracked: <span className="font-display text-base text-foreground-strong">{formatBytes(totalTracked)}</span>
            {overview.hostMemoryTotal > 0 && (
              <span className="text-foreground-muted">
                {" "}
                of {formatBytes(overview.hostMemoryTotal, { maximumFractionDigits: 0 })} host memory ({((100 * totalTracked) / overview.hostMemoryTotal).toFixed(0)}%)
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-4 lg:ml-auto">
            <SegmentedControl label="Sort" value={sortKey} onChange={setSortKey} options={[{ value: "memory", label: "Memory" }, { value: "cpu", label: "CPU" }]} />
            <SegmentedControl label="Source" value={sourceFilter} onChange={setSourceFilter} options={[{ value: "all", label: "All" }, { value: "docker", label: "Docker" }, { value: "systemd", label: "systemd" }]} />
          </div>
        </div>
        <div ref={listReference}>
          {visibleUsages.length === 0 && <EmptyState icon={<BarChart3 className="h-10 w-10 stroke-[1]" />} title="No running apps" description="App usage is sampled every 10 seconds from Docker and systemd cgroups." />}
          {visibleUsages.map((usage, usageIndex) => (
            <div key={usage.appKey} data-app-key={usage.appKey}>
              <AppUsageRow
                rank={usageIndex + 1}
                usage={usage}
                identity={identityOf(usage.appKey)}
                hostMemoryTotal={overview.hostMemoryTotal}
                sparklineValues={(sparklines[usage.appKey] ?? []).map((point) => (sortKey === "memory" ? point.memoryBytes : point.cpuPercent))}
                isSelected={selectedAppKey === usage.appKey}
                onSelect={() => setSelectedAppKey(usage.appKey)}
              />
            </div>
          ))}
        </div>
      </Card>

      <ChartPanel title="Memory share" subtitle={`top ${DONUT_SEGMENT_COUNT} + other`} className="col-span-12 lg:col-span-5">
        {donutSegments.length > 0 ? (
          <DonutChart ariaLabel="Memory share by application" segments={donutSegments} cutoutPercentage={72} showsLegend centerContent={<><div className="font-display text-lg">{formatBytes(totalTracked, { maximumFractionDigits: 1 })}</div><div className="text-xs text-foreground-muted">tracked</div></>} className="h-[300px]" />
        ) : (
          <div className="py-16 text-center text-foreground-muted">No data yet.</div>
        )}
      </ChartPanel>

      <ChartPanel
        title="History"
        subtitle={selectedAppKey ? identityOf(selectedAppKey).name : "select an app"}
        className="col-span-12 lg:col-span-7"
        actions={
          <div className="flex items-center gap-3">
            <FormSelect size="small" aria-label="Application" value={selectedAppKey ?? ""} onChange={(changeEvent) => setSelectedAppKey(changeEvent.target.value || null)} options={[{ value: "", label: "Choose an app…" }, ...historyOptions]} className="w-48" />
            <SegmentedControl label="" value={historyRange} onChange={setHistoryRange} options={[{ value: "24h", label: "24h" }, { value: "7d", label: "7d" }, { value: "30d", label: "30d" }]} />
          </div>
        }
      >
        {!selectedAppKey && <div className="flex h-[280px] items-center justify-center text-foreground-muted">Click a row to see its memory and CPU history.</div>}
        {selectedAppKey && history && (
          <div className={mergeClassNames("grid gap-4 transition-opacity", isLoadingHistory && "opacity-50")}>
            <LineChart ariaLabel="Memory history" labels={historyLabels} series={[{ label: "Memory avg", values: history.memory.averages as number[], colorName: "brand", fillStyle: "gradient" }, { label: "Memory max", values: history.memory.maximums as number[], colorName: "brand", opacity: 0.35, lineStyle: "dotted" }]} valueFormat="bytes" showsXAxisLabels showsYAxisLabels showsGridLines className="h-[160px]" />
            <LineChart ariaLabel="CPU history" labels={historyLabels} series={[{ label: "CPU avg", values: history.cpu.averages as number[], colorName: "info", fillStyle: "gradient" }]} valueFormat="percentage" showsXAxisLabels showsYAxisLabels showsGridLines className="h-[120px]" />
          </div>
        )}
      </ChartPanel>
    </div>
  );
}
