import type { ReactNode } from "react";
import { ChangeIndicator, type ChangeDirection } from "@/components/dashboard/change-indicator";
import { mergeClassNames } from "@/utilities/merge-class-names";

export interface MetricSummaryProps {
  label: ReactNode;
  value: ReactNode;
  changePercentage?: number;
  direction?: ChangeDirection;
  valueClassName?: string;
  className?: string;
}

/**
 * A gray label above a large figure with its percentage change, as at the top of many dashboard
 * cards ("Total Beds 476,221 11% ⌃").
 *
 * @example
 * <MetricSummary label="Total Beds" value="476,221" changePercentage={11} direction="increase" />
 * <MetricSummary label="Total Patients" value="24,782" valueClassName="text-2xl" />
 */
export function MetricSummary({ label, value, changePercentage, direction = "increase", valueClassName, className }: MetricSummaryProps) {
  return (
    <div className={className}>
      <div className="text-base text-foreground-muted">{label}</div>
      <div className="mt-1 flex items-center">
        <div className={mergeClassNames("text-xl font-medium font-display", valueClassName)}>{value}</div>
        {changePercentage !== undefined && <ChangeIndicator changePercentage={changePercentage} direction={direction} />}
      </div>
    </div>
  );
}
