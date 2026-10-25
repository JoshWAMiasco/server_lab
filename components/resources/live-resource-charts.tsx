"use client";

import { useRef, useState } from "react";
import { LiveLineChart, type LiveLineChartHandle, type LiveLineSeries, type LivePoint } from "@/components/charts/live-line-chart";
import { ChartPanel } from "@/components/resources/chart-panel";
import { SERIES_COLOR_NAMES } from "@/components/resources/metric-tones";
import { FormSwitch } from "@/components/primitives/form-check";
import type { GpuDevice } from "@/collector/types";
import { useLiveStream } from "@/hooks/use-live-stream";
import type { LiveSystemSample } from "@/lib/queries/live-types";

interface ChartDefinition {
  key: string;
  series: LiveLineSeries[];
  extract: (sample: LiveSystemSample) => (number | null)[];
}

const colorAt = (seriesIndex: number) => SERIES_COLOR_NAMES[seriesIndex % SERIES_COLOR_NAMES.length] ?? "brand";

function buildDefinitions(latestSample: LiveSystemSample, isTailscaleShown: boolean) {
  const coreCount = latestSample.corePercents.length;
  const interfaces = latestSample.networkInterfaces.map((networkInterface) => networkInterface.interfaceName).filter((interfaceName) => isTailscaleShown || interfaceName !== "tailscale0");
  const devices = latestSample.disks.map((disk) => disk.device);
  const sensorLabels = latestSample.temperatures.map((temperature) => temperature.label);
  const gpus = latestSample.gpus;

  const cpu: ChartDefinition = {
    key: `cpu-${coreCount}`,
    series: [{ label: "Total", colorName: "brand", isFilled: true, borderWidth: 1.8 }, ...Array.from({ length: coreCount }, (_, coreIndex) => ({ label: `Core ${coreIndex}`, colorName: "foreground-faint" as const, opacity: 0.55, borderWidth: 0.6 }))],
    extract: (sample) => [sample.cpuPercent, ...Array.from({ length: coreCount }, (_, coreIndex) => sample.corePercents[coreIndex] ?? null)],
  };
  const memory: ChartDefinition = {
    key: "memory",
    series: [
      { label: "Used", colorName: "info", isFilled: true, borderWidth: 1.8 },
      { label: "Cache", colorName: "foreground-subtle", isDashed: true },
      { label: "Swap", colorName: "warning" },
    ],
    extract: (sample) => [sample.memoryUsed, sample.memoryCached, sample.swapUsed],
  };
  const temperatures: ChartDefinition = {
    key: `temperatures-${sensorLabels.join("|")}-${gpus.length}`,
    series: [
      { label: "CPU", colorName: "brand", borderWidth: 1.8 },
      ...gpus.map((gpu, gpuIndex) => ({ label: `GPU ${gpu.gpuIndex}`, colorName: colorAt(gpuIndex + 1) })),
      ...sensorLabels.map((label, sensorIndex) => ({ label, colorName: colorAt(sensorIndex + gpus.length + 1), borderWidth: 1 })),
    ],
    extract: (sample) => [sample.cpuTemperatureCelsius, ...gpus.map((gpu) => sample.gpus.find((candidate) => candidate.gpuIndex === gpu.gpuIndex)?.temperatureCelsius ?? null), ...sensorLabels.map((label) => sample.temperatures.find((temperature) => temperature.label === label)?.celsius ?? null)],
  };
  const network: ChartDefinition = {
    key: `network-${interfaces.join("|")}`,
    series: interfaces.flatMap((interfaceName, interfaceIndex) => [
      { label: `${interfaceName} ↓`, colorName: colorAt(interfaceIndex), isFilled: interfaceIndex === 0 },
      { label: `${interfaceName} ↑`, colorName: colorAt(interfaceIndex), isDashed: true },
    ]),
    extract: (sample) =>
      interfaces.flatMap((interfaceName) => {
        const networkInterface = sample.networkInterfaces.find((candidate) => candidate.interfaceName === interfaceName);
        return [networkInterface?.receivedBytesPerSecond ?? null, networkInterface?.transmittedBytesPerSecond ?? null];
      }),
  };
  const disk: ChartDefinition = {
    key: `disk-${devices.join("|")}`,
    series: devices.flatMap((device, deviceIndex) => [
      { label: `${device} read`, colorName: colorAt(deviceIndex + 1), isFilled: deviceIndex === 0 },
      { label: `${device} write`, colorName: colorAt(deviceIndex + 1), isDashed: true },
    ]),
    extract: (sample) =>
      devices.flatMap((device) => {
        const diskRow = sample.disks.find((candidate) => candidate.device === device);
        return [diskRow?.readBytesPerSecond ?? null, diskRow?.writtenBytesPerSecond ?? null];
      }),
  };
  const gpuDefinitions: ChartDefinition[] = gpus.map((gpu) => ({
    key: `gpu-${gpu.gpuIndex}`,
    series: [
      { label: "Usage", colorName: "success", isFilled: true, borderWidth: 1.8 },
      { label: "VRAM", colorName: "accent", isDashed: true },
    ],
    extract: (sample) => {
      const reading = sample.gpus.find((candidate) => candidate.gpuIndex === gpu.gpuIndex);
      const vramPercent = reading?.memoryUsed !== null && reading?.memoryUsed !== undefined && reading.memoryTotal ? (100 * reading.memoryUsed) / reading.memoryTotal : null;
      return [reading?.utilizationPercent ?? null, vramPercent];
    },
  }));
  return { cpu, memory, temperatures, network, disk, gpuDefinitions };
}

