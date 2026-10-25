import type { ThemeColorName } from "@/utilities/read-theme-color";

export type ChartValueFormat = "number" | "percentage" | "compact" | "bytes" | "bytes-per-second" | "celsius";

export interface ChartColor {
  colorName: ThemeColorName;
  opacity?: number;
}

export interface ChartAxisOptions {
  showsXAxisLabels?: boolean;
  showsYAxisLabels?: boolean;
  showsGridLines?: boolean;
  showsLegend?: boolean;
  valueFormat?: ChartValueFormat;
}

export interface LineChartSeries extends ChartColor {
  label?: string;
  values: readonly number[];
  lineStyle?: "solid" | "dashed" | "dotted";
  fillStyle?: "none" | "gradient" | "solid";
  fillColor?: ChartColor;
  borderWidth?: number;
}

export interface BarChartSeries extends ChartColor {
  label?: string;
  values: readonly number[];
  borderColor?: ChartColor;
}

export interface ChartSegment extends ChartColor {
  label: string;
  value: number;
}

export interface LineChartSpecification extends ChartAxisOptions {
  chartKind: "line";
  labels: readonly string[];
  series: readonly LineChartSeries[];
  isCurved?: boolean;
  showsPoints?: boolean;
}

export interface BarChartSpecification extends ChartAxisOptions {
  chartKind: "bar";
  labels: readonly string[];
  series: readonly BarChartSeries[];
  orientation?: "vertical" | "horizontal";
  isStacked?: boolean;
  barThickness?: number;
  barPercentage?: number;
  categoryPercentage?: number;
  borderRadius?: number;
  isLiveUpdating?: boolean;
}

export interface SegmentChartSpecification {
  chartKind: "donut" | "pie";
  segments: readonly ChartSegment[];
  cutoutPercentage?: number;
  isHalfCircle?: boolean;
  segmentSpacing?: number;
  showsLegend?: boolean;
  valueFormat?: ChartValueFormat;
}

export interface RadarChartSpecification {
  chartKind: "radar";
  labels: readonly string[];
  series: readonly LineChartSeries[];
  showsLegend?: boolean;
}

export type ChartSpecification = LineChartSpecification | BarChartSpecification | SegmentChartSpecification | RadarChartSpecification;
