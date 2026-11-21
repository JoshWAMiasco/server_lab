"use client";

import { Clock, Cpu, MemoryStick, Network, Thermometer } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { readTemperatureTone, readUsageTone } from "@/components/resources/metric-tones";
import { useLiveStream } from "@/hooks/use-live-stream";
import type { LiveSystemSample } from "@/lib/queries/live-types";
import type { UptimeStreak } from "@/lib/queries/uptime-queries";
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

function formatAgo(milliseconds: number): string {
  return `${formatDuration(milliseconds / 1000).split(" ")[0] ?? "0s"} ago`;
}

function describeUptime(sample: LiveSystemSample, streak: UptimeStreak | null, now: number): { value: string; detail: string } {
  if (!streak) return { value: formatDuration(sample.uptimeSeconds), detail: "since last boot" };
  const rebootText = streak.lastRebootAt === null || streak.rebootCount === 0 ? "no reboots" : `last reboot ${formatAgo(now - streak.lastRebootAt)}`;
  return { value: formatDuration((now - streak.streakStartedAt) / 1000), detail: `since last shutdown · ${rebootText}` };
}

/**
 * The live tiles at the top of Resources: CPU, memory (with the installed module count when
 * known), temperature, network and uptime, coloured by thresholds (success < 70 % < warning <
 * 90 % < danger). Uptime is the continuous streak, which reboots do not reset; it ticks every
 * second from `renderTimestamp` so the server and the first client render agree. Without a streak
 * it falls back to the kernel uptime. GPUs have their own section below the charts.
 *
 * @example
 * <ResourceStatTiles initialSample={latestSample} uptimeStreak={streak} renderTimestamp={readRenderTimestamp()} memoryModuleCount={4} />
 */
export function ResourceStatTiles({ initialSample, uptimeStreak, renderTimestamp, memoryModuleCount = null }: { initialSample: LiveSystemSample | null; uptimeStreak: UptimeStreak | null; renderTimestamp: number; memoryModuleCount?: number | null }) {
  const [sample, setSample] = useState(initialSample);
  const [now, setNow] = useState(renderTimestamp);
  useLiveStream("system", setSample);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  if (!sample) return null;
  const memoryPercentage = sample.memoryTotal > 0 ? (100 * sample.memoryUsed) / sample.memoryTotal : null;
  const hottestGpu = Math.max(...sample.gpus.map((gpu) => gpu.temperatureCelsius ?? Number.NEGATIVE_INFINITY));
  const uptime = describeUptime(sample, uptimeStreak, now);
  const moduleText = memoryModuleCount ? ` · ${memoryModuleCount} stick${memoryModuleCount === 1 ? "" : "s"}` : "";
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      <Tile label="CPU" icon={<Cpu className="h-3.5 w-3.5" />} value={`${sample.cpuPercent.toFixed(0)}%`} detail={`load ${sample.loadAverages.map((load) => load.toFixed(2)).join(" ")}`} tone={readUsageTone(sample.cpuPercent)} percentage={sample.cpuPercent} />
      <Tile label="Memory" icon={<MemoryStick className="h-3.5 w-3.5" />} value={formatBytes(sample.memoryUsed, { maximumFractionDigits: 1 })} detail={`of ${formatBytes(sample.memoryTotal, { maximumFractionDigits: 0 })}${moduleText} · swap ${formatBytes(sample.swapUsed, { maximumFractionDigits: 1 })}`} tone={readUsageTone(memoryPercentage)} percentage={memoryPercentage} />
      <Tile label="Temperature" icon={<Thermometer className="h-3.5 w-3.5" />} value={sample.cpuTemperatureCelsius === null ? "—" : `${sample.cpuTemperatureCelsius.toFixed(0)}°C`} detail={Number.isFinite(hottestGpu) ? `GPU ${hottestGpu.toFixed(0)}°C` : "CPU package"} tone={readTemperatureTone(sample.cpuTemperatureCelsius)} />
      <Tile label="Network" icon={<Network className="h-3.5 w-3.5" />} value={<span className="text-xl">↓{formatBytes(sample.networkReceivedBytesPerSecond, { maximumFractionDigits: 1 })}/s</span>} detail={`↑ ${formatBytes(sample.networkTransmittedBytesPerSecond, { maximumFractionDigits: 1 })}/s`} tone="slate" />
      <Tile label="Uptime" icon={<Clock className="h-3.5 w-3.5" />} value={uptime.value} detail={uptime.detail} tone="slate" />
    </div>
  );
}
