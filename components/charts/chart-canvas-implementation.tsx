"use client";

import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PieController,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
  type ChartConfiguration,
  type ScriptableContext,
} from "chart.js";
import { useEffect, useRef } from "react";
import type { ChartColor, ChartSpecification, ChartValueFormat, LineChartSeries } from "@/components/charts/chart-types";
import { formatBytes, formatCompactNumber, formatNumber, formatPercentage } from "@/utilities/format-number";
import { readThemeColor } from "@/utilities/read-theme-color";

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PieController,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
);

const LINE_DASH_PATTERNS = { solid: [], dashed: [2, 2], dotted: [1, 1] } as const;

function resolveColor({ colorName, opacity = 1 }: ChartColor): string {
  return readThemeColor(colorName, opacity);
}

function formatChartValue(value: number | string, valueFormat: ChartValueFormat = "number"): string {
  const numericValue = Number(value);
  if (valueFormat === "bytes") return formatBytes(numericValue);
  if (valueFormat === "bytes-per-second") return `${formatBytes(numericValue)}/s`;
  if (valueFormat === "celsius") return `${formatNumber(Math.round(numericValue))}°C`;
  if (valueFormat === "percentage") return formatPercentage(numericValue);
  if (valueFormat === "compact") return formatCompactNumber(numericValue);
  return formatNumber(numericValue);
}

function createAxisScales(specification: Extract<ChartSpecification, { chartKind: "line" | "bar" }>) {
  const tickColor = readThemeColor("foreground-muted", 0.8);
  const gridColor = readThemeColor("line-strong");
  const isHorizontal = specification.chartKind === "bar" && specification.orientation === "horizontal";
  const isStacked = specification.chartKind === "bar" && specification.isStacked;
  const valueAxisTicks = {
    display: specification.showsYAxisLabels ?? false,
    color: tickColor,
    font: { size: 12 },
    callback: (tickValue: number | string) => formatChartValue(tickValue, specification.valueFormat),
  };
  const categoryAxisTicks = { display: specification.showsXAxisLabels ?? false, color: tickColor, font: { size: 12 } };
  const valueAxis = {
    stacked: isStacked,
    beginAtZero: true,
    ticks: valueAxisTicks,
    grid: { display: specification.showsGridLines ?? false, color: gridColor },
    border: { display: false, dash: [2, 2] },
  };
  const categoryAxis = { stacked: isStacked, ticks: categoryAxisTicks, grid: { display: false }, border: { display: false } };
  return isHorizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis };
}

function createLineDataset(series: LineChartSeries, isCurved: boolean, showsPoints: boolean) {
  const fillColor = series.fillColor ?? { colorName: series.colorName, opacity: 0.3 };
  return {
    label: series.label,
    data: [...series.values],
    borderWidth: series.borderWidth ?? 1.1,
    borderColor: resolveColor(series),
    borderDash: [...LINE_DASH_PATTERNS[series.lineStyle ?? "solid"]],
    pointRadius: showsPoints ? 3 : 0,
    pointBackgroundColor: resolveColor(series),
    tension: isCurved ? 0.3 : 0,
    fill: (series.fillStyle ?? "none") !== "none",
    backgroundColor:
      series.fillStyle === "gradient"
        ? (scriptableContext: ScriptableContext<"line">) => {
            const { ctx: canvasContext, chartArea } = scriptableContext.chart;
            const gradient = canvasContext.createLinearGradient(0, chartArea?.top ?? 0, 0, chartArea?.bottom ?? 100);
            gradient.addColorStop(0, resolveColor(fillColor));
            gradient.addColorStop(1, readThemeColor("surface", 0));
            return gradient;
          }
        : resolveColor(fillColor),
  };
}

