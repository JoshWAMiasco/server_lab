"use client";

import { useRef } from "react";
import type { GpuDevice } from "@/collector/types";
import { LiveLineChart, type LiveLineChartHandle, type LiveLineSeries, type LivePoint } from "@/components/charts/live-line-chart";
import { Badge, type BadgeTone } from "@/components/primitives/badge";
import { Card } from "@/components/primitives/card";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { ChartPanel } from "@/components/resources/chart-panel";
import { readTemperatureTone, readUsageTone } from "@/components/resources/metric-tones";
import { useLiveStream } from "@/hooks/use-live-stream";
import type { LiveSystemSample } from "@/lib/queries/live-types";
import { formatBytes } from "@/utilities/format-number";
import { mergeClassNames } from "@/utilities/merge-class-names";

type GpuReading = LiveSystemSample["gpus"][number];

export interface GpuEntry {
  index: number;
  vendor: string;
  name: string;
  pciAddress: string | null;
  statsAvailable: boolean;
  unavailableReason: string | null;
  reading: GpuReading | null;
}

const VENDOR_BADGES: Record<string, { label: string; tone: BadgeTone }> = {
  nvidia: { label: "NVIDIA", tone: "success" },
  amd: { label: "AMD", tone: "danger" },
  intel: { label: "Intel", tone: "info" },
};

const TONE_TEXT_CLASS_NAMES = { success: "text-success", warning: "text-warning", danger: "text-danger", slate: "text-foreground" } as const;
const TONE_BAR = { success: "success", warning: "warning", danger: "danger", slate: "primary" } as const;
const UTILIZATION_SERIES: LiveLineSeries[] = [{ label: "Utilization", colorName: "success", isFilled: true, borderWidth: 1.8 }];
const VRAM_SERIES: LiveLineSeries[] = [{ label: "VRAM used", colorName: "accent", isFilled: true, borderWidth: 1.8 }];

/**
 * Merges the detected GPUs (the `gpus` capability) with the latest live readings by index, so a
 * GPU that is detected but has no reading still shows, and a reading without a detected device
 * (a driver that skips detection) shows too. Sorted by index.
 *
 * @example
 * const entries = mergeGpuEntries(gpuDevices, latestSample.gpus);
 */
export function mergeGpuEntries(devices: readonly GpuDevice[], readings: readonly GpuReading[]): GpuEntry[] {
  const indexes = [...new Set([...devices.map((device) => device.index), ...readings.map((reading) => reading.gpuIndex)])].sort((first, second) => first - second);
  return indexes.map((index) => {
    const device = devices.find((candidate) => candidate.index === index);
    const reading = readings.find((candidate) => candidate.gpuIndex === index) ?? null;
    return {
      index,
      vendor: device?.vendor ?? reading?.vendor ?? "unknown",
      name: device?.name ?? reading?.name ?? "Unknown GPU",
      pciAddress: device?.pciAddress ?? null,
      statsAvailable: device ? device.statsAvailable : true,
      unavailableReason: device?.unavailableReason ?? null,
      reading,
    };
  });
}

function readGpu(sample: LiveSystemSample, index: number): GpuReading | undefined {
  return sample.gpus.find((candidate) => candidate.gpuIndex === index);
}

function VendorBadge({ vendor }: { vendor: string }) {
  const badge = VENDOR_BADGES[vendor.toLowerCase()] ?? { label: vendor, tone: "slate" as const };
  return <Badge tone={badge.tone}>{badge.label}</Badge>;
}

function Statistic({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface-subtle px-3 py-2">
      <div className="text-[11px] tracking-[0.08em] text-foreground-muted uppercase">{label}</div>
      <div className={mergeClassNames("mt-0.5 truncate font-display text-base font-medium tabular-nums", className)}>{value}</div>
    </div>
  );
}

function Message({ children }: { children: string }) {
  return <div className="flex h-[220px] items-center justify-center px-6 text-center text-foreground-muted">{children}</div>;
}

