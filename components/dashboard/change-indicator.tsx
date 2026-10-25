import { ChevronDown, ChevronUp } from "lucide-react";
import { mergeClassNames } from "@/utilities/merge-class-names";

export type ChangeDirection = "increase" | "decrease";
export type ChangeIndicatorTone = "automatic" | "neutral";

/**
 * A small "11% ⌃" change label shown next to a dashboard figure: green with an up chevron for
 * increases, red with a down chevron for decreases. `showsSign` prefixes "+" or "-";
 * `tone="neutral"` keeps the text color of its surroundings.
 *
 * @example
 * <ChangeIndicator changePercentage={11} direction="increase" />
 * <ChangeIndicator changePercentage={3} direction="decrease" showsSign className="text-sm font-medium" />
 */
export function ChangeIndicator({ changePercentage, direction, showsSign = false, tone = "automatic", className }: { changePercentage: number; direction: ChangeDirection; showsSign?: boolean; tone?: ChangeIndicatorTone; className?: string }) {
  const DirectionIcon = direction === "increase" ? ChevronUp : ChevronDown;
  const signPrefix = showsSign ? (direction === "increase" ? "+" : "-") : "";
  return (
    <div className={mergeClassNames("-mr-1 ml-2 flex items-center text-xs", tone === "automatic" && (direction === "increase" ? "text-success" : "text-danger"), className)}>
      {signPrefix}
      {changePercentage}%
      <DirectionIcon className="ml-px h-4 w-4 stroke-[1]" />
    </div>
  );
}
