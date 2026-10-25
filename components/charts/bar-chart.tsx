import { ChartCanvas } from "@/components/charts/chart-canvas";
import type { BarChartSeries, ChartAxisOptions } from "@/components/charts/chart-types";

export interface BarChartProps extends ChartAxisOptions {
  labels: readonly string[];
  series: readonly BarChartSeries[];
  orientation?: "vertical" | "horizontal";
  isStacked?: boolean;
  barThickness?: number;
  barPercentage?: number;
  categoryPercentage?: number;
  borderRadius?: number;
  isLiveUpdating?: boolean;
  ariaLabel: string;
  className?: string;
}

/**
 * A vertical, horizontal or stacked bar chart. `isLiveUpdating` rotates the values every second
 * (the template's "live visitors" effect). Works in server and client components.
 *
 * @example
 * <BarChart
 *   ariaLabel="Template sales by month"
 *   labels={["Jan", "Feb", "Mar", "Apr"]}
 *   series={[
 *     { label: "HTML Template", values: [0, 200, 250, 200], colorName: "primary" },
 *     { label: "React Template", values: [0, 300, 400, 560], colorName: "foreground-faint" },
 *   ]}
 *   barThickness={6}
 *   barPercentage={0.5}
 *   showsXAxisLabels showsYAxisLabels showsGridLines showsLegend valueFormat="currency"
 * />
 *
 * @example
 * <BarChart ariaLabel="Live visitors" labels={visitorLabels} series={[{ values: visitorCounts, colorName: "primary", opacity: 0.3, borderColor: { colorName: "primary", opacity: 0.7 } }]} isLiveUpdating className="h-[80px]" />
 */
export function BarChart({ labels, series, orientation, isStacked, barThickness, barPercentage, categoryPercentage, borderRadius, isLiveUpdating, showsXAxisLabels, showsYAxisLabels, showsGridLines, showsLegend, valueFormat, ariaLabel, className }: BarChartProps) {
  const specification = { chartKind: "bar" as const, labels, series, orientation, isStacked, barThickness, barPercentage, categoryPercentage, borderRadius, isLiveUpdating, showsXAxisLabels, showsYAxisLabels, showsGridLines, showsLegend, valueFormat };
  return <ChartCanvas specification={specification} ariaLabel={ariaLabel} className={className} />;
}
