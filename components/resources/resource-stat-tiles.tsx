"use client";

import { Clock, Cpu, Gauge, MemoryStick, Network, Thermometer } from "lucide-react";
import { useState, type ReactNode } from "react";
import { readTemperatureTone, readUsageTone } from "@/components/resources/metric-tones";
import { useLiveStream } from "@/hooks/use-live-stream";
import type { LiveSystemSample } from "@/lib/queries/live-types";
import { formatBytes, formatDuration } from "@/utilities/format-number";
import { mergeClassNames } from "@/utilities/merge-class-names";

const TONE_CLASS_NAMES = { success: "text-success", warning: "text-warning", danger: "text-danger", slate: "text-foreground-muted" } as const;
const BAR_CLASS_NAMES = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", slate: "bg-foreground-faint" } as const;

function Tile({ label, icon, value, detail, tone, percentage }: { label: string; icon: ReactNode; value: ReactNode; detail?: ReactNode; tone: keyof typeof TONE_CLASS_NAMES; percentage?: number | null }) {
  return (
    <div className="box relative flex flex-col border border-dashed border-line-strong/80 p-4">
      <div className="flex items-center gap-2 text-xs tracking-[0.08em] text-foreground-muted uppercase">
        {icon}
        {label}
      </div>
      <div className={mergeClassNames("mt-2 font-display text-2xl font-medium", TONE_CLASS_NAMES[tone])}>{value}</div>
      {detail && <div className="mt-0.5 truncate text-xs text-foreground-subtle">{detail}</div>}
      {percentage !== undefined && percentage !== null && (
        <div className="mt-3 h-1 w-full bg-surface-strong">
          <div className={mergeClassNames("h-full transition-[width] duration-700", BAR_CLASS_NAMES[tone])} style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * The live tiles at the top of Resources: CPU, memory, GPU (only when one reports stats),
 * temperature, network and uptime, coloured by thresholds (success < 70 % < warning < 90 % < danger).
 *
 * @example
 * <ResourceStatTiles initialSample={latestSample} />
 */
export function ResourceStatTiles({ initialSample }: { initialSample: LiveSystemSample | null }) {
  const [sample, setSample] = useState(initialSample);
  useLiveStream("system", setSample);
  if (!sample) return null;
  const memoryPercentage = sample.memoryTotal > 0 ? (100 * sample.memoryUsed) / sample.memoryTotal : null;
  const gpusWithUsage = sample.gpus.filter((gpu) => gpu.utilizationPercent !== null);
  const gpuPercentage = gpusWithUsage.length > 0 ? gpusWithUsage.reduce((total, gpu) => total + (gpu.utilizationPercent ?? 0), 0) / gpusWithUsage.length : null;
  const hottestGpu = Math.max(...sample.gpus.map((gpu) => gpu.temperatureCelsius ?? Number.NEGATIVE_INFINITY));
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Tile label="CPU" icon={<Cpu className="h-3.5 w-3.5" />} value={`${sample.cpuPercent.toFixed(0)}%`} detail={`load ${sample.loadAverages.map((load) => load.toFixed(2)).join(" ")}`} tone={readUsageTone(sample.cpuPercent)} percentage={sample.cpuPercent} />
      <Tile label="Memory" icon={<MemoryStick className="h-3.5 w-3.5" />} value={formatBytes(sample.memoryUsed, { maximumFractionDigits: 1 })} detail={`of ${formatBytes(sample.memoryTotal, { maximumFractionDigits: 0 })} · swap ${formatBytes(sample.swapUsed, { maximumFractionDigits: 1 })}`} tone={readUsageTone(memoryPercentage)} percentage={memoryPercentage} />
      {sample.gpus.length > 0 && <Tile label="GPU" icon={<Gauge className="h-3.5 w-3.5" />} value={gpuPercentage === null ? "—" : `${gpuPercentage.toFixed(0)}%`} detail={sample.gpus[0]?.name ?? "No GPU stats"} tone={readUsageTone(gpuPercentage)} percentage={gpuPercentage} />}
      <Tile label="Temperature" icon={<Thermometer className="h-3.5 w-3.5" />} value={sample.cpuTemperatureCelsius === null ? "—" : `${sample.cpuTemperatureCelsius.toFixed(0)}°C`} detail={Number.isFinite(hottestGpu) ? `GPU ${hottestGpu.toFixed(0)}°C` : "CPU package"} tone={readTemperatureTone(sample.cpuTemperatureCelsius)} />
      <Tile label="Network" icon={<Network className="h-3.5 w-3.5" />} value={<span className="text-xl">↓{formatBytes(sample.networkReceivedBytesPerSecond, { maximumFractionDigits: 1 })}/s</span>} detail={`↑ ${formatBytes(sample.networkTransmittedBytesPerSecond, { maximumFractionDigits: 1 })}/s`} tone="slate" />
      <Tile label="Uptime" icon={<Clock className="h-3.5 w-3.5" />} value={formatDuration(sample.uptimeSeconds)} detail="since last boot" tone="slate" />
    </div>
  );
}
