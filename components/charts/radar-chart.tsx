import { ChartCanvas } from "@/components/charts/chart-canvas";
import type { LineChartSeries } from "@/components/charts/chart-types";

export interface RadarChartProps {
  labels: readonly string[];
  series: readonly LineChartSeries[];
  showsLegend?: boolean;
  ariaLabel: string;
  className?: string;
}

/**
 * A radar (spider) chart comparing series across several dimensions.
 *
 * @example
 * <RadarChart ariaLabel="Team skills" labels={["Design", "Frontend", "Backend", "Testing", "DevOps"]}
 *   series={[{ label: "Team A", values: [65, 59, 90, 81, 56], colorName: "primary", fillColor: { colorName: "primary", opacity: 0.2 } }]} />
 */
export function RadarChart({ labels, series, showsLegend, ariaLabel, className }: RadarChartProps) {
  const specification = { chartKind: "radar" as const, labels, series, showsLegend };
  return <ChartCanvas specification={specification} ariaLabel={ariaLabel} className={className} />;
}
