import type { ServerLabDatabase } from "@/lib/database/client";

const MINUTE_MILLISECONDS = 60_000;
const HOUR_MILLISECONDS = 3_600_000;

interface RollupSource {
  metric: string;
  entityExpression: string;
  valueExpression: string;
  fromClause: string;
  timestampColumn: string;
}

/*
 * Every raw metric that gets 1-minute buckets. `entity` is '' for host-wide metrics, otherwise the
 * GPU index, interface, mount or app key.
 */
const MINUTE_SOURCES: readonly RollupSource[] = [
  { metric: "cpu_pct", entityExpression: "''", valueExpression: "cpu_pct", fromClause: "metric_samples", timestampColumn: "ts" },
  { metric: "mem_pct", entityExpression: "''", valueExpression: "100.0 * mem_used / NULLIF(mem_total, 0)", fromClause: "metric_samples", timestampColumn: "ts" },
  { metric: "mem_used", entityExpression: "''", valueExpression: "mem_used", fromClause: "metric_samples", timestampColumn: "ts" },
  { metric: "swap_used", entityExpression: "''", valueExpression: "swap_used", fromClause: "metric_samples", timestampColumn: "ts" },
  { metric: "load1", entityExpression: "''", valueExpression: "load1", fromClause: "metric_samples", timestampColumn: "ts" },
  { metric: "cpu_temp_c", entityExpression: "''", valueExpression: "cpu_temp_c", fromClause: "metric_samples", timestampColumn: "ts" },
  { metric: "net_rx_bps", entityExpression: "''", valueExpression: "net_rx_bps", fromClause: "metric_samples", timestampColumn: "ts" },
  { metric: "net_tx_bps", entityExpression: "''", valueExpression: "net_tx_bps", fromClause: "metric_samples", timestampColumn: "ts" },
  { metric: "disk_read_bps", entityExpression: "''", valueExpression: "disk_read_bps", fromClause: "metric_samples", timestampColumn: "ts" },
  { metric: "disk_write_bps", entityExpression: "''", valueExpression: "disk_write_bps", fromClause: "metric_samples", timestampColumn: "ts" },
  { metric: "gpu_util", entityExpression: "CAST(gpu_samples.gpu_index AS TEXT)", valueExpression: "gpu_samples.util_pct", fromClause: "gpu_samples JOIN metric_samples ON metric_samples.id = gpu_samples.sample_id", timestampColumn: "metric_samples.ts" },
  { metric: "gpu_temp_c", entityExpression: "CAST(gpu_samples.gpu_index AS TEXT)", valueExpression: "gpu_samples.temp_c", fromClause: "gpu_samples JOIN metric_samples ON metric_samples.id = gpu_samples.sample_id", timestampColumn: "metric_samples.ts" },
  { metric: "gpu_vram_used", entityExpression: "CAST(gpu_samples.gpu_index AS TEXT)", valueExpression: "gpu_samples.vram_used", fromClause: "gpu_samples JOIN metric_samples ON metric_samples.id = gpu_samples.sample_id", timestampColumn: "metric_samples.ts" },
  { metric: "sensor_temp_c", entityExpression: "temp_sensors.label", valueExpression: "temp_sensors.temp_c", fromClause: "temp_sensors JOIN metric_samples ON metric_samples.id = temp_sensors.sample_id", timestampColumn: "metric_samples.ts" },
  { metric: "iface_rx_bps", entityExpression: "net_iface_samples.iface", valueExpression: "net_iface_samples.rx_bps", fromClause: "net_iface_samples JOIN metric_samples ON metric_samples.id = net_iface_samples.sample_id", timestampColumn: "metric_samples.ts" },
  { metric: "iface_tx_bps", entityExpression: "net_iface_samples.iface", valueExpression: "net_iface_samples.tx_bps", fromClause: "net_iface_samples JOIN metric_samples ON metric_samples.id = net_iface_samples.sample_id", timestampColumn: "metric_samples.ts" },
  { metric: "disk_used_pct", entityExpression: "mount", valueExpression: "100.0 * used / NULLIF(size, 0)", fromClause: "fs_usage", timestampColumn: "ts" },
  { metric: "app_mem", entityExpression: "app_key", valueExpression: "mem_bytes", fromClause: "app_usage_samples", timestampColumn: "ts" },
  { metric: "app_cpu", entityExpression: "app_key", valueExpression: "cpu_pct", fromClause: "app_usage_samples", timestampColumn: "ts" },
];

