import { ChartCanvas } from "@/components/charts/chart-canvas";
import type { ChartSegment, ChartValueFormat } from "@/components/charts/chart-types";

export interface PieChartProps {
  segments: readonly ChartSegment[];
  showsLegend?: boolean;
  valueFormat?: ChartValueFormat;
  ariaLabel: string;
  className?: string;
}

/**
 * A pie chart.
 *
 * @example
 * <PieChart ariaLabel="Traffic sources" segments={[
 *   { label: "Organic", value: 15, colorName: "pending", opacity: 0.9 },
 *   { label: "Social", value: 10, colorName: "warning", opacity: 0.9 },
 *   { label: "Referral", value: 65, colorName: "primary", opacity: 0.9 },
 * ]} showsLegend />
 */
export function PieChart({ segments, showsLegend, valueFormat, ariaLabel, className }: PieChartProps) {
  const specification = { chartKind: "pie" as const, segments, showsLegend, valueFormat };
  return <ChartCanvas specification={specification} ariaLabel={ariaLabel} className={className} />;
}
