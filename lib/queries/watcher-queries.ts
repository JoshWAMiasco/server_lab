import { and, desc, gte } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { readCapability, readSetting } from "@/lib/database/key-value";
import { loginEvents } from "@/lib/schema/watcher";
import type { LiveLoginEvent } from "@/lib/queries/live-types";
import { toLiveLoginEvent } from "@/lib/queries/stream-queries";

export const WATCHER_RANGES = { "24h": 24 * 3_600_000, "7d": 7 * 24 * 3_600_000, "30d": 30 * 24 * 3_600_000, all: Number.POSITIVE_INFINITY } as const;
export type WatcherRange = keyof typeof WATCHER_RANGES;

const MAXIMUM_GRID_ROWS = 5000;
const HOUR_MILLISECONDS = 3_600_000;
const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;

export interface WatcherOverview {
  events: LiveLoginEvent[];
  isTruncated: boolean;
  successfulToday: number;
  failedInRange: number;
  uniqueAddresses: number;
  countryCount: number;
  timeline: { bucketTimestamps: number[]; successes: number[]; failures: number[]; bucketMilliseconds: number };
  failedByCountry: { countryCode: string | null; countryName: string; count: number }[];
  backfill: { state: "running" | "done"; count: number } | null;
  hasGeolocation: boolean;
}

/**
 * Everything the User Watcher shows for a range: the newest rows for the grid, the summary
 * counts, a success/failure timeline (hourly up to 24 h, daily beyond) and failures by country.
 */
export function readWatcherOverview(database: ServerLabDatabase, range: WatcherRange, now = Date.now()): WatcherOverview {
  const since = Number.isFinite(WATCHER_RANGES[range]) ? now - WATCHER_RANGES[range] : 0;
  const connection = database.$client;
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const counts = connection
    .prepare(
      `SELECT
         sum(CASE WHEN result = 'success' AND ts >= ? THEN 1 ELSE 0 END) AS successfulToday,
         sum(CASE WHEN result != 'success' THEN 1 ELSE 0 END) AS failedInRange,
         count(DISTINCT src_ip) AS uniqueAddresses,
         count(DISTINCT geo_country_code) AS countryCount,
         count(*) AS total
       FROM login_events WHERE ts >= ?`,
    )
    .get(startOfToday, since) as { successfulToday: number | null; failedInRange: number | null; uniqueAddresses: number; countryCount: number; total: number };

  const oldestTimestamp = since || ((connection.prepare("SELECT min(ts) AS oldest FROM login_events").get() as { oldest: number | null }).oldest ?? now);
  const bucketMilliseconds = now - oldestTimestamp <= DAY_MILLISECONDS ? HOUR_MILLISECONDS : DAY_MILLISECONDS;
  const timelineRows = connection
    .prepare(`SELECT (ts / CAST(? AS INTEGER)) * CAST(? AS INTEGER) AS bucket, sum(CASE WHEN result = 'success' THEN 1 ELSE 0 END) AS successes, sum(CASE WHEN result != 'success' THEN 1 ELSE 0 END) AS failures FROM login_events WHERE ts >= ? GROUP BY bucket ORDER BY bucket`)
    .all(bucketMilliseconds, bucketMilliseconds, oldestTimestamp) as { bucket: number; successes: number; failures: number }[];
  const rowsByBucket = new Map(timelineRows.map((row) => [row.bucket, row]));
  const timeline: WatcherOverview["timeline"] = { bucketTimestamps: [], successes: [], failures: [], bucketMilliseconds };
  for (let bucket = Math.floor(oldestTimestamp / bucketMilliseconds) * bucketMilliseconds; bucket <= now; bucket += bucketMilliseconds) {
    timeline.bucketTimestamps.push(bucket);
    timeline.successes.push(rowsByBucket.get(bucket)?.successes ?? 0);
    timeline.failures.push(rowsByBucket.get(bucket)?.failures ?? 0);
  }

  const failedByCountry = (
    connection
      .prepare(`SELECT geo_country_code AS countryCode, coalesce(geo_country, CASE network_tag WHEN 'lan' THEN 'LAN' WHEN 'tailnet' THEN 'Tailnet' ELSE 'Unknown' END) AS countryName, count(*) AS count FROM login_events WHERE ts >= ? AND result != 'success' GROUP BY countryCode, countryName ORDER BY count DESC LIMIT 10`)
      .all(since) as WatcherOverview["failedByCountry"]
  );

  const events = database.select().from(loginEvents).where(and(gte(loginEvents.timestamp, since))).orderBy(desc(loginEvents.timestamp)).limit(MAXIMUM_GRID_ROWS).all().map(toLiveLoginEvent);
  return {
    events,
    isTruncated: counts.total > MAXIMUM_GRID_ROWS,
    successfulToday: counts.successfulToday ?? 0,
    failedInRange: counts.failedInRange ?? 0,
    uniqueAddresses: counts.uniqueAddresses,
    countryCount: counts.countryCount,
    timeline,
    failedByCountry,
    backfill: readSetting<WatcherOverview["backfill"]>(database, "watcher.backfill", null),
    hasGeolocation: readCapability<boolean>(database, "geoip", false),
  };
}
