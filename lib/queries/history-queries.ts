import { desc, eq } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { filesystemUsage } from "@/lib/schema/metrics";

export const LIVE_RANGES = { "5m": 5 * 60_000, "15m": 15 * 60_000, "1h": 60 * 60_000 } as const;
export const HISTORY_RANGES = {
  "24h": { spanMilliseconds: 24 * 3_600_000, resolution: "1m", bucketMilliseconds: 5 * 60_000 },
  "7d": { spanMilliseconds: 7 * 24 * 3_600_000, resolution: "1h", bucketMilliseconds: 3_600_000 },
  "30d": { spanMilliseconds: 30 * 24 * 3_600_000, resolution: "1h", bucketMilliseconds: 4 * 3_600_000 },
} as const;

export type LiveRange = keyof typeof LIVE_RANGES;
export type HistoryRange = keyof typeof HISTORY_RANGES;
export type ResourceRange = LiveRange | HistoryRange;

export interface HistorySeries {
  bucketTimestamps: number[];
  averages: (number | null)[];
  maximums: (number | null)[];
}

/**
 * Whether a `?range=` value is one of the history windows (served from rollups) rather than live.
 */
export function isHistoryRange(range: string): range is HistoryRange {
  return range in HISTORY_RANGES;
}

/**
 * One rolled-up metric over a history window, re-bucketed so every chart has a few hundred points
 * at most. Missing buckets are filled with null so gaps show as gaps.
 */
export function readRollupSeries(database: ServerLabDatabase, metric: string, entity: string, range: HistoryRange, now = Date.now()): HistorySeries {
  const { spanMilliseconds, resolution, bucketMilliseconds } = HISTORY_RANGES[range];
  const firstBucket = Math.floor((now - spanMilliseconds) / bucketMilliseconds) * bucketMilliseconds;
  const rows = database.$client
    .prepare(
      `SELECT (bucket_ts / CAST(? AS INTEGER)) * CAST(? AS INTEGER) AS bucket, avg(avg) AS average, max(max) AS maximum
       FROM metric_rollups WHERE resolution = ? AND metric = ? AND entity = ? AND bucket_ts >= ?
       GROUP BY bucket ORDER BY bucket`,
    )
    .all(bucketMilliseconds, bucketMilliseconds, resolution, metric, entity, firstBucket) as { bucket: number; average: number; maximum: number }[];
  const rowsByBucket = new Map(rows.map((row) => [row.bucket, row]));
  const series: HistorySeries = { bucketTimestamps: [], averages: [], maximums: [] };
  for (let bucket = firstBucket; bucket <= now; bucket += bucketMilliseconds) {
    const row = rowsByBucket.get(bucket);
    series.bucketTimestamps.push(bucket);
    series.averages.push(row ? row.average : null);
    series.maximums.push(row ? row.maximum : null);
  }
  return series;
}

/**
 * The entities that have rollups for a metric in the window (GPU indexes, interfaces, apps…).
 */
export function readRollupEntities(database: ServerLabDatabase, metric: string, range: HistoryRange, now = Date.now()): string[] {
  const { spanMilliseconds, resolution } = HISTORY_RANGES[range];
  return (database.$client.prepare("SELECT DISTINCT entity FROM metric_rollups WHERE resolution = ? AND metric = ? AND bucket_ts >= ? ORDER BY entity").all(resolution, metric, now - spanMilliseconds) as { entity: string }[]).map((row) => row.entity);
}

export type FilesystemUsageRecord = typeof filesystemUsage.$inferSelect;

/**
 * The latest usage row of each mount.
 */
export function readLatestFilesystems(database: ServerLabDatabase): FilesystemUsageRecord[] {
  const latest = database.select({ timestamp: filesystemUsage.timestamp }).from(filesystemUsage).orderBy(desc(filesystemUsage.timestamp)).limit(1).get();
  if (!latest) return [];
  return database.select().from(filesystemUsage).where(eq(filesystemUsage.timestamp, latest.timestamp)).all().sort((left, right) => left.mountPoint.localeCompare(right.mountPoint));
}
