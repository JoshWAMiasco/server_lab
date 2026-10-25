import { mergeClassNames } from "@/utilities/merge-class-names";

export type DistributionSegmentTone = "primary" | "info" | "pending" | "success" | "warning" | "danger";

export interface DistributionSegment {
  label: string;
  percentage: number;
  tone: DistributionSegmentTone;
}

const segmentToneClassNames: Record<DistributionSegmentTone, string> = {
  primary: "border-primary/50 bg-primary/50",
  info: "border-info/50 bg-info/50",
  pending: "border-pending/50 bg-pending/50",
  success: "border-success/50 bg-success/50",
  warning: "border-warning/50 bg-warning/50",
  danger: "border-danger/50 bg-danger/50",
};

/**
 * A thin horizontal bar split into colored segments by percentage (e.g. medical conditions or
 * occupied versus available beds). Hovering a segment shows its label.
 *
 * @example
 * <SegmentedDistributionBar segments={[{ label: "Occupied Beds", percentage: 60, tone: "primary" }, { label: "Available Beds", percentage: 40, tone: "info" }]} />
 */
export function SegmentedDistributionBar({ segments, className }: { segments: readonly DistributionSegment[]; className?: string }) {
  return (
    <div className={mergeClassNames("flex h-2.5", className)} role="img" aria-label={segments.map((segment) => `${segment.label} ${segment.percentage}%`).join(", ")}>
      {segments.map((segment) => (
        <div key={segment.label} title={segment.label} style={{ width: `${segment.percentage}%` }} className={mergeClassNames("h-full cursor-pointer border first:rounded-l last:rounded-r", segmentToneClassNames[segment.tone])} />
      ))}
    </div>
  );
}
