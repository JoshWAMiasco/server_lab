/**
 * Formats a number with thousands separators.
 *
 * @example
 * formatNumber(457204); // "457,204"
 */
export function formatNumber(value: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Formats a large number in short form.
 *
 * @example
 * formatCompactNumber(1250000); // "1.3M"
 */
export function formatCompactNumber(value: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/**
 * Formats a ratio or percentage value. Pass `isRatio` when the value is between 0 and 1.
 *
 * @example
 * formatPercentage(68); // "68%"
 * formatPercentage(0.125, { isRatio: true, maximumFractionDigits: 1 }); // "12.5%"
 */
export function formatPercentage(value: number, { isRatio = false, maximumFractionDigits = 0 }: { isRatio?: boolean; maximumFractionDigits?: number } = {}): string {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits }).format(isRatio ? value : value / 100);
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/**
 * Formats a byte count with binary (1024) steps and a short unit, as `free -h` and `docker stats` do.
 *
 * @example
 * formatBytes(2_480_000_000); // "2.31 GB"
 * formatBytes(812 * 1024 * 1024, { maximumFractionDigits: 0 }); // "812 MB"
 */
export function formatBytes(byteCount: number, { maximumFractionDigits = 2 }: { maximumFractionDigits?: number } = {}): string {
  if (!Number.isFinite(byteCount) || byteCount <= 0) return "0 B";
  const unitIndex = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(byteCount) / Math.log(1024)));
  const scaledValue = byteCount / 1024 ** unitIndex;
  const fractionDigits = unitIndex === 0 ? 0 : scaledValue >= 100 ? 0 : maximumFractionDigits;
  return `${scaledValue.toFixed(fractionDigits)} ${BYTE_UNITS[unitIndex]}`;
}

/**
 * Formats a duration in seconds as its two largest units ("12d 4h", "3h 20m", "45s").
 *
 * @example
 * formatDuration(1_051_200); // "12d 4h"
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return seconds % 60 > 0 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`;
  return `${seconds}s`;
}
