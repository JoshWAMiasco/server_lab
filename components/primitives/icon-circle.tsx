import type { LucideIcon } from "lucide-react";
import { mergeClassNames } from "@/utilities/merge-class-names";

export type IconCircleTone = "primary" | "info" | "success" | "warning" | "pending" | "danger" | "inverted";
export type IconCircleSize = "small" | "medium" | "large";

const iconCircleToneClassNames: Record<IconCircleTone, { circle: string; icon: string }> = {
  primary: { circle: "border-primary/10 bg-primary/10", icon: "fill-primary/10 text-primary" },
  info: { circle: "border-info/10 bg-info/10", icon: "fill-info/10 text-info" },
  success: { circle: "border-success/10 bg-success/10", icon: "fill-success/10 text-success" },
  warning: { circle: "border-warning/10 bg-warning/10", icon: "fill-warning/10 text-warning" },
  pending: { circle: "border-pending/10 bg-pending/10", icon: "fill-pending/10 text-pending" },
  danger: { circle: "border-danger/10 bg-danger/10", icon: "fill-danger/10 text-danger" },
  inverted: { circle: "border-on-primary/10 bg-on-primary/10", icon: "fill-on-primary/10 text-on-primary" },
};

const iconCircleSizeClassNames: Record<IconCircleSize, { circle: string; icon: string }> = {
  small: { circle: "h-10 w-10", icon: "h-[1.15rem] w-[1.15rem]" },
  medium: { circle: "h-10 w-10", icon: "h-5 w-5" },
  large: { circle: "h-12 w-12", icon: "h-6 w-6" },
};

export interface IconCircleProps {
  icon: LucideIcon;
  tone?: IconCircleTone;
  size?: IconCircleSize;
  className?: string;
}

/**
 * A soft tinted circle with a thin-stroke icon in the middle, used at the top of dashboard cards
 * and in front of metrics, quick links and activity rows. Pass the icon component itself (not an
 * element). `tone="inverted"` is for cards with a colored background.
 *
 * @example
 * <IconCircle icon={CreditCard} tone="primary" size="large" />
 * <IconCircle icon={Laptop} tone="success" size="small" className="mr-5" />
 */
export function IconCircle({ icon: Icon, tone = "primary", size = "medium", className }: IconCircleProps) {
  return (
    <div className={mergeClassNames("flex shrink-0 items-center justify-center rounded-full border", iconCircleSizeClassNames[size].circle, iconCircleToneClassNames[tone].circle, className)}>
      <Icon className={mergeClassNames("stroke-[1]", iconCircleSizeClassNames[size].icon, iconCircleToneClassNames[tone].icon)} />
    </div>
  );
}
