import { createHash } from "node:crypto";
import type { ServerLabDatabase } from "@/lib/database/client";
import { loginEvents } from "@/lib/schema/watcher";
import { classifyNetworkTag } from "@/collector/parsers/classify-ip-address";
import type { ParsedLoginEvent } from "@/collector/types";
import { lookUpGeolocation, type GeolocationResult } from "@/lib/watcher/geolocation";

export type StoredLoginEvent = typeof loginEvents.$inferSelect;

/**
 * The UNIQUE key that stops a replayed journal line from being stored twice.
 */
export function computeLoginDedupeHash(loginEvent: Pick<ParsedLoginEvent, "timestamp" | "sourceAddress" | "sourcePort" | "username" | "result" | "channel">): string {
  return createHash("sha1")
    .update([loginEvent.timestamp, loginEvent.sourceAddress ?? "", loginEvent.sourcePort ?? "", loginEvent.username, loginEvent.result, loginEvent.channel].join("|"))
    .digest("hex");
}

/**
 * Adds network tag and offline geolocation, then inserts the event. Returns the stored row, or
 * null when it was a duplicate.
 */
export async function storeLoginEvent(database: ServerLabDatabase, loginEvent: ParsedLoginEvent, { isBackfilled = false, tailnetDevice = null, geolocationOverride }: { isBackfilled?: boolean; tailnetDevice?: string | null; geolocationOverride?: GeolocationResult | null } = {}): Promise<StoredLoginEvent | null> {
  const networkTag = loginEvent.sourceAddress ? classifyNetworkTag(loginEvent.sourceAddress) : null;
  const geolocation = geolocationOverride !== undefined ? geolocationOverride : loginEvent.sourceAddress && networkTag === "public" ? await lookUpGeolocation(loginEvent.sourceAddress) : null;
  const inserted = database
    .insert(loginEvents)
    .values({
      timestamp: loginEvent.timestamp,
      channel: loginEvent.channel,
      username: loginEvent.username.slice(0, 64),
      result: loginEvent.result,
      method: loginEvent.method,
      sourceAddress: loginEvent.sourceAddress,
      sourcePort: loginEvent.sourcePort,
      countryName: geolocation?.countryName ?? null,
      countryCode: geolocation?.countryCode ?? null,
      cityName: geolocation?.cityName ?? null,
      latitude: geolocation?.latitude ?? null,
      longitude: geolocation?.longitude ?? null,
      networkTag,
      isBackfilled,
      tailnetDevice,
      raw: loginEvent.raw.slice(0, 1000),
      dedupeHash: computeLoginDedupeHash(loginEvent),
    })
    .onConflictDoNothing()
    .returning()
    .get();
  return inserted ?? null;
}