function AllGpusStrip({ entries }: { entries: readonly GpuEntry[] }) {
  return (
    <Card className="p-5">
      <div className="mb-3 font-display text-sm font-medium">All GPUs</div>
      <ul className="grid grid-cols-1 gap-x-8 gap-y-2.5 md:grid-cols-2">
        {entries.map((entry) => {
          const utilization = entry.reading?.utilizationPercent ?? null;
          return (
            <li key={entry.index} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-xs">
              <span className="text-foreground-muted">GPU {entry.index}</span>
              <div className="min-w-0">
                <div className="mb-1 truncate text-foreground-subtle">{entry.name}</div>
                <ProgressBar value={utilization ?? 0} size="extra-small" tone={TONE_BAR[readUsageTone(utilization)]} />
              </div>
              <span className="text-right tabular-nums">{utilization === null ? "—" : `${utilization.toFixed(0)}%`}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * One section per GPU, for any number and mix of vendors: a header (index, vendor, model, PCI
 * address), a stat row (utilization, VRAM, temperature, power; "—" when not reported) and two
 * separate live charts, utilization and VRAM, side by side from `lg`. With three or more GPUs an
 * "All GPUs" strip on top gives a quick scan. Charts seed from the parent's sample buffer
 * (`readSamples`) and then append from the live stream without re-rendering.
 *
 * @example
 * <GpuOverview gpuDevices={gpus} latestSample={sample} readSamples={() => samplesReference.current} windowMilliseconds={300_000} />
 */
export function GpuOverview({ gpuDevices, latestSample, readSamples, windowMilliseconds }: { gpuDevices: readonly GpuDevice[]; latestSample: LiveSystemSample; readSamples: () => readonly LiveSystemSample[]; windowMilliseconds: number }) {
  const chartHandles = useRef(new Map<string, LiveLineChartHandle | null>());
  const lastPushedTimestamp = useRef(latestSample.timestamp);

  useLiveStream("system", (sample) => {
    if (sample.timestamp <= lastPushedTimestamp.current) return;
    lastPushedTimestamp.current = sample.timestamp;
    for (const reading of sample.gpus) {
      chartHandles.current.get(`gpu-${reading.gpuIndex}-utilization`)?.push({ timestamp: sample.timestamp, values: [reading.utilizationPercent] });
      chartHandles.current.get(`gpu-${reading.gpuIndex}-vram-${reading.memoryTotal ?? "none"}`)?.push({ timestamp: sample.timestamp, values: [reading.memoryUsed] });
    }
  });

  const entries = mergeGpuEntries(gpuDevices, latestSample.gpus);
  if (entries.length === 0) return null;

  const renderChart = (key: string, series: LiveLineSeries[], extract: (reading: GpuReading | undefined) => number | null, index: number, options: { valueFormat: "percentage" | "bytes"; maximumValue: number; ariaLabel: string }) => (
    <LiveLineChart
      key={key}
      ref={(handle) => {
        chartHandles.current.set(key, handle);
      }}
      series={series}
      readInitialPoints={(): LivePoint[] => readSamples().map((sample) => ({ timestamp: sample.timestamp, values: [extract(readGpu(sample, index))] }))}
      windowMilliseconds={windowMilliseconds}
      {...options}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {entries.length >= 3 && <AllGpusStrip entries={entries} />}
      {entries.map((entry) => {
        const { reading } = entry;
        const utilization = reading?.utilizationPercent ?? null;
        const memoryUsed = reading?.memoryUsed ?? null;
        const memoryTotal = reading?.memoryTotal ?? null;
        const temperature = reading?.temperatureCelsius ?? null;
        const power = reading?.powerWatts ?? null;
        const hasVram = memoryUsed !== null && memoryTotal !== null && memoryTotal > 0;
        return (
          <section key={entry.index} aria-label={`GPU ${entry.index}`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="font-display text-base font-medium">GPU {entry.index}</h3>
              <VendorBadge vendor={entry.vendor} />
              <span className="min-w-0 truncate text-sm">{entry.name}</span>
              {entry.pciAddress && <span className="font-mono text-xs text-foreground-subtle">{entry.pciAddress}</span>}
            </div>
            {!entry.statsAvailable ? (
              <Card className="p-5">
                <Message>{entry.unavailableReason ?? "Stats unavailable"}</Message>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <Statistic label="Utilization" value={utilization === null ? "—" : `${utilization.toFixed(0)}%`} className={TONE_TEXT_CLASS_NAMES[readUsageTone(utilization)]} />
                  <Statistic label="VRAM" value={hasVram ? `${formatBytes(memoryUsed, { maximumFractionDigits: 1 })} / ${formatBytes(memoryTotal, { maximumFractionDigits: 0 })}` : "—"} className={TONE_TEXT_CLASS_NAMES[readUsageTone(hasVram ? (100 * memoryUsed) / memoryTotal : null)]} />
                  <Statistic label="Temperature" value={temperature === null ? "—" : `${temperature.toFixed(0)}°C`} className={TONE_TEXT_CLASS_NAMES[readTemperatureTone(temperature)]} />
                  <Statistic label="Power" value={power === null ? "—" : `${power.toFixed(0)} W`} />
                </div>
                {reading ? (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <ChartPanel title="Utilization" subtitle={`GPU ${entry.index} · %`}>
                      {renderChart(`gpu-${entry.index}-utilization`, UTILIZATION_SERIES, (gpuReading) => gpuReading?.utilizationPercent ?? null, entry.index, { valueFormat: "percentage", maximumValue: 100, ariaLabel: `GPU ${entry.index} utilization` })}
                    </ChartPanel>
                    <ChartPanel title="VRAM" subtitle={hasVram ? `GPU ${entry.index} · of ${formatBytes(memoryTotal, { maximumFractionDigits: 0 })}` : `GPU ${entry.index}`}>
                      {hasVram ? renderChart(`gpu-${entry.index}-vram-${memoryTotal}`, VRAM_SERIES, (gpuReading) => gpuReading?.memoryUsed ?? null, entry.index, { valueFormat: "bytes", maximumValue: memoryTotal, ariaLabel: `GPU ${entry.index} VRAM used` }) : <Message>VRAM not reported by this driver</Message>}
                    </ChartPanel>
                  </div>
                ) : (
                  <Card className="p-5">
                    <Message>No readings from this GPU yet.</Message>
                  </Card>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