const UPSERT_CLAUSE = "ON CONFLICT(host_id, resolution, metric, entity, bucket_ts) DO UPDATE SET avg = excluded.avg, max = excluded.max, min = excluded.min";

/**
 * Builds (or rebuilds) the 1-minute buckets in [fromTimestamp, toTimestamp). Only complete minutes
 * should be passed; the job is idempotent, so overlapping runs are harmless.
 */
export function rollUpMinutes(database: ServerLabDatabase, fromTimestamp: number, toTimestamp: number): void {
  const connection = database.$client;
  const runAll = connection.transaction(() => {
    for (const source of MINUTE_SOURCES) {
      connection
        .prepare(
          `INSERT INTO metric_rollups (host_id, bucket_ts, resolution, metric, entity, avg, max, min)
           SELECT 1, (${source.timestampColumn} / ${MINUTE_MILLISECONDS}) * ${MINUTE_MILLISECONDS} AS bucket, '1m', '${source.metric}', ${source.entityExpression} AS rollup_entity,
                  avg(${source.valueExpression}), max(${source.valueExpression}), min(${source.valueExpression})
           FROM ${source.fromClause}
           WHERE ${source.timestampColumn} >= ? AND ${source.timestampColumn} < ? AND ${source.valueExpression} IS NOT NULL
           GROUP BY bucket, rollup_entity
           ${UPSERT_CLAUSE}`,
        )
        .run(fromTimestamp, toTimestamp);
    }
  });
  runAll();
}

/**
 * Builds (or rebuilds) the 1-hour buckets in [fromTimestamp, toTimestamp) from the 1-minute ones.
 */
export function rollUpHours(database: ServerLabDatabase, fromTimestamp: number, toTimestamp: number): void {
  database.$client
    .prepare(
      `INSERT INTO metric_rollups (host_id, bucket_ts, resolution, metric, entity, avg, max, min)
       SELECT host_id, (bucket_ts / ${HOUR_MILLISECONDS}) * ${HOUR_MILLISECONDS} AS bucket, '1h', metric, entity, avg(avg), max(max), min(min)
       FROM metric_rollups
       WHERE resolution = '1m' AND bucket_ts >= ? AND bucket_ts < ?
       GROUP BY host_id, bucket, metric, entity
       ${UPSERT_CLAUSE}`,
    )
    .run(fromTimestamp, toTimestamp);
}

/**
 * The periodic job: rebuilds the last 10 minutes of 1-minute buckets and the last 3 hours of
 * 1-hour buckets (the current, incomplete hour included so history charts reach "now").
 */
export function runRollups(database: ServerLabDatabase, now = Date.now()): void {
  const currentMinute = Math.floor(now / MINUTE_MILLISECONDS) * MINUTE_MILLISECONDS;
  rollUpMinutes(database, currentMinute - 10 * MINUTE_MILLISECONDS, currentMinute);
  const currentHour = Math.floor(now / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  rollUpHours(database, currentHour - 3 * HOUR_MILLISECONDS, currentHour + HOUR_MILLISECONDS);
}

/**
 * Rebuilds everything the raw tables still hold (run once at start, to cover collector downtime).
 */
export function runFullRollups(database: ServerLabDatabase, now = Date.now()): void {
  const currentMinute = Math.floor(now / MINUTE_MILLISECONDS) * MINUTE_MILLISECONDS;
  rollUpMinutes(database, currentMinute - 31 * 24 * HOUR_MILLISECONDS, currentMinute);
  const currentHour = Math.floor(now / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  rollUpHours(database, currentHour - 31 * 24 * HOUR_MILLISECONDS, currentHour + HOUR_MILLISECONDS);
}
