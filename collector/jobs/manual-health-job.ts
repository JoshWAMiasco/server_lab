import { eq, isNotNull } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { lobbyItems } from "@/lib/schema/lobby";

const PROBE_TIMEOUT_MILLISECONDS = 5000;

/**
 * Probes `health_check_url` of Lobby items that have one: 2xx/3xx is "healthy", anything else
 * (including timeouts) is "unhealthy". Redirects are not followed, so 3xx counts as up.
 */
export async function runManualHealthChecks(database: ServerLabDatabase): Promise<void> {
  const probedItems = database.select({ id: lobbyItems.id, healthCheckUrl: lobbyItems.healthCheckUrl }).from(lobbyItems).where(isNotNull(lobbyItems.healthCheckUrl)).all();
  await Promise.all(
    probedItems.map(async (probedItem) => {
      let healthCheckState: "healthy" | "unhealthy" = "unhealthy";
      try {
        const response = await fetch(String(probedItem.healthCheckUrl), { method: "GET", redirect: "manual", signal: AbortSignal.timeout(PROBE_TIMEOUT_MILLISECONDS) });
        healthCheckState = response.status >= 200 && response.status < 400 ? "healthy" : "unhealthy";
      } catch {
        healthCheckState = "unhealthy";
      }
      database.update(lobbyItems).set({ healthCheckState, healthCheckedAt: Date.now() }).where(eq(lobbyItems.id, probedItem.id)).run();
    }),
  );
}