function createChartConfiguration(specification: ChartSpecification): ChartConfiguration {
  const legendLabelColor = readThemeColor("foreground-muted", 0.8);
  const tooltipFormat = "valueFormat" in specification ? specification.valueFormat : undefined;
  const sharedPlugins = {
    legend: { display: specification.showsLegend ?? false, labels: { color: legendLabelColor } },
    tooltip: { callbacks: { label: (tooltipItem: { formattedValue: string; raw: unknown; dataset: { label?: string } }) => `${tooltipItem.dataset.label ? `${tooltipItem.dataset.label}: ` : ""}${formatChartValue(Number(tooltipItem.raw), tooltipFormat)}` } },
  };

  if (specification.chartKind === "line") {
    return {
      type: "line",
      data: { labels: [...specification.labels], datasets: specification.series.map((series) => createLineDataset(series, specification.isCurved ?? true, specification.showsPoints ?? false)) },
      options: { maintainAspectRatio: false, plugins: sharedPlugins, scales: createAxisScales(specification) },
    } as ChartConfiguration;
  }

  if (specification.chartKind === "bar") {
    return {
      type: "bar",
      data: {
        labels: [...specification.labels],
        datasets: specification.series.map((series) => ({
          label: series.label,
          data: [...series.values],
          backgroundColor: resolveColor(series),
          borderColor: series.borderColor ? resolveColor(series.borderColor) : undefined,
          borderWidth: series.borderColor ? 1 : 0,
          borderRadius: specification.borderRadius ?? 1.5,
          barThickness: specification.barThickness,
          maxBarThickness: specification.barThickness ? specification.barThickness + 2 : undefined,
          barPercentage: specification.barPercentage ?? 1,
          categoryPercentage: specification.categoryPercentage ?? 0.8,
          minBarLength: 2,
        })),
      },
      options: {
        maintainAspectRatio: false,
        indexAxis: specification.orientation === "horizontal" ? "y" : "x",
        plugins: sharedPlugins,
        scales: createAxisScales(specification),
      },
    } as ChartConfiguration;
  }

  if (specification.chartKind === "radar") {
    return {
      type: "radar",
      data: { labels: [...specification.labels], datasets: specification.series.map((series) => createLineDataset({ fillStyle: "solid", ...series }, false, true)) },
      options: {
        maintainAspectRatio: false,
        plugins: sharedPlugins,
        scales: { r: { ticks: { display: false }, grid: { color: readThemeColor("line-strong") }, angleLines: { color: readThemeColor("line-strong") }, pointLabels: { color: legendLabelColor } } },
      },
    } as ChartConfiguration;
  }

  const segmentColors = specification.segments.map((segment) => resolveColor(segment));
  return {
    type: specification.chartKind === "pie" ? "pie" : "doughnut",
    data: {
      labels: specification.segments.map((segment) => segment.label),
      datasets: [
        {
          data: specification.segments.map((segment) => segment.value),
          backgroundColor: segmentColors,
          hoverBackgroundColor: segmentColors,
          borderColor: specification.chartKind === "pie" ? readThemeColor("surface") : segmentColors,
          borderWidth: specification.chartKind === "pie" ? 3 : 1,
          spacing: specification.segmentSpacing ?? 0,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: sharedPlugins,
      cutout: specification.chartKind === "donut" ? `${specification.cutoutPercentage ?? 82}%` : undefined,
      rotation: specification.isHalfCircle ? -90 : 0,
      circumference: specification.isHalfCircle ? 180 : 360,
    },
  } as ChartConfiguration;
}

/**
 * Draws a `ChartSpecification` with Chart.js in the theme's colours and body font. Loaded on demand
 * by the chart components; use `LineChart`, `BarChart`, etc. instead.
 *
 * @example
 * <ChartCanvasImplementation specification={{ chartKind: "pie", segments }} ariaLabel="Sales by category" />
 */
export function ChartCanvasImplementation({ specification, ariaLabel }: { specification: ChartSpecification; ariaLabel: string }) {
  const canvasReference = useRef<HTMLCanvasElement>(null);
  const specificationKey = JSON.stringify(specification);

  useEffect(() => {
    const specification = JSON.parse(specificationKey) as ChartSpecification;
    if (!canvasReference.current) return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const chart = new Chart(canvasReference.current, createChartConfiguration(specification));
    let liveUpdateInterval: number | undefined;
    if (specification.chartKind === "bar" && specification.isLiveUpdating) {
      liveUpdateInterval = window.setInterval(() => {
        for (const dataset of chart.data.datasets) {
          const firstValue = dataset.data.shift();
          if (firstValue !== undefined) dataset.data.push(firstValue);
        }
        chart.update();
      }, 1000);
    }
    return () => {
      window.clearInterval(liveUpdateInterval);
      chart.destroy();
    };
  }, [specificationKey]);

  return <canvas ref={canvasReference} role="img" aria-label={ariaLabel} />;
}
