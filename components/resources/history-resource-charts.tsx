import { LineChart } from "@/components/charts/line-chart";
import type { ChartValueFormat, LineChartSeries } from "@/components/charts/chart-types";
import { ChartPanel } from "@/components/resources/chart-panel";
import { SERIES_COLOR_NAMES } from "@/components/resources/metric-tones";
import type { HistorySeries } from "@/lib/queries/history-queries";

export interface HistoryChart {
  title: string;
  subtitle?: string;
  valueFormat: ChartValueFormat;
  lines: { label: string; series: HistorySeries; showsMaximum?: boolean }[];
}

function formatBucketLabel(timestamp: number, spanMilliseconds: number): string {
  const date = new Date(timestamp);
  if (spanMilliseconds <= 24 * 3_600_000) return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + (spanMilliseconds <= 7 * 24 * 3_600_000 ? ` ${date.getHours().toString().padStart(2, "0")}h` : "");
}

/**
 * History charts from `metric_rollups`: each line is the bucket average, with the bucket maximum
 * as a faint dotted line where `showsMaximum` is set. Rendered on the server.
 *
 * @example
 * <HistoryResourceCharts charts={charts} spanMilliseconds={86_400_000} />
 */
export function HistoryResourceCharts({ charts, spanMilliseconds }: { charts: readonly HistoryChart[]; spanMilliseconds: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {charts.map((chart) => {
        const timestamps = chart.lines[0]?.series.bucketTimestamps ?? [];
        const labels = timestamps.map((timestamp) => formatBucketLabel(timestamp, spanMilliseconds));
        const series: LineChartSeries[] = chart.lines.flatMap((line, lineIndex) => {
          const colorName = SERIES_COLOR_NAMES[lineIndex % SERIES_COLOR_NAMES.length] ?? "brand";
          const averageLine: LineChartSeries = { label: `${line.label} avg`, values: line.series.averages as number[], colorName, fillStyle: lineIndex === 0 ? "gradient" : "none", borderWidth: 1.5 };
          if (!line.showsMaximum) return [averageLine];
          return [averageLine, { label: `${line.label} max`, values: line.series.maximums as number[], colorName, opacity: 0.35, lineStyle: "dotted", borderWidth: 1 }];
        });
        const hasData = chart.lines.some((line) => line.series.averages.some((value) => value !== null));
        return (
          <ChartPanel key={chart.title} title={chart.title} subtitle={chart.subtitle}>
            {hasData ? (
              <LineChart ariaLabel={`${chart.title} history`} labels={labels} series={series} valueFormat={chart.valueFormat} showsXAxisLabels showsYAxisLabels showsGridLines showsLegend={series.length > 1} className="h-[240px]" />
            ) : (
              <div className="flex h-[240px] items-center justify-center text-foreground-muted">No data in this window yet.</div>
            )}
          </ChartPanel>
        );
      })}
    </div>
  );
}
