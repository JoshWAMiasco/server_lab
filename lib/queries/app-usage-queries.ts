import { and, asc, gte } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { appUsageSamples } from "@/lib/schema/metrics";
import type { LiveAppUsageBatch } from "@/lib/queries/live-types";
import { readLobbyCards } from "@/lib/queries/lobby-queries";
import { readLatestAppUsageBatch } from "@/lib/queries/stream-queries";
import { readLatestSystemSample } from "@/lib/queries/system-queries";
import { readRollupEntities } from "@/lib/queries/history-queries";

const SPARKLINE_WINDOW_MILLISECONDS = 15 * 60_000;

export interface AppIdentity {
  name: string;
  iconFileName: string | null;
  source: "docker" | "systemd" | "port" | "nginx" | "manual";
}

export interface AppUsageOverview {
  batch: LiveAppUsageBatch | null;
  sparklines: Record<string, { timestamp: number; memoryBytes: number; cpuPercent: number }[]>;
  hostMemoryTotal: number;
  identities: Record<string, AppIdentity>;
  historyAppKeys: string[];
}

/**
 * Everything the Applications page needs on first render: the latest usage batch, 15 minutes of
 * per-app samples for sparklines, host memory, names and icons (shared with the Lobby), and the
 * apps that have history (including stopped ones).
 */
export function readAppUsageOverview(database: ServerLabDatabase, now = Date.now()): AppUsageOverview {
  const sparklineRows = database
    .select({ appKey: appUsageSamples.appKey, timestamp: appUsageSamples.timestamp, memoryBytes: appUsageSamples.memoryBytes, cpuPercent: appUsageSamples.cpuPercent })
    .from(appUsageSamples)
    .where(and(gte(appUsageSamples.timestamp, now - SPARKLINE_WINDOW_MILLISECONDS)))
    .orderBy(asc(appUsageSamples.timestamp))
    .all();
  const sparklines: AppUsageOverview["sparklines"] = {};
  for (const row of sparklineRows) (sparklines[row.appKey] ??= []).push({ timestamp: row.timestamp, memoryBytes: row.memoryBytes, cpuPercent: row.cpuPercent });
  const identities: Record<string, AppIdentity> = {};
  for (const card of readLobbyCards(database, now)) identities[card.key] = { name: card.name, iconFileName: card.iconFileName, source: card.source };
  return {
    batch: readLatestAppUsageBatch(database),
    sparklines,
    hostMemoryTotal: readLatestSystemSample(database)?.memoryTotal ?? 0,
    identities,
    historyAppKeys: readRollupEntities(database, "app_mem", "7d", now),
  };
}
