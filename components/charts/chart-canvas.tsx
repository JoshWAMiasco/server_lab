"use client";

import dynamic from "next/dynamic";
import type { ChartSpecification } from "@/components/charts/chart-types";
import { mergeClassNames } from "@/utilities/merge-class-names";

const LazyChartCanvasImplementation = dynamic(
  () => import("@/components/charts/chart-canvas-implementation").then((chartModule) => chartModule.ChartCanvasImplementation),
  { ssr: false },
);

/**
 * Reserves the chart's space during server rendering and loads Chart.js only in the browser.
 * The chart components (`LineChart`, `BarChart`, …) use it; build new chart types on it too.
 *
 * @example
 * <ChartCanvas specification={{ chartKind: "radar", labels, series }} ariaLabel="Skills" className="h-64" />
 */
export function ChartCanvas({ specification, ariaLabel, className }: { specification: ChartSpecification; ariaLabel: string; className?: string }) {
  return (
    <div className={mergeClassNames("relative h-[200px] w-full", className)}>
      <LazyChartCanvasImplementation specification={specification} ariaLabel={ariaLabel} />
    </div>
  );
}
