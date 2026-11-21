import { desc, eq } from "drizzle-orm";
import type { BootEndKind, BootIdentity } from "@/collector/types";
import type { ServerLabDatabase } from "@/lib/database/client";
import { bootSessions } from "@/lib/schema/system";

type KnownEndKind = Exclude<BootEndKind, "crash">;

function readLatestSession(database: ServerLabDatabase) {
  return database.select().from(bootSessions).orderBy(desc(bootSessions.bootedAt), desc(bootSessions.id)).limit(1).get();
}

/**
 * Called once when the collector starts. A known boot id is a collector restart: the boot goes on
 * (and a shutdown intent recorded by a stop that never happened is cleared). A new boot id closes
 * the previous boot, using the end kind its SIGTERM recorded, else `classifyPreviousBoot` (the
 * journal), else "crash". A reboot carries the uptime streak forward; anything else starts a new one.
 *
 * Returns the end kind given to the previous boot, or null when there was none to close.
 */
export async function startBootSession(database: ServerLabDatabase, identity: BootIdentity, classifyPreviousBoot: () => Promise<KnownEndKind | null>, now = Date.now()): Promise<BootEndKind | null> {
  const latestSession = readLatestSession(database);
  if (latestSession?.bootId === identity.bootId) {
    database.update(bootSessions).set({ lastSeenAt: now, endKind: null, endedAt: null }).where(eq(bootSessions.id, latestSession.id)).run();
    return null;
  }
  let previousEndKind: BootEndKind | null = null;
  let streakStartedAt = identity.bootedAt;
  if (latestSession) {
    previousEndKind = latestSession.endKind ?? (await classifyPreviousBoot().catch(() => null)) ?? "crash";
    const endedAt = Math.min(latestSession.lastSeenAt, identity.bootedAt);
    database.update(bootSessions).set({ endKind: previousEndKind, endedAt }).where(eq(bootSessions.id, latestSession.id)).run();
    if (previousEndKind === "reboot") streakStartedAt = latestSession.streakStartedAt;
  }
  database.insert(bootSessions).values({ bootId: identity.bootId, bootedAt: identity.bootedAt, lastSeenAt: now, streakStartedAt }).onConflictDoNothing().run();
  return previousEndKind;
}

/**
 * The heartbeat: moves the current boot's `last_seen_at`, which becomes its end time if the host
 * goes down without warning.
 *
 * @example
 * touchBootSession(database, identity.bootId);
 */
export function touchBootSession(database: ServerLabDatabase, bootId: string, now = Date.now()): void {
  database.update(bootSessions).set({ lastSeenAt: now }).where(eq(bootSessions.bootId, bootId)).run();
}

/**
 * Called from the SIGTERM handler when systemd has a reboot or power-off queued, so the next start
 * knows how this boot ended without guessing.
 *
 * @example
 * recordShutdownIntent(database, identity.bootId, "reboot");
 */
export function recordShutdownIntent(database: ServerLabDatabase, bootId: string, endKind: KnownEndKind, now = Date.now()): void {
  database.update(bootSessions).set({ endKind, lastSeenAt: now }).where(eq(bootSessions.bootId, bootId)).run();
}
