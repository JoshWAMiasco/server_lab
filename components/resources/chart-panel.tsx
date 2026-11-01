import type { ReactNode } from "react";
import { Card } from "@/components/primitives/card";
import { mergeClassNames } from "@/utilities/merge-class-names";

/**
 * A card with a small uppercase title row and a chart (or any content) under it.
 *
 * @example
 * <ChartPanel title="CPU" subtitle="total and per core"><LiveLineChart … /></ChartPanel>
 */
export function ChartPanel({ title, subtitle, actions, className, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Card className={mergeClassNames("p-5", className)}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="font-display text-sm font-medium">{title}</div>
        {subtitle && <div className="text-xs text-foreground-subtle">{subtitle}</div>}
        {actions && <div className="ml-auto max-w-full min-w-0">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}
