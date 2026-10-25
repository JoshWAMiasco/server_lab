"use client";

import { Chart, Filler, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip, type ChartDataset } from "chart.js";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { ChartColor, ChartValueFormat } from "@/components/charts/chart-types";
import { formatBytes, formatNumber, formatPercentage } from "@/utilities/format-number";
import { readThemeColor } from "@/utilities/read-theme-color";
import { mergeClassNames } from "@/utilities/merge-class-names";

Chart.register(LineController, LineElement, PointElement, LinearScale, Filler, Tooltip, Legend);

export interface LiveLineSeries extends ChartColor {
  label: string;
  isFilled?: boolean;
  borderWidth?: number;
  isDashed?: boolean;
}

export interface LivePoint {
  timestamp: number;
  values: readonly (number | null)[];
}

export interface LiveLineChartHandle {
  push: (point: LivePoint) => void;
}

function formatLiveValue(value: number, valueFormat: ChartValueFormat): string {
  if (valueFormat === "percentage") return formatPercentage(value, { maximumFractionDigits: 1 });
  if (valueFormat === "bytes") return formatBytes(value);
  if (valueFormat === "bytes-per-second") return `${formatBytes(value)}/s`;
  if (valueFormat === "celsius") return `${value.toFixed(1)}°C`;
  return formatNumber(Math.round(value * 100) / 100);
}

function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * A streaming line chart for live metrics. Unlike `LineChart`, it builds one Chart.js instance on
 * mount and appends points through `ref.push(...)` with `update("none")` (no animation, no
 * rebuild), dropping points older than `windowMilliseconds`. Drawing pauses while the tab is
 * hidden. The x axis is a linear time axis in milliseconds. `readInitialPoints` is called once, on
 * mount, so a parent can seed the chart from a buffer it keeps in a ref.
 *
 * @example
 * const cpuChart = useRef<LiveLineChartHandle>(null);
 * <LiveLineChart ref={cpuChart} ariaLabel="CPU usage" series={[{ label: "CPU", colorName: "brand", isFilled: true }]} readInitialPoints={() => points} windowMilliseconds={300_000} valueFormat="percentage" maximumValue={100} />
 * cpuChart.current?.push({ timestamp: sample.timestamp, values: [sample.cpuPercent] });
 */
export function LiveLineChart({
  ref,
  series,
  readInitialPoints,
  windowMilliseconds,
  valueFormat = "number",
  maximumValue,
  showsLegend = false,
  ariaLabel,
  className,
}: {
  ref?: Ref<LiveLineChartHandle>;
  series: readonly LiveLineSeries[];
  readInitialPoints: () => readonly LivePoint[];
  windowMilliseconds: number;
  valueFormat?: ChartValueFormat;
  maximumValue?: number;
  showsLegend?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const canvasReference = useRef<HTMLCanvasElement>(null);
  const chartReference = useRef<Chart<"line", { x: number; y: number | null }[]> | null>(null);
  const windowReference = useRef(windowMilliseconds);
  const isDirtyReference = useRef(false);
  const initialSetup = useRef({ series, readInitialPoints, valueFormat, maximumValue, showsLegend });

  useImperativeHandle(ref, () => ({
    push(point) {
      const chart = chartReference.current;
      if (!chart) return;
      const oldestAllowed = point.timestamp - windowReference.current;
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        dataset.data.push({ x: point.timestamp, y: point.values[datasetIndex] ?? null });
        while (dataset.data.length > 0 && (dataset.data[0]?.x ?? 0) < oldestAllowed) dataset.data.shift();
      });
      const xScale = chart.options.scales?.x;
      if (xScale) {
        xScale.min = oldestAllowed;
        xScale.max = point.timestamp;
      }
      if (document.visibilityState === "visible") chart.update("none");
      else isDirtyReference.current = true;
    },
  }));

  useEffect(() => {
    windowReference.current = windowMilliseconds;
    const chart = chartReference.current;
    const latestTimestamp = chart?.data.datasets[0]?.data.at(-1)?.x;
    if (chart && latestTimestamp !== undefined && chart.options.scales?.x) {
      chart.options.scales.x.min = latestTimestamp - windowMilliseconds;
      chart.update("none");
    }
  }, [windowMilliseconds]);

  useEffect(() => {
    if (!canvasReference.current) return;
    const { series: initialSeries, readInitialPoints: readPoints, valueFormat: format, maximumValue: maximum, showsLegend: legend } = initialSetup.current;
    const points = readPoints();
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const latestTimestamp = points.at(-1)?.timestamp ?? Date.now();
    const datasets: ChartDataset<"line", { x: number; y: number | null }[]>[] = initialSeries.map((lineSeries, seriesIndex) => ({
      label: lineSeries.label,
      data: points.filter((point) => point.timestamp >= latestTimestamp - windowReference.current).map((point) => ({ x: point.timestamp, y: point.values[seriesIndex] ?? null })),
      borderColor: readThemeColor(lineSeries.colorName, lineSeries.opacity ?? 1),
      backgroundColor: readThemeColor(lineSeries.colorName, 0.12),
      borderWidth: lineSeries.borderWidth ?? 1.4,
      borderDash: lineSeries.isDashed ? [3, 3] : [],
      fill: lineSeries.isFilled ? "origin" : false,
      pointRadius: 0,
      tension: 0.25,
      spanGaps: true,
    }));
    const tickColor = readThemeColor("foreground-muted", 0.8);
    const gridColor = readThemeColor("line-strong", 0.6);
    const chart = new Chart<"line", { x: number; y: number | null }[]>(canvasReference.current, {
      type: "line",
      data: { datasets },
      options: {
        animation: false,
        maintainAspectRatio: false,
        parsing: false,
        normalized: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: legend, labels: { color: tickColor, boxWidth: 10, boxHeight: 10 } },
          tooltip: { callbacks: { title: (tooltipItems) => formatClockTime(Number(tooltipItems[0]?.parsed.x ?? 0)), label: (tooltipItem) => `${tooltipItem.dataset.label}: ${formatLiveValue(Number(tooltipItem.parsed.y), format)}` } },
        },
        scales: {
          x: { type: "linear", min: latestTimestamp - windowReference.current, max: latestTimestamp, ticks: { color: tickColor, maxTicksLimit: 6, callback: (tickValue) => formatClockTime(Number(tickValue)).slice(0, 5) }, grid: { display: false }, border: { display: false } },
          y: { beginAtZero: true, suggestedMax: maximum, max: maximum, ticks: { color: tickColor, maxTicksLimit: 5, callback: (tickValue) => formatLiveValue(Number(tickValue), format) }, grid: { color: gridColor }, border: { display: false, dash: [2, 2] } },
        },
      },
    });
    chartReference.current = chart;
    const redrawWhenVisible = () => {
      if (document.visibilityState === "visible" && isDirtyReference.current) {
        isDirtyReference.current = false;
        chart.update("none");
      }
    };
    document.addEventListener("visibilitychange", redrawWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", redrawWhenVisible);
      chart.destroy();
      chartReference.current = null;
    };
  }, []);

  return (
    <div className={mergeClassNames("relative h-[220px] w-full", className)}>
      <canvas ref={canvasReference} role="img" aria-label={ariaLabel} />
    </div>
  );
}
