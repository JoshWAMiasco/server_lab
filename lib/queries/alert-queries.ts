import { and, desc, eq } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { alertEvents, alertRules } from "@/lib/schema/alerts";
import type { LiveAlertEvent } from "@/lib/queries/live-types";
import { toLiveAlertEvent } from "@/lib/queries/stream-queries";

export type AlertRuleRecord = typeof alertRules.$inferSelect;

/**
 * The newest alert events, newest first.
 */
export function readRecentAlertEvents(database: ServerLabDatabase, limit = 30): LiveAlertEvent[] {
  return database.select().from(alertEvents).orderBy(desc(alertEvents.startedAt)).limit(limit).all().map(toLiveAlertEvent);
}

/**
 * Every alert rule, defaults first.
 */
export function readAlertRules(database: ServerLabDatabase): AlertRuleRecord[] {
  return database.select().from(alertRules).orderBy(alertRules.id).all();
}

/**
 * How long the collector may be silent before the in-app "Collector offline" banner shows, from the
 * `collector_offline` rule (evaluated by the web process). Null when that rule is disabled or gone.
 */
export function readCollectorOfflineThreshold(database: ServerLabDatabase): number | null {
  const rule = database.select().from(alertRules).where(and(eq(alertRules.kind, "event"), eq(alertRules.event, "collector_offline"))).get();
  if (!rule?.isEnabled) return null;
  return Math.max(10, Number(rule.parameters.seconds ?? 60)) * 1000;
}
