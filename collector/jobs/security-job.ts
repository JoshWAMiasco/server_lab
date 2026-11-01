import { asc, eq } from "drizzle-orm";
import type { CollectorDriver } from "@/collector/driver";
import type { ServerLabDatabase } from "@/lib/database/client";
import { readSetting, writeCapability } from "@/lib/database/key-value";
import { hostActionRequests } from "@/lib/schema/security";
import { SECURITY_CAPABILITY_KEY, SECURITY_REFRESH_REQUEST_KEY, type HostActionResult } from "@/lib/security/security-types";
import { securityActionSchema } from "@/lib/security/security-validation";

const SNAPSHOT_INTERVAL_MILLISECONDS = 5 * 60_000;

/**
 * Carries out firewall and fail2ban changes queued by the web pages (oldest first, one at a time)
 * and publishes the host's UFW and fail2ban state: every five minutes, after each change, and when
 * a page asks for a refresh (opening the page does). Requests left `running` by a previous collector are marked failed.
 */
export function createSecurityJob(
  database: ServerLabDatabase,
  driver: Pick<CollectorDriver, "readSecurityState" | "runSecurityAction">,
  { now = () => Date.now(), snapshotIntervalMilliseconds = SNAPSHOT_INTERVAL_MILLISECONDS } = {},
): () => Promise<void> {
  database
    .update(hostActionRequests)
    .set({ status: "failed", finishedAt: now(), result: null, summary: "The collector restarted before this finished. Check the page and try again if needed." })
    .where(eq(hostActionRequests.status, "running"))
    .run();
  let lastSnapshotAt = 0;

  return async () => {
    if (!driver.readSecurityState) return;
    let hasChanged = false;
    if (driver.runSecurityAction) {
      const pendingRequests = database.select().from(hostActionRequests).where(eq(hostActionRequests.status, "pending")).orderBy(asc(hostActionRequests.requestedAt)).all();
      for (const request of pendingRequests) {
        const parsedAction = securityActionSchema.safeParse(request.action);
        if (!parsedAction.success || parsedAction.data.kind === "snapshot") {
          database.update(hostActionRequests).set({ status: "failed", finishedAt: now() }).where(eq(hostActionRequests.id, request.id)).run();
          continue;
        }
        database.update(hostActionRequests).set({ status: "running" }).where(eq(hostActionRequests.id, request.id)).run();
        let result: HostActionResult;
        try {
          result = await driver.runSecurityAction(request.id, parsedAction.data);
        } catch (error) {
          result = { requestId: request.id, isSuccessful: false, errorMessage: error instanceof Error ? error.message : String(error), steps: [], finishedAt: now() };
        }
        database
          .update(hostActionRequests)
          .set({ status: result.isSuccessful ? "done" : "failed", result, finishedAt: result.finishedAt })
          .where(eq(hostActionRequests.id, request.id))
          .run();
        hasChanged = true;
      }
    }
    const refreshRequestedAt = readSetting<number>(database, SECURITY_REFRESH_REQUEST_KEY, 0);
    if (hasChanged || refreshRequestedAt > lastSnapshotAt || now() - lastSnapshotAt >= snapshotIntervalMilliseconds) {
      lastSnapshotAt = now();
      writeCapability(database, SECURITY_CAPABILITY_KEY, await driver.readSecurityState());
    }
  };
}