function toPoints(samples: readonly LiveSystemSample[], definition: ChartDefinition): LivePoint[] {
  return samples.map((sample) => ({ timestamp: sample.timestamp, values: definition.extract(sample) }));
}

/**
 * The live chart grid of Resources (CPU, memory, GPUs, temperatures, network, disk I/O). The
 * first render uses the last hour of samples from the server; the SSE stream then appends.
 * GPUs that are present but report no stats show why instead of a chart.
 *
 * @example
 * <LiveResourceCharts initialSamples={samples} windowMilliseconds={300_000} gpuDevices={gpus} />
 */
export function LiveResourceCharts({ initialSamples, windowMilliseconds, gpuDevices }: { initialSamples: readonly LiveSystemSample[]; windowMilliseconds: number; gpuDevices: readonly GpuDevice[] }) {
  const samplesReference = useRef<LiveSystemSample[]>([...initialSamples]);
  const chartHandles = useRef(new Map<string, LiveLineChartHandle | null>());
  const [isTailscaleShown, setIsTailscaleShown] = useState(false);
  const [latestSample, setLatestSample] = useState<LiveSystemSample | undefined>(initialSamples.at(-1));
  const definitions = latestSample ? buildDefinitions(latestSample, isTailscaleShown) : null;

  useLiveStream("system", (sample) => {
    const samples = samplesReference.current;
    if (samples.at(-1)?.id === sample.id) return;
    samples.push(sample);
    while (samples.length > 0 && (samples[0]?.timestamp ?? 0) < sample.timestamp - 3_600_000) samples.shift();
    const currentDefinitions = buildDefinitions(sample, isTailscaleShown);
    for (const definition of [currentDefinitions.cpu, currentDefinitions.memory, currentDefinitions.temperatures, currentDefinitions.network, currentDefinitions.disk, ...currentDefinitions.gpuDefinitions]) {
      chartHandles.current.get(definition.key)?.push({ timestamp: sample.timestamp, values: definition.extract(sample) });
    }
    setLatestSample(sample);
  });

  if (!definitions || !latestSample) return <div className="py-16 text-center text-foreground-muted">Waiting for the first sample from the collector…</div>;

  const renderChart = (definition: ChartDefinition, options: { valueFormat: "percentage" | "bytes" | "bytes-per-second" | "celsius"; maximumValue?: number; showsLegend?: boolean; ariaLabel: string }) => (
    <LiveLineChart
      key={definition.key}
      ref={(handle) => {
        chartHandles.current.set(definition.key, handle);
      }}
      series={definition.series}
      readInitialPoints={() => toPoints(samplesReference.current, definition)}
      windowMilliseconds={windowMilliseconds}
      {...options}
    />
  );
  const unavailableGpus = gpuDevices.filter((device) => !device.statsAvailable);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <ChartPanel title="CPU" subtitle={`total and ${latestSample.corePercents.length} cores`}>
        {renderChart(definitions.cpu, { valueFormat: "percentage", maximumValue: 100, ariaLabel: "CPU usage, total and per core" })}
      </ChartPanel>
      <ChartPanel title="Memory" subtitle="used · cache · swap">
        {renderChart(definitions.memory, { valueFormat: "bytes", maximumValue: latestSample.memoryTotal, showsLegend: true, ariaLabel: "Memory used, cache and swap" })}
      </ChartPanel>
      {definitions.gpuDefinitions.map((gpuDefinition, gpuIndex) => (
        <ChartPanel key={gpuDefinition.key} title={`GPU ${latestSample.gpus[gpuIndex]?.gpuIndex ?? gpuIndex}`} subtitle={latestSample.gpus[gpuIndex]?.name}>
          {renderChart(gpuDefinition, { valueFormat: "percentage", maximumValue: 100, showsLegend: true, ariaLabel: "GPU usage and VRAM" })}
        </ChartPanel>
      ))}
      {unavailableGpus.map((device) => (
        <ChartPanel key={device.pciAddress} title={`GPU ${device.index}`} subtitle={device.name}>
          <div className="flex h-[220px] items-center justify-center px-6 text-center text-foreground-muted">{device.unavailableReason ?? "Stats unavailable"}</div>
        </ChartPanel>
      ))}
      <ChartPanel title="Temperatures" subtitle="CPU, GPUs and sensors">
        {renderChart(definitions.temperatures, { valueFormat: "celsius", showsLegend: true, ariaLabel: "Temperatures" })}
      </ChartPanel>
      <ChartPanel title="Network" subtitle="per interface, ↓ receive ↑ send" actions={<FormSwitch id="show-tailscale" label="tailscale0" checked={isTailscaleShown} onChange={(changeEvent) => setIsTailscaleShown(changeEvent.target.checked)} />}>
        {renderChart(definitions.network, { valueFormat: "bytes-per-second", showsLegend: true, ariaLabel: "Network throughput per interface" })}
      </ChartPanel>
      <ChartPanel title="Disk I/O" subtitle="per device">
        {renderChart(definitions.disk, { valueFormat: "bytes-per-second", showsLegend: true, ariaLabel: "Disk read and write per device" })}
      </ChartPanel>
    </div>
  );
}
