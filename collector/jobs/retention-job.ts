import type { ServerLabDatabase } from "@/lib/database/client";
import { readRetentionSettings } from "@/lib/database/retention";
import { pruneUnusedCustomIcons } from "@/lib/lobby/custom-icon-store";

const HOUR_MILLISECONDS = 3_600_000;
const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;
const DELETE_BATCH_SIZE = 5000;

function deleteInBatches(database: ServerLabDatabase, statementText: string, cutoff: number): number {
  const statement = database.$client.prepare(statementText);
  let deletedTotal = 0;
  for (;;) {
    const { changes } = statement.run(cutoff, DELETE_BATCH_SIZE);
    deletedTotal += changes;
    if (changes < DELETE_BATCH_SIZE) return deletedTotal;
  }
}

/**
 * Deletes rows past their retention (raw samples cascade to their child rows) in small batches so
 * the web process is never blocked for long, then returns free pages to the OS (databases created
 * with `auto_vacuum = INCREMENTAL`) and checkpoints the WAL.
 */
export function runRetention(database: ServerLabDatabase, now = Date.now()): void {
  const retention = readRetentionSettings(database);
  const rawCutoff = now - retention.rawHours * HOUR_MILLISECONDS;
  deleteInBatches(database, "DELETE FROM metric_samples WHERE id IN (SELECT id FROM metric_samples WHERE ts < ? LIMIT ?)", rawCutoff);
  deleteInBatches(database, "DELETE FROM app_usage_samples WHERE id IN (SELECT id FROM app_usage_samples WHERE ts < ? LIMIT ?)", rawCutoff);
  deleteInBatches(database, "DELETE FROM fs_usage WHERE id IN (SELECT id FROM fs_usage WHERE ts < ? LIMIT ?)", now - retention.filesystemDays * DAY_MILLISECONDS);
  deleteInBatches(database, "DELETE FROM metric_rollups WHERE rowid IN (SELECT rowid FROM metric_rollups WHERE resolution = '1m' AND bucket_ts < ? LIMIT ?)", now - retention.minuteRollupDays * DAY_MILLISECONDS);
  deleteInBatches(database, "DELETE FROM metric_rollups WHERE rowid IN (SELECT rowid FROM metric_rollups WHERE resolution = '1h' AND bucket_ts < ? LIMIT ?)", now - retention.hourRollupDays * DAY_MILLISECONDS);
  deleteInBatches(database, "DELETE FROM login_events WHERE id IN (SELECT id FROM login_events WHERE ts < ? LIMIT ?)", now - retention.loginDays * DAY_MILLISECONDS);
  deleteInBatches(database, "DELETE FROM alert_events WHERE id IN (SELECT id FROM alert_events WHERE state = 'resolved' AND started_at < ? LIMIT ?)", now - retention.alertDays * DAY_MILLISECONDS);
  deleteInBatches(database, "DELETE FROM host_action_requests WHERE id IN (SELECT id FROM host_action_requests WHERE status IN ('done', 'failed') AND requested_at < ? LIMIT ?)", now - retention.alertDays * DAY_MILLISECONDS);
  database.$client.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  pruneUnusedCustomIcons(database, now);
  database.$client.pragma("incremental_vacuum");
  database.$client.pragma("wal_checkpoint(TRUNCATE)");
}
