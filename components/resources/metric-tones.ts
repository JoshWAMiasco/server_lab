import type { ThemeColorName } from "@/utilities/read-theme-color";

/** Series colours, in the order multi-series charts use them. */
export const SERIES_COLOR_NAMES: readonly ThemeColorName[] = ["brand", "info", "success", "warning", "pending", "accent", "danger", "foreground-muted"];

/**
 * The tile tone for a percentage: success below 70, warning below 90, danger above.
 *
 * @example
 * readUsageTone(83); // "warning"
 */
export function readUsageTone(percentage: number | null): "success" | "warning" | "danger" | "slate" {
  if (percentage === null || !Number.isFinite(percentage)) return "slate";
  if (percentage < 70) return "success";
  if (percentage < 90) return "warning";
  return "danger";
}

/**
 * The tile tone for a temperature: warning from 75 °C, danger from 85 °C.
 *
 * @example
 * readTemperatureTone(58); // "success"
 */
export function readTemperatureTone(celsius: number | null): "success" | "warning" | "danger" | "slate" {
  if (celsius === null) return "slate";
  if (celsius < 75) return "success";
  if (celsius < 85) return "warning";
  return "danger";
}
