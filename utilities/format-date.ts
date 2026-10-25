import dayjs from "dayjs";
import relativeTimePlugin from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTimePlugin);

/**
 * Formats an ISO date string with a dayjs pattern. Defaults to "March 22, 2015".
 *
 * @example
 * formatDate("2015-03-22"); // "March 22, 2015"
 * formatDate("2015-03-22", "DD MMM YYYY"); // "22 Mar 2015"
 */
export function formatDate(isoDate: string, pattern = "MMMM D, YYYY"): string {
  return dayjs(isoDate).format(pattern);
}

/**
 * Describes how long ago a date was, relative to `referenceDate` (defaults to now).
 * Pass a fixed `referenceDate` in server components so static output stays stable.
 *
 * @example
 * formatRelativeTime("2024-05-01T10:00:00", "2024-05-01T12:00:00"); // "2 hours ago"
 */
export function formatRelativeTime(isoDate: string, referenceDate?: string): string {
  return dayjs(isoDate).from(referenceDate ? dayjs(referenceDate) : dayjs());
}
