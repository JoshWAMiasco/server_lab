import { ChartCanvas } from "@/components/charts/chart-canvas";
import type { ChartAxisOptions, LineChartSeries } from "@/components/charts/chart-types";

export interface LineChartProps extends ChartAxisOptions {
  labels: readonly string[];
  series: readonly LineChartSeries[];
  isCurved?: boolean;
  showsPoints?: boolean;
  ariaLabel: string;
  className?: string;
}

/**
 * A line or area chart. Colors are design-token names (`colorName: "primary"`), so the chart
 * follows the theme. Works in server and client components; only the canvas ships JavaScript.
 * Set the height with `className` (default 200px).
 *
 * @example
 * <LineChart
 *   ariaLabel="Revenue this month versus last month"
 *   labels={DAY_LABELS}
 *   series={[
 *     { label: "This month", values: currentMonthRevenue, colorName: "primary", fillStyle: "gradient" },
 *     { label: "Last month", values: previousMonthRevenue, colorName: "foreground-subtle", lineStyle: "dotted", fillStyle: "gradient", fillColor: { colorName: "surface-subtle" } },
 *   ]}
 *   className="h-[290px]"
 * />
 *
 * @example
 * <LineChart ariaLabel="Weekly orders" labels={WEEK_LABELS} series={[{ values: weeklyOrders, colorName: "success" }]} showsXAxisLabels showsYAxisLabels showsGridLines valueFormat="compact" />
 */
export function LineChart({ labels, series, isCurved, showsPoints, showsXAxisLabels, showsYAxisLabels, showsGridLines, showsLegend, valueFormat, ariaLabel, className }: LineChartProps) {
  const specification = { chartKind: "line" as const, labels, series, isCurved, showsPoints, showsXAxisLabels, showsYAxisLabels, showsGridLines, showsLegend, valueFormat };
  return <ChartCanvas specification={specification} ariaLabel={ariaLabel} className={className} />;
}
