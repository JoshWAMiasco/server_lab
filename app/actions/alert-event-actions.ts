"use server";

import { eq, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/authentication/require-session";
import { getDatabase } from "@/lib/database/client";
import { alertEvents, alertRules } from "@/lib/schema/alerts";

/* Event rules with no "back to normal" state: acknowledging their events also resolves them. */
const ONE_SHOT_EVENT_KINDS = ["login_failed_burst", "login_new_country"];

function acknowledge(alertEventIds: number[]): void {
  if (alertEventIds.length === 0) return;
  const database = getDatabase();
  const events = database.select({ id: alertEvents.id, state: alertEvents.state, event: alertRules.event }).from(alertEvents).leftJoin(alertRules, eq(alertRules.id, alertEvents.ruleId)).where(inArray(alertEvents.id, alertEventIds)).all();
  const now = Date.now();
  for (const alertEvent of events) {
    const isOneShot = alertEvent.state === "firing" && ONE_SHOT_EVENT_KINDS.includes(alertEvent.event ?? "");
    database
      .update(alertEvents)
      .set({ isAcknowledged: true, ...(isOneShot ? { state: "resolved" as const, resolvedAt: now } : {}) })
      .where(eq(alertEvents.id, alertEvent.id))
      .run();
  }
}

/**
 * Acknowledges one alert event.
 */
export async function acknowledgeAlertEvent(alertEventId: number): Promise<void> {
  await requireSession("/alerts");
  acknowledge([alertEventId]);
}

/**
 * Acknowledges every unacknowledged event.
 */
export async function acknowledgeAllAlertEvents(): Promise<void> {
  await requireSession("/alerts");
  acknowledge(getDatabase().select({ id: alertEvents.id }).from(alertEvents).where(eq(alertEvents.isAcknowledged, false)).all().map((row) => row.id));
}
