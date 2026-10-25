import { and, asc, desc, gt, isNotNull, or } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { alertEvents } from "@/lib/schema/alerts";
import { appUsageSamples } from "@/lib/schema/metrics";
import { loginEvents } from "@/lib/schema/watcher";
import type { LiveAlertEvent, LiveAppUsageBatch, LiveLoginEvent } from "@/lib/queries/live-types";

/**
 * Converts a stored login row to what the browser gets (no raw log line).
 */
export function toLiveLoginEvent(row: typeof loginEvents.$inferSelect): LiveLoginEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    channel: row.channel,
    username: row.username,
    result: row.result,
    method: row.method,
    sourceAddress: row.sourceAddress,
    sourcePort: row.sourcePort,
    countryName: row.countryName,
    countryCode: row.countryCode,
    cityName: row.cityName,
    networkTag: row.networkTag,
    isBackfilled: row.isBackfilled,
    tailnetDevice: row.tailnetDevice,
  };
}

/**
 * Converts a stored alert event row for the browser.
 */
export function toLiveAlertEvent(row: typeof alertEvents.$inferSelect): LiveAlertEvent {
  return { id: row.id, ruleId: row.ruleId, ruleName: row.ruleName, entity: row.entity, state: row.state, value: row.value, message: row.message, startedAt: row.startedAt, resolvedAt: row.resolvedAt, isAcknowledged: row.isAcknowledged };
}

/**
 * The newest app usage batch (all rows of the latest 10-second tick), or null.
 */
export function readLatestAppUsageBatch(database: ServerLabDatabase, afterTimestamp = 0): LiveAppUsageBatch | null {
  const latest = database.select({ timestamp: appUsageSamples.timestamp }).from(appUsageSamples).orderBy(desc(appUsageSamples.timestamp)).limit(1).get();
  if (!latest || latest.timestamp <= afterTimestamp) return null;
  const rows = database.select().from(appUsageSamples).where(gt(appUsageSamples.timestamp, latest.timestamp - 1)).all();
  return { timestamp: latest.timestamp, usages: rows.map(({ appKey, source, cpuPercent, memoryBytes, memoryLimitBytes }) => ({ appKey, source, cpuPercent, memoryBytes, memoryLimitBytes })) };
}

/**
 * Login events with an id above `afterId`, oldest first.
 */
export function readLoginEventsAfterId(database: ServerLabDatabase, afterId: number, limit = 200): LiveLoginEvent[] {
  return database.select().from(loginEvents).where(gt(loginEvents.id, afterId)).orderBy(asc(loginEvents.id)).limit(limit).all().map(toLiveLoginEvent);
}

/**
 * The highest login event id (0 when empty).
 */
export function readLatestLoginEventId(database: ServerLabDatabase): number {
  return database.select({ id: loginEvents.id }).from(loginEvents).orderBy(desc(loginEvents.id)).limit(1).get()?.id ?? 0;
}

/**
 * Alert events that are new (id above `afterId`) or were resolved after `changedSince`.
 */
export function readAlertEventChanges(database: ServerLabDatabase, afterId: number, changedSince: number): LiveAlertEvent[] {
  return database
    .select()
    .from(alertEvents)
    .where(or(gt(alertEvents.id, afterId), and(isNotNull(alertEvents.resolvedAt), gt(alertEvents.resolvedAt, changedSince))))
    .orderBy(asc(alertEvents.id))
    .limit(100)
    .all()
    .map(toLiveAlertEvent);
}

/**
 * The highest alert event id (0 when empty).
 */
export function readLatestAlertEventId(database: ServerLabDatabase): number {
  return database.select({ id: alertEvents.id }).from(alertEvents).orderBy(desc(alertEvents.id)).limit(1).get()?.id ?? 0;
}
