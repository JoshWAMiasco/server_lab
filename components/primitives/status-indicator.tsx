import type { ReactNode } from "react";
import { CheckSquare, XSquare } from "lucide-react";
import { mergeClassNames } from "@/utilities/merge-class-names";

export type StatusIndicatorTone = "success" | "danger" | "warning" | "pending" | "primary" | "slate";

const statusIndicatorToneClassNames: Record<StatusIndicatorTone, string> = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  pending: "text-pending",
  primary: "text-primary",
  slate: "text-foreground-muted",
};

export interface StatusIndicatorProps {
  label: ReactNode;
  tone: StatusIndicatorTone;
  icon?: ReactNode;
  className?: string;
}

/**
 * A colored icon + text status, as used in the template's tables ("✓ Active", "✗ Inactive").
 *
 * @example
 * <StatusIndicator tone="success" label="Active" />
 * <StatusIndicator tone="danger" label="Inactive" icon={<XSquare className="h-3.5 w-3.5 stroke-[1.7]" />} />
 */
export function StatusIndicator({ label, tone, icon, className }: StatusIndicatorProps) {
  const defaultIcon = tone === "danger" ? <XSquare className="h-3.5 w-3.5 stroke-[1.7]" /> : <CheckSquare className="h-3.5 w-3.5 stroke-[1.7]" />;
  return (
    <div className={mergeClassNames("flex items-center", statusIndicatorToneClassNames[tone], className)}>
      {icon ?? defaultIcon}
      <div className="ml-1.5 whitespace-nowrap">{label}</div>
    </div>
  );
}
