import { mergeClassNames } from "@/utilities/merge-class-names";

export type ChartLegendTone = "primary" | "success" | "danger" | "info" | "warning" | "pending" | "slate" | "theme";
export type ChartLegendAppearance = "solid" | "outlined";

export interface ChartLegendItem {
  label: string;
  tone: ChartLegendTone;
}

const solidDotClassNames: Record<ChartLegendTone, string> = {
  primary: "bg-primary/70",
  success: "bg-success/70",
  danger: "bg-danger/70",
  info: "bg-info/70",
  warning: "bg-warning/70",
  pending: "bg-pending/70",
  slate: "bg-foreground-subtle",
  theme: "bg-accent/70",
};

const outlinedDotClassNames: Record<ChartLegendTone, string> = {
  primary: "border-primary/60 bg-primary/60",
  success: "border-success/60 bg-success/60",
  danger: "border-danger/60 bg-danger/60",
  info: "border-info/60 bg-info/60",
  warning: "border-warning/60 bg-warning/60",
  pending: "border-pending/60 bg-pending/60",
  slate: "border-foreground-muted/60 bg-foreground-muted/60",
  theme: "border-accent/60 bg-accent/60",
};

/**
 * The centered row of colored dots and labels under a dashboard chart. `appearance="outlined"`
 * is the muted variant with bordered dots and gray labels.
 *
 * @example
 * <ChartLegend items={[{ label: "Products Sold", tone: "primary" }, { label: "Store Locations", tone: "slate" }]} />
 * <ChartLegend appearance="outlined" items={[{ label: "Machine Performance", tone: "primary" }]} className="mt-5" />
 */
export function ChartLegend({ items, appearance = "solid", className }: { items: readonly ChartLegendItem[]; appearance?: ChartLegendAppearance; className?: string }) {
  return (
    <div className={mergeClassNames("flex flex-wrap items-center justify-center gap-x-5 gap-y-3", className)}>
      {items.map((item) =>
        appearance === "solid" ? (
          <div key={item.label} className="flex items-center">
            <div className={mergeClassNames("h-2 w-2 rounded-full", solidDotClassNames[item.tone])} />
            <div className="ml-2.5">{item.label}</div>
          </div>
        ) : (
          <div key={item.label} className="flex items-center text-foreground-muted">
            <div className={mergeClassNames("mr-2 h-2 w-2 rounded-full border", outlinedDotClassNames[item.tone])} />
            {item.label}
          </div>
        ),
      )}
    </div>
  );
}
