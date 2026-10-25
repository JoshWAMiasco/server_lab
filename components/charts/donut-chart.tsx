import type { ReactNode } from "react";
import { ChartCanvas } from "@/components/charts/chart-canvas";
import type { ChartSegment, ChartValueFormat } from "@/components/charts/chart-types";
import { mergeClassNames } from "@/utilities/merge-class-names";

export interface DonutChartProps {
  segments: readonly ChartSegment[];
  cutoutPercentage?: number;
  isHalfCircle?: boolean;
  segmentSpacing?: number;
  showsLegend?: boolean;
  valueFormat?: ChartValueFormat;
  centerContent?: ReactNode;
  ariaLabel: string;
  className?: string;
}

/**
 * A donut or half-donut (gauge) chart, with optional content in the middle.
 *
 * @example
 * <DonutChart
 *   ariaLabel="Customers by age"
 *   segments={[
 *     { label: "17 - 30 years", value: 15, colorName: "primary", opacity: 0.7 },
 *     { label: "31 - 50 years", value: 10, colorName: "danger", opacity: 0.6 },
 *     { label: ">= 50 years", value: 5, colorName: "accent", opacity: 0.6 },
 *   ]}
 *   cutoutPercentage={89}
 *   centerContent={<><div className="text-lg font-medium font-display">20%</div><div className="text-xs text-foreground-muted">Active users</div></>}
 *   className="h-[208px] w-[208px]"
 * />
 *
 * @example
 * <DonutChart ariaLabel="Target progress" segments={progressSegments} isHalfCircle cutoutPercentage={89} />
 */
export function DonutChart({ segments, cutoutPercentage, isHalfCircle, segmentSpacing, showsLegend, valueFormat, centerContent, ariaLabel, className }: DonutChartProps) {
  const specification = { chartKind: "donut" as const, segments, cutoutPercentage, isHalfCircle, segmentSpacing, showsLegend, valueFormat };
  return (
    <div className={mergeClassNames("relative mx-auto h-[200px]", className)}>
      <ChartCanvas specification={specification} ariaLabel={ariaLabel} className="h-full" />
      {centerContent && <div className="absolute inset-0 flex flex-col items-center justify-center">{centerContent}</div>}
    </div>
  );
}
